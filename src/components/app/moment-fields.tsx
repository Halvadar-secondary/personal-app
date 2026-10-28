"use client";

import { Clock, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { chipClass } from "./chip";

export type MomentTracker = { id: string; name: string; emoji: string | null };

const label = (t: MomentTracker) => (t.emoji ? `${t.emoji} ${t.name}` : t.name);

/** "YYYY-MM-DDTHH:MM" of now, for a datetime-local's max. */
function localNow(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

/**
 * A moment's properties in the Capture dialog: which tracker, how strong,
 * and when (now unless set earlier).
 */
export function MomentFields({
  trackers,
  trackerId,
  onTracker,
  intensity,
  onIntensity,
  at,
  onAt,
}: {
  /** Null until the dialog's options arrive. */
  trackers: MomentTracker[] | null;
  trackerId: string | null;
  onTracker: (id: string) => void;
  intensity: number | null;
  onIntensity: (n: number | null) => void;
  /** A datetime-local value, or null for now. */
  at: string | null;
  onAt: (at: string | null) => void;
}) {
  const [picking, setPicking] = useState(false);

  if (trackers && trackers.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No trackers yet.{" "}
        <Link href="/trackers" className="text-primary underline">
          Add one
        </Link>
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <div
        role="radiogroup"
        aria-label="Tracker"
        className="flex flex-wrap gap-1.5"
      >
        {(trackers ?? []).map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={trackerId === t.id}
            aria-label={label(t)}
            onClick={() => onTracker(t.id)}
            className={chipClass(trackerId === t.id)}
          >
            {label(t)}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <div
          role="group"
          aria-label="Intensity"
          className="flex items-center gap-1 text-xs text-muted-foreground"
        >
          <span aria-hidden>Intensity</span>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              aria-label={`Intensity ${n}`}
              aria-pressed={intensity === n}
              onClick={() => onIntensity(intensity === n ? null : n)}
              className={cn(
                "size-6 rounded-full border text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring",
                intensity !== null && n <= intensity
                  ? "border-primary/30 bg-accent text-accent-foreground"
                  : "hover:text-foreground",
              )}
            >
              {n}
            </button>
          ))}
        </div>
        {picking || at ? (
          <span className={chipClass(at !== null)}>
            <Clock className="size-3" aria-hidden />
            <input
              type="datetime-local"
              aria-label="When it happened"
              autoFocus={picking && !at}
              max={localNow()}
              value={at ?? ""}
              onChange={(e) => onAt(e.target.value || null)}
              className="bg-transparent text-xs outline-none"
            />
            <button
              type="button"
              aria-label="Now"
              onClick={() => {
                onAt(null);
                setPicking(false);
              }}
              className="text-faint hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          </span>
        ) : (
          <button
            type="button"
            aria-label="When: Now"
            onClick={() => setPicking(true)}
            className={chipClass(false)}
          >
            <Clock className="size-3" aria-hidden />
            Now
          </button>
        )}
      </div>
    </div>
  );
}
