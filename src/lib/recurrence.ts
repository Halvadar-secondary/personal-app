import {
  addDays,
  daysBetween,
  formatDeadline,
  weekdayOf,
  weekStartOf,
} from "./dates";

/** How a task repeats (spec §4). Dates are owner-local YYYY-MM-DD. */
export type Recurrence = {
  freq: "daily" | "weekly";
  interval: number;
  /** Weekly only; 0 = Sunday. Defaults to the start's weekday. */
  byWeekday?: number[];
  start: string;
  end?:
    | { type: "never" }
    | { type: "until"; date: string }
    | { type: "count"; count: number };
};

function weekdays(r: Recurrence): number[] {
  return r.byWeekday ?? [weekdayOf(r.start)];
}

/** Whether `date` fits the pattern, ignoring the end. */
function matches(r: Recurrence, date: string): boolean {
  if (date < r.start) return false;
  if (r.freq === "daily") return daysBetween(r.start, date) % r.interval === 0;
  // Weeks are counted Monday to Monday, whatever the owner's week start.
  const weeks = daysBetween(weekStartOf(r.start, 1), weekStartOf(date, 1)) / 7;
  return weeks % r.interval === 0 && weekdays(r).includes(weekdayOf(date));
}

/** One full cycle of the pattern, in days. */
function period(r: Recurrence): number {
  return r.freq === "daily" ? r.interval : 7 * r.interval;
}

/** The last day an occurrence may fall on, or null if it never ends. */
function lastDay(r: Recurrence): string | null {
  const end = r.end;
  if (!end || end.type === "never") return null;
  if (end.type === "until") return end.date;
  let seen = 0;
  for (let d = r.start; ; d = addDays(d, 1)) {
    if (matches(r, d) && ++seen === end.count) return d;
  }
}

export function isDueOn(r: Recurrence, date: string): boolean {
  const last = lastDay(r);
  return matches(r, date) && (last === null || date <= last);
}

/** Occurrences from `from` to `to`, both inclusive. */
export function occurrencesBetween(
  r: Recurrence,
  from: string,
  to: string,
): string[] {
  const last = lastDay(r);
  const stop = last !== null && last < to ? last : to;
  const out: string[] = [];
  for (let d = from < r.start ? r.start : from; d <= stop; d = addDays(d, 1)) {
    if (matches(r, d)) out.push(d);
  }
  return out;
}

/** True once no occurrence remains on or after `today`. */
export function hasEnded(r: Recurrence, today: string): boolean {
  const last = lastDay(r);
  if (last === null) return false;
  const from = today < r.start ? r.start : today;
  // Any occurrence left shows up within one cycle.
  const to = addDays(from, period(r) - 1);
  return occurrencesBetween(r, from, last < to ? last : to).length === 0;
}

export type RepeatPreset = "daily" | "weekdays" | "weekly";
export type RepeatSpan = "week" | "month" | "forever";

const SPAN_DAYS: Record<Exclude<RepeatSpan, "forever">, number> = {
  week: 7,
  month: 30,
};

/**
 * The picker's presets, starting on `start`. A span ("for 1 week") runs
 * from `spanFrom` (today) when the rule started earlier, so editing an old
 * rule doesn't end it at once; `start` stays, keeping its history.
 */
export function buildRecurrence(
  p: { preset: RepeatPreset; days?: number[]; span: RepeatSpan },
  start: string,
  spanFrom: string = start,
): Recurrence {
  const from = spanFrom > start ? spanFrom : start;
  const end: Recurrence["end"] =
    p.span === "forever"
      ? { type: "never" }
      : { type: "until", date: addDays(from, SPAN_DAYS[p.span] - 1) };
  if (p.preset === "daily") return { freq: "daily", interval: 1, start, end };
  const byWeekday =
    p.preset === "weekdays"
      ? [1, 2, 3, 4, 5]
      : [...new Set(p.days ?? [])].sort((a, b) => a - b);
  return { freq: "weekly", interval: 1, byWeekday, start, end };
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Daily", "Weekdays", "Weekly on Mon, Thu · until Oct 7", … */
export function describeRecurrence(r: Recurrence): string {
  let text: string;
  if (r.freq === "daily") {
    text = r.interval === 1 ? "Daily" : `Every ${r.interval} days`;
  } else {
    const days = [...weekdays(r)].sort((a, b) => a - b);
    const names = days.map((d) => DAY_NAMES[d]).join(", ");
    if (r.interval > 1) text = `Every ${r.interval} weeks on ${names}`;
    else if (days.join() === "1,2,3,4,5") text = "Weekdays";
    else text = `Weekly on ${names}`;
  }
  if (r.end?.type === "until") text += ` · until ${formatDeadline(r.end.date)}`;
  if (r.end?.type === "count") text += ` · ${r.end.count} times`;
  return text;
}

export type StripState = "done" | "missed" | "due" | "upcoming" | "off";
export type StripDay = { date: string; state: StripState };

/** This week and the three before it, one entry per day. */
export function completionStrip(
  r: Recurrence,
  done: ReadonlySet<string>,
  today: string,
  weekStart: number,
): StripDay[] {
  const first = addDays(weekStartOf(today, weekStart), -21);
  return Array.from({ length: 28 }, (_, i) => {
    const date = addDays(first, i);
    let state: StripState;
    if (!isDueOn(r, date)) state = "off";
    else if (done.has(date)) state = "done";
    else if (date < today) state = "missed";
    else state = date === today ? "due" : "upcoming";
    return { date, state };
  });
}
