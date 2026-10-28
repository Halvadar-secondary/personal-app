"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { createTrackerAction } from "@/server/actions/trackers";
import { perform } from "./use-mutate";

type Draft = { name: string; emoji: string | null; direction: "less" | "more" };

const STARTERS: Draft[] = [
  { name: "Negative thinking", emoji: "😟", direction: "less" },
  { name: "Anger", emoji: "😠", direction: "less" },
  { name: "Kindness", emoji: "💛", direction: "more" },
];

/** "New tracker", plus one-tap starters while there are none. */
export function NewTracker({ starters = false }: { starters?: boolean }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("");
  const [direction, setDirection] = useState<"less" | "more">("less");
  const [busy, setBusy] = useState(false);

  async function add(d: Draft) {
    setBusy(true);
    const r = await perform(() => createTrackerAction(d));
    setBusy(false);
    return !!r?.ok;
  }

  return (
    <div className="flex flex-col gap-3">
      {starters && (
        <div className="flex flex-col gap-2 rounded-[12px] border border-dashed p-3">
          <p className="text-sm text-muted-foreground">
            Pick a behaviour to watch. Logging each time it happens is what
            helps change it.
          </p>
          <div className="flex flex-wrap gap-2">
            {STARTERS.map((s) => (
              <Button
                key={s.name}
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => void add(s)}
              >
                {s.emoji} {s.name}
              </Button>
            ))}
          </div>
        </div>
      )}
      {open ? (
        <form
          aria-label="New tracker"
          className="flex flex-wrap items-end gap-2 rounded-[12px] border bg-card p-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const n = name.trim();
            if (!n) return;
            const ok = await add({
              name: n,
              emoji: emoji.trim() || null,
              direction,
            });
            if (ok) {
              setName("");
              setEmoji("");
              setOpen(false);
            }
          }}
        >
          <label className="flex min-w-40 flex-1 flex-col gap-1 text-xs">
            Name
            <Input
              autoFocus
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="flex w-20 flex-col gap-1 text-xs">
            Emoji
            <Input
              value={emoji}
              maxLength={16}
              onChange={(e) => setEmoji(e.target.value)}
            />
          </label>
          <div
            role="radiogroup"
            aria-label="Direction"
            className="flex rounded-md border p-0.5 text-xs"
          >
            {(
              [
                ["less", "Fewer is better"],
                ["more", "More is better"],
              ] as const
            ).map(([d, text]) => (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={direction === d}
                onClick={() => setDirection(d)}
                className={cn(
                  "rounded-[5px] px-2 py-1 outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  direction === d
                    ? "bg-accent font-medium text-accent-foreground"
                    : "text-muted-foreground",
                )}
              >
                {text}
              </button>
            ))}
          </div>
          <Button type="submit" disabled={!name.trim() || busy}>
            Add tracker
          </Button>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </form>
      ) : (
        <Button className="self-start" onClick={() => setOpen(true)}>
          <Plus /> New tracker
        </Button>
      )}
    </div>
  );
}
