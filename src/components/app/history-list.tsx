"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { undoAction } from "@/server/actions/history";
import type { HistoryBatch } from "@/server/domain/history-view";
import { perform } from "./use-mutate";

/** One row per batch: what happened, who and when, and Undo. */
export function HistoryList({ batches }: { batches: HistoryBatch[] }) {
  // Batches with an undo in flight: a second click must not send another.
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());

  async function undo(batchId: string) {
    if (busy.has(batchId)) return;
    setBusy((b) => new Set(b).add(batchId));
    try {
      await perform(() => undoAction({ batchId }), { success: "Undone" });
    } finally {
      setBusy((b) => {
        const next = new Set(b);
        next.delete(batchId);
        return next;
      });
    }
  }

  if (batches.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nothing yet. Changes you make show up here.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-1.5">
      {batches.map((b) => (
        <li
          key={b.batchId}
          className="flex items-center gap-3 rounded-[10px] border bg-card px-3 py-2"
        >
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-sm break-words">{b.summary}</span>
            <span className="text-xs text-muted-foreground">
              {b.who} · {b.when}
            </span>
          </div>
          {b.undone ? (
            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              Undone
            </span>
          ) : (
            <Button
              variant="outline"
              size="sm"
              disabled={busy.has(b.batchId)}
              onClick={() => undo(b.batchId)}
            >
              Undo
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}
