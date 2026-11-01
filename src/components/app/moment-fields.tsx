"use client";

import { Clock, X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { chipClass } from "./chip";

/** "YYYY-MM-DDTHH:MM" of now, for a datetime-local's max. */
function localNow(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

/**
 * A moment's details on the Trackers page: how strong, and when (now unless
 * set earlier).
 */
export function MomentFields({
  intensity,
  onIntensity,
  at,
  onAt,
}: {
  intensity: number | null;
  onIntensity: (n: number | null) => void;
  /** A datetime-local value, or null for now. */
  at: string | null;
  onAt: (at: string | null) => void;
}) {
  const [picking, setPicking] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <div
          role="group"
          aria-label="Intensity"
          className="flex items-center gap-1.5 text-sm text-muted-foreground md:text-xs"
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
                "size-9 rounded-full border text-sm outline-none md:size-7 md:text-xs focus-visible:ring-2 focus-visible:ring-ring",
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
