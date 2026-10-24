"use server";

import { refresh } from "next/cache";
import { requireOwner } from "@/server/auth/require-owner";
import { getDb } from "@/server/db/client";
import { revokeApp } from "@/server/mcp/connected";
import { messageFor } from "@/server/messages";
import type { Result } from "./run";

/** Settings → Connected AI apps → Revoke. Not undoable: the app reconnects instead. */
export async function revokeAppAction(input: {
  clientId: string;
}): Promise<Result> {
  // A public POST endpoint like every Server Action: the owner check comes first.
  const { id } = await requireOwner();
  const clientId = input?.clientId;
  if (typeof clientId !== "string" || !clientId || clientId.length > 2000) {
    return {
      ok: false,
      code: "invalid_input",
      message: messageFor("invalid_input"),
    };
  }
  await revokeApp(getDb(), id, clientId);
  refresh();
  return { ok: true, data: undefined, batchId: "" };
}
