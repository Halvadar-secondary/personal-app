import Link from "next/link";
import { coverBackground } from "@/lib/covers";
import type { AreaSummary } from "@/server/domain/views";

function Counts({ counts }: Pick<AreaSummary, "counts">) {
  return (
    <p className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
      <span>{counts.active} active</span>
      <span aria-hidden>·</span>
      <span>{counts.backlog} backlog</span>
      <span aria-hidden>·</span>
      <span>{counts.done} done</span>
    </p>
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
export function AreaCard({ area }: { area: AreaSummary }) {
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
        <h2 className="truncate text-sm font-bold">{area.name}</h2>
        <Counts counts={area.counts} />
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
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-sm font-bold">{area.name}</span>
        <Counts counts={area.counts} />
      </span>
    </Link>
  );
}
