"use client";

import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { timeAgo } from "@/lib/dates";
import { listChats, removeChat } from "@/server/actions/chat";
import { perform } from "../use-mutate";
import { modelName, type Tiers } from "./model-picker";

type Row = Awaited<ReturnType<typeof listChats>>[number];

/** Past conversations, newest activity first; one tap opens one. */
export function ConversationList({
  tiers,
  onOpen,
  onDeleted,
}: {
  tiers: Tiers;
  onOpen: (id: string) => void;
  onDeleted: (id: string) => void;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [failed, setFailed] = useState(false);

  async function reload() {
    try {
      setRows(await listChats());
    } catch {
      setFailed(true);
    }
  }

  useEffect(() => {
    let live = true;
    listChats()
      .then((r) => live && setRows(r))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, []);

  async function remove(id: string) {
    const r = await perform(() => removeChat(id), { success: "Deleted" });
    if (r?.ok) {
      onDeleted(id);
      await reload();
    }
  }

  if (failed)
    return (
      <p className="p-4 text-sm text-muted-foreground">
        Couldn&apos;t load your conversations. Try again.
      </p>
    );
  if (!rows)
    return <p className="p-4 text-sm text-muted-foreground">Loading…</p>;
  if (rows.length === 0)
    return (
      <p className="p-4 text-sm text-muted-foreground">
        No conversations yet. They show up here once you send a message.
      </p>
    );

  const now = new Date();
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return (
    <ul aria-label="Conversations" className="flex flex-col gap-1 p-2">
      {rows.map((r) => (
        <li key={r.id} className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onOpen(r.id)}
            className="flex min-w-0 flex-1 flex-col items-start gap-0.5 rounded-lg px-3 py-2 text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="w-full truncate text-sm">{r.title}</span>
            <span className="text-xs text-muted-foreground">
              {modelName(r.model, tiers)} ·{" "}
              {timeAgo(new Date(r.updatedAt), now, zone)}
            </span>
          </button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Delete “${r.title}”`}
            onClick={() => remove(r.id)}
          >
            <Trash2 />
          </Button>
        </li>
      ))}
    </ul>
  );
}
