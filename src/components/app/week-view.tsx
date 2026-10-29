"use client";

import { CalendarPlus, Plus } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { dayLabel, SECTIONS } from "@/lib/plan";
import { cn } from "@/lib/utils";
import { planTaskAction } from "@/server/actions/plan";
import {
  completeTaskAction,
  uncompleteTaskAction,
} from "@/server/actions/tasks";
import type { DayItem, Sections, WeekItem } from "@/server/domain/plan";
import { useCapture } from "./capture-context";
import { useMutate } from "./use-mutate";

export type Week = {
  start: string;
  end: string;
  today: string;
  days: { day: string; sections: Sections }[];
  list: WeekItem[];
};

type Op =
  | { type: "done"; id: string; day: string; done: boolean }
  | { type: "dated"; id: string };

function reducer(w: Week, op: Op): Week {
  if (op.type === "dated") {
    return { ...w, list: w.list.filter((t) => t.id !== op.id) };
  }
  const flip = (i: DayItem) => (i.id === op.id ? { ...i, done: op.done } : i);
  return {
    ...w,
    days: w.days.map((d) =>
      d.day === op.day
        ? {
            ...d,
            sections: {
              work: d.sections.work.map(flip),
              spare: d.sections.spare.map(flip),
            },
          }
        : d,
    ),
    list: w.list.map((t) => (t.id === op.id ? { ...t, done: op.done } : t)),
  };
}

/** The week: seven days at a glance, and the week's own list. */
export function WeekView({ week }: { week: Week }) {
  const { state, run } = useMutate(reducer, week);
  const toggle = (id: string, day: string, done: boolean) =>
    run({ type: "done", id, day, done: !done }, () =>
      done
        ? uncompleteTaskAction({ taskId: id })
        : completeTaskAction({ taskId: id }),
    );
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-2 md:grid-cols-7">
        {state.days.map((d) => (
          <DayCard
            key={d.day}
            day={d.day}
            today={state.today}
            items={SECTIONS.flatMap((s) => d.sections[s])}
            onToggle={(i) => toggle(i.id, d.day, i.done)}
          />
        ))}
      </div>
      <WeekList
        start={state.start}
        days={state.days.map((d) => d.day)}
        items={state.list}
        onToggle={(t) => toggle(t.id, "", t.done)}
        onDate={(t, date) =>
          run({ type: "dated", id: t.id }, () =>
            planTaskAction({ taskId: t.id, plan: { type: "day", date } }),
          )
        }
      />
    </div>
  );
}

/** One day: its items (Work first), compact, with a link to plan it. */
export function DayCard({
  day,
  today,
  items,
  onToggle,
}: {
  day: string;
  today: string;
  items: DayItem[];
  onToggle?: (i: DayItem) => void;
}) {
  const label = dayLabel(day);
  return (
    <section
      aria-label={label}
      aria-current={day === today ? "date" : undefined}
      className={cn(
        "flex min-w-0 flex-col gap-1.5 rounded-[12px] border bg-card p-2",
        day === today && "border-primary",
      )}
    >
      <h2 className="px-1 text-xs font-semibold text-muted-foreground">
        {label}
      </h2>
      {items.length === 0 ? (
        <p className="px-1 text-xs text-faint">Nothing planned</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {items.map((i) => {
            const notToday = i.kind === "repeat" && day !== today;
            return (
              <li key={i.id} className="flex items-start gap-1.5 px-1 text-xs">
                <Checkbox
                  aria-label={`Complete ${i.title}`}
                  title={notToday ? "Only today" : undefined}
                  checked={i.done}
                  disabled={notToday || !onToggle}
                  onCheckedChange={() => onToggle?.(i)}
                  className="mt-px size-3.5"
                />
                <span className="flex min-w-0 flex-col">
                  <span
                    className={cn(
                      "break-words",
                      i.done && "text-muted-foreground line-through",
                    )}
                  >
                    {i.title}
                  </span>
                  {i.rolledLabel && (
                    <span className="text-[11px] text-muted-foreground">
                      {i.rolledLabel}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <Link
        href={`/plan?day=${day}`}
        aria-label={`Plan ${label}`}
        className="mt-auto px-1 text-xs text-muted-foreground hover:text-foreground"
      >
        Plan
      </Link>
    </section>
  );
}

/** The week's own list: tasks for this week without a day yet. */
export function WeekList({
  start,
  days,
  items,
  onToggle,
  onDate,
}: {
  start: string;
  days: string[];
  items: WeekItem[];
  onToggle: (t: WeekItem) => void;
  onDate: (t: WeekItem, date: string) => void;
}) {
  const { openCreate } = useCapture();
  return (
    <section aria-label="This week's list" className="flex flex-col gap-2">
      <h2 className="px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        This week&apos;s list
      </h2>
      {items.length === 0 && (
        <p className="px-1 text-sm text-muted-foreground">
          Nothing waiting for a day this week.
        </p>
      )}
      <ul className="flex flex-col gap-1.5">
        {items.map((t) => (
          <li
            key={t.id}
            className="flex items-start gap-2 rounded-[10px] border bg-card px-3 py-2"
          >
            <Checkbox
              aria-label={`Complete ${t.title}`}
              checked={t.done}
              onCheckedChange={() => onToggle(t)}
              className="mt-0.5"
            />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span
                className={cn(
                  "text-sm break-words",
                  t.done && "text-muted-foreground line-through",
                )}
              >
                {t.title}
              </span>
              <span className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                {t.rolledLabel && (
                  <span className="rounded-full bg-badge px-1.5 font-medium text-badge-foreground">
                    {t.rolledLabel}
                  </span>
                )}
                {t.achievement && <span>{t.achievement.title}</span>}
              </span>
            </span>
            {!t.done && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Give ${t.title} a day`}
                  >
                    <CalendarPlus />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {days.map((d) => (
                    <DropdownMenuItem key={d} onSelect={() => onDate(t, d)}>
                      {dayLabel(d)}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </li>
        ))}
      </ul>
      <Button
        variant="ghost"
        className="justify-start text-muted-foreground"
        onClick={() =>
          openCreate({ kind: "task", plan: { type: "week", date: start } })
        }
      >
        <Plus /> Add to this week
      </Button>
    </section>
  );
}
