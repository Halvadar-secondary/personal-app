import { text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

export const timestamptz = (name: string) =>
  timestamp(name, { withTimezone: true });

export const ownerId = () =>
  text("owner_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" });

export const base = () => ({
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: ownerId(),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
  updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  deletedAt: timestamptz("deleted_at"),
});
