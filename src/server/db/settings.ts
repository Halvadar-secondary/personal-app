import { pgTable, smallint, text, timestamp } from "drizzle-orm/pg-core";

export const settings = pgTable("settings", {
  ownerId: text("owner_id").primaryKey(),
  timeZone: text("time_zone").notNull().default("UTC"),
  weekStart: smallint("week_start").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
