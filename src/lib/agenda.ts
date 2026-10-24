import { isDueOn, type Recurrence } from "./recurrence";

/** What decides whether a task still wants doing today. */
export type OpenCandidate = {
  deadline: string | null;
  recurrence: Recurrence | null;
  completedAt: Date | null;
  doneToday: boolean;
};

/** A one-off task not yet done, or a repeating one due today and not done today. */
export function isOpenToday(t: OpenCandidate, today: string): boolean {
  if (t.recurrence) return isDueOn(t.recurrence, today) && !t.doneToday;
  return t.completedAt === null;
}

/**
 * The open task with the earliest deadline; without deadlines, the first
 * open one. `tasks` arrive in board order, which breaks ties.
 */
export function pickUpNext<T extends OpenCandidate>(
  tasks: T[],
  today: string,
): T | null {
  let best: T | null = null;
  for (const t of tasks) {
    if (!isOpenToday(t, today)) continue;
    if (
      !best ||
      (t.deadline !== null &&
        (best.deadline === null || t.deadline < best.deadline))
    ) {
      best = t;
    }
  }
  return best;
}
