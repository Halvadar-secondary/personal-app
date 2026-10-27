import {
  and,
  asc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  or,
} from "drizzle-orm";
import { z } from "zod";
import { addDays, localDate, weekStartOf } from "@/lib/dates";
import { keysAfter } from "@/lib/ordering";
import {
  orderSection,
  rolledLabel,
  rollsInto,
  type Section,
  SECTIONS,
  weekListLabel,
  weekRange,
} from "@/lib/plan";
import { isDueOn, type Recurrence } from "@/lib/recurrence";
import {
  achievements,
  areas,
  dayPlans,
  type Task,
  taskCompletions,
  tasks,
} from "@/server/db/schema";
import { type Ctx, defineAction } from "./context";
import { DomainError } from "./errors";
import { planColumns, zPlan, zSection } from "./plan-fields";
import { sortKeyFor } from "./position";
import { findLive, updateRecorded } from "./rows";
import { targetProgress } from "./target-progress";
import type { NavArea } from "./views";

// Planned days and weeks (spec "Plan your days"): Today, Plan tomorrow and
// Week read from here. Rolling is computed, never written.

const zDay = z.iso.date();

export type DayItem = {
  id: string;
  title: string;
  kind: "once" | "repeat";
  section: Section;
  key: string | null;
  done: boolean;
  /** The day an unfinished task was planned on, when it rolled here. */
  rolledFrom: string | null;
  rolledLabel: string | null;
  achievement: { id: string; title: string } | null;
  area: NavArea | null;
  effort: number;
  recurrence: Recurrence | null;
  target: { amount: number; unit: string; progress: number } | null;
  createdAt: Date;
};

export type Sections = Record<Section, DayItem[]>;

export type WeekItem = {
  id: string;
  title: string;
  done: boolean;
  rolledLabel: string | null;
  achievement: { id: string; title: string } | null;
  area: NavArea | null;
};

const today = (ctx: Ctx) => localDate(ctx.now(), ctx.timeZone);

/** Tasks with their achievement and area, for building items. */
function withParents(ctx: Ctx) {
  return ctx.db
    .select({
      task: tasks,
      achievement: {
        id: achievements.id,
        title: achievements.title,
        status: achievements.status,
        deletedAt: achievements.deletedAt,
        areaId: achievements.areaId,
      },
      area: {
        id: areas.id,
        name: areas.name,
        emoji: areas.emoji,
        deletedAt: areas.deletedAt,
      },
    })
    .from(tasks)
    .leftJoin(achievements, eq(achievements.id, tasks.achievementId))
    .leftJoin(areas, eq(areas.id, achievements.areaId));
}

type Row = Awaited<ReturnType<ReturnType<typeof withParents>["where"]>>[number];

/** Loose, or under a live achievement (and a live area if it has one). */
function liveParents(r: Row): boolean {
  if (!r.task.achievementId) return true;
  if (!r.achievement || r.achievement.deletedAt) return false;
  return !r.achievement.areaId || (!!r.area && !r.area.deletedAt);
}

/** Repeating tasks show on days only when loose or under an active achievement. */
function inDayScope(r: Row): boolean {
  if (!r.task.achievementId) return true;
  return (
    liveParents(r) &&
    r.achievement!.status === "active" &&
    r.achievement!.areaId !== null
  );
}

function parentsOf(r: Row) {
  return {
    achievement: r.achievement
      ? { id: r.achievement.id, title: r.achievement.title }
      : null,
    area:
      r.area && r.achievement?.areaId
        ? { id: r.area.id, name: r.area.name, emoji: r.area.emoji }
        : null,
  };
}

async function itemsFor(
  ctx: Ctx,
  rows: { row: Row; done: boolean; rolledFrom: string | null }[],
  day: string,
  now: string,
): Promise<Sections> {
  const progress = await targetProgress(
    ctx,
    rows
      .filter((r) => r.row.task.targetAmount !== null)
      .map((r) => r.row.task.id),
  );
  const out: Sections = { work: [], spare: [] };
  for (const { row, done, rolledFrom } of rows) {
    const t = row.task;
    const section = t.planSection ?? "spare";
    out[section].push({
      id: t.id,
      title: t.title,
      kind: t.recurrence ? "repeat" : "once",
      section,
      key: t.planSortKey,
      done,
      rolledFrom,
      rolledLabel: rolledFrom ? rolledLabel(rolledFrom, day, now) : null,
      ...parentsOf(row),
      effort: t.effort,
      recurrence: t.recurrence,
      target:
        t.targetAmount !== null
          ? {
              amount: t.targetAmount,
              unit: t.targetUnit!,
              progress: progress.get(t.id) ?? 0,
            }
          : null,
      createdAt: t.createdAt,
    });
  }
  for (const s of SECTIONS) out[s] = orderSection(out[s]);
  return out;
}

