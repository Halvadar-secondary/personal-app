import { z } from "zod";
import { keyBetween } from "@/lib/ordering";
import { DomainError } from "./errors";

/** Where to put an item among its siblings; neither = last. */
export const zPosition = z.object({
  afterId: z.uuid().nullish(),
  beforeId: z.uuid().nullish(),
});
export type Position = z.infer<typeof zPosition>;

type Sibling = { id: string; sortKey: string };

/** A sort key for `pos` among ordered `siblings` (which exclude the item being placed). */
export function sortKeyFor(siblings: Sibling[], pos: Position): string {
  const indexOf = (id: string) => {
    const i = siblings.findIndex((s) => s.id === id);
    if (i < 0) throw new DomainError("invalid_input", { neighbour: id });
    return i;
  };
  const keyAt = (i: number) => siblings[i]?.sortKey ?? null;

  if (pos.afterId && pos.beforeId) {
    const a = indexOf(pos.afterId);
    const b = indexOf(pos.beforeId);
    if (a >= b) throw new DomainError("invalid_input", { position: pos });
    const lo = keyAt(a)!;
    const hi = keyAt(b)!;
    // Equal keys (a tie from concurrent writes) leave no room between them.
    if (lo >= hi) throw new DomainError("conflict", { position: pos });
    return keyBetween(lo, hi);
  }
  // Single-sided placements skip over neighbours tied with the anchor.
  if (pos.afterId) {
    const lo = keyAt(indexOf(pos.afterId))!;
    const next = siblings.find((s) => s.sortKey > lo);
    return keyBetween(lo, next?.sortKey ?? null);
  }
  if (pos.beforeId) {
    const hi = keyAt(indexOf(pos.beforeId))!;
    const prev = siblings.findLast((s) => s.sortKey < hi);
    return keyBetween(prev?.sortKey ?? null, hi);
  }
  return keyBetween(keyAt(siblings.length - 1), null);
}
