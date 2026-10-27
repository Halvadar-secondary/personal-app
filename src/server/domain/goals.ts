import {
  and,
  asc,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { z } from "zod";
import { addDays, daysBetween, localDate } from "@/lib/dates";
import { reviewWeekStart, weekRange } from "@/lib/plan";
import {
  type Achievement,
  type AchievementStatus,
  achievements,
  areas,
  type Goal,
  goals,
  taskCompletions,
  tasks,
} from "@/server/db/schema";
import { zDate } from "./achievements";
import { type Ctx, callAction, defineAction } from "./context";
import { getWeek } from "./plan";
import { sortKeyFor, zPosition } from "./position";
import {
  findLive,
  insertRecorded,
  softDeleteRecorded,
  updateRecorded,
} from "./rows";
import type { NavArea } from "./views";

// Goals (spec "Plan your days" §7): broad aims with a deadline that
// achievements from any area feed, reviewed and planned on Sunday.

const zTitle = z.string().trim().min(1).max(200);
const zNotes = z.string().max(10_000).nullish();

function siblings(ctx: Ctx, exceptId?: string) {
  return ctx.db
    .select({ id: goals.id, sortKey: goals.sortKey })
    .from(goals)
    .where(
      and(
        eq(goals.ownerId, ctx.ownerId),
        isNull(goals.deletedAt),
        exceptId ? ne(goals.id, exceptId) : undefined,
      ),
    )
    .orderBy(asc(goals.sortKey), asc(goals.id));
}

export const createGoal = defineAction(
  z.object({ title: zTitle, notes: zNotes, deadline: zDate.nullish() }),
  async (ctx, input) =>
    insertRecorded(ctx, "goal", goals, {
      ...input,
      sortKey: sortKeyFor(await siblings(ctx), {}),
    }),
);

export const updateGoal = defineAction(
  z.object({
    goalId: z.uuid(),
    title: zTitle.optional(),
    notes: zNotes,
    deadline: zDate.nullish(),
    status: z.enum(["active", "done"]).optional(),
  }),
  async (ctx, { goalId, ...patch }) => {
    const before = await findLive(ctx, goals, goalId);
    const completedAt =
      patch.status === undefined || patch.status === before.status
        ? {}
        : { completedAt: patch.status === "done" ? ctx.now() : null };
    return updateRecorded(ctx, "goal", goals, before, {
      ...patch,
      ...completedAt,
    });
  },
);

export const moveGoal = defineAction(
  zPosition.extend({ goalId: z.uuid() }),
  async (ctx, { goalId, ...pos }) => {
    const before = await findLive(ctx, goals, goalId);
    const sortKey = sortKeyFor(await siblings(ctx, goalId), pos);
    return updateRecorded(ctx, "goal", goals, before, { sortKey });
  },
);

/** Unlinks the goal's achievements, then soft-deletes it, in one batch. */
export const deleteGoal = defineAction(
  z.object({ goalId: z.uuid() }),
  async (ctx, { goalId }) => {
    const goal = await findLive(ctx, goals, goalId);
    const linked = await ctx.db
      .select()
      .from(achievements)
      .where(
        and(
          eq(achievements.ownerId, ctx.ownerId),
          eq(achievements.goalId, goalId),
          isNull(achievements.deletedAt),
        ),
      );
    for (const a of linked) {
      await updateRecorded(ctx, "achievement", achievements, a, {
        goalId: null,
      });
    }
    await softDeleteRecorded(ctx, "goal", goals, goal);
    return { deleted: 1 as const };
  },
);

/** Links an achievement to a goal (one goal each), or unlinks it with null. */
export const linkAchievement = defineAction(
  z.object({ achievementId: z.uuid(), goalId: z.uuid().nullable() }),
  async (ctx, { achievementId, goalId }): Promise<Achievement> => {
    const before = await findLive(ctx, achievements, achievementId);
    if (goalId) await findLive(ctx, goals, goalId);
    return updateRecorded(ctx, "achievement", achievements, before, {
      goalId,
    });
  },
);

export type GoalSummary = Goal & {
  achievementCount: number;
  achievementsDone: number;
  taskCount: number;
  tasksDone: number;
  /** Days from today to the deadline; negative once it has passed. */
  daysLeft: number | null;
};

type Linked = {
  id: string;
  title: string;
  status: AchievementStatus;
  goalId: string;
  area: NavArea | null;
  taskCount: number;
  doneCount: number;
};

/** Live achievements linked to `goalIds`, in board order, with one-off task counts. */
async function linkedTo(ctx: Ctx, goalIds: string[]): Promise<Linked[]> {
  if (goalIds.length === 0) return [];
  const rows = await ctx.db
    .select({
      id: achievements.id,
      title: achievements.title,
      status: achievements.status,
      goalId: achievements.goalId,
      areaId: areas.id,
      areaName: areas.name,
      areaEmoji: areas.emoji,
      taskCount: sql<number>`count(${tasks.id})::int`,
      doneCount: sql<number>`count(${tasks.completedAt})::int`,
    })
    .from(achievements)
    .leftJoin(areas, eq(areas.id, achievements.areaId))
    .leftJoin(
      tasks,
      and(
        eq(tasks.achievementId, achievements.id),
        isNull(tasks.deletedAt),
        isNull(tasks.recurrence),
      ),
    )
    .where(
      and(
        eq(achievements.ownerId, ctx.ownerId),
        inArray(achievements.goalId, goalIds),
        isNull(achievements.deletedAt),
      ),
    )
    .groupBy(achievements.id, areas.id)
    .orderBy(
      asc(areas.sortKey),
      asc(achievements.status),
      asc(achievements.sortKey),
      asc(achievements.id),
    );
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    goalId: r.goalId!,
    area: r.areaId
      ? { id: r.areaId, name: r.areaName!, emoji: r.areaEmoji }
      : null,
    taskCount: r.taskCount,
    doneCount: r.doneCount,
  }));
}

