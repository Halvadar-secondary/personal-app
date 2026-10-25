"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { authClient } from "@/lib/auth-client";
import { SectionSkeleton } from "./page-skeletons";

export type PasskeyRow = {
  id: string;
  name: string | null;
  createdAt: Date;
};

type Outcome = { error?: string };

export type PasskeyApi = {
  list(): Promise<PasskeyRow[]>;
  add(): Promise<Outcome>;
  rename(id: string, name: string): Promise<Outcome>;
  remove(id: string): Promise<Outcome>;
};

const outcome = (res: { error?: { message?: string } | null } | undefined) =>
  res?.error ? { error: res.error.message ?? "Something went wrong." } : {};

/** Better Auth's own passkey endpoints; they act on the signed-in user only. */
export const betterAuthPasskeys: PasskeyApi = {
  async list() {
    const res = await authClient.passkey.listUserPasskeys();
    return (res.data ?? []).map((p) => ({
      id: p.id,
      name: p.name ?? null,
      createdAt: new Date(p.createdAt),
    }));
  },
  add: async () => outcome(await authClient.passkey.addPasskey()),
  rename: async (id, name) =>
    outcome(await authClient.passkey.updatePasskey({ id, name })),
  remove: async (id) => outcome(await authClient.passkey.deletePasskey({ id })),
};

const added = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

/** Settings → Passkeys: list, add, rename, remove (spec §6.1, §15). */
export function Passkeys({ api = betterAuthPasskeys }: { api?: PasskeyApi }) {
  const [rows, setRows] = useState<PasskeyRow[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [removing, setRemoving] = useState<PasskeyRow | null>(null);

  const reload = useCallback(async () => setRows(await api.list()), [api]);
  useEffect(() => {
    let live = true;
    void api.list().then((r) => live && setRows(r));
    return () => {
      live = false;
    };
  }, [api]);

  /** Runs a change, toasts its error, and reloads either way. */
  const change = async (run: () => Promise<Outcome>) => {
    const { error } = await run();
    if (error) toast.error(error);
    await reload();
  };

  if (rows === null) {
    return <SectionSkeleton testId="passkeys-loading" />;
  }
  return (
    <div className="flex flex-col gap-3">
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No passkeys yet. Add one to sign in with Face ID, fingerprint or
          Windows Hello.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((p) => (
            <li
              key={p.id}
              data-testid="passkey-row"
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2"
            >
              <div className="flex min-w-0 flex-col">
                {editing === p.id ? (
                  <RenameField
                    initial={p.name ?? ""}
                    onDone={async (name) => {
                      setEditing(null);
                      if (name && name !== p.name)
                        await change(() => api.rename(p.id, name));
                    }}
                  />
                ) : (
                  <span className="truncate text-sm font-medium">
                    {p.name || "Passkey"}
                  </span>
                )}
                <span className="text-xs text-muted-foreground">
                  Added {added.format(p.createdAt)}
                </span>
              </div>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditing(p.id)}
                >
                  Rename
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setRemoving(p)}
                >
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Button
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => change(() => api.add())}
      >
        Add a passkey
      </Button>
      <Dialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Remove passkey</DialogTitle>
            <DialogDescription>
              Remove this passkey? You can still sign in with Google.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                const target = removing!;
                setRemoving(null);
                await change(() => api.remove(target.id));
              }}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RenameField({
  initial,
  onDone,
}: {
  initial: string;
  onDone: (name: string) => void;
}) {
  const [draft, setDraft] = useState(initial);
  return (
    <input
      aria-label="Passkey name"
      autoFocus
      value={draft}
      maxLength={60}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onDone(draft.trim())}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onDone(draft.trim());
        } else if (e.key === "Escape") {
          onDone(initial);
        }
      }}
      className="rounded-sm bg-transparent text-sm font-medium outline-none ring-2 ring-ring/50"
    />
  );
}
