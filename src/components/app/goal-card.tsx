import Link from "next/link";
import { formatDeadline } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { GoalSummary } from "@/server/domain/goals";

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/** "Due Jun 1 · 83 days left", "… · today", "… · overdue by 3 days", "No deadline". */
export function deadlineText(goal: Pick<GoalSummary, "deadline" | "daysLeft">) {
  if (!goal.deadline || goal.daysLeft === null) return "No deadline";
  const due = `Due ${formatDeadline(goal.deadline)}`;
  if (goal.daysLeft === 0) return `${due} · today`;
  if (goal.daysLeft < 0) {
    return `${due} · overdue by ${plural(-goal.daysLeft, "day")}`;
  }
  return `${due} · ${plural(goal.daysLeft, "day")} left`;
}

export function progressText(goal: GoalSummary) {
  return `${goal.achievementsDone}/${goal.achievementCount} achievements · ${goal.tasksDone}/${goal.taskCount} tasks`;
}

/** Tasks done across the goal's achievements, as a bar. */
export function GoalBar({ goal }: { goal: GoalSummary }) {
  const share = goal.taskCount ? goal.tasksDone / goal.taskCount : 0;
  return (
    <span aria-hidden className="h-1.5 overflow-hidden rounded-full bg-muted">
      <span
        className="block h-full rounded-full bg-primary"
        style={{ width: `${share * 100}%` }}
      />
    </span>
  );
}

export function GoalCard({ goal }: { goal: GoalSummary }) {
  const overdue =
    goal.status === "active" && goal.daysLeft !== null && goal.daysLeft < 0;
  return (
    <Link
      href={`/goals/${goal.id}`}
      className="flex flex-col gap-1.5 rounded-[12px] border bg-card p-3 shadow-card hover:border-primary"
    >
      <span className="text-base font-semibold break-words">{goal.title}</span>
      <span
        className={cn(
          "text-xs text-muted-foreground",
          overdue && "font-semibold text-destructive",
        )}
      >
        {goal.status === "done" ? "Done" : deadlineText(goal)}
      </span>
      <GoalBar goal={goal} />
      <span className="text-xs text-muted-foreground">
        {progressText(goal)}
      </span>
    </Link>
  );
}
