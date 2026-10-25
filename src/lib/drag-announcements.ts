import type { Announcements, UniqueIdentifier } from "@dnd-kit/core";

/**
 * What screen readers hear while dragging. dnd-kit's defaults read out the
 * raw ids (uuids); these say the item's title instead.
 */
export function dragAnnouncements(
  nameOf: (id: UniqueIdentifier) => string | undefined,
): Announcements {
  const name = (id: UniqueIdentifier) => nameOf(id) ?? "item";
  return {
    onDragStart: ({ active }) => `Picked up ${name(active.id)}.`,
    onDragOver: ({ active, over }) =>
      over
        ? `${name(active.id)} is over ${name(over.id)}.`
        : `${name(active.id)} is no longer over a drop area.`,
    onDragEnd: ({ active, over }) =>
      over
        ? `${name(active.id)} was dropped on ${name(over.id)}.`
        : `${name(active.id)} was dropped.`,
    onDragCancel: ({ active }) => `Moving ${name(active.id)} was cancelled.`,
  };
}
