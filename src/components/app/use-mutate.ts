"use client";

import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";
import { undoAction } from "@/server/actions/history";
import type { Result } from "@/server/actions/run";

// A thrown call is usually a stale action id after a deploy; a reload fixes it.
const RELOAD = "Couldn't save. Reload the page and try again.";

type Opts = { undoable?: boolean; success?: string };

async function settle<T>(call: () => Promise<Result<T>>) {
  try {
    return await call();
  } catch {
    return null;
  }
}

async function undo(batchId: string) {
  const r = await settle(() => undoAction({ batchId }));
  if (!r) toast.error(RELOAD);
  else if (!r.ok) toast.error(r.message);
}

/**
 * Runs a server call and reports the outcome in a toast: the domain message
 * on refusal, the reload hint when it threw, Undo when `undoable`.
 */
export async function perform<T>(
  call: () => Promise<Result<T>>,
  opts: Opts = {},
): Promise<Result<T> | null> {
  const r = await settle(call);
  if (!r) toast.error(RELOAD);
  else if (!r.ok) toast.error(r.message);
  else if (opts.undoable) {
    toast(opts.success ?? "Deleted", {
      action: { label: "Undo", onClick: () => void undo(r.batchId) },
    });
  } else if (opts.success) toast.success(opts.success);
  return r;
}

/**
 * Applies `op` optimistically while `call` runs. When the call settles the
 * optimistic state gives way to the server's: refreshed on success, the old
 * props (a revert) on failure, with the message in a toast.
 */
export function useMutate<O, Op>(reducer: (state: O, op: Op) => O, initial: O) {
  const [state, addOptimistic] = useOptimistic(initial, reducer);
  const [pending, startTransition] = useTransition();

  function run<T>(
    op: Op,
    call: () => Promise<Result<T>>,
    opts: Opts = {},
  ): Promise<Result<T> | null> {
    return new Promise((resolve) =>
      startTransition(async () => {
        addOptimistic(op);
        resolve(await perform(call, opts));
      }),
    );
  }

  return { state, run, pending };
}