function summarise(goal: Goal, linked: Linked[], today: string): GoalSummary {
  const mine = linked.filter((a) => a.goalId === goal.id);
  return {
    ...goal,
    achievementCount: mine.length,
    achievementsDone: mine.filter((a) => a.status === "done").length,
    taskCount: mine.reduce((s, a) => s + a.taskCount, 0),
    tasksDone: mine.reduce((s, a) => s + a.doneCount, 0),
    daysLeft: goal.deadline ? daysBetween(today, goal.deadline) : null,
  };
}

async function liveGoals(ctx: Ctx, status?: "active") {
  return ctx.db
    .select()
    .from(goals)
    .where(
      and(
        eq(goals.ownerId, ctx.ownerId),
        isNull(goals.deletedAt),
        status ? eq(goals.status, status) : undefined,
      ),
    )
    .orderBy(asc(goals.status), asc(goals.sortKey), asc(goals.id));
}

/** Active goals in the owner's order, then done ones. */
export const listGoals = defineAction(z.object({}), async (ctx) => {
  const today = localDate(ctx.now(), ctx.timeZone);
  const rows = await liveGoals(ctx);
  const linked = await linkedTo(
    ctx,
    rows.map((g) => g.id),
  );
  return { today, goals: rows.map((g) => summarise(g, linked, today)) };
});

export const getGoal = defineAction(
  z.object({ goalId: z.uuid() }),
  async (ctx, { goalId }) => {
    const today = localDate(ctx.now(), ctx.timeZone);
    const goal = await findLive(ctx, goals, goalId);
    const linked = await linkedTo(ctx, [goalId]);
    return {
      today,
      goal: summarise(goal, linked, today),
      achievements: linked,
    };
  },
);

/** Achievements the goal could link: every live one not already on it. */
export const listLinkableAchievements = defineAction(
  z.object({ goalId: z.uuid() }),
  async (ctx, { goalId }) => {
    const rows = await ctx.db
      .select({
        id: achievements.id,
        title: achievements.title,
        areaId: areas.id,
        areaName: areas.name,
        areaEmoji: areas.emoji,
        goalTitle: goals.title,
      })
      .from(achievements)
      .leftJoin(areas, eq(areas.id, achievements.areaId))
      .leftJoin(
        goals,
        and(eq(goals.id, achievements.goalId), isNull(goals.deletedAt)),
      )
      .where(
        and(
          eq(achievements.ownerId, ctx.ownerId),
          isNull(achievements.deletedAt),
          or(isNull(areas.id), isNull(areas.deletedAt)),
          or(isNull(achievements.goalId), ne(achievements.goalId, goalId)),
        ),
      )
      .orderBy(
        asc(areas.sortKey),
        asc(achievements.status),
        asc(achievements.sortKey),
        asc(achievements.id),
      );
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      area: r.areaId
        ? { id: r.areaId, name: r.areaName!, emoji: r.areaEmoji }
        : null,
      goalTitle: r.goalTitle,
    }));
  },
);

export type ReviewTask = {
  id: string;
  title: string;
  achievementTitle: string;
  plannedOn: string | null;
  plannedWeek: string | null;
};

