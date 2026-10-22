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
    return keyBetween(keyAt(a), keyAt(b));
  }
  if (pos.afterId) {
    const a = indexOf(pos.afterId);
    return keyBetween(keyAt(a), keyAt(a + 1));
  }
  if (pos.beforeId) {
    const b = indexOf(pos.beforeId);
    return keyBetween(keyAt(b - 1), keyAt(b));
  }
  return keyBetween(keyAt(siblings.length - 1), null);
}
