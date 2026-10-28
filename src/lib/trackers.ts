import { addDays, localDate, weekStartOf } from "./dates";

// Pure rules for behaviour trackers (spec "Behaviour trackers").

const WEEK_MS = 7 * 86_400_000;

/** The owner-local week start of each moment. */
function weekOf(m: Date, timeZone: string, weekStart: number): string {
  return weekStartOf(localDate(m, timeZone), weekStart);
}

/**
 * This week so far, and last week up to the same weekday and time, so a
 * Monday never looks like a great week next to a full one.
 */
export function soFarCounts(
  moments: Date[],
  now: Date,
  timeZone: string,
  weekStart: number,
): { thisWeek: number; lastWeek: number } {
  const thisStart = weekOf(now, timeZone, weekStart);
  const lastStart = addDays(thisStart, -7);
  const cutoff = now.getTime() - WEEK_MS;
  let thisWeek = 0;
  let lastWeek = 0;
  for (const m of moments) {
    const week = weekOf(m, timeZone, weekStart);
    if (week === thisStart && m.getTime() <= now.getTime()) thisWeek++;
    else if (week === lastStart && m.getTime() <= cutoff) lastWeek++;
  }
  return { thisWeek, lastWeek };
}

/** `weeks` weekly counts ending with the week starting `lastStart`, oldest first. */
export function weekBuckets(
  moments: Date[],
  timeZone: string,
  weekStart: number,
  lastStart: string,
  weeks: number,
): { start: string; count: number }[] {
  const buckets = Array.from({ length: weeks }, (_, i) => ({
    start: addDays(lastStart, -7 * (weeks - 1 - i)),
    count: 0,
  }));
  const index = new Map(buckets.map((b, i) => [b.start, i]));
  for (const m of moments) {
    const i = index.get(weekOf(m, timeZone, weekStart));
    if (i !== undefined) buckets[i]!.count++;
  }
  return buckets;
}

/** "3 fewer than last week", "2 more than last week", "Same as last week". */
export function trendText(diff: number, than = "last week"): string {
  if (diff === 0) return `Same as ${than}`;
  return `${Math.abs(diff)} ${diff < 0 ? "fewer" : "more"} than ${than}`;
}

/** Did it move the way the tracker wants? Null when it didn't move. */
export function trendGood(
  direction: "less" | "more",
  diff: number,
): boolean | null {
  if (diff === 0) return null;
  return direction === "less" ? diff < 0 : diff > 0;
}
