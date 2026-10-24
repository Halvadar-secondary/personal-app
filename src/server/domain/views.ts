import {
  and,
  asc,
  count,
  eq,
  inArray,
  isNotNull,
  isNull,
  lte,
  ne,
  sql,
} from "drizzle-orm";
import { z } from "zod";
import { pickUpNext } from "@/lib/agenda";
import { addDays, localDate, weekStartOf } from "@/lib/dates";
import { isDueOn, type Recurrence } from "@/lib/recurrence";
import {
  type Achievement,
  type Area,
  type AchievementStatus,
  achievements,
  areas,
  categories,
  taskCategories,
  taskCompletions,
  tasks,
} from "@/server/db/schema";
import { listAreas } from "./areas";
import { type Ctx, callAction, defineAction } from "./context";
import { type AreaProgress, areaProgress } from "./progress";
import { findLive } from "./rows";

// Read models for the UI's screens. Each concern is one grouped query.

export type NavArea = { id: string; name: string; emoji: string | null };

/** The task to do next in an area or achievement (spec "Home: overview"). */
export type UpNext = {
  taskId: string;
  title: string;
  achievementId: string;
  deadline: string | null;
} | null;

export type AreaSummary = Area & {
  counts: Record<AchievementStatus, number>;
  progress: AreaProgress;
  upNext: UpNext;
};
export type Overview = {
  areas: AreaSummary[];
  inboxCount: number;
  activeCount: number;
  dueThisWeek: number;
  bestStreak: number;
  /** The owner's date, for deadline colours. */
  today: string;
};

/** Live tasks under active achievements, in board order, with today's state. */
async function activeTasks(ctx: Ctx, today: string) {
  const rows = await ctx.db
    .select({
      id: tasks.id,
      title: tasks.title,
      effort: tasks.effort,
      deadline: tasks.deadline,
      recurrence: tasks.recurrence,
      completedAt: tasks.completedAt,
      achievementId: achievements.id,
      achievementTitle: achievements.title,
      areaId: achievements.areaId,
    })
    .from(tasks)
    .innerJoin(achievements, eq(achievements.id, tasks.achievementId))
    .where(
      and(
        eq(tasks.ownerId, ctx.ownerId),
        isNull(tasks.deletedAt),
        isNull(achievements.deletedAt),
        eq(achievements.status, "active"),
        isNotNull(achievements.areaId),
      ),
    )
    .orderBy(
      asc(achievements.sortKey),
      asc(achievements.id),
      asc(tasks.sortKey),
      asc(tasks.id),
    );
  const ids = rows.filter((r) => r.recurrence).map((r) => r.id);
  const doneRows = ids.length
    ? await ctx.db
        .select({ taskId: taskCompletions.taskId })
        .from(taskCompletions)
        .where(
          and(
            eq(taskCompletions.ownerId, ctx.ownerId),
            inArray(taskCompletions.taskId, ids),
            eq(taskCompletions.occurrenceDate, today),
          ),
        )
    : [];
  const doneToday = new Set(doneRows.map((d) => d.taskId));
  return rows.map((r) => ({
    ...r,
    areaId: r.areaId!,
    doneToday: doneToday.has(r.id),
  }));
}

type ActiveTask = Awaited<ReturnType<typeof activeTasks>>[number];

function upNextOf(rows: ActiveTask[], today: string): UpNext {
  const t = pickUpNext(rows, today);
  return t
    ? {
        taskId: t.id,
        title: t.title,
        achievementId: t.achievementId,
        deadline: t.deadline,
      }
    : null;
}

function groupBy<T>(rows: T[], key: (r: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r);
    out.set(k, [...(out.get(k) ?? []), r]);
  }
  return out;
}

export type DueItem = {
  kind: "task" | "achievement";
  id: string;
  title: string;
  deadline: string;
  achievementId: string;
  area: NavArea;
};

/**
 * Unfinished one-off tasks and achievements due on or before `through`,
 * overdue included, soonest first. Repeating tasks are never "due".
 */
async function dueBy(
  ctx: Ctx,
  through: string,
  areaById: Map<string, NavArea>,
): Promise<DueItem[]> {
  const taskRows = await ctx.db
    .select({
      id: tasks.id,
      title: tasks.title,
      deadline: tasks.deadline,
      achievementId: achievements.id,
      areaId: achievements.areaId,
    })
    .from(tasks)
    .innerJoin(achievements, eq(achievements.id, tasks.achievementId))
    .where(
      and(
        eq(tasks.ownerId, ctx.ownerId),
        isNull(tasks.deletedAt),
        isNull(tasks.recurrence),
        isNull(tasks.completedAt),
        lte(tasks.deadline, through),
        isNull(achievements.deletedAt),
        ne(achievements.status, "done"),
      ),
    );
  const achRows = await ctx.db
    .select({
      id: achievements.id,
      title: achievements.title,
      deadline: achievements.deadline,
      areaId: achievements.areaId,
    })
    .from(achievements)
    .where(
      and(
        eq(achievements.ownerId, ctx.ownerId),
        isNull(achievements.deletedAt),
        ne(achievements.status, "done"),
        lte(achievements.deadline, through),
      ),
    );
  const items: DueItem[] = [];
  for (const t of taskRows) {
    const area = t.areaId ? areaById.get(t.areaId) : undefined;
    if (area) items.push({ kind: "task", ...t, deadline: t.deadline!, area });
  }
  for (const a of achRows) {
    const area = a.areaId ? areaById.get(a.areaId) : undefined;
    if (area) {
      items.push({
        kind: "achievement",
        id: a.id,
        title: a.title,
        deadline: a.deadline!,
        achievementId: a.id,
        area,
      });
    }
  }
  return items.sort((x, y) => x.deadline.localeCompare(y.deadline));
}

