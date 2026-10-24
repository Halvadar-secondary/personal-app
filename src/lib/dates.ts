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
