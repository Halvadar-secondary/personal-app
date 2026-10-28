import type { z } from "zod";
import {
  createAchievement,
  getAchievement,
  listAchievements,
  moveAchievement,
  updateAchievement,
} from "@/server/domain/achievements";
import { createArea, updateArea } from "@/server/domain/areas";
import {
  createCategory,
  listCategories,
  setTaskCategories,
} from "@/server/domain/categories";
import type { Action } from "@/server/domain/context";
import {
  createGoal,
  getGoal,
  linkAchievement,
  listGoals,
  updateGoal,
} from "@/server/domain/goals";
import { listHistory } from "@/server/domain/history-view";
import { captureItem } from "@/server/domain/inbox";
import { deleteItem, fileItem } from "@/server/domain/mcp-actions";
import { getDay, getWeek, placeTask, planTask } from "@/server/domain/plan";
import { addPracticeEntry } from "@/server/domain/practice";
import { search } from "@/server/domain/search";
import {
  completeTask,
  createTasks,
  moveTask,
  uncompleteTask,
  updateTask,
} from "@/server/domain/tasks";
import { logProgress } from "@/server/domain/targets";
import {
  createTracker,
  listMoments,
  listTrackers,
  logMoment,
} from "@/server/domain/trackers";
import { undoBatch } from "@/server/domain/undo";
import { getOverview } from "@/server/domain/views";

// Spec §7.2: each MCP tool is one domain action, with a description written
// for the model and a one-line summary of the result. No logic lives here.

export type ToolDef = {
  name: string;
  description: string;
  action: Action<z.ZodType, unknown>;
  summary: (output: unknown, input: unknown) => string;
  destructive?: boolean;
};

function tool<S extends z.ZodType, O>(def: {
  name: string;
  description: string;
  action: Action<S, O>;
  summary: (output: O, input: z.output<S>) => string;
  destructive?: boolean;
}): ToolDef {
  return def as unknown as ToolDef;
}

const q = (s: string) => `“${s}”`;
const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

const STATUSES =
  "Statuses: backlog (someday), active (working on it now), done.";

const PLAN =
  'Optional plan says when to do a one-off task: {type:"day", date, section} (section "work" or "spare", default spare) or {type:"week", date} (any day in that week). Repeating tasks take no plan.';

const TARGET =
  'Optional target is an amount to reach: {amount, unit} with unit "times", "hours", "pages", "lessons" or another short word; progress is logged with log_progress.';