/** Everything on `day`: its one-offs, the ones rolled onto it, and due repeats. */
async function daySections(ctx: Ctx, day: string): Promise<Sections> {
  const now = today(ctx);
  // Completed in the last two days covers "done today" in any time zone.
  const recently = new Date(ctx.now().getTime() - 2 * 86_400_000);
  const once = await withParents(ctx).where(
    and(
      eq(tasks.ownerId, ctx.ownerId),
      isNull(tasks.deletedAt),
      isNull(tasks.recurrence),
      lte(tasks.plannedOn, day),
      or(
        eq(tasks.plannedOn, day),
        isNull(tasks.completedAt),
        gte(tasks.completedAt, recently),
      ),
    ),
  );
  const picked: { row: Row; done: boolean; rolledFrom: string | null }[] = [];
  for (const row of once.filter(liveParents)) {
    const t = row.task;
    const done = t.completedAt !== null;
    if (t.plannedOn === day) {
      picked.push({ row, done, rolledFrom: null });
    } else if (!done && rollsInto(t.plannedOn!, day, now)) {
      picked.push({ row, done, rolledFrom: t.plannedOn });
    } else if (
      done &&
      day === now &&
      localDate(t.completedAt!, ctx.timeZone) === now
    ) {
      // Rolled here and finished today: it stays, ticked.
      picked.push({ row, done, rolledFrom: t.plannedOn });
    }
  }

  const repeating = (
    await withParents(ctx).where(
      and(
        eq(tasks.ownerId, ctx.ownerId),
        isNull(tasks.deletedAt),
        isNotNull(tasks.recurrence),
      ),
    )
  ).filter((r) => inDayScope(r) && isDueOn(r.task.recurrence!, day));
  const ids = repeating.map((r) => r.task.id);
  const doneRows = ids.length
    ? await ctx.db
        .select({ taskId: taskCompletions.taskId })
        .from(taskCompletions)
        .where(
          and(
            eq(taskCompletions.ownerId, ctx.ownerId),
            inArray(taskCompletions.taskId, ids),
            eq(taskCompletions.occurrenceDate, day),
          ),
        )
    : [];
  const doneIds = new Set(doneRows.map((d) => d.taskId));
  for (const row of repeating) {
    picked.push({ row, done: doneIds.has(row.task.id), rolledFrom: null });
  }
  return itemsFor(ctx, picked, day, now);
}

async function isPlanned(ctx: Ctx, day: string): Promise<boolean> {
  const [mark] = await ctx.db
    .select({ day: dayPlans.day })
    .from(dayPlans)
    .where(and(eq(dayPlans.ownerId, ctx.ownerId), eq(dayPlans.day, day)));
  if (mark) return true;
  const [task] = await ctx.db
    .select({ id: tasks.id })
    .from(tasks)
    .where(
      and(
        eq(tasks.ownerId, ctx.ownerId),
        isNull(tasks.deletedAt),
        eq(tasks.plannedOn, day),
      ),
    )
    .limit(1);
  return task !== undefined;
}

/** A day's plan: Work and Spare time, rolled tasks first. */
export const getDay = defineAction(
  z.object({ day: zDay.optional() }),
  async (ctx, input) => {
    const now = today(ctx);
    const day = input.day ?? now;
    return {
      day,
      today: now,
      planned: await isPlanned(ctx, day),
      sections: await daySections(ctx, day),
    };
  },
);

/** Week tasks of the week starting `start`, plus earlier unfinished ones while it is current. */
async function weekList(
  ctx: Ctx,
  start: string,
  opts: { openOnly?: boolean } = {},
): Promise<WeekItem[]> {
  const now = today(ctx);
  const end = addDays(start, 6);
  // Leftovers roll into the week being lived or planned next.
  const rolls = start <= addDays(now, 1) && now <= end;
  const rows = (
    await withParents(ctx).where(
      and(
        eq(tasks.ownerId, ctx.ownerId),
        isNull(tasks.deletedAt),
        isNotNull(tasks.plannedWeek),
        or(
          and(gte(tasks.plannedWeek, start), lte(tasks.plannedWeek, end)),
          rolls
            ? and(lt(tasks.plannedWeek, start), isNull(tasks.completedAt))
            : undefined,
        ),
        opts.openOnly ? isNull(tasks.completedAt) : undefined,
      ),
    )
  ).filter(liveParents);
  return rows
    .map((r) => ({ r, rolled: r.task.plannedWeek! < start }))
    .sort(
      (a, b) =>
        Number(b.rolled) - Number(a.rolled) ||
        a.r.task.plannedWeek!.localeCompare(b.r.task.plannedWeek!) ||
        a.r.task.createdAt.getTime() - b.r.task.createdAt.getTime(),
    )
    .map(({ r, rolled }) => ({
      id: r.task.id,
      title: r.task.title,
      done: r.task.completedAt !== null,
      rolledLabel: rolled
        ? weekListLabel(r.task.plannedWeek!, start, ctx.weekStart)
        : null,
      ...parentsOf(r),
    }));
}

/** A week: each day's plan and the week's own list. */
export const getWeek = defineAction(
  z.object({ start: zDay.optional() }),
  async (ctx, input) => {
    const now = today(ctx);
    const { start, end } = weekRange(input.start ?? now, ctx.weekStart);
    const days = [];
    for (let i = 0; i < 7; i++) {
      const day = addDays(start, i);
      days.push({ day, sections: await daySections(ctx, day) });
    }
    return { start, end, today: now, days, list: await weekList(ctx, start) };
  },
);

