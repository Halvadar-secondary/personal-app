"use client";

import { Flag } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { linkAchievementAction } from "@/server/actions/goals";
import { useMutate } from "./use-mutate";

const NONE = "none";

/** The achievement's goal: which life goal it feeds, if any. */
export function GoalChip({
  achievementId,
  goalId,
  goals,
}: {
  achievementId: string;
  goalId: string | null;
  /** Active goals, in the owner's order. */
  goals: { id: string; title: string }[];
}) {
  const { state, run } = useMutate(
    (_: string | null, next: string | null) => next,
    goalId,
  );
  const current = goals.find((g) => g.id === state);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={current ? `Goal: ${current.title}` : "Goal: none"}
        className="flex items-center gap-1.5 rounded-lg border bg-card px-2 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Flag className="size-3.5 text-muted-foreground" aria-hidden />
        {current ? current.title : "Goal"}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuRadioGroup
          value={state ?? NONE}
          onValueChange={(v) => {
            const next = v === NONE ? null : v;
            void run(next, () =>
              linkAchievementAction({ achievementId, goalId: next }),
            );
          }}
        >
          {goals.map((g) => (
            <DropdownMenuRadioItem key={g.id} value={g.id}>
              {g.title}
            </DropdownMenuRadioItem>
          ))}
          {goals.length > 0 && <DropdownMenuSeparator />}
          <DropdownMenuRadioItem value={NONE}>No goal</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
