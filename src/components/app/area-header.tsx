"use client";

import { MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { coverBackground } from "@/lib/covers";
import { deleteAreaAction, updateAreaAction } from "@/server/actions/areas";
import type { Area } from "@/server/db/goals";
import type { AreaProgress } from "@/server/domain/progress";
import { AreaForm } from "./area-form";
import { LevelBadge, Streak, Trophies, XpBar } from "./progress";
import { perform } from "./use-mutate";

/** Cover, emoji, name, level and description, with Edit / Delete in a menu. */
export function AreaHeader({
  area,
  progress,
}: {
  area: Area;
  progress: AreaProgress;
}) {
  const { level } = progress;
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  return (
    <header className="overflow-hidden rounded-[12px] border bg-card shadow-card">
      <div
        className="h-14"
        style={{ background: coverBackground(area.cover) }}
      />
      <div className="flex items-start gap-3 px-4 pb-3">
        <span
          aria-hidden
          className="-mt-5 flex size-11 shrink-0 items-center justify-center rounded-[10px] bg-card text-2xl shadow-sm"
        >
          {area.emoji ?? area.name.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1 pt-2">
          <div className="flex items-center gap-2">
            <h1 className="min-w-0 text-xl font-bold break-words">
              {area.name}
            </h1>
            <LevelBadge level={level.level} />
          </div>
          <XpBar progress={level} className="mt-1.5 max-w-xs" />
          <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
            <span>
              {progress.xp} XP · {level.span - level.into} to level{" "}
              {level.level + 1}
            </span>
            <Streak days={progress.streak} />
            {progress.trophies > 0 && (
              <Link
                href={`/areas/${area.id}/trophies`}
                className="hover:text-foreground"
              >
                <Trophies count={progress.trophies} />
              </Link>
            )}
          </p>
          {area.description && (
            <p className="mt-0.5 text-sm whitespace-pre-line text-muted-foreground">
              {area.description}
            </p>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Area menu"
              className="mt-1.5"
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setEditing(true)}>
              Edit area
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onSelect={async () => {
                const r = await perform(
                  () => deleteAreaAction({ areaId: area.id }),
                  { undoable: true },
                );
                if (r?.ok) router.push("/");
              }}
            >
              Delete area
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <AreaForm
        open={editing}
        onOpenChange={setEditing}
        initial={area}
        onSubmit={async (values) => {
          const r = await perform(() =>
            updateAreaAction({ areaId: area.id, ...values }),
          );
          if (r?.ok) setEditing(false);
        }}
      />
    </header>
  );
}
