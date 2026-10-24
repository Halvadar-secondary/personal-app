/** The calendar date (YYYY-MM-DD) of `instant` in `timeZone`. */
export function localDate(instant: Date, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/** A deadline (YYYY-MM-DD) is overdue once its day is over. */
export function isOverdue(deadline: string | null, today: string): boolean {
  return deadline !== null && deadline < today;
}

const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");

/** "2026-06-01" → "Jun 1", without time zone shifts. */
export function formatDeadline(deadline: string): string {
  const [, m, d] = deadline.split("-").map(Number);
  return `${MONTHS[m! - 1]} ${d}`;
}

// Calendar arithmetic on YYYY-MM-DD strings, done in UTC so DST can't shift a day.
const DAY = 86_400_000;

function toUtc(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y!, m! - 1, d!);
}

function fromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(date: string, n: number): string {
  return fromUtc(toUtc(date) + n * DAY);
}

/** Whole days from `from` to `to` (negative if `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(date: string): number {
  return new Date(toUtc(date)).getUTCDay();
}

/** The first day of the week holding `date`, for a week starting on `weekStart`. */
export function weekStartOf(date: string, weekStart: number): string {
  return addDays(date, -((weekdayOf(date) - weekStart + 7) % 7));
}
