import { sql } from "drizzle-orm";
import type { Recurrence } from "@/lib/recurrence";
import {
  check,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

const timestamptz = (name: string) => timestamp(name, { withTimezone: true });

/**
 * Fractional-index keys compare by byte ("Zz" < "a0"). COLLATE "C" makes
 * Postgres order them the same way whatever the database's default collation.
 */
const sortKey = customType<{ data: string }>({
  dataType: () => 'text COLLATE "C"',
});

const ownerId = () =>
  text("owner_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" });

const base = () => ({
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: ownerId(),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
  updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  deletedAt: timestamptz("deleted_at"),
});

export type Cover = { type: "gradient" | "color" | "image"; value: string };

export type { Recurrence };

export const achievementStatus = pgEnum("achievement_status", [
  "backlog",
  "active",
  "done",
]);

export const areas = pgTable("areas", {
  ...base(),
  name: text("name").notNull(),
  emoji: text("emoji"),
  cover: jsonb("cover").$type<Cover>(),
  description: text("description"),
  sortKey: sortKey("sort_key").notNull(),
});

export const achievements = pgTable(
  "achievements",
  {
    ...base(),
    // null = Inbox
    areaId: uuid("area_id").references(() => areas.id),
    title: text("title").notNull(),
    notes: text("notes"),
    status: achievementStatus("status").notNull().default("backlog"),
    deadline: date("deadline", { mode: "string" }),
    completedAt: timestamptz("completed_at"),
    sortKey: sortKey("sort_key").notNull(),
  },
  (t) => [index().on(t.ownerId, t.areaId, t.status, t.sortKey)],
);

export const tasks = pgTable(
  "tasks",
  {
    ...base(),
    achievementId: uuid("achievement_id").references(() => achievements.id),
    // Denormalised from the achievement for fast area queries.
    areaId: uuid("area_id").references(() => areas.id),
    title: text("title").notNull(),
    notes: text("notes"),
    effort: smallint("effort").notNull().default(2),
    deadline: date("deadline", { mode: "string" }),
    recurrence: jsonb("recurrence").$type<Recurrence>(),
    completedAt: timestamptz("completed_at"),
    sortKey: sortKey("sort_key").notNull(),
  },
  (t) => [
    check("tasks_effort_range", sql`${t.effort} between 1 and 5`),
    // Filed means under an achievement: never directly in an area.
    check(
      "tasks_area_needs_achievement",
      sql`${t.achievementId} is not null or ${t.areaId} is null`,
    ),
    index().on(t.ownerId, t.achievementId, t.sortKey),
  ],
);

export const categories = pgTable(
  "categories",
  {
    ...base(),
    name: text("name").notNull(),
    color: text("color").notNull(),
  },
  (t) => [
    uniqueIndex("categories_owner_name_unique")
      .on(t.ownerId, sql`lower(${t.name})`)
      .where(sql`${t.deletedAt} is null`),
  ],
);

export const taskCategories = pgTable(
  "task_categories",
  {
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id),
    ownerId: ownerId(),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.categoryId] })],
);

export const taskCompletions = pgTable(
  "task_completions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: ownerId(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id),
    completedAt: timestamptz("completed_at").notNull(),
    occurrenceDate: date("occurrence_date", { mode: "string" }).notNull(),
    // Frozen at award time so later effort edits don't rewrite history.
    xpAwarded: integer("xp_awarded").notNull(),
  },
  (t) => [unique().on(t.taskId, t.occurrenceDate)],
);

export const practiceEntries = pgTable("practice_entries", {
  ...base(),
  taskId: uuid("task_id")
    .notNull()
    .references(() => tasks.id),
  startedAt: timestamptz("started_at").notNull(),
  durationSeconds: integer("duration_seconds"),
  metrics: jsonb("metrics").$type<Record<string, number | string>>(),
  note: text("note"),
  // manual, mcp:<client>, later tool:<name>
  source: text("source").notNull(),
});

export type Area = typeof areas.$inferSelect;
export type Achievement = typeof achievements.$inferSelect;
export type AchievementStatus = Achievement["status"];
export type Task = typeof tasks.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type TaskCompletion = typeof taskCompletions.$inferSelect;
export type PracticeEntry = typeof practiceEntries.$inferSelect;
