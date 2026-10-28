import Link from "next/link";
import type { getPatterns } from "@/server/domain/trackers";
import { momentTime, Trend, trackerLabel } from "./tracker-card";

type PatternsData = Awaited<ReturnType<typeof getPatterns.run>>;

/** The review's patterns: last week per tracker, and what the notes said. */
export function Patterns({ patterns }: { patterns: PatternsData }) {
  if (patterns.trackers.length === 0) return null;
  return (
    <section aria-label="Patterns" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Patterns
        </h2>
        <Link
          href="/trackers"
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Trackers
        </Link>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {patterns.trackers.map((t) => (
          <div
            key={t.id}
            className="flex flex-col gap-1.5 rounded-[12px] border bg-card p-3"
          >
            <span className="text-sm font-medium">
              {trackerLabel(t)}: {t.count} last week ({t.previous} the week
              before)
            </span>
            <Trend
              direction={t.direction}
              diff={t.count - t.previous}
              than="the week before"
            />
            {t.notes.length > 0 && (
              <ul className="flex flex-col gap-1 border-t pt-1.5 text-xs">
                {t.notes.map((n, i) => (
                  <li key={i} className="break-words">
                    <span className="text-muted-foreground">
                      {momentTime(n.at)}
                      {n.intensity !== null && ` · ${n.intensity}`} ·{" "}
                    </span>
                    {n.note}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
