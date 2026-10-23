import { generateKeyBetween, generateNKeysBetween } from "fractional-indexing";

/** A sort key strictly between `a` and `b` (null = open end). Throws unless a < b. */
export function keyBetween(a: string | null, b: string | null): string {
  // The library returns garbage (not an error) for some inverted bounds.
  if (a !== null && b !== null && a >= b) {
    throw new Error(`keyBetween: ${a} is not before ${b}`);
  }
  return generateKeyBetween(a, b);
}

/** `n` increasing sort keys after `last` (null = empty list). */
export function keysAfter(last: string | null, n: number): string[] {
  return generateNKeysBetween(last, null, n);
}
