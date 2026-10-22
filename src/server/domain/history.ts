import { changeEvents } from "@/server/db/schema";
import type { Ctx } from "./context";

export type EntityType =
  | "area"
  | "achievement"
  | "task"
  | "category"
  | "task_categories"
  | "task_completion"
  | "practice_entry";

export type Change = {
  entityType: EntityType;
  entityId: string;
  op: "create" | "update" | "delete" | "restore";
  /** Full-row snapshots; null when the row doesn't exist on that side. */
  before: object | null;
  after: object | null;
};

/** Writes one change event in the action's batch (spec §5.5). */
export async function recordChange(ctx: Ctx, c: Change): Promise<void> {
  await ctx.db.insert(changeEvents).values({
    ownerId: ctx.ownerId,
    batchId: ctx.batchId,
    actor: ctx.actor,
    entityType: c.entityType,
    entityId: c.entityId,
    op: c.op,
    before: c.before,
    after: c.after,
    createdAt: ctx.now(),
  });
}
