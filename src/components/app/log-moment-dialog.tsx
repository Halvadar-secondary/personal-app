"use client";

import { SlidersHorizontal } from "lucide-react";
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
import { logMomentAction } from "@/server/actions/trackers";
import { MomentFields } from "./moment-fields";
import { undo } from "./use-mutate";

// A thrown call is usually a stale action id after a deploy; a reload fixes it.
const RELOAD = "Couldn't save. Reload the page and try again.";

type Tracker = { id: string; name: string; emoji: string | null };

/**
 * A tracker card's "Log with details": intensity, an earlier time, a note.
 * Today's one-tap buttons cover the quick case.
 */
export function LogMomentButton({ tracker }: { tracker: Tracker }) {
  const [open, setOpen] = useState(false);
  const label = tracker.emoji
    ? `${tracker.emoji} ${tracker.name}`
    : tracker.name;
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        aria-label={`Log with details for ${tracker.name}`}
        onClick={() => setOpen(true)}
      >
        <SlidersHorizontal /> Log with details
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log {label}</DialogTitle>
          </DialogHeader>
          {open && <LogForm tracker={tracker} onDone={() => setOpen(false)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function LogForm({
  tracker,
  onDone,
}: {
  tracker: Tracker;
  onDone: () => void;
}) {
  const [intensity, setIntensity] = useState<number | null>(null);
  const [at, setAt] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        setError(null);
        const n = note.trim();
        let r: Awaited<ReturnType<typeof logMomentAction>> | null;
        try {
          r = await logMomentAction({
            trackerId: tracker.id,
            ...(intensity ? { intensity } : {}),
            ...(n ? { note: n } : {}),
            ...(at ? { at: new Date(at).toISOString() } : {}),
          });
        } catch {
          r = null;
        }
        setSaving(false);
        if (!r || !r.ok) {
          setError(r?.message ?? RELOAD);
          return;
        }
        onDone();
        const { batchId } = r;
        toast(`Logged ${tracker.name}`, {
          action: { label: "Undo", onClick: () => void undo(batchId) },
        });
      }}
    >
      <MomentFields
        intensity={intensity}
        onIntensity={setIntensity}
        at={at}
        onAt={setAt}
      />
      <Label htmlFor="moment-note" className="sr-only">
        Note
      </Label>
      <Textarea
        id="moment-note"
        maxLength={1000}
        placeholder="What was happening?"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <DialogFooter>
        <Button type="submit" disabled={saving}>
          Log moment
        </Button>
      </DialogFooter>
    </form>
  );
}
