"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { logMomentAction, noteMomentAction } from "@/server/actions/trackers";
import { undo } from "./use-mutate";

// A thrown call is usually a stale action id after a deploy; a reload fixes it.
const RELOAD = "Couldn't save. Reload the page and try again.";

export type QuickTracker = {
  id: string;
  name: string;
  emoji: string | null;
  /** Moments logged today, in the owner's day. */
  today: number;
};

type Noting = { momentId: string; name: string };

/**
 * Today's row of trackers: one tap logs a moment now, with no score. The
 * toast offers Undo and Add note; details live on the Trackers page.
 */
export function QuickLog({ trackers }: { trackers: QuickTracker[] }) {
  const [noting, setNoting] = useState<Noting | null>(null);
  // Taps counted before the server's refreshed counts arrive.
  const [pending, setPending] = useState<Record<string, number>>({});
  const [seen, setSeen] = useState(trackers);
  if (seen !== trackers) {
    setSeen(trackers);
    setPending({});
  }
  if (trackers.length === 0) return null;

  const bump = (id: string, by: number) =>
    setPending((p) => ({ ...p, [id]: (p[id] ?? 0) + by }));

  async function log(t: QuickTracker) {
    bump(t.id, 1);
    let r: Awaited<ReturnType<typeof logMomentAction>> | null;
    try {
      r = await logMomentAction({ trackerId: t.id });
    } catch {
      r = null;
    }
    if (!r || !r.ok) {
      bump(t.id, -1);
      toast.error(r?.message ?? RELOAD);
      return;
    }
    const { batchId } = r;
    const momentId = r.data.id;
    toast(`Logged ${t.name}`, {
      action: { label: "Undo", onClick: () => void undo(batchId) },
      cancel: {
        label: "Add note",
        onClick: () => setNoting({ momentId, name: t.name }),
      },
    });
  }

  return (
    <section aria-label="Trackers">
      {/* Every tracker in view: they wrap, never scroll. */}
      <div className="flex flex-wrap gap-2">
        {trackers.map((t) => {
          const count = t.today + (pending[t.id] ?? 0);
          return (
            <button
              key={t.id}
              type="button"
              // Says what the tap does and includes what's on the button.
              aria-label={`Log ${t.name} ${count} today`}
              onClick={() => void log(t)}
              className="inline-flex min-h-11 items-center gap-2 rounded-full border bg-card px-4 text-base font-medium outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring active:scale-95 md:min-h-9 md:px-3.5 md:text-sm"
            >
              {t.emoji ? `${t.emoji} ${t.name}` : t.name}
              <span
                title="Today"
                className="min-w-6 rounded-full bg-muted px-1.5 text-center text-sm text-muted-foreground tabular-nums"
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>
      <NoteDialog noting={noting} onClose={() => setNoting(null)} />
    </section>
  );
}

function NoteDialog({
  noting,
  onClose,
}: {
  noting: Noting | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={noting !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Note for {noting?.name}</DialogTitle>
        </DialogHeader>
        {noting && <NoteForm noting={noting} onDone={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function NoteForm({ noting, onDone }: { noting: Noting; onDone: () => void }) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        let r: Awaited<ReturnType<typeof noteMomentAction>> | null;
        try {
          r = await noteMomentAction({ momentId: noting.momentId, note });
        } catch {
          r = null;
        }
        setSaving(false);
        if (!r || !r.ok) toast.error(r?.message ?? RELOAD);
        else onDone();
      }}
    >
      <Label htmlFor="quick-note" className="sr-only">
        Note
      </Label>
      <Textarea
        id="quick-note"
        autoFocus
        maxLength={1000}
        placeholder="What was happening?"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <DialogFooter>
        <Button type="submit" disabled={saving || !note.trim()}>
          Save note
        </Button>
      </DialogFooter>
    </form>
  );
}
