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
  real,
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

export const planSection = pgEnum("plan_section", ["work", "spare"]);

export const goalStatus = pgEnum("goal_status", ["active", "done"]);

/** A life goal with a deadline that achievements from any area feed. */
export const goals = pgTable("goals", {
  ...base(),
  title: text("title").notNull(),
  notes: text("notes"),
  deadline: date("deadline", { mode: "string" }),
  status: goalStatus("status").notNull().default("active"),
  completedAt: timestamptz("completed_at"),
  sortKey: sortKey("sort_key").notNull(),
});

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
    goalId: uuid("goal_id").references(() => goals.id),
  },
  (t) => [
    index().on(t.ownerId, t.areaId, t.status, t.sortKey),
    index().on(t.ownerId, t.goalId),
  ],
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
    // When to do it: a day, or a week (its first day). Never both.
    plannedOn: date("planned_on", { mode: "string" }),
    plannedWeek: date("planned_week", { mode: "string" }),
    // Where it sits on a day; a repeating task's standing place.
    planSection: planSection("plan_section"),
    planSortKey: sortKey("plan_sort_key"),
    targetAmount: real("target_amount"),
    targetUnit: text("target_unit"),
  },
  (t) => [
    check("tasks_effort_range", sql`${t.effort} between 1 and 5`),
    check(
      "tasks_one_plan",
      sql`${t.plannedOn} is null or ${t.plannedWeek} is null`,
    ),
    // A repeating task's rule is its plan; it has no target either.
    check(
      "tasks_repeat_unplanned",
      sql`${t.recurrence} is null or (${t.plannedOn} is null and ${t.plannedWeek} is null)`,
    ),
    check(
      "tasks_target_pair",
      sql`(${t.targetAmount} is null) = (${t.targetUnit} is null)`,
    ),
    check(
      "tasks_target_positive",
      sql`${t.targetAmount} is null or ${t.targetAmount} > 0`,
    ),
    check(
      "tasks_target_once",
      sql`${t.targetAmount} is null or ${t.recurrence} is null`,
    ),
    // Filed means under an achievement: never directly in an area.
    check(
      "tasks_area_needs_achievement",
      sql`${t.achievementId} is not null or ${t.areaId} is null`,
    ),
    index().on(t.ownerId, t.achievementId, t.sortKey),
    index().on(t.ownerId, t.plannedOn),
    index().on(t.ownerId, t.plannedWeek),
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
  // Progress toward a target in its unit (hours use durationSeconds).
  amount: real("amount"),
  note: text("note"),
  // manual, mcp:<client>, later tool:<name>
  source: text("source").notNull(),
});

export const trackerDirection = pgEnum("tracker_direction", ["less", "more"]);

/** A behaviour to watch: fewer is better ("less") or more is ("more"). */
export const trackers = pgTable("trackers", {
  ...base(),
  name: text("name").notNull(),
  emoji: text("emoji"),
  direction: trackerDirection("direction").notNull().default("less"),
  archivedAt: timestamptz("archived_at"),
  sortKey: sortKey("sort_key").notNull(),
});

/** One time the behaviour happened. */
export const trackerMoments = pgTable(
  "tracker_moments",
  {
    ...base(),
    trackerId: uuid("tracker_id")
      .notNull()
      .references(() => trackers.id),
    at: timestamptz("at").notNull(),
    intensity: smallint("intensity"),
    note: text("note"),
  },
  (t) => [
    check(
      "tracker_moments_intensity_range",
      sql`${t.intensity} is null or ${t.intensity} between 1 and 5`,
    ),
    index().on(t.ownerId, t.trackerId, t.at),
  ],
);

export type Tracker = typeof trackers.$inferSelect;
export type TrackerMoment = typeof trackerMoments.$inferSelect;
export type TrackerDirection = Tracker["direction"];

/** Days the owner finished planning; the evening reminder skips them. */
export const dayPlans = pgTable(
  "day_plans",
  {
    ownerId: ownerId(),
    day: date("day", { mode: "string" }).notNull(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.ownerId, t.day] })],
);

export type Goal = typeof goals.$inferSelect;
export type GoalStatus = Goal["status"];
export type DayPlan = typeof dayPlans.$inferSelect;
export type Area = typeof areas.$inferSelect;
export type Achievement = typeof achievements.$inferSelect;
export type AchievementStatus = Achievement["status"];
export type Task = typeof tasks.$inferSelect;
export type PlanSection = NonNullable<Task["planSection"]>;
export type Category = typeof categories.$inferSelect;
export type TaskCompletion = typeof taskCompletions.$inferSelect;
export type PracticeEntry = typeof practiceEntries.$inferSelect;