export const TOOLS: ToolDef[] = [
  tool({
    name: "get_overview",
    description:
      "The owner's areas (life areas such as Guitar or Health) with level, XP, streak and achievement counts, plus Inbox and Active counts. Start here to find area ids.",
    action: getOverview,
    summary: (o) =>
      `${plural(o.areas.length, "area")}, ${o.inboxCount} in Inbox`,
  }),
  tool({
    name: "list_achievements",
    description: `Achievements (goals) in one area, or in the Inbox when areaId is null, optionally filtered by status. ${STATUSES}`,
    action: listAchievements,
    summary: (o) => plural(o.length, "achievement"),
  }),
  tool({
    name: "get_achievement",
    description:
      "One achievement with its tasks in order, each task's categories and recent completions.",
    action: getAchievement,
    summary: (o) =>
      `${q(o.achievement.title)}: ${plural(o.tasks.length, "task")}`,
  }),
  tool({
    name: "search",
    description:
      "Find areas, achievements and tasks whose title or notes contain the text.",
    action: search,
    summary: (o) =>
      `${plural(o.areas.length, "area")}, ${plural(o.achievements.length, "achievement")}, ${plural(o.tasks.length, "task")}`,
  }),
  tool({
    name: "create_area",
    description:
      "Create a life area, such as Guitar or Health. Achievements live inside areas.",
    action: createArea,
    summary: (o) => `Added area ${q(o.name)}`,
  }),
  tool({
    name: "update_area",
    description:
      "Rename an area or change its emoji, cover or description. Only the fields you pass change.",
    action: updateArea,
    summary: (o) => `Updated area ${q(o.name)}`,
  }),
  tool({
    name: "create_achievement",
    description: `Create an achievement (a goal made of tasks) in an area's backlog, or in the Inbox when areaId is null. Add its tasks with create_tasks. ${STATUSES}`,
    action: createAchievement,
    summary: (o) => `Added ${q(o.title)}`,
  }),
  tool({
    name: "update_achievement",
    description:
      "Change an achievement's title or notes. To change its status or area, use move_achievement.",
    action: updateAchievement,
    summary: (o) => `Updated ${q(o.title)}`,
  }),
  tool({
    name: "move_achievement",
    description: `Change an achievement's status, area or position (afterId/beforeId are sibling achievement ids). ${STATUSES}`,
    action: moveAchievement,
    summary: (o) => `Moved ${q(o.title)} to ${o.status}`,
  }),
  tool({
    name: "create_tasks",
    description: `Add tasks to an achievement (or with achievementId null, a loose task), appended in the order given. Prefer one achievement with 5–15 ordered tasks, easiest first. Creating them in one call makes one undo step. ${PLAN} ${TARGET} A loose task with a plan is not in the Inbox.`,
    action: createTasks,
    summary: (o) =>
      o.length === 1
        ? `Added task ${q(o[0]!.title)}`
        : `Added ${o.length} tasks`,
  }),
  tool({
    name: "update_task",
    description: `Change a task's title, notes, effort (1–5), deadline (YYYY-MM-DD), recurrence or target. Only the fields you pass change. To set when to do it, use plan_task. ${TARGET}`,
    action: updateTask,
    summary: (o) => `Updated task ${q(o.title)}`,
  }),
  tool({
    name: "move_task",
    description:
      "Move a task to another achievement (null for the Inbox) or position (afterId/beforeId are sibling task ids).",
    action: moveTask,
    summary: (o) => `Moved task ${q(o.title)}`,
  }),
  tool({
    name: "complete_task",
    description:
      "Mark a task done. For a repeating task this completes today's occurrence and earns XP.",
    action: completeTask,
    summary: (o) => `Completed ${q(o.task.title)}`,
  }),
  tool({
    name: "uncomplete_task",
    description:
      "Undo a task's completion (today's occurrence for a repeating task).",
    action: uncompleteTask,
    summary: (o) => `Uncompleted ${q(o.title)}`,
  }),
  tool({
    name: "capture",
    description:
      "Quick capture into the Inbox. Plain text makes a task; text starting with '!' makes an achievement. Optional context files it into an area or achievement.",
    action: captureItem,
    summary: (o, i) =>
      `Captured ${o.kind} ${q(i.text.replace(/^\s*!/, "").trim())}`,
  }),
  tool({
    name: "file_item",
    description:
      "File an Inbox item: an achievement into an area (areaId, lands in backlog), or a task into an achievement (achievementId).",
    action: fileItem,
    summary: (_o, i) => `Filed ${i.kind}`,
  }),
  tool({
    name: "list_categories",
    description:
      "The owner's task categories (tags such as Technique), with how often each is used in an area when areaId is given.",
    action: listCategories,
    summary: (o) => plural(o.length, "category", "categories"),
  }),
  tool({
    name: "create_category",
    description: "Create a task category with a name and a colour.",
    action: createCategory,
    summary: (o) => `Added category ${q(o.name)}`,
  }),
  tool({
    name: "set_task_categories",
    description:
      "Replace a task's categories with exactly these category ids (an empty list clears them).",
    action: setTaskCategories,
    summary: (_o, i) =>
      `Set ${plural(i.categoryIds.length, "category", "categories")}`,
  }),
  tool({
    name: "log_practice",
    description:
      "Log a practice session on a task: when it started, how long, free-form metrics (e.g. bpm) and a note.",
    action: addPracticeEntry,
    summary: () => "Logged practice",
  }),
  tool({
    name: "get_day",
    description:
      "One day's plan (default today, YYYY-MM-DD): its Work and Spare time lists in order, with repeating tasks due that day and unfinished tasks rolled over from earlier days (rolledFrom).",
    action: getDay,
    summary: (o) =>
      `${o.day}: ${plural(o.sections.work.length + o.sections.spare.length, "item")}`,
  }),
  tool({
    name: "get_week",
    description:
      "A week (default this one; start may be any day in it): each day's plan, and the week's own list of tasks planned for the week without a day.",
    action: getWeek,
    summary: (o) => `Week of ${o.start}: ${plural(o.list.length, "week task")}`,
  }),
  tool({
    name: "plan_task",
    description: `Set when to do a one-off task, or clear it with plan null. ${PLAN} A day plan puts it last in its section; use place_task for an exact spot.`,
    action: planTask,
    summary: (o) => `Planned ${q(o.title)}`,
  }),
  tool({
    name: "place_task",
    description:
      "Put a task at a spot in a day's section (work or spare), after afterId and/or before beforeId (task ids on that day). A one-off is planned on that day; a repeating task due that day keeps that spot on every day.",
    action: placeTask,
    summary: (o) => `Placed ${q(o.title)}`,
  }),
  tool({
    name: "log_progress",
    description:
      "Log progress on a task with a target: amount in its unit (minutes for an hours target), optional note. Completes the task when the target is reached.",
    action: logProgress,
    summary: (o) => (o.completed ? "Target reached" : `Progress ${o.progress}`),
  }),
  tool({
    name: "list_goals",
    description:
      "The owner's life goals (broad aims with a deadline, such as writing a song) with progress across their linked achievements.",
    action: listGoals,
    summary: (o) => plural(o.goals.length, "goal"),
  }),
  tool({
    name: "get_goal",
    description:
      "One goal with the achievements that feed it, from any area, and their task progress.",
    action: getGoal,
    summary: (o) =>
      `${q(o.goal.title)}: ${plural(o.achievements.length, "achievement")}`,
  }),
  tool({
    name: "create_goal",
    description:
      "Create a life goal with an optional deadline (YYYY-MM-DD). Then link achievements to it with link_achievement_to_goal.",
    action: createGoal,
    summary: (o) => `Added goal ${q(o.title)}`,
  }),
  tool({
    name: "update_goal",
    description:
      "Change a goal's title, notes, deadline or status (active or done). Only the fields you pass change.",
    action: updateGoal,
    summary: (o) => `Updated goal ${q(o.title)}`,
  }),
  tool({
    name: "link_achievement_to_goal",
    description:
      "Link an achievement (from any area) to the goal it feeds, or unlink it with goalId null. An achievement feeds at most one goal.",
    action: linkAchievement,
    summary: (o) =>
      o.goalId ? `Linked ${q(o.title)}` : `Unlinked ${q(o.title)}`,
  }),
  tool({
    name: "list_trackers",
    description:
      "The owner's behaviour trackers (things to watch, such as anger or kindness; direction less means fewer is better) with this week so far, last week up to the same moment, and 8 weekly counts.",
    action: listTrackers,
    summary: (o) => plural(o.trackers.length, "tracker"),
  }),
  tool({
    name: "create_tracker",
    description:
      'Create a behaviour tracker: a name, an optional emoji, and direction "less" (fewer is better, the default) or "more".',
    action: createTracker,
    summary: (o) => `Added tracker ${q(o.name)}`,
  }),
  tool({
    name: "log_moment",
    description:
      "Log one time a tracked behaviour happened: optional at (ISO time, default now, never in the future), intensity 1–5 and a short note about what was happening.",
    action: logMoment,
    summary: (o) => `Logged a moment of ${q(o.trackerName)}`,
  }),
  tool({
    name: "get_tracker",
    description:
      "A tracker's moments, newest first (limit up to 100, before for the next page).",
    action: listMoments,
    summary: (o) => plural(o.length, "moment"),
  }),
  tool({
    name: "list_history",
    description:
      "Recent changes, newest first, one batch per action with who made it. Pass a batchId to undo_batch to undo one.",
    action: listHistory,
    summary: (o) => plural(o.batches.length, "change"),
  }),
  tool({
    name: "undo_batch",
    description:
      "Undo one batch from list_history. Refused when something newer depends on it; undo that first.",
    action: undoBatch,
    summary: (o) => `Undid ${plural(o.restored, "change")}`,
    destructive: true,
  }),
  tool({
    name: "delete_item",
    description:
      "Delete an area (with everything in it), achievement (with its tasks), task, category or goal (its achievements stay, unlinked). Soft delete; undo with undo_batch.",
    action: deleteItem,
    summary: (_o, i) => `Deleted ${i.kind}`,
    destructive: true,
  }),
];
