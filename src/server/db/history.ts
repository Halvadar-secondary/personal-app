import {
  bigserial,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

export const changeOp = pgEnum("change_op", [
  "create",
  "update",
  "delete",
  "restore",
]);

/** One row per entity an action touched; rows sharing batch_id undo together (spec §5.5). */
export const changeEvents = pgTable(
  "change_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Total order of events, for replaying a batch in reverse.
    seq: bigserial("seq", { mode: "number" }).notNull().unique(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    batchId: uuid("batch_id").notNull(),
    actor: text("actor").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    op: changeOp("op").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    undoneAt: timestamp("undone_at", { withTimezone: true }),
    undoneByBatch: uuid("undone_by_batch"),
  },
  (t) => [
    index().on(t.ownerId, t.batchId),
    index().on(t.ownerId, t.entityType, t.entityId),
  ],
);

export type ChangeEvent = typeof changeEvents.$inferSelect;
