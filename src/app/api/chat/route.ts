import Anthropic from "@anthropic-ai/sdk";
import * as Sentry from "@sentry/nextjs";
import { connection } from "next/server";
import { z } from "zod";
import { runTurn } from "@/server/chat/engine";
import type { ChatEvent } from "@/server/chat/events";
import { listModels, resolveTiers } from "@/server/chat/models";
import { requireOwnerApi } from "@/server/auth/require-owner";
import { getDb } from "@/server/db/client";
import { runAction } from "@/server/domain/context";
import { getChatModelOverrides } from "@/server/domain/settings";
import { hitRateLimit } from "@/server/rate-limit";

// Hobby's maximum with Fluid Compute (Vercel docs, "Duration limits").
export const maxDuration = 300;

const Body = z.object({
  conversationId: z.uuid().optional(),
  tier: z.enum(["quick", "smart", "deep"]).optional(),
  text: z.string().max(20_000).optional(),
  confirm: z
    .object({ toolUseId: z.string().min(1), approve: z.boolean() })
    .optional(),
  retry: z.boolean().optional(),
});

const FAILED: ChatEvent = {
  type: "error",
  message: "Claude couldn't answer. Try again.",
  retryable: true,
};

/** One chat turn, streamed as newline-delimited ChatEvents. */
export async function POST(req: Request) {
  // Dynamic first: the build sees auth env as placeholders.
  await connection();
  const owner = await requireOwnerApi(req);
  if (owner instanceof Response) return owner;

  const db = getDb();
  const limited = await hitRateLimit(
    db,
    `chat:${owner.id}`,
    20,
    60_000,
    new Date(),
  );
  if (!limited.ok)
    return Response.json(
      { error: "rate_limited" },
      {
        status: 429,
        headers: { "retry-after": String(limited.retryAfterSeconds) },
      },
    );

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return Response.json({ error: "invalid_input" }, { status: 400 });
  const input = parsed.data;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // After the client leaves, enqueue throws; the turn still finishes and stores.
      const emit = (e: ChatEvent) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
        } catch {}
      };
      try {
        const client = new Anthropic();
        const now = new Date();
        const overrides = await runAction(
          { db, ownerId: owner.id, actor: "chat", now: () => now },
          getChatModelOverrides,
          {},
        );
        const models = await resolveTiers({
          list: listModels(client),
          overrides,
          now,
        });
        await runTurn(
          { db, ownerId: owner.id, client, now: () => new Date(), models },
          input,
          emit,
        );
      } catch (e) {
        console.error("chat route failed", e);
        Sentry.captureException(e, { tags: { surface: "chat" } });
        emit(FAILED);
      } finally {
        try {
          controller.close();
        } catch {}
      }
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
      "x-accel-buffering": "no",
    },
  });
}
