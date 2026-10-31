import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import * as Sentry from "@sentry/nextjs";
import { and, eq } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { z } from "zod";
import {
  achievements,
  areas,
  categories,
  changeEvents,
  goals,
  tasks,
  trackers,
} from "@/server/db/schema";
import type { Db } from "@/server/db/types";
import { type Action, runAction } from "@/server/domain/context";
import {
  getConversation,
  searchConversations,
} from "@/server/domain/conversations";
import { DomainError } from "@/server/domain/errors";
import { listHistory } from "@/server/domain/history-view";
import { messageFor } from "@/server/messages";
import { TOOLS, type ToolDef } from "@/server/mcp/tools";

type Deps = { db: Db; ownerId: string };

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/** Chat-only tools: Claude reading the owner's earlier conversations. */
const CHAT_ONLY: ToolDef[] = [
  {
    name: "search_conversations",
    description:
      "Search the owner's earlier chats with you by words in the title or the messages. Returns matching conversations with short snippets; open one with get_conversation.",
    action: searchConversations,
    summary: (o) => plural((o as unknown[]).length, "conversation"),
  } as ToolDef,
  {
    name: "get_conversation",
    description:
      "Read one earlier chat (by id from search_conversations): the text of its messages.",
    action: {
      input: getConversation.input,
      run: async (ctx, input) => {
        const { conversation, messages } = await getConversation.run(
          ctx,
          input as { id: string },
        );
        return {
          id: conversation.id,
          title: conversation.title,
          messages: messages.flatMap((m) => {
            if (m.role === "system") return [];
            const text = Array.isArray(m.content)
              ? (m.content as { type?: string; text?: string }[])
                  .filter((b) => b.type === "text")
                  .map((b) => b.text)
                  .join("\n")
              : "";
            return text ? [{ role: m.role, text }] : [];
          }),
        };
      },
    } as Action<z.ZodType, unknown>,
    summary: (o) => `Read “${(o as { title: string }).title}”`,
  },
];

const ALL: ToolDef[] = [...TOOLS, ...CHAT_ONLY];
const BY_NAME = new Map(ALL.map((t) => [t.name, t]));

/** Every tool the chat can call, in the API's tool shape. */
export function chatToolDefs(): Anthropic.Tool[] {
  const defs: Anthropic.Tool[] = ALL.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: z.toJSONSchema(t.action.input, {
      io: "input",
    }) as Anthropic.Tool.InputSchema,
  }));
  const last = defs.at(-1)!;
  last.cache_control = { type: "ephemeral" };
  return defs;
}

export function isDestructive(name: string): boolean {
  return BY_NAME.get(name)?.destructive ?? false;
}

const failed = (
  id: string,
  text: string,
): {
  result: Anthropic.ToolResultBlockParam;
  summary: string;
  batchId: null;
} => ({
  result: {
    type: "tool_result",
    tool_use_id: id,
    content: text,
    is_error: true,
  },
  summary: text,
  batchId: null,
});

/** Runs one tool call as Claude in chat, one undoable batch per call. */
export async function runChatTool(
  deps: Deps,
  block: { id: string; name: string; input: unknown },
): Promise<{
  result: Anthropic.ToolResultBlockParam;
  summary: string;
  batchId: string | null;
}> {
  const tool = BY_NAME.get(block.name);
  if (!tool) return failed(block.id, `Unknown tool: ${block.name}`);
  const batchId = crypto.randomUUID();
  try {
    const output = await runAction(
      { ...deps, actor: "chat", batchId },
      tool.action,
      block.input,
    );
    const [event] = await deps.db
      .select({ id: changeEvents.id })
      .from(changeEvents)
      .where(
        and(
          eq(changeEvents.batchId, batchId),
          eq(changeEvents.ownerId, deps.ownerId),
        ),
      )
      .limit(1);
    return {
      result: {
        type: "tool_result",
        tool_use_id: block.id,
        content: [
          { type: "text", text: tool.summary(output, block.input) },
          { type: "text", text: JSON.stringify(output) },
        ],
      },
      summary: tool.summary(output, block.input),
      batchId: event ? batchId : null,
    };
  } catch (e) {
    if (e instanceof DomainError)
      return failed(block.id, messageFor(e.code, e.details));
    console.error("chat tool failed", block.name, e);
    Sentry.captureException(e, {
      tags: { surface: "chat" },
      extra: { tool: block.name },
    });
    return failed(block.id, "Something went wrong. Try again.");
  }
}

async function titleOf(deps: Deps, kind: string, id: string) {
  const owned = (t: { id: AnyPgColumn; ownerId: AnyPgColumn }) =>
    and(eq(t.id, id), eq(t.ownerId, deps.ownerId));
  const pick = async (rows: Promise<{ v: string }[]>) => (await rows)[0]?.v;
  switch (kind) {
    case "area":
      return pick(
        deps.db.select({ v: areas.name }).from(areas).where(owned(areas)),
      );
    case "achievement":
      return pick(
        deps.db
          .select({ v: achievements.title })
          .from(achievements)
          .where(owned(achievements)),
      );
    case "task":
      return pick(
        deps.db.select({ v: tasks.title }).from(tasks).where(owned(tasks)),
      );
    case "category":
      return pick(
        deps.db
          .select({ v: categories.name })
          .from(categories)
          .where(owned(categories)),
      );
    case "goal":
      return pick(
        deps.db.select({ v: goals.title }).from(goals).where(owned(goals)),
      );
    case "tracker":
      return pick(
        deps.db
          .select({ v: trackers.name })
          .from(trackers)
          .where(owned(trackers)),
      );
  }
}

/** The question the owner is asked before a destructive call runs. */
export async function describeDestructive(
  deps: Deps,
  name: string,
  input: unknown,
): Promise<string> {
  const i = (input ?? {}) as Record<string, unknown>;
  if (name === "delete_item") {
    const kind = String(i.kind);
    const title = await titleOf(deps, kind, String(i.id));
    return title ? `Delete ${kind} “${title}”?` : `Delete this ${kind}?`;
  }
  if (name === "undo_batch") {
    const d = { ...deps, actor: "chat" as const };
    let before: number | undefined;
    // History pages newest first; the batch is almost always on the first.
    for (let page = 0; page < 10; page++) {
      const h = await runAction(d, listHistory, { before, limit: 100 });
      const hit = h.batches.find((b) => b.batchId === i.batchId);
      if (hit) return `Undo “${hit.summary}”?`;
      if (h.nextBefore === null) break;
      before = h.nextBefore;
    }
    return "Undo this change?";
  }
  return `Run ${name}?`;
}
