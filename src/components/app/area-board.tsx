"use client";

import type { Slot, Status } from "@/lib/placement";
import {
  createAchievementAction,
  deleteAchievementAction,
  moveAchievementAction,
} from "@/server/actions/achievements";
import type { AchievementCard } from "@/server/domain/views";
import type { ChipCategory } from "./achievement-card";
import { Board } from "./board";
import { boardReducer, draftCard } from "./board-state";
import { StatusList } from "./status-list";
import { useMutate } from "./use-mutate";

/** The area's achievements: a board on desktop, a list on phone, one state. */
export function AreaBoard({
  areaId,
  achievements,
  categories,
}: {
  areaId: string;
  achievements: AchievementCard[];
  categories: ChipCategory[];
}) {
  const { state, run } = useMutate(boardReducer, achievements);
  const chips = new Map(categories.map((c) => [c.id, c]));

  const move = (id: string, to: Slot & { status: Status }) =>
    run({ type: "move", id, ...to }, () =>
      moveAchievementAction({ achievementId: id, ...to }),
    );
  const add = (title: string, status: Status) =>
    run({ type: "add", card: draftCard(areaId, title, status) }, () =>
      createAchievementAction({ areaId, title, status }),
    );
  const remove = (id: string) =>
    run(
      { type: "remove", id },
      () => deleteAchievementAction({ achievementId: id }),
      { undoable: true },
    );

  return (
    <>
      <Board cards={state} categories={chips} onMove={move} onAdd={add} />
      <StatusList
        cards={state}
        categories={chips}
        onMove={move}
        onAdd={(title) => add(title, "backlog")}
        onDelete={remove}
      />
    </>
  );
}
