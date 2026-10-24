"use client";

import Link from "next/link";
import { Checkbox } from "@/components/ui/checkbox";
import { describeRecurrence } from "@/lib/recurrence";
import {
  completeTaskAction,
  uncompleteTaskAction,
} from "@/server/actions/tasks";
import type { PracticeTask } from "@/server/domain/views";
import { useMutate } from "./use-mutate";

type Op = { id: string; doneToday: boolean };

function reducer(tasks: PracticeTask[], op: Op): PracticeTask[] {
  return tasks.map((t) =>
    t.id === op.id ? { ...t, doneToday: op.doneToday } : t,
  );
}

/** Today's repeating tasks across areas, checked off in place. */
export function PracticeList({ tasks }: { tasks: PracticeTask[] }) {
  const { state, run } = useMutate(reducer, tasks);
  if (state.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No practice due today.</p>
    );
  }
  return (
    <ul className="flex flex-col gap-1.5">
      {state.map((t) => (
        <li
          key={t.id}
          className="flex items-start gap-2 rounded-[10px] border bg-card px-3 py-2"
        >
          <Checkbox
            aria-label={`Complete ${t.title} for today`}
            checked={t.doneToday}
            onCheckedChange={() =>
              run({ id: t.id, doneToday: !t.doneToday }, () =>
                t.doneToday
                  ? uncompleteTaskAction({ taskId: t.id })
                  : completeTaskAction({ taskId: t.id }),
              )
            }
            className="mt-0.5"
          />
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-sm break-words">{t.title}</span>
            <span className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
              <span>{describeRecurrence(t.recurrence)}</span>
              <Link
                href={`/achievements/${t.achievementId}`}
                className="hover:text-foreground"
              >
                {t.area.emoji} {t.area.name} · {t.achievementTitle}
              </Link>
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
