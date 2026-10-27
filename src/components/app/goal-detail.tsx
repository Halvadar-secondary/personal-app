"use client";

import { MoreHorizontal, Unlink } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import {
  deleteGoalAction,
  linkAchievementAction,
  updateGoalAction,
} from "@/server/actions/goals";
import type { AchievementStatus } from "@/server/db/goals";
import type { GoalSummary } from "@/server/domain/goals";
import type { NavArea } from "@/server/domain/views";
import { STATUS_LABELS } from "./board-state";
import { DateField } from "./date-field";
import { deadlineText, GoalBar, progressText } from "./goal-card";
import { GoalLinkPicker } from "./goal-link-picker";
import { InlineText } from "./inline-text";
import { perform, useMutate } from "./use-mutate";

type Fed = {
  id: string;
  title: string;
  status: AchievementStatus;
  area: NavArea | null;
  taskCount: number;
  doneCount: number;
};

type Patch = Partial<
  Pick<GoalSummary, "title" | "notes" | "deadline" | "status">
>;

/** A goal: its own fields, and the achievements from any area that feed it. */
export function GoalDetail({
  goal,
  achievements,
}: {
  goal: GoalSummary;
  achievements: Fed[];
}) {
  const router = useRouter();
  const { state, run } = useMutate(
    (g: GoalSummary, patch: Patch) => ({ ...g, ...patch }),
    goal,
  );
  const fed = useMutate(
    (list: Fed[], id: string) => list.filter((a) => a.id !== id),
    achievements,
  );
  const update = (patch: Patch) =>
    run(patch, () => updateGoalAction({ goalId: goal.id, ...patch }));
  const done = state.status === "done";

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-3">
        <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
          <Link href="/goals" className="hover:underline">
            Goals
          </Link>
        </nav>
        <div className="flex items-start gap-2">
          <h1 className="min-w-0 flex-1 text-xl font-bold">
            <InlineText
              value={state.title}
              label="Goal title"
              maxLength={200}
              onSave={(title) => update({ title })}
            />
          </h1>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Goal menu">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                variant="destructive"
                onSelect={async () => {
                  const r = await perform(
                    () => deleteGoalAction({ goalId: goal.id }),
                    { undoable: true },
                  );
                  if (r?.ok) router.push("/goals");
                }}
              >
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1 rounded-lg border bg-card px-2 py-1 text-sm">
            <DateField
              label="Goal deadline"
              value={state.deadline}
              onSave={(deadline) => update({ deadline })}
            />
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => update({ status: done ? "active" : "done" })}
          >
            {done ? "Mark active" : "Mark done"}
          </Button>
          <span className="text-sm text-muted-foreground">
            {done ? "Done" : deadlineText(goal)}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <GoalBar goal={goal} />
          <span className="text-xs text-muted-foreground">
            {progressText(goal)}
          </span>
        </div>
        <Textarea
          aria-label="Notes"
          placeholder="Why this matters, what done looks like…"
          defaultValue={state.notes ?? ""}
          maxLength={10_000}
          className="bg-card"
          onBlur={(e) => {
            const notes = e.target.value.trim() || null;
            if (notes !== (state.notes ?? null)) update({ notes });
          }}
        />
      </header>

      <section aria-label="Feeding this goal" className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Feeding this goal
          </h2>
          <GoalLinkPicker goalId={goal.id} />
        </div>
        {fed.state.length === 0 ? (
          <p className="px-1 text-sm text-muted-foreground">
            No achievements yet. Link the ones that move this goal forward, from
            any area.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {fed.state.map((a) => (
              <li
                key={a.id}
                className="flex items-center gap-2 rounded-[10px] border bg-card px-3 py-2"
              >
                <Link
                  href={`/achievements/${a.id}`}
                  className="flex min-w-0 flex-1 flex-col hover:text-primary"
                >
                  <span className="text-sm font-medium break-words">
                    {a.title}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {a.area
                      ? `${a.area.emoji ? `${a.area.emoji} ` : ""}${a.area.name}`
                      : "Inbox"}
                    {" · "}
                    {STATUS_LABELS[a.status]}
                    {a.taskCount > 0 &&
                      ` · ${a.doneCount}/${a.taskCount} tasks`}
                  </span>
                </Link>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Unlink ${a.title}`}
                  onClick={() =>
                    fed.run(a.id, () =>
                      linkAchievementAction({
                        achievementId: a.id,
                        goalId: null,
                      }),
                    )
                  }
                >
                  <Unlink />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
