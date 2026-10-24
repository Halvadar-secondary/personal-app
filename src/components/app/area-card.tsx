import Link from "next/link";
import { coverBackground } from "@/lib/covers";
import { formatDeadline, isOverdue } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { AreaSummary } from "@/server/domain/views";
import { LevelBadge, Streak, Trophies, XpBar } from "./progress";

function Stats({ area }: { area: AreaSummary }) {
  return (
    <p className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
      <span>{area.counts.active} active</span>
      <span>{area.counts.backlog} backlog</span>
      <Trophies count={area.progress.trophies} />
      <Streak days={area.progress.streak} />
    </p>
  );
}

function UpNextLine({ area, today }: { area: AreaSummary; today: string }) {
  const next = area.upNext;
  return (
    <div className="mt-1 border-t pt-2 text-xs">
      <span className="block text-[9px] tracking-wider text-faint uppercase">
        Up next
      </span>
      {next ? (
        <span className="line-clamp-2">
          {next.title}
          {next.deadline && (
            <span
              className={cn(
                "text-muted-foreground",
                isOverdue(next.deadline, today) &&
                  "font-semibold text-destructive",
              )}
            >
              {" "}
              · {formatDeadline(next.deadline)}
            </span>
          )}
        </span>
      ) : (
        <span className="text-muted-foreground">
          Nothing active. Pick from backlog
        </span>
      )}
    </div>
  );
}

function EmojiTile({
  area,
  className,
}: {
  area: AreaSummary;
  className: string;
}) {
  return (
    <span
      aria-hidden
      className={`flex items-center justify-center rounded-[10px] ${className}`}
    >
      {area.emoji ?? area.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

/** md and up: a grid card with the cover across the top. */
export function AreaCard({
  area,
  today,
}: {
  area: AreaSummary;
  today: string;
}) {
  return (
    <Link
      href={`/areas/${area.id}`}
      className="overflow-hidden rounded-[12px] border bg-card shadow-card transition hover:-translate-y-px hover:shadow-md"
    >
      <div
        className="relative h-12"
        style={{ background: coverBackground(area.cover) }}
      >
        <EmojiTile
          area={area}
          className="absolute -bottom-4 left-3 size-9 bg-card text-2xl shadow-sm"
        />
      </div>
      <div className="flex flex-col gap-1.5 px-3 pt-6 pb-3">
        <h2 className="flex items-center justify-between gap-2 text-sm font-bold">
          <span className="truncate">{area.name}</span>
          <LevelBadge level={area.progress.level.level} />
        </h2>
        <XpBar progress={area.progress.level} />
        <Stats area={area} />
        <UpNextLine area={area} today={today} />
      </div>
    </Link>
  );
}

/** Below md: a compact row, the emoji on the cover gradient. */
export function AreaRow({ area }: { area: AreaSummary }) {
  return (
    <Link
      href={`/areas/${area.id}`}
      className="flex items-center gap-3 rounded-[12px] border bg-card p-2.5"
    >
      <span
        className="shrink-0 rounded-[10px]"
        style={{ background: coverBackground(area.cover) }}
      >
        <EmojiTile area={area} className="size-9 text-xl" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-bold">{area.name}</span>
          <LevelBadge level={area.progress.level.level} />
        </span>
        <XpBar progress={area.progress.level} className="h-1" />
        <span className="flex gap-x-2 text-xs text-muted-foreground">
          <span>{area.counts.active} active</span>
          <Streak days={area.progress.streak} />
        </span>
      </span>
    </Link>
  );
}
