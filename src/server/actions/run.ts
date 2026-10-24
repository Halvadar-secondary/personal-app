import "server-only";
import { refresh } from "next/cache";
import { notFound } from "next/navigation";
import type { z } from "zod";
import { requireOwner } from "@/server/auth/require-owner";
import { getDb } from "@/server/db/client";
import type { Db } from "@/server/db/types";
import { type Action, runAction } from "@/server/domain/context";
import { DomainError, type DomainErrorCode } from "@/server/domain/errors";

// The UI adapter: every Server Action and every page read goes through here.

export type Result<T = undefined> =
  | { ok: true; data: T; batchId: string }
  | { ok: false; code: DomainErrorCode; message: string };

const MESSAGES: Record<DomainErrorCode, string> = {
  invalid_input: "That doesn't look right. Check what you entered.",
  not_found: "That item no longer exists. Refresh to see the latest.",
  invalid_state: "This page was out of date. It's been refreshed.",
  conflict: "Something changed since. Refresh and try again.",
  already_undone: "That was already undone.",
};

/** What changed since, by name, when a conflict says so. */
function changedLabels(details: unknown): string[] {
  const changed = (details as { changed?: { label?: unknown }[] } | undefined)
    ?.changed;
  return (changed ?? [])
    .map((c) => c.label)
    .filter((l): l is string => typeof l === "string");
}

export function messageFor(code: DomainErrorCode, details?: unknown): string {
  const labels = code === "conflict" ? changedLabels(details) : [];
  if (labels.length === 0) return MESSAGES[code];
  const shown = labels
    .slice(0, 3)
    .map((l) => `“${l}”`)
    .join(", ");
  const more = labels.length > 3 ? ` and ${labels.length - 3} more` : "";
  return `Changed since: ${shown}${more}. Undo the later change first.`;
}

type Env = {
  owner: () => Promise<{ id: string }>;
  db: () => Db;
  refresh: () => void;
};

export function makeAct(env: Env) {
  return async function act<S extends z.ZodType, O, T = undefined>(
    action: Action<S, O>,
    input: z.input<S>,
    pick?: (o: O) => T,
  ): Promise<Result<T>> {
    // Actions are public POST endpoints: the owner check comes first.
    const { id } = await env.owner();
    const batchId = crypto.randomUUID();
    try {
      const o = await runAction(
        { db: env.db(), ownerId: id, actor: "ui", batchId },
        action,
        input,
      );
      env.refresh();
      return { ok: true, data: pick?.(o) as T, batchId };
    } catch (e) {
      if (e instanceof DomainError) {
        // A refusal means the page showed something stale; bad input doesn't.
        if (e.code !== "invalid_input") env.refresh();
        return {
          ok: false,
          code: e.code,
          message: messageFor(e.code, e.details),
        };
      }
      throw e;
    }
  };
}

export function makeRead(env: Omit<Env, "refresh">) {
  return async function read<S extends z.ZodType, O>(
    action: Action<S, O>,
    input: z.input<S>,
  ): Promise<O> {
    const { id } = await env.owner();
    try {
      return await runAction(
        { db: env.db(), ownerId: id, actor: "ui" },
        action,
        input,
      );
    } catch (e) {
      // Reads take ids from the URL: a missing or malformed one is a 404.
      if (
        e instanceof DomainError &&
        (e.code === "not_found" || e.code === "invalid_input")
      ) {
        notFound();
      }
      throw e;
    }
  };
}

const env = { owner: requireOwner, db: getDb, refresh };
export const act = makeAct(env);
export const read = makeRead(env);
