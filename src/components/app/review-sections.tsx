"use client";

import { CalendarPlus, ListPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { addDays } from "@/lib/dates";
import { dayLabel } from "@/lib/plan";
import { cn } from "@/lib/utils";
import { planTaskAction } from "@/server/actions/plan";
import type { GoalSummary, ReviewTask } from "@/server/domain/goals";
import { deadlineText, GoalBar, progressText } from "./goal-card";
import { useMutate } from "./use-mutate";

type Planned = Pick<ReviewTask, "plannedOn" | "plannedWeek">;
type Op = { id: string } & Planned;

function reducer(tasks: ReviewTask[], op: Op): ReviewTask[] {
  return tasks.map((t) => (t.id === op.id ? { ...t, ...op } : t));
}

/** Where a planned task sits, against the week being planned. */
function placeOf(t: Planned, start: string): string | null {
  if (t.plannedOn) return dayLabel(t.plannedOn);
  if (t.plannedWeek) {
    return t.plannedWeek >= start && t.plannedWeek <= addDays(start, 6)
      ? "This week"
      : "Another week";
  }
  return null;
}

/** A goal's open tasks, each one tap from the week being planned. */
export function ReviewGoal({
  start,
  goal,
  tasks,
}: {
  start: string;
  goal: GoalSummary;
  tasks: ReviewTask[];
}) {
  const overdue = goal.daysLeft !== null && goal.daysLeft < 0;
  return (
    <section
      aria-label={goal.title}
      className="flex flex-col gap-2 rounded-[12px] border bg-card p-3"
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold break-words">{goal.title}</h2>
        <span
          className={cn(
            "text-xs text-muted-foreground",
            overdue && "font-semibold text-destructive",
          )}
        >
          {deadlineText(goal)} · {progressText(goal)}
        </span>
        <GoalBar goal={goal} />
      </div>
      <ReviewTasks
        start={start}
        tasks={tasks}
        empty="No open tasks. Add some to its achievements."
      />
    </section>
  );
}

export function ReviewTasks({
  start,
  tasks,
  empty,
}: {
  start: string;
  tasks: ReviewTask[];
  empty: string;
}) {
  const { state, run } = useMutate(reducer, tasks);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const plan = (t: ReviewTask, p: { type: "week" | "day"; date: string }) =>
    run(
      {
        id: t.id,
        plannedOn: p.type === "day" ? p.date : null,
        plannedWeek: p.type === "week" ? p.date : null,
      },
      () => planTaskAction({ taskId: t.id, plan: p }),
    );
  if (state.length === 0) {
    return <p className="text-sm text-muted-foreground">{empty}</p>;
  }
  return (
    <ul className="flex flex-col gap-1">
      {state.map((t) => {
        const where = placeOf(t, start);
        return (
          <li key={t.id} className="flex items-center gap-2 py-0.5">
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-sm break-words">{t.title}</span>
              <span className="text-xs text-muted-foreground">
                {t.achievementTitle}
              </span>
            </span>
            {where && (
              <span className="shrink-0 rounded-full bg-badge px-2 text-xs font-medium text-badge-foreground">
                {where}
              </span>
            )}
            {!where && (
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Add ${t.title} to this week`}
                title="Add to this week"
                onClick={() => plan(t, { type: "week", date: start })}
              >
                <ListPlus />
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Pick a day for ${t.title}`}
                  title="Pick a day"
                >
                  <CalendarPlus />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {days.map((d) => (
                  <DropdownMenuItem
                    key={d}
                    onSelect={() => plan(t, { type: "day", date: d })}
                  >
                    {dayLabel(d)}
                  </DropdownMenuItem>
                ))}
                {where && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={() => plan(t, { type: "week", date: start })}
                    >
                      This week, no day
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </li>
        );
      })}
    </ul>
  );
}
