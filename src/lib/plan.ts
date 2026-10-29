import { addDays, daysBetween, formatDeadline, weekStartOf } from "./dates";

// Pure rules for planned days and weeks (spec "Plan your days" §1–§8).

export type Section = "work" | "spare";
export const SECTIONS: Section[] = ["work", "spare"];
export const SECTION_LABELS: Record<Section, string> = {
  work: "Work",
  spare: "Spare time",
};

const WEEKDAYS = "Sun Mon Tue Wed Thu Fri Sat".split(" ");

function weekday(date: string): string {
  return WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()]!;
}

/** "2026-03-12" → "Thu Mar 12". */
export function dayLabel(date: string): string {
  return `${weekday(date)} ${formatDeadline(date)}`;
}

/**
 * Does an unfinished task planned on `plannedOn` show on `day`? It rolls
 * onto today from any earlier day, and onto tomorrow (for planning) from
 * today or earlier; never onto other days.
 */
export function rollsInto(
  plannedOn: string,
  day: string,
  today: string,
): boolean {
  if (day === today) return plannedOn < today;
  if (day === addDays(today, 1)) return plannedOn <= today;
  return false;
}

export type Orderable = {
  id: string;
  key: string | null;
  rolledFrom: string | null;
  createdAt: Date;
};

function byKey(a: Orderable, b: Orderable): number {
  if (a.key !== b.key) {
    if (a.key === null) return 1;
    if (b.key === null) return -1;
    return a.key < b.key ? -1 : 1;
  }
  return (
    a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : 1)
  );
}

/** A section's order: rolled items first (oldest day first), then by key. */
export function orderSection<T extends Orderable>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    if (a.rolledFrom !== b.rolledFrom) {
      if (a.rolledFrom === null) return 1;
      if (b.rolledFrom === null) return -1;
      return a.rolledFrom < b.rolledFrom ? -1 : 1;
    }
    return byKey(a, b);
  });
}

/** "left from today", "from Mon", or "from Mar 2" for older days. */
export function rolledLabel(
  plannedOn: string,
  day: string,
  today: string,
): string {
  if (plannedOn === today && day > today) return "left from today";
  return daysBetween(plannedOn, day) < 7
    ? `from ${weekday(plannedOn)}`
    : `from ${formatDeadline(plannedOn)}`;
}

/** A rolled week task: "from last week", or "from week of Feb 23". */
export function weekListLabel(
  plannedWeek: string,
  currentStart: string,
  weekStart: number,
): string {
  const start = weekStartOf(plannedWeek, weekStart);
  return start === addDays(currentStart, -7)
    ? "from last week"
    : `from week of ${formatDeadline(start)}`;
}

export function weekRange(
  date: string,
  weekStart: number,
): { start: string; end: string } {
  const start = weekStartOf(date, weekStart);
  return { start, end: addDays(start, 6) };
}

/** The week a review plans: the coming one on the week's last day. */
export function reviewWeekStart(today: string, weekStart: number): string {
  const { start, end } = weekRange(today, weekStart);
  return today === end ? addDays(start, 7) : start;
}

/** Progress toward a target: hours from durations, other units from amounts. */
export function progressOf(
  unit: string,
  entries: { amount: number | null; durationSeconds: number | null }[],
): number {
  if (unit === "hours") {
    return entries.reduce((s, e) => s + (e.durationSeconds ?? 0), 0) / 3600;
  }
  return entries.reduce((s, e) => s + (e.amount ?? 0), 0);
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** "34 / 100 times"; hours to one decimal. */
export function formatProgress(
  progress: number,
  amount: number,
  unit: string,
): string {
  return `${round1(progress)} / ${round1(amount)} ${unit}`;
}