/** Open one-off tasks of unfinished achievements, grouped by achievement id. */
async function openTasksOf(ctx: Ctx, achievementIds: string[]) {
  if (achievementIds.length === 0) return new Map<string, ReviewTask[]>();
  const rows = await ctx.db
    .select({
      id: tasks.id,
      title: tasks.title,
      achievementId: achievements.id,
      achievementTitle: achievements.title,
      plannedOn: tasks.plannedOn,
      plannedWeek: tasks.plannedWeek,
    })
    .from(tasks)
    .innerJoin(achievements, eq(achievements.id, tasks.achievementId))
    .where(
      and(
        eq(tasks.ownerId, ctx.ownerId),
        inArray(tasks.achievementId, achievementIds),
        isNull(tasks.deletedAt),
        isNull(tasks.recurrence),
        isNull(tasks.completedAt),
      ),
    )
    .orderBy(asc(tasks.sortKey), asc(tasks.id));
  const out = new Map<string, ReviewTask[]>();
  for (const { achievementId, ...t } of rows) {
    out.set(achievementId, [...(out.get(achievementId) ?? []), t]);
  }
  return out;
}

/** Last week in numbers: one-offs done, and planned ones left unfinished. */
async function lastWeekOf(ctx: Ctx, start: string) {
  const from = addDays(start, -7);
  const to = addDays(start, -1);
  const done = await ctx.db
    .select({ n: sql<number>`count(*)::int` })
    .from(taskCompletions)
    .innerJoin(tasks, eq(tasks.id, taskCompletions.taskId))
    .where(
      and(
        eq(taskCompletions.ownerId, ctx.ownerId),
        isNull(tasks.recurrence),
        isNull(tasks.deletedAt),
        gte(taskCompletions.occurrenceDate, from),
        lte(taskCompletions.occurrenceDate, to),
      ),
    );
  const rolled = await ctx.db
    .select({ n: sql<number>`count(*)::int` })
    .from(tasks)
    .where(
      and(
        eq(tasks.ownerId, ctx.ownerId),
        isNull(tasks.deletedAt),
        isNull(tasks.completedAt),
        or(
          and(gte(tasks.plannedOn, from), lte(tasks.plannedOn, to)),
          and(gte(tasks.plannedWeek, from), lte(tasks.plannedWeek, to)),
        ),
      ),
    );
  return { done: done[0]!.n, rolled: rolled[0]!.n };
}

/** "Plan your week": goals with the tasks that feed them, and the week. */
export const getReview = defineAction(
  z.object({ start: zDate.optional() }),
  async (ctx, input) => {
    const today = localDate(ctx.now(), ctx.timeZone);
    const { start, end } = weekRange(
      input.start ?? reviewWeekStart(today, ctx.weekStart),
      ctx.weekStart,
    );
    const active = await liveGoals(ctx, "active");
    const linked = await linkedTo(
      ctx,
      active.map((g) => g.id),
    );
    const unlinkedAchs = await ctx.db
      .select({
        id: achievements.id,
        title: achievements.title,
        areaId: areas.id,
        areaName: areas.name,
        areaEmoji: areas.emoji,
      })
      .from(achievements)
      .innerJoin(areas, eq(areas.id, achievements.areaId))
      .leftJoin(
        goals,
        and(eq(goals.id, achievements.goalId), isNull(goals.deletedAt)),
      )
      .where(
        and(
          eq(achievements.ownerId, ctx.ownerId),
          isNull(achievements.deletedAt),
          isNull(areas.deletedAt),
          ne(achievements.status, "done"),
          // No goal, or only a finished one.
          or(isNull(goals.id), eq(goals.status, "done")),
        ),
      )
      .orderBy(
        asc(areas.sortKey),
        asc(achievements.status),
        asc(achievements.sortKey),
      );
    const open = await openTasksOf(ctx, [
      ...linked.filter((a) => a.status !== "done").map((a) => a.id),
      ...unlinkedAchs.map((a) => a.id),
    ]);
    return {
      start,
      end,
      today,
      lastWeek: await lastWeekOf(ctx, start),
      goals: active.map((g) => ({
        goal: summarise(g, linked, today),
        tasks: linked
          .filter((a) => a.goalId === g.id && a.status !== "done")
          .flatMap((a) => open.get(a.id) ?? []),
      })),
      unlinked: unlinkedAchs
        .map((a) => ({
          achievement: { id: a.id, title: a.title },
          area: { id: a.areaId, name: a.areaName, emoji: a.areaEmoji },
          tasks: open.get(a.id) ?? [],
        }))
        .filter((u) => u.tasks.length > 0),
      week: await callAction(ctx, getWeek, { start }),
    };
  },
);
