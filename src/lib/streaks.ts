import { addDays } from "./dates";

/**
 * Consecutive days with a completion, ending today or yesterday: a streak
 * isn't broken before today has had its chance.
 */
export function currentStreak(days: Iterable<string>, today: string): number {
  const set = new Set(days);
  let day = set.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (set.has(day)) {
    n++;
    day = addDays(day, -1);
  }
  return n;
}
