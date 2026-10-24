"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

/** Approve or deny an AI app; Better Auth sends the browser back to it. */
export function ConsentForm({
  clientName,
  origin,
}: {
  clientName: string;
  origin: { verified: boolean; host: string };
}) {
  const [busy, setBusy] = useState(false);
  async function answer(accept: boolean) {
    setBusy(true);
    const r = await authClient.oauth2.consent({ accept });
    const url = (r.data as { url?: string; redirect_uri?: string } | null)?.url;
    if (url) window.location.href = url;
    else setBusy(false);
  }
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">
        <span className="text-primary">{clientName}</span> wants to read and
        change your goals
      </h1>
      <p data-testid="client-origin" className="text-sm">
        {origin.verified ? (
          <>Identified by {origin.host}.</>
        ) : (
          <>
            Unverified app. After you approve, it continues at{" "}
            <span className="font-semibold">{origin.host}</span>.
          </>
        )}
      </p>
      <p className="text-sm text-muted-foreground">
        It will act as you: create, change, complete and delete. Every change
        shows in History and can be undone.
      </p>
      <div className="flex gap-2">
        <Button disabled={busy} onClick={() => answer(true)}>
          Approve
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => answer(false)}>
          Deny
        </Button>
      </div>
    </div>
  );
}
