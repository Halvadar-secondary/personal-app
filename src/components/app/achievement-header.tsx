"use client";

import { MoreHorizontal, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Status } from "@/lib/placement";
import {
  deleteAchievementAction,
  moveAchievementAction,
  updateAchievementAction,
} from "@/server/actions/achievements";
import type { Achievement, Area } from "@/server/db/goals";
import { STATUS_LABELS, STATUSES } from "./board-state";
import { InlineText } from "./inline-text";
import { perform, useMutate } from "./use-mutate";

type Fields = Pick<
  Achievement,
  "title" | "status" | "deadline" | "notes" | "areaId"
>;

/** Breadcrumb, title, status, deadline, notes and the achievement menu. */
export function AchievementHeader({
  achievement,
  areas,
}: {
  achievement: Achievement;
  areas: Pick<Area, "id" | "name" | "emoji">[];
}) {
  const router = useRouter();
  const { state, run } = useMutate(
    (a: Achievement, patch: Partial<Fields>) => ({ ...a, ...patch }),
    achievement,
  );
  const id = achievement.id;
  const area = areas.find((a) => a.id === state.areaId);
  const update = (
    patch: Partial<Pick<Fields, "title" | "deadline" | "notes">>,
  ) =>
    run(patch, () => updateAchievementAction({ achievementId: id, ...patch }));

  return (
    <header className="flex flex-col gap-3">
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
        {area ? (
          <Link href={`/areas/${area.id}`} className="hover:underline">
            {area.emoji && <span aria-hidden>{area.emoji} </span>}
            {area.name}
          </Link>
        ) : (
          <Link href="/inbox" className="hover:underline">
            Inbox
          </Link>
        )}
      </nav>
      <div className="flex items-start gap-2">
        <h1 className="min-w-0 flex-1 text-xl font-bold">
          <InlineText
            value={state.title}
            label="Achievement title"
            maxLength={200}
            onSave={(title) => update({ title })}
          />
        </h1>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Achievement menu">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Move to area…</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {areas
                  .filter((a) => a.id !== state.areaId)
                  .map((a) => (
                    <DropdownMenuItem
                      key={a.id}
                      onSelect={() =>
                        run({ areaId: a.id }, () =>
                          moveAchievementAction({
                            achievementId: id,
                            areaId: a.id,
                          }),
                        )
                      }
                    >
                      {a.emoji && <span aria-hidden>{a.emoji}</span>}
                      {a.name}
                    </DropdownMenuItem>
                  ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuItem
              variant="destructive"
              onSelect={async () => {
                const r = await perform(
                  () => deleteAchievementAction({ achievementId: id }),
                  { undoable: true },
                );
                if (r?.ok) {
                  router.push(
                    state.areaId ? `/areas/${state.areaId}` : "/inbox",
                  );
                }
              }}
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={state.status}
          onValueChange={(v) =>
            run({ status: v as Status }, () =>
              moveAchievementAction({ achievementId: id, status: v as Status }),
            )
          }
        >
          <SelectTrigger aria-label="Status" size="sm" className="bg-card">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="flex items-center gap-1 rounded-lg border bg-card px-2 py-1 text-sm">
          <input
            type="date"
            aria-label="Achievement deadline"
            value={state.deadline ?? ""}
            onChange={(e) => update({ deadline: e.target.value || null })}
            className="bg-transparent"
          />
          {state.deadline && (
            <button
              type="button"
              aria-label="Clear achievement deadline"
              onClick={() => update({ deadline: null })}
              className="text-faint hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </span>
      </div>
      <Textarea
        aria-label="Notes"
        placeholder="Notes"
        defaultValue={state.notes ?? ""}
        maxLength={10_000}
        className="bg-card"
        onBlur={(e) => {
          const notes = e.target.value.trim() || null;
          if (notes !== (state.notes ?? null)) update({ notes });
        }}
      />
    </header>
  );
}
