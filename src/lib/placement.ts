// Turns a drop (or a phone "Move up/down") into the domain's position input.

export type Slot = { afterId: string | null; beforeId: string | null };
export type Status = "backlog" | "active" | "done";

/**
 * Where `activeId` lands when it ends up at `toIndex` of `ids` (a list that
 * includes it). Null when it wouldn't move.
 */
export function placeInList(
  ids: string[],
  activeId: string,
  toIndex: number,
): Slot | null {
  const from = ids.indexOf(activeId);
  if (from === -1 || from === toIndex) return null;
  const rest = ids.filter((id) => id !== activeId);
  return {
    afterId: rest[toIndex - 1] ?? null,
    beforeId: rest[toIndex] ?? null,
  };
}

/**
 * A drop on the board. `over.id` null is the column background (its end);
 * a card means take that card's place. Null for no change. Any columns:
 * the board's statuses, or a day's sections.
 */
export function placeOnBoard<K extends string = Status>(
  columns: Record<K, string[]>,
  activeId: string,
  over: { column: K; id: string | null },
): (Slot & { status: K }) | null {
  const from = (Object.keys(columns) as K[]).find((s) =>
    columns[s].includes(activeId),
  );
  if (!from || over.id === activeId) return null;
  const target = columns[over.column];

  if (from === over.column) {
    const to = over.id === null ? target.length - 1 : target.indexOf(over.id);
    const slot = placeInList(target, activeId, to);
    return slot && { status: over.column, ...slot };
  }
  if (over.id === null) {
    return {
      status: over.column,
      afterId: target.at(-1) ?? null,
      beforeId: null,
    };
  }
  const i = target.indexOf(over.id);
  return {
    status: over.column,
    afterId: target[i - 1] ?? null,
    beforeId: over.id,
  };
}

/** One step up (-1) or down (1). Null at the edges. */
export function moveBy(ids: string[], id: string, delta: -1 | 1): Slot | null {
  const to = ids.indexOf(id) + delta;
  if (to < 0 || to >= ids.length) return null;
  return placeInList(ids, id, to);
}
