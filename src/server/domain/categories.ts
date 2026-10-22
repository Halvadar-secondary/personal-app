import { and, asc, count, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { categories, taskCategories, tasks } from "@/server/db/schema";
import { type Ctx, defineAction } from "./context";
import { DomainError } from "./errors";
import { recordChange } from "./history";
import {
  findLive,
  insertRecorded,
  softDeleteRecorded,
  updateRecorded,
} from "./rows";

const zName = z.string().trim().min(1).max(40);
const zColor = z.string().min(1).max(32);

/** Names are unique per owner among live categories, ignoring case. */
async function assertNameFree(ctx: Ctx, name: string, exceptId?: string) {
  const [clash] = await ctx.db
    .select({ id: categories.id })
    .from(categories)
    .where(
      and(
        eq(categories.ownerId, ctx.ownerId),
        sql`lower(${categories.name}) = lower(${name})`,
        isNull(categories.deletedAt),
        exceptId ? ne(categories.id, exceptId) : undefined,
      ),
    );
  if (clash) throw new DomainError("conflict", { name });
}

export const createCategory = defineAction(
  z.object({ name: zName, color: zColor }),
  async (ctx, input) => {
    await assertNameFree(ctx, input.name);
    return insertRecorded(ctx, "category", categories, input);
  },
);

export const updateCategory = defineAction(
  z.object({
    categoryId: z.uuid(),
    name: zName.optional(),
    color: zColor.optional(),
  }),
  async (ctx, { categoryId, ...patch }) => {
    const before = await findLive(ctx, categories, categoryId);
    if (patch.name) await assertNameFree(ctx, patch.name, categoryId);
    return updateRecorded(ctx, "category", categories, before, patch);
  },
);

/** Soft delete; tasks keep their join rows, which reads filter out. */
export const deleteCategory = defineAction(
  z.object({ categoryId: z.uuid() }),
  async (ctx, { categoryId }) => {
    const before = await findLive(ctx, categories, categoryId);
    await softDeleteRecorded(ctx, "category", categories, before);
    return { deleted: 1 as const };
  },
);

/** The task's join rows as a snapshot (all of them, deleted categories included). */
export async function readTaskCategories(
  ctx: Ctx,
  taskId: string,
): Promise<{ categoryIds: string[] }> {
  const rows = await ctx.db
    .select({ id: taskCategories.categoryId })
    .from(taskCategories)
    .where(
      and(
        eq(taskCategories.ownerId, ctx.ownerId),
        eq(taskCategories.taskId, taskId),
      ),
    );
  return { categoryIds: rows.map((r) => r.id).sort() };
}

/** Replaces the task's join rows with `categoryIds`. */
export async function writeTaskCategories(
  ctx: Ctx,
  taskId: string,
  categoryIds: string[],
): Promise<void> {
  await ctx.db
    .delete(taskCategories)
    .where(
      and(
        eq(taskCategories.ownerId, ctx.ownerId),
        eq(taskCategories.taskId, taskId),
      ),
    );
  if (categoryIds.length) {
    await ctx.db.insert(taskCategories).values(
      categoryIds.map((categoryId) => ({
        taskId,
        categoryId,
        ownerId: ctx.ownerId,
      })),
    );
  }
}

export const setTaskCategories = defineAction(
  z.object({
    taskId: z.uuid(),
    categoryIds: z
      .array(z.uuid())
      .max(20)
      .refine((ids) => new Set(ids).size === ids.length, "duplicate ids"),
  }),
  async (ctx, { taskId, categoryIds }) => {
    await findLive(ctx, tasks, taskId);
    for (const id of categoryIds) await findLive(ctx, categories, id);
    const before = await readTaskCategories(ctx, taskId);
    await writeTaskCategories(ctx, taskId, categoryIds);
    const after = { categoryIds: [...categoryIds].sort() };
    await recordChange(ctx, {
      entityType: "task_categories",
      entityId: taskId,
      op: "update",
      before,
      after,
    });
    return after;
  },
);

/** Live category ids per task, for display. */
export async function categoryIdsByTask(
  ctx: Ctx,
  taskIds: string[],
): Promise<Map<string, string[]>> {
  const byTask = new Map<string, string[]>(taskIds.map((id) => [id, []]));
  if (!taskIds.length) return byTask;
  const rows = await ctx.db
    .select({ taskId: taskCategories.taskId, id: taskCategories.categoryId })
    .from(taskCategories)
    .innerJoin(categories, eq(categories.id, taskCategories.categoryId))
    .where(
      and(
        eq(taskCategories.ownerId, ctx.ownerId),
        inArray(taskCategories.taskId, taskIds),
        isNull(categories.deletedAt),
      ),
    )
    .orderBy(asc(categories.name));
  for (const r of rows) byTask.get(r.taskId)!.push(r.id);
  return byTask;
}

/** The global pool; with an area, the ones its tasks use most come first. */
export const listCategories = defineAction(
  z.object({ areaId: z.uuid().optional() }),
  async (ctx, { areaId }) => {
    const all = await ctx.db
      .select()
      .from(categories)
      .where(
        and(eq(categories.ownerId, ctx.ownerId), isNull(categories.deletedAt)),
      )
      .orderBy(asc(categories.name));
    const used = new Map<string, number>();
    if (areaId) {
      const counts = await ctx.db
        .select({ id: taskCategories.categoryId, n: count() })
        .from(taskCategories)
        .innerJoin(tasks, eq(tasks.id, taskCategories.taskId))
        .where(
          and(
            eq(taskCategories.ownerId, ctx.ownerId),
            eq(tasks.areaId, areaId),
            isNull(tasks.deletedAt),
          ),
        )
        .groupBy(taskCategories.categoryId);
      for (const c of counts) used.set(c.id, c.n);
    }
    return all
      .map((c) => ({ ...c, usedInArea: used.get(c.id) ?? 0 }))
      .sort((a, b) => b.usedInArea - a.usedInArea);
  },
);
