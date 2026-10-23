"use client";

import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { moveBy, type Slot, type Status } from "@/lib/placement";
import type { AchievementCard } from "@/server/domain/views";
import { AchievementSummary, type ChipCategory } from "./achievement-card";
import { AddAchievement } from "./add-achievement";
import { columnsOf, STATUS_LABELS, STATUSES } from "./board-state";

type Props = {
  cards: AchievementCard[];
  categories: Map<string, ChipCategory>;
  onMove: (id: string, to: Slot & { status: Status }) => void;
  onAdd: (title: string) => void;
  onDelete: (id: string) => void;
};

const ORDER: Status[] = ["active", "backlog", "done"];

/** Below md: grouped list, moved with "Move to…" menus. */
export function StatusList({
  cards,
  categories,
  onMove,
  onAdd,
  onDelete,
}: Props) {
  const columns = columnsOf(cards);
  const byId = new Map(cards.map((c) => [c.id, c]));
  return (
    <section aria-label="List" className="flex flex-col gap-4 md:hidden">
      <AddAchievement onAdd={onAdd} className="bg-card" />
      {ORDER.map((status) => (
        <div key={status} className="flex flex-col gap-2">
          <h2 className="px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {STATUS_LABELS[status]} · {columns[status].length}
          </h2>
          {columns[status].map((id) => {
            const card = byId.get(id)!;
            const ids = columns[status];
            const step = (delta: -1 | 1) => {
              const slot = moveBy(ids, id, delta);
              if (slot) onMove(id, { status, ...slot });
            };
            return (
              <div
                key={id}
                className="flex items-start gap-2 rounded-[10px] border bg-card p-2.5"
              >
                <div className="min-w-0 flex-1">
                  <AchievementSummary card={card} categories={categories} />
                </div>
                {!id.startsWith("draft-") && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Move to… ${card.title}`}
                      >
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {STATUSES.filter((s) => s !== status).map((s) => (
                        <DropdownMenuItem
                          key={s}
                          onSelect={() =>
                            onMove(id, {
                              status: s,
                              afterId: columns[s].at(-1) ?? null,
                              beforeId: null,
                            })
                          }
                        >
                          {STATUS_LABELS[s]}
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        disabled={ids[0] === id}
                        onSelect={() => step(-1)}
                      >
                        Move up
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={ids.at(-1) === id}
                        onSelect={() => step(1)}
                      >
                        Move down
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={() => onDelete(id)}
                      >
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </section>
  );
}