const navArea = (a: Area): NavArea => ({
  id: a.id,
  name: a.name,
  emoji: a.emoji,
});

export const getOverview = defineAction(
  z.object({}),
  async (ctx): Promise<Overview> => {
    const rows = await callAction(ctx, listAreas, {});
    const perStatus = await ctx.db
      .select({
        areaId: achievements.areaId,
        status: achievements.status,
        n: count(),
      })
      .from(achievements)
      .where(
        and(
          eq(achievements.ownerId, ctx.ownerId),
          isNull(achievements.deletedAt),
        ),
      )
      .groupBy(achievements.areaId, achievements.status);
    const [unfiledTasks] = await ctx.db
      .select({ n: count() })
      .from(tasks)
      .where(
        and(
          eq(tasks.ownerId, ctx.ownerId),
          isNull(tasks.achievementId),
          isNull(tasks.deletedAt),
        ),
      );

    const live = new Set(rows.map((a) => a.id));
    const counts = new Map<string, Record<AchievementStatus, number>>(
      rows.map((a) => [a.id, { backlog: 0, active: 0, done: 0 }]),
    );
    let inboxCount = unfiledTasks!.n;
    let activeCount = 0;
    for (const r of perStatus) {
      if (r.areaId === null) {
        inboxCount += r.n;
      } else if (live.has(r.areaId)) {
        counts.get(r.areaId)![r.status] = r.n;
        if (r.status === "active") activeCount += r.n;
      }
    }
    const today = localDate(ctx.now(), ctx.timeZone);
    const progress = await areaProgress(
      ctx,
      rows.map((a) => a.id),
    );
    const byArea = groupBy(await activeTasks(ctx, today), (t) => t.areaId);
    const weekEnd = addDays(weekStartOf(today, ctx.weekStart), 6);
    const due = await dueBy(
      ctx,
      weekEnd,
      new Map(rows.map((a) => [a.id, navArea(a)])),
    );
    const summaries = rows.map((a) => ({
      ...a,
      counts: counts.get(a.id)!,
      progress: progress.get(a.id)!,
      upNext: upNextOf(byArea.get(a.id) ?? [], today),
    }));
    return {
      areas: summaries,
      inboxCount,
      activeCount,
      dueThisWeek: due.length,
      bestStreak: Math.max(0, ...summaries.map((a) => a.progress.streak)),
      today,
    };
  },
);

export type AchievementCard = Achievement & {
  taskCount: number;
  doneCount: number;
  categoryIds: string[];
};

export const getAreaBoard = defineAction(
  z.object({ areaId: z.uuid() }),
  async (ctx, { areaId }) => {
    const area = await findLive(ctx, areas, areaId);
    const rows = await ctx.db
      .select()
      .from(achievements)
      .where(
        and(
          eq(achievements.ownerId, ctx.ownerId),
          eq(achievements.areaId, areaId),
          isNull(achievements.deletedAt),
        ),
      )
      .orderBy(
        asc(achievements.status),
        asc(achievements.sortKey),
        asc(achievements.id),
      );
    const ids = rows.map((a) => a.id);
    const liveTask = and(
      eq(tasks.ownerId, ctx.ownerId),
      ids.length ? inArray(tasks.achievementId, ids) : sql`false`,
      isNull(tasks.deletedAt),
    );
    const taskCounts = await ctx.db
      .select({
        id: tasks.achievementId,
        total: count(),
        done: count(tasks.completedAt),
      })
      .from(tasks)
      .where(and(liveTask, isNull(tasks.recurrence)))
      .groupBy(tasks.achievementId);
    const used = await ctx.db
      .selectDistinct({
        id: tasks.achievementId,
        categoryId: taskCategories.categoryId,
      })
      .from(taskCategories)
      .innerJoin(tasks, eq(tasks.id, taskCategories.taskId))
      .innerJoin(categories, eq(categories.id, taskCategories.categoryId))
      .where(and(liveTask, isNull(categories.deletedAt)));

    const byId = new Map(taskCounts.map((p) => [p.id, p]));
    const cats = new Map<string, string[]>(ids.map((id) => [id, []]));
    for (const u of used) cats.get(u.id!)!.push(u.categoryId);
    const cards: AchievementCard[] = rows.map((a) => ({
      ...a,
      taskCount: byId.get(a.id)?.total ?? 0,
      doneCount: byId.get(a.id)?.done ?? 0,
      categoryIds: cats.get(a.id)!,
    }));
    const progress = (await areaProgress(ctx, [areaId])).get(areaId)!;
    return { area, achievements: cards, progress };
  },
);

