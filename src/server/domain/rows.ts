import { and, eq, isNull } from "drizzle-orm";
import {
  achievements,
  areas,
  categories,
  goals,
  trackerMoments,
  trackers,
  practiceEntries,
  tasks,
} from "@/server/db/schema";
import type { Ctx } from "./context";
import { found } from "./errors";
import { type EntityType, recordChange } from "./history";

/** The soft-deleted, owner-scoped tables that share id/owner/timestamps. */
export type SoftTable =
  | typeof areas
  | typeof achievements
  | typeof tasks
  | typeof categories
  | typeof practiceEntries
  | typeof goals
  | typeof trackers
  | typeof trackerMoments;

type Row<T extends SoftTable> = T["$inferSelect"];

/** The live (not deleted) row with this id, owned by the caller; else not_found. */
export async function findLive<T extends SoftTable>(
  ctx: Ctx,
  table: T,
  id: string,
): Promise<Row<T>> {
  const [row] = await ctx.db
    .select()
    .from(table as SoftTable)
    .where(
      and(
        eq(table.id, id),
        eq(table.ownerId, ctx.ownerId),
        isNull(table.deletedAt),
      ),
    );
  return found(row as Row<T> | undefined);
}

export async function insertRecorded<T extends SoftTable>(
  ctx: Ctx,
  entityType: EntityType,
  table: T,
  values: Omit<T["$inferInsert"], "ownerId">,
): Promise<Row<T>> {
  const now = ctx.now();
  const [row] = (await ctx.db
    .insert(table as SoftTable)
    .values({
      ...values,
      ownerId: ctx.ownerId,
      createdAt: now,
      updatedAt: now,
    } as never)
    .returning()) as Row<T>[];
  await recordChange(ctx, {
    entityType,
    entityId: row!.id,
    op: "create",
    before: null,
    after: row!,
  });
  return row!;
}

export async function updateRecorded<T extends SoftTable>(
  ctx: Ctx,
  entityType: EntityType,
  table: T,
  before: Row<T>,
  patch: Partial<T["$inferInsert"]>,
  op: "update" | "delete" = "update",
): Promise<Row<T>> {
  const [row] = (await ctx.db
    .update(table as SoftTable)
    .set({ ...patch, updatedAt: ctx.now() } as never)
    .where(and(eq(table.id, before.id), eq(table.ownerId, ctx.ownerId)))
    .returning()) as Row<T>[];
  await recordChange(ctx, {
    entityType,
    entityId: before.id,
    op,
    before,
    after: row!,
  });
  return row!;
}

export function softDeleteRecorded<T extends SoftTable>(
  ctx: Ctx,
  entityType: EntityType,
  table: T,
  before: Row<T>,
): Promise<Row<T>> {
  return updateRecorded(
    ctx,
    entityType,
    table,
    before,
    { deletedAt: ctx.now() } as Partial<T["$inferInsert"]>,
    "delete",
  );
}
