import type { Slot, Status } from "@/lib/placement";
import type { AchievementCard } from "@/server/domain/views";

export const STATUSES: Status[] = ["backlog", "active", "done"];
export const STATUS_LABELS: Record<Status, string> = {
  backlog: "Backlog",
  active: "Active",
  done: "Done",
};

export type BoardOp =
  | ({ type: "move"; id: string; status: Status } & Slot)
  | { type: "add"; card: AchievementCard }
  | { type: "remove"; id: string };

/** The optimistic version of what the server will do with each op. */
export function boardReducer(
  cards: AchievementCard[],
  op: BoardOp,
): AchievementCard[] {
  if (op.type === "add") return [...cards, op.card];
  const card = cards.find((c) => c.id === op.id);
  const rest = cards.filter((c) => c.id !== op.id);
  if (op.type === "remove" || !card) return rest;
  const moved = { ...card, status: op.status };
  // Order only matters within a status, so "end of column" is the list's end.
  const at = op.afterId
    ? rest.findIndex((c) => c.id === op.afterId) + 1
    : op.beforeId
      ? rest.findIndex((c) => c.id === op.beforeId)
      : rest.length;
  return [...rest.slice(0, at), moved, ...rest.slice(at)];
}

/** Ids the server has confirmed: only these can anchor a position. */
export function confirmed(ids: string[]): string[] {
  return ids.filter((id) => !id.startsWith("draft-"));
}

export function columnsOf(cards: AchievementCard[]): Record<Status, string[]> {
  const cols: Record<Status, string[]> = { backlog: [], active: [], done: [] };
  for (const c of cards) cols[c.status].push(c.id);
  return cols;
}

/** A placeholder card for an achievement the server is still creating. */
export function draftCard(
  areaId: string,
  title: string,
  status: Status,
): AchievementCard {
  const now = new Date();
  return {
    id: `draft-${crypto.randomUUID()}`,
    ownerId: "",
    areaId,
    title,
    notes: null,
    status,
    deadline: null,
    completedAt: null,
    sortKey: "",
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    taskCount: 0,
    doneCount: 0,
    categoryIds: [],
  };
}
