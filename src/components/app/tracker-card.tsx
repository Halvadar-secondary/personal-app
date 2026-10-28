"use client";

import { MoreHorizontal, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDeadline } from "@/lib/dates";
import { trendGood, trendText } from "@/lib/trackers";
import { cn } from "@/lib/utils";
import {
  deleteMomentAction,
  deleteTrackerAction,
  momentsAction,
  moveTrackerAction,
  updateTrackerAction,
} from "@/server/actions/trackers";
import type { TrackerMoment } from "@/server/db/goals";
import type { TrackerSummary } from "@/server/domain/trackers";
import { InlineText } from "./inline-text";
import { perform, useMutate } from "./use-mutate";

const PAGE = 20;

export const trackerLabel = (t: { name: string; emoji: string | null }) =>
  t.emoji ? `${t.emoji} ${t.name}` : t.name;

/** "Tue 18:30" in this device's zone. */
export function momentTime(at: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(at);
}

/** "Same as last week" etc., coloured by whether it went the wanted way. */
export function Trend({
  direction,
  diff,
  than,
}: {
  direction: "less" | "more";
  diff: number;
  than?: string;
}) {
  const good = trendGood(direction, diff);
  return (
    <span
      data-good={good === null ? "same" : String(good)}
      className={cn(
        "text-xs",
        good ? "font-medium text-primary" : "text-muted-foreground",
      )}
    >
      {trendText(diff, than)}
    </span>
  );
}

/** One tracker: this week so far, the trend, 8 weeks of bars and its moments. */
export function TrackerCard({
  tracker,
  moments,
  prevId = null,
  nextId = null,
}: {
  tracker: TrackerSummary;
  moments: TrackerMoment[];
  /** Neighbours, for Move up / Move down. */
  prevId?: string | null;
  nextId?: string | null;
}) {
  const { state, run } = useMutate(
    (list: TrackerMoment[], id: string) => list.filter((m) => m.id !== id),
    moments,
  );
  const [older, setOlder] = useState<TrackerMoment[]>([]);
  const [more, setMore] = useState(moments.length >= PAGE);
  const label = trackerLabel(tracker);
  const max = Math.max(1, ...tracker.weeks.map((w) => w.count));
  const shown = [...state, ...older];
  const id = tracker.id;
  const update = (patch: Parameters<typeof updateTrackerAction>[0]) =>
    perform(() => updateTrackerAction(patch));

  async function loadMore() {
    const last = shown.at(-1);
    if (!last) return;
    try {
      const page = await momentsAction({
        trackerId: id,
        before: last.at.toISOString(),
      });
      setOlder((o) => [...o, ...page]);
      setMore(page.length >= PAGE);
    } catch {
      setMore(false);
    }
  }

  return (
    <section
      aria-label={label}
      className="flex flex-col gap-3 rounded-[12px] border bg-card p-3 shadow-card"
    >
      <div className="flex items-start gap-2">
        <h2 className="min-w-0 flex-1 text-base font-semibold">
          {tracker.emoji && <span aria-hidden>{tracker.emoji} </span>}
          <InlineText
            value={tracker.name}
            label="Tracker name"
            maxLength={60}
            onSave={(name) => void update({ trackerId: id, name })}
          />
        </h2>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`Tracker menu ${tracker.name}`}
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={() =>
                void update({
                  trackerId: id,
                  direction: tracker.direction === "less" ? "more" : "less",
                })
              }
            >
              {tracker.direction === "less"
                ? "More is better"
                : "Fewer is better"}
            </DropdownMenuItem>
            {prevId && (
              <DropdownMenuItem
                onSelect={() =>
                  void perform(() =>
                    moveTrackerAction({ trackerId: id, beforeId: prevId }),
                  )
                }
              >
                Move up
              </DropdownMenuItem>
            )}
            {nextId && (
              <DropdownMenuItem
                onSelect={() =>
                  void perform(() =>
                    moveTrackerAction({ trackerId: id, afterId: nextId }),
                  )
                }
              >
                Move down
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onSelect={() =>
                void update({
                  trackerId: id,
                  archived: tracker.archivedAt === null,
                })
              }
            >
              {tracker.archivedAt ? "Unarchive" : "Archive"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={() =>
                void perform(() => deleteTrackerAction({ trackerId: id }), {
                  undoable: true,
                })
              }
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-sm font-medium">
          This week so far: {tracker.thisWeek}
        </span>
        <Trend
          direction={tracker.direction}
          diff={tracker.thisWeek - tracker.lastWeek}
        />
        {tracker.avgIntensity !== null && (
          <span className="text-xs text-muted-foreground">
            Avg intensity {Math.round(tracker.avgIntensity * 10) / 10}
          </span>
        )}
      </div>

      <ol aria-label="Last 8 weeks" className="flex h-12 items-end gap-1">
        {tracker.weeks.map((w) => (
          <li
            key={w.start}
            aria-label={`Week of ${formatDeadline(w.start)}: ${w.count}`}
            className="flex h-full flex-1 items-end"
          >
            <span
              className="block w-full rounded-sm bg-primary/70"
              style={{ height: `${Math.max(4, (w.count / max) * 100)}%` }}
            />
          </li>
        ))}
      </ol>

      {shown.length > 0 && (
        <ul className="flex flex-col gap-1 border-t pt-2">
          {shown.map((m) => (
            <li key={m.id} className="flex items-start gap-2 text-sm">
              <span className="w-20 shrink-0 text-xs text-muted-foreground tabular-nums">
                {momentTime(m.at)}
              </span>
              {m.intensity !== null && (
                <span
                  aria-label={`Intensity ${m.intensity}`}
                  className="shrink-0 rounded-full bg-badge px-1.5 text-xs text-badge-foreground"
                >
                  {m.intensity}
                </span>
              )}
              <span className="min-w-0 flex-1 break-words">{m.note ?? ""}</span>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Delete moment"
                onClick={() => {
                  setOlder((o) => o.filter((x) => x.id !== m.id));
                  void run(m.id, () => deleteMomentAction({ momentId: m.id }), {
                    undoable: true,
                  });
                }}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {more && (
        <Button
          variant="ghost"
          size="sm"
          className="self-start"
          onClick={() => void loadMore()}
        >
          Show more
        </Button>
      )}
    </section>
  );
}
