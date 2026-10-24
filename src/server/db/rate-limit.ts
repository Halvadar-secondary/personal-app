import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/** Fixed-window request counts, one row per key (spec §6.2). */
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  count: integer("count").notNull(),
});
