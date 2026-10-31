import { PROFILE_LABELS, type ProfileSection } from "@/lib/profile";

// Plain-English one-liners for a batch of change events (spec §5.5's
// History panel). Pure: everything it needs arrives as arguments.

type Row = Record<string, unknown>;

export type SummaryEvent = {
  entityType: string;
  /** For task_categories, the task (its snapshots hold only categoryIds). */
  entityId?: string;
  op: "create" | "update" | "delete" | "restore";
  before: Row | null;
  after: Row | null;
};

const STATUS: Record<string, string> = {
  backlog: "Backlog",
  active: "Active",
  done: "Done",
};

// Which entity speaks for an update batch: a move of an achievement also
// rewrites its tasks, and the achievement is what the owner did.
const RANK = ["area", "achievement", "task", "category"];

function nameOf(e: SummaryEvent): string {
  const row = e.after ?? e.before;
  const name = row?.title ?? row?.name;
  return typeof name === "string" ? name : "something";
}

function taskOf(e: SummaryEvent, titles: ReadonlyMap<string, string>): string {
  const id =
    (e.after ?? e.before)?.taskId ??
    (e.entityType === "task_categories" ? e.entityId : undefined);
  return (typeof id === "string" && titles.get(id)) || "a task";
}

function changedKeys(e: SummaryEvent): string[] {
  const before = e.before ?? {};
  const after = e.after ?? {};
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(
    (k) =>
      k !== "updatedAt" &&
      JSON.stringify(before[k]) !== JSON.stringify(after[k]),
  );
}

function describeUpdate(e: SummaryEvent): string {
  const name = nameOf(e);
  const keys = changedKeys(e);
  if (keys.includes("status") && typeof e.after?.status === "string") {
    return `Moved “${name}” to ${STATUS[e.after.status] ?? e.after.status}`;
  }
  if (keys.includes("areaId") && e.before?.areaId == null) {
    return `Filed “${name}”`;
  }
  if (keys.includes("achievementId") && e.before?.achievementId == null) {
    return `Filed task “${name}”`;
  }
  if (keys.length > 0 && keys.every((k) => k === "sortKey")) {
    return `Reordered “${name}”`;
  }
  return `Edited “${name}”`;
}

export function summarizeBatch(
  events: SummaryEvent[],
  taskTitles: ReadonlyMap<string, string>,
): string {
  if (events.length > 0 && events.every((e) => e.op === "restore")) {
    return "Undid a change";
  }
  const of = (type: string, op?: SummaryEvent["op"]) =>
    events.filter((e) => e.entityType === type && (!op || e.op === op));

  const completion = of("task_completion")[0];
  if (completion) {
    const verb = completion.op === "delete" ? "Uncompleted" : "Completed";
    return `${verb} “${taskOf(completion, taskTitles)}”`;
  }

  const [area] = of("area", "delete");
  if (area) return `Deleted area “${nameOf(area)}”`;
  const [ach] = of("achievement", "delete");
  if (ach) return `Deleted “${nameOf(ach)}”`;
  const deletedTasks = of("task", "delete");
  if (deletedTasks.length === 1) {
    return `Deleted task “${nameOf(deletedTasks[0]!)}”`;
  }
  if (deletedTasks.length > 1) return `Deleted ${deletedTasks.length} tasks`;

  const [newArea] = of("area", "create");
  if (newArea) return `Created area “${nameOf(newArea)}”`;
  const newAchs = of("achievement", "create");
  if (newAchs.length === 1) return `Added “${nameOf(newAchs[0]!)}”`;
  if (newAchs.length > 1) return `Added ${newAchs.length} achievements`;
  const newTasks = of("task", "create");
  if (newTasks.length === 1) return `Added task “${nameOf(newTasks[0]!)}”`;
  if (newTasks.length > 1) return `Added ${newTasks.length} tasks`;
  const [newCategory] = of("category", "create");
  if (newCategory) return `Created category “${nameOf(newCategory)}”`;
  const [practice] = of("practice_entry", "create");
  if (practice) return `Logged practice on “${taskOf(practice, taskTitles)}”`;

  const profile = events.find(
    (e) =>
      e.entityType === "profile_section" &&
      (e.op === "create" || e.op === "update"),
  );
  if (profile) {
    const section = (profile.after?.section ?? "") as string;
    const label = PROFILE_LABELS[section as ProfileSection];
    return label ? `Updated your profile: ${label}` : "Updated your profile";
  }

  for (const type of RANK) {
    const [update] = of(type, "update");
    if (update) return describeUpdate(update);
  }
  const [cats] = of("task_categories");
  if (cats) return `Changed categories on “${taskOf(cats, taskTitles)}”`;

  return `Changed ${events.length} items`;
}

/** Who made a change, as the History list shows it. */
export function actorLabel(actor: string): string {
  if (actor === "ui") return "You";
  if (actor === "seed") return "Sample data";
  if (actor === "chat") return "Claude in chat";
  if (actor.startsWith("mcp:")) return `${actor.slice(4)} via MCP`;
  return actor;
}
