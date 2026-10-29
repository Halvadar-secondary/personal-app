import {
  boolean,
  date,
  pgTable,
  smallint,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

export const settings = pgTable("settings", {
  ownerId: text("owner_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  timeZone: text("time_zone").notNull().default("UTC"),
  weekStart: smallint("week_start").notNull().default(1),
  reminderEnabled: boolean("reminder_enabled").notNull().default(false),
  // Owner-local "HH:MM".
  reminderTime: text("reminder_time").notNull().default("21:00"),
  // The owner-local evening the last reminder went out.
  lastReminderOn: date("last_reminder_on", { mode: "string" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