export type PlanOptions = {
  week: WeekItem[];
  achievements: {
    area: NavArea;
    achievement: { id: string; title: string };
    tasks: {
      id: string;
      title: string;
      plannedOn: string | null;
      plannedWeek: string | null;
    }[];
  }[];
};

/** What the planner can pick from for `day`. */
export const getPlanOptions = defineAction(
  z.object({ day: zDay }),
  async (ctx, { day }): Promise<PlanOptions> => {
    const week = await weekList(ctx, weekStartOf(day, ctx.weekStart), {
      openOnly: true,
    });
    const rows = await ctx.db
      .select({
        task: {
          id: tasks.id,
          title: tasks.title,
          plannedOn: tasks.plannedOn,
          plannedWeek: tasks.plannedWeek,
        },
        achievement: { id: achievements.id, title: achievements.title },
        area: { id: areas.id, name: areas.name, emoji: areas.emoji },
      })
      .from(tasks)
      .innerJoin(achievements, eq(achievements.id, tasks.achievementId))
      .innerJoin(areas, eq(areas.id, achievements.areaId))
      .where(
        and(
          eq(tasks.ownerId, ctx.ownerId),
          isNull(tasks.deletedAt),
          isNull(tasks.recurrence),
          isNull(tasks.completedAt),
          or(isNull(tasks.plannedOn), ne(tasks.plannedOn, day)),
          isNull(achievements.deletedAt),
          eq(achievements.status, "active"),
          isNull(areas.deletedAt),
        ),
      )
      .orderBy(
        asc(areas.sortKey),
        asc(areas.id),
        asc(achievements.sortKey),
        asc(achievements.id),
        asc(tasks.sortKey),
        asc(tasks.id),
      );
    const groups: PlanOptions["achievements"] = [];
    for (const r of rows) {
      const last = groups.at(-1);
      if (last?.achievement.id === r.achievement.id) last.tasks.push(r.task);
      else groups.push({ ...r, tasks: [r.task] });
    }
    return { week, achievements: groups };
  },
);

/** Plans a one-off task on a day (last in its section), in a week, or clears it. */
export const planTask = defineAction(
  z.object({ taskId: z.uuid(), plan: zPlan }),
  async (ctx, { taskId, plan }): Promise<Task> => {
    const before = await findLive(ctx, tasks, taskId);
    if (before.recurrence) throw new DomainError("invalid_state");
    const cols = await planColumns(
      ctx,
      plan,
      { section: before.planSection },
      taskId,
    );
    return updateRecorded(ctx, "task", tasks, before, cols);
  },
);

/**
 * Puts a task at a place in a day's section. A one-off is planned on that
 * day (a rolled one is adopted); a repeating task due that day moves its
 * standing place, which every day it appears on shares.
 */
export const placeTask = defineAction(
  z.object({
    taskId: z.uuid(),
    day: zDay,
    section: zSection,
    afterId: z.uuid().nullish(),
    beforeId: z.uuid().nullish(),
  }),
  async (ctx, { taskId, day, section, afterId, beforeId }) => {
    const before = await findLive(ctx, tasks, taskId);
    const sections = await daySections(ctx, day);
    const shown = [...sections.work, ...sections.spare].some(
      (i) => i.id === taskId,
    );
    if (before.recurrence && !shown) throw new DomainError("invalid_state");

    // Rolled items sit above the ordered ones; a drop among them means the top.
    const items = sections[section].filter(
      (i) => i.id !== taskId && i.rolledFrom === null,
    );
    const lastKey = items.findLast((i) => i.key !== null)?.key ?? null;
    const unkeyed = items.filter((i) => i.key === null);
    const fresh = keysAfter(lastKey, unkeyed.length);
    for (const [n, item] of unkeyed.entries()) {
      const row = await findLive(ctx, tasks, item.id);
      item.key = fresh[n]!;
      await updateRecorded(ctx, "task", tasks, row, {
        planSection: section,
        planSortKey: item.key,
      });
    }
    const siblings = items.map((i) => ({ id: i.id, sortKey: i.key! }));
    const has = (id: string | null | undefined) =>
      !!id && siblings.some((s) => s.id === id);
    const pos =
      has(afterId) || has(beforeId)
        ? {
            afterId: has(afterId) ? afterId : null,
            beforeId: has(beforeId) ? beforeId : null,
          }
        : afterId || beforeId
          ? { beforeId: siblings[0]?.id ?? null }
          : {};
    const key = sortKeyFor(siblings, pos);
    return updateRecorded(ctx, "task", tasks, before, {
      planSection: section,
      planSortKey: key,
      ...(before.recurrence ? {} : { plannedOn: day, plannedWeek: null }),
    });
  },
);

/** "Done planning": the evening reminder skips this day. Not history. */
export const markDayPlanned = defineAction(
  z.object({ day: zDay }),
  async (ctx, { day }) => {
    await ctx.db
      .insert(dayPlans)
      .values({ ownerId: ctx.ownerId, day, createdAt: ctx.now() })
      .onConflictDoNothing();
    return { day };
  },
);
