"use client";

import type { Slot, Status } from "@/lib/placement";
import {
  deleteAchievementAction,
  moveAchievementAction,
} from "@/server/actions/achievements";
import type { AchievementCard } from "@/server/domain/views";
import type { ChipCategory } from "./achievement-card";
import { Board } from "./board";
import { boardReducer } from "./board-state";
import { StatusList } from "./status-list";
import { useMutate } from "./use-mutate";

/** The area's achievements: a board on desktop, a list on phone, one state. */
export function AreaBoard({
  achievements,
  categories,
}: {
  achievements: AchievementCard[];
  categories: ChipCategory[];
}) {
  const { state, run } = useMutate(boardReducer, achievements);
  const chips = new Map(categories.map((c) => [c.id, c]));

  const move = (id: string, to: Slot & { status: Status }) =>
    run({ type: "move", id, ...to }, () =>
      moveAchievementAction({ achievementId: id, ...to }),
    );
  const remove = (id: string) =>
    run(
      { type: "remove", id },
      () => deleteAchievementAction({ achievementId: id }),
      { undoable: true },
    );

  return (
    <>
      <Board cards={state} categories={chips} onMove={move} />
      <StatusList
        cards={state}
        categories={chips}
        onMove={move}
        onDelete={remove}
      />
    </>
  );
}