export type FilingArea = {
  id: string;
  name: string;
  emoji: string | null;
  achievements: { id: string; title: string; status: AchievementStatus }[];
};

/** Where Inbox items can go: live areas and their unfinished achievements. */
export const listFilingTargets = defineAction(
  z.object({}),
  async (ctx): Promise<FilingArea[]> => {
    const rows = await callAction(ctx, listAreas, {});
    const achs = await ctx.db
      .select({
        id: achievements.id,
        areaId: achievements.areaId,
        title: achievements.title,
        status: achievements.status,
      })
      .from(achievements)
      .where(
        and(
          eq(achievements.ownerId, ctx.ownerId),
          isNull(achievements.deletedAt),
          ne(achievements.status, "done"),
        ),
      )
      .orderBy(
        asc(achievements.status),
        asc(achievements.sortKey),
        asc(achievements.id),
      );
    const byArea = new Map<string, FilingArea["achievements"]>(
      rows.map((a) => [a.id, []]),
    );
    for (const { areaId, ...a } of achs) {
      if (areaId) byArea.get(areaId)?.push(a);
    }
    return rows.map((a) => ({
      id: a.id,
      name: a.name,
      emoji: a.emoji,
      achievements: byArea.get(a.id)!,
    }));
  },
);

export type PracticeTask = {
  id: string;
  title: string;
  effort: number;
  recurrence: Recurrence;
  doneToday: boolean;
  achievementId: string;
  achievementTitle: string;
  area: NavArea;
};

export type ActiveGroup = {
  area: NavArea;
  achievements: {
    id: string;
    title: string;
    deadline: string | null;
    taskCount: number;
    doneCount: number;
    upNext: UpNext;
  }[];
};

/** The Active page: today's practice, what's due soon, every active achievement. */
export const getActive = defineAction(z.object({}), async (ctx) => {
  const today = localDate(ctx.now(), ctx.timeZone);
  const areaRows = await callAction(ctx, listAreas, {});
  const areaById = new Map(areaRows.map((a) => [a.id, navArea(a)]));
  const open = (await activeTasks(ctx, today)).filter((t) =>
    areaById.has(t.areaId),
  );

  const practice: PracticeTask[] = open
    .filter((t) => t.recurrence && isDueOn(t.recurrence, today))
    .map((t) => ({
      id: t.id,
      title: t.title,
      effort: t.effort,
      recurrence: t.recurrence!,
      doneToday: t.doneToday,
      achievementId: t.achievementId,
      achievementTitle: t.achievementTitle,
      area: areaById.get(t.areaId)!,
    }));

  const achRows = await ctx.db
    .select({
      id: achievements.id,
      title: achievements.title,
      deadline: achievements.deadline,
      areaId: achievements.areaId,
    })
    .from(achievements)
    .where(
      and(
        eq(achievements.ownerId, ctx.ownerId),
        isNull(achievements.deletedAt),
        eq(achievements.status, "active"),
        isNotNull(achievements.areaId),
      ),
    )
    .orderBy(asc(achievements.sortKey), asc(achievements.id));
  const byAchievement = groupBy(open, (t) => t.achievementId);
  const byArea = groupBy(achRows, (a) => a.areaId!);
  const groups: ActiveGroup[] = areaRows
    .filter((a) => byArea.has(a.id))
    .map((a) => ({
      area: navArea(a),
      achievements: byArea.get(a.id)!.map((ach) => {
        const list = byAchievement.get(ach.id) ?? [];
        const oneOff = list.filter((t) => !t.recurrence);
        return {
          id: ach.id,
          title: ach.title,
          deadline: ach.deadline,
          taskCount: oneOff.length,
          doneCount: oneOff.filter((t) => t.completedAt).length,
          upNext: upNextOf(list, today),
        };
      }),
    }));

  return {
    today,
    practice,
    dueSoon: await dueBy(ctx, addDays(today, 7), areaById),
    groups,
  };
});

export type JumpTarget = {
  id: string;
  title: string;
  status: AchievementStatus;
  area: NavArea;
};

/** Every filed, live achievement, for the command palette to jump to. */
export const listJumpTargets = defineAction(
  z.object({}),
  async (ctx): Promise<JumpTarget[]> =>
    ctx.db
      .select({
        id: achievements.id,
        title: achievements.title,
        status: achievements.status,
        area: { id: areas.id, name: areas.name, emoji: areas.emoji },
      })
      .from(achievements)
      .innerJoin(areas, eq(areas.id, achievements.areaId))
      .where(
        and(
          eq(achievements.ownerId, ctx.ownerId),
          isNull(achievements.deletedAt),
          isNull(areas.deletedAt),
        ),
      )
      .orderBy(
        asc(areas.sortKey),
        asc(areas.id),
        asc(achievements.status),
        asc(achievements.sortKey),
        asc(achievements.id),
      ),
);
