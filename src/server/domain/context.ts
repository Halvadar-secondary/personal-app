import { eq } from "drizzle-orm";
import type { z } from "zod";
import { settings } from "@/server/db/schema";
import type { Db } from "@/server/db/types";
import { DomainError } from "./errors";

/** Who made a change: the owner in the UI, the seed script, or an AI app. */
export type Actor = "ui" | "seed" | `mcp:${string}`;

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export type Ctx = {
  db: Tx;
  ownerId: string;
  actor: Actor;
  /** Shared by every change event this action writes; one undo step. */
  batchId: string;
  now: () => Date;
  timeZone: string;
  /** First day of the owner's week; 0 = Sunday. */
  weekStart: number;
};

export type Action<S extends z.ZodType, O> = {
  input: S;
  run: (ctx: Ctx, input: z.output<S>) => Promise<O>;
};

export function defineAction<S extends z.ZodType, O>(
  input: S,
  run: (ctx: Ctx, input: z.output<S>) => Promise<O>,
): Action<S, O> {
  return { input, run };
}

function parse<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const r = schema.safeParse(input);
  if (!r.success) {
    throw new DomainError("invalid_input", { issues: r.error.issues });
  }
  return r.data;
}

/** Runs an action inside another one: same transaction, same batch. */
export function callAction<S extends z.ZodType, O>(
  ctx: Ctx,
  action: Action<S, O>,
  input: z.input<S>,
): Promise<O> {
  return action.run(ctx, parse(action.input, input));
}

export type ActionDeps = {
  db: Db;
  ownerId: string;
  actor: Actor;
  /** Lets the caller know the batch id up front, to offer undo. */
  batchId?: string;
  now?: () => Date;
};

/** The entry point for adapters: validate, then run in one owner-scoped transaction. */
export async function runAction<S extends z.ZodType, O>(
  deps: ActionDeps,
  action: Action<S, O>,
  input: z.input<S>,
): Promise<O> {
  const parsed = parse(action.input, input);
  return deps.db.transaction(async (tx) => {
    const [s] = await tx
      .select({ timeZone: settings.timeZone, weekStart: settings.weekStart })
      .from(settings)
      .where(eq(settings.ownerId, deps.ownerId));
    const ctx: Ctx = {
      db: tx,
      ownerId: deps.ownerId,
      actor: deps.actor,
      batchId: deps.batchId ?? crypto.randomUUID(),
      now: deps.now ?? (() => new Date()),
      timeZone: s?.timeZone ?? "UTC",
      weekStart: s?.weekStart ?? 1,
    };
    return action.run(ctx, parsed);
  });
}
