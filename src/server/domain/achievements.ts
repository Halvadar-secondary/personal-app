import { and, asc, eq, gte, inArray, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import { addDays, localDate, weekStartOf } from "@/lib/dates";
import {
  type AchievementStatus,
  achievements,
  areas,
  type Task,
  taskCompletions,
  tasks,
} from "@/server/db/schema";
import { categoryIdsByTask } from "./categories";
import { type Ctx, defineAction } from "./context";
import { sortKeyFor, zPosition } from "./position";
import {
  findLive,
  insertRecorded,
  softDeleteRecorded,
  updateRecorded,
} from "./rows";

export const zDate = z.iso.date();
const zStatus = z.enum(["backlog", "active", "done"]);
const zTitle = z.string().trim().min(1).max(200);

/** Ordered achievements in one (area, status) column; areaId null = Inbox. */
function column(
  ctx: Ctx,
  areaId: string | null,
  status: AchievementStatus,
  exceptId?: string,
) {
  return ctx.db
    .select({ id: achievements.id, sortKey: achievements.sortKey })
    .from(achievements)
    .where(
      and(
        eq(achievements.ownerId, ctx.ownerId),
        areaId ? eq(achievements.areaId, areaId) : isNull(achievements.areaId),
        eq(achievements.status, status),
        isNull(achievements.deletedAt),
        exceptId ? ne(achievements.id, exceptId) : undefined,
      ),
    )
    .orderBy(asc(achievements.sortKey), asc(achievements.id));
}

/** The achievement's tasks that aren't deleted, in order. */
export function liveTasksOf(ctx: Ctx, achievementId: string) {
  return ctx.db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.ownerId, ctx.ownerId),
        eq(tasks.achievementId, achievementId),
        isNull(tasks.deletedAt),
      ),
    )
    .orderBy(asc(tasks.sortKey), asc(tasks.id));
}

export const createAchievement = defineAction(
  z.object({
    areaId: z.uuid().nullable(),
    title: zTitle,
    notes: z.string().max(10_000).nullish(),
    status: zStatus.default("backlog"),
    deadline: zDate.nullish(),
  }),
  async (ctx, input) => {
    if (input.areaId) await findLive(ctx, areas, input.areaId);
    const sortKey = sortKeyFor(
      await column(ctx, input.areaId, input.status),
      {},
    );
    return insertRecorded(ctx, "achievement", achievements, {
      ...input,
      sortKey,
      completedAt: input.status === "done" ? ctx.now() : null,
    });
  },
);

export const updateAchievement = defineAction(
  z.object({
    achievementId: z.uuid(),
    title: zTitle.optional(),
    notes: z.string().max(10_000).nullish(),
    deadline: zDate.nullish(),
  }),
  async (ctx, { achievementId, ...patch }) => {
    const before = await findLive(ctx, achievements, achievementId);
    return updateRecorded(ctx, "achievement", achievements, before, patch);
  },
);

/** Moves within or between columns and areas; tasks follow the area. */
export const moveAchievement = defineAction(
  zPosition.extend({
    achievementId: z.uuid(),
    status: zStatus.optional(),
    areaId: z.uuid().nullable().optional(),
  }),
  async (ctx, { achievementId, status, areaId, ...pos }) => {
    const before = await findLive(ctx, achievements, achievementId);
    const toArea = areaId === undefined ? before.areaId : areaId;
    const toStatus = status ?? before.status;
    if (toArea && toArea !== before.areaId) {
      await findLive(ctx, areas, toArea);
    }
    const sortKey = sortKeyFor(
      await column(ctx, toArea, toStatus, achievementId),
      pos,
    );
    const completedAt =
      toStatus !== "done"
        ? null
        : before.status === "done"
          ? before.completedAt
          : ctx.now();
    const after = await updateRecorded(
      ctx,
      "achievement",
      achievements,
      before,
      {
        areaId: toArea,
        status: toStatus,
        sortKey,
        completedAt,
      },
    );
    if (toArea !== before.areaId) {
      for (const t of await liveTasksOf(ctx, achievementId)) {
        await updateRecorded(ctx, "task", tasks, t, { areaId: toArea });
      }
    }
    return after;
  },
);

/** Soft-deletes the achievement and its tasks, in one batch. */
export const deleteAchievement = defineAction(
  z.object({ achievementId: z.uuid() }),
  async (ctx, { achievementId }) => {
    const ach = await findLive(ctx, achievements, achievementId);
    const taskRows = await liveTasksOf(ctx, achievementId);
    for (const t of taskRows) await softDeleteRecorded(ctx, "task", tasks, t);
    await softDeleteRecorded(ctx, "achievement", achievements, ach);
    return { deleted: 1 + taskRows.length };
  },
);

export const listAchievements = defineAction(
  z.object({ areaId: z.uuid().nullable(), status: zStatus.optional() }),
  (ctx, { areaId, status }) =>
    ctx.db
      .select()
      .from(achievements)
      .where(
        and(
          eq(achievements.ownerId, ctx.ownerId),
          areaId
            ? eq(achievements.areaId, areaId)
            : isNull(achievements.areaId),
          status ? eq(achievements.status, status) : undefined,
          isNull(achievements.deletedAt),
        ),
      )
      .orderBy(
        asc(achievements.status),
        asc(achievements.sortKey),
        asc(achievements.id),
      ),
);

export const getAchievement = defineAction(
  z.object({ achievementId: z.uuid() }),
  async (ctx, { achievementId }) => {
    const achievement = await findLive(ctx, achievements, achievementId);
    const rows = await liveTasksOf(ctx, achievementId);
    const ids = await categoryIdsByTask(
      ctx,
      rows.map((t) => t.id),
    );
    const today = localDate(ctx.now(), ctx.timeZone);
    // Completions inside the 4-week strip, for repeating tasks' history.
    const from = addDays(weekStartOf(today, ctx.weekStart), -21);
    const repeating = rows.filter((t) => t.recurrence).map((t) => t.id);
    const recent = repeating.length
      ? await ctx.db
          .select({
            taskId: taskCompletions.taskId,
            day: taskCompletions.occurrenceDate,
          })
          .from(taskCompletions)
          .where(
            and(
              eq(taskCompletions.ownerId, ctx.ownerId),
              inArray(taskCompletions.taskId, repeating),
              gte(taskCompletions.occurrenceDate, from),
            ),
          )
          .orderBy(asc(taskCompletions.occurrenceDate))
      : [];
    // A task with any completion can't switch between one-off and repeating.
    const completed = rows.length
      ? await ctx.db
          .selectDistinct({ taskId: taskCompletions.taskId })
          .from(taskCompletions)
          .where(
            and(
              eq(taskCompletions.ownerId, ctx.ownerId),
              inArray(
                taskCompletions.taskId,
                rows.map((t) => t.id),
              ),
            ),
          )
      : [];
    const hasCompletions = new Set(completed.map((c) => c.taskId));
    const withCategories: (Task & {
      categoryIds: string[];
      recentDone: string[];
      hasCompletions: boolean;
    })[] = rows.map((t) => ({
      ...t,
      categoryIds: ids.get(t.id)!,
      recentDone: recent.filter((r) => r.taskId === t.id).map((r) => r.day),
      hasCompletions: hasCompletions.has(t.id),
    }));
    return {
      achievement,
      tasks: withCategories,
      today,
      weekStart: ctx.weekStart,
    };
  },
);
