import { and, asc, count, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import {
  type Achievement,
  type Area,
  type AchievementStatus,
  achievements,
  areas,
  categories,
  taskCategories,
  tasks,
} from "@/server/db/schema";
import { listAreas } from "./areas";
import { callAction, defineAction } from "./context";
import { findLive } from "./rows";

// Read models for the UI's screens. Each concern is one grouped query.

export type AreaSummary = Area & {
  counts: Record<AchievementStatus, number>;
};
export type Overview = {
  areas: AreaSummary[];
  inboxCount: number;
  activeCount: number;
};

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
    return {
      areas: rows.map((a) => ({ ...a, counts: counts.get(a.id)! })),
      inboxCount,
      activeCount,
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
    const progress = await ctx.db
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

    const byId = new Map(progress.map((p) => [p.id, p]));
    const cats = new Map<string, string[]>(ids.map((id) => [id, []]));
    for (const u of used) cats.get(u.id!)!.push(u.categoryId);
    const cards: AchievementCard[] = rows.map((a) => ({
      ...a,
      taskCount: byId.get(a.id)?.total ?? 0,
      doneCount: byId.get(a.id)?.done ?? 0,
      categoryIds: cats.get(a.id)!,
    }));
    return { area, achievements: cards };
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
