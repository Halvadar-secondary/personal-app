"use client";

import { Briefcase, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { dayLabel, type Section, SECTION_LABELS } from "@/lib/plan";
import { planTaskAction } from "@/server/actions/plan";
import type { PlanOptions } from "@/server/domain/plan";
import { useMutate } from "./use-mutate";

type Op = { id: string };

function reducer(o: PlanOptions, op: Op): PlanOptions {
  return {
    week: o.week.filter((t) => t.id !== op.id),
    achievements: o.achievements.map((g) => ({
      ...g,
      tasks: g.tasks.filter((t) => t.id !== op.id),
    })),
  };
}

const areaName = (a: { name: string; emoji: string | null }) =>
  a.emoji ? `${a.emoji} ${a.name}` : a.name;

/** The planner's sources: this week's list, then open tasks of active achievements. */
export function PickList({
  day,
  options,
}: {
  day: string;
  options: PlanOptions;
}) {
  const { state, run } = useMutate(reducer, options);
  const add = (id: string, section: Section) =>
    run({ id }, () =>
      planTaskAction({
        taskId: id,
        plan: { type: "day", date: day, section },
      }),
    );
  const groups = state.achievements.filter((g) => g.tasks.length > 0);

  return (
    <aside aria-label="Pick tasks" className="flex flex-col gap-4">
      {state.week.length === 0 && groups.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nothing to pick: this week&apos;s list is empty and active
          achievements have no open tasks.
        </p>
      )}
      {state.week.length > 0 && (
        <section aria-label="This week" className="flex flex-col gap-1.5">
          <h2 className="px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            This week
          </h2>
          <ul className="flex flex-col gap-1.5">
            {state.week.map((t) => (
              <PickRow
                key={t.id}
                title={t.title}
                note={t.rolledLabel}
                onAdd={(s) => add(t.id, s)}
              />
            ))}
          </ul>
        </section>
      )}
      {groups.length > 0 && (
        <section
          aria-label="From your active achievements"
          className="flex flex-col gap-1.5"
        >
          <h2 className="px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            From your active achievements
          </h2>
          {groups.map((g) => (
            <details
              key={g.achievement.id}
              className="rounded-[10px] border bg-card"
            >
              <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
                {areaName(g.area)} · {g.achievement.title}
              </summary>
              <ul className="flex flex-col gap-1 px-2 pb-2">
                {g.tasks.map((t) => (
                  <PickRow
                    key={t.id}
                    title={t.title}
                    note={
                      t.plannedOn
                        ? dayLabel(t.plannedOn)
                        : t.plannedWeek
                          ? "In a week's list"
                          : null
                    }
                    onAdd={(s) => add(t.id, s)}
                  />
                ))}
              </ul>
            </details>
          ))}
        </section>
      )}
    </aside>
  );
}

function PickRow({
  title,
  note,
  onAdd,
}: {
  title: string;
  note: string | null;
  onAdd: (section: Section) => void;
}) {
  return (
    <li className="flex items-center gap-2 rounded-[10px] border bg-card px-3 py-1.5">
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm break-words">{title}</span>
        {note && <span className="text-xs text-muted-foreground">{note}</span>}
      </span>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={`Add ${title} to ${SECTION_LABELS.work}`}
        title={`Add to ${SECTION_LABELS.work}`}
        onClick={() => onAdd("work")}
      >
        <Briefcase />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={`Add ${title} to ${SECTION_LABELS.spare}`}
        title={`Add to ${SECTION_LABELS.spare}`}
        onClick={() => onAdd("spare")}
      >
        <Sun />
      </Button>
    </li>
  );
}
