import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import * as Sentry from "@sentry/nextjs";
import { localDate } from "@/lib/dates";
import type { ChatMeta } from "@/server/db/schema";
import type { Db } from "@/server/db/types";
import { type ActionDeps, runAction } from "@/server/domain/context";
import {
  appendMessages,
  type ChatMessage,
  createConversation,
  getConversation,
  type NewChatMessage,
  setConversationModel,
} from "@/server/domain/conversations";
import { DomainError } from "@/server/domain/errors";
import { getProfile } from "@/server/domain/profile";
import { getSettings } from "@/server/domain/settings";
import { messageFor } from "@/server/messages";
import type { ChatEvent } from "./events";
import { fallbackFor, type Resolved, type Tier, TIERS, tierOf } from "./models";
import { contextBlock, systemPrompt } from "./prompt";
import {
  chatToolDefs,
  describeDestructive,
  isDestructive,
  rejectInvalid,
  runChatTool,
} from "./tools";

type BetaMessage = Anthropic.Beta.Messages.BetaMessage;
type ChatRequest = Parameters<Anthropic["beta"]["messages"]["stream"]>[0];

/** The slice of the SDK the engine calls, so tests can pass a fake. */
export type ChatClient = {
  beta: {
    messages: {
      stream(body: ChatRequest): {
        on(event: "text", listener: (delta: string) => void): unknown;
        finalMessage(): Promise<BetaMessage>;
      };
    };
  };
};

export type TurnInput = {
  conversationId?: string;
  tier?: Tier;
  text?: string;
  confirm?: { toolUseId: string; approve: boolean };
  retry?: boolean;
};

export type TurnDeps = {
  db: Db;
  ownerId: string;
  client: ChatClient;
  now: () => Date;
  models: Record<Tier, Resolved>;
};

const MAX_TOOL_REQUESTS = 10;
const MAX_TOKENS = 8000;
const TITLE_CHARS = 60;
const DECLINED = "The owner declined.";
const INTERRUPTED = "This call was interrupted before it ran.";
export const STOP_TOOLS = "Stop using tools now and summarise what you did.";
const API_FAILED = "Claude couldn't answer. Try again.";
const REFUSED = "Claude declined to answer this one.";

type Block = { type: string; [key: string]: unknown };
type ToolUse = { type: "tool_use"; id: string; name: string; input: unknown };
type ToolMeta = NonNullable<ChatMeta["tools"]>;

type Turn = {
  deps: TurnDeps;
  action: ActionDeps;
  emit: (e: ChatEvent) => void;
  conversationId: string;
  tier: Tier;
  model: string;
  history: ChatMessage[];
  changed: boolean;
};

class TurnError extends Error {}

const blocksOf = (m: ChatMessage): Block[] =>
  Array.isArray(m.content) ? (m.content as Block[]) : [];

/** Tool calls in the last assistant message that no later user message answers. */
export function unanswered(history: ChatMessage[]): ToolUse[] {
  const at = history.findLastIndex((m) => m.role === "assistant");
  if (at < 0) return [];
  const answered = new Set(
    history
      .slice(at + 1)
      .filter((m) => m.role === "user")
      .flatMap((m) => blocksOf(m))
      .filter((b) => b.type === "tool_result")
      .map((b) => b.tool_use_id),
  );
  return blocksOf(history[at]!).filter(
    (b): b is ToolUse => b.type === "tool_use" && !answered.has(b.id),
  );
}

const declined = (id: string): Block => ({
  type: "tool_result",
  tool_use_id: id,
  content: DECLINED,
});

/** Results for calls that will never run: declined if destructive, else interrupted. */
function closeOut(calls: ToolUse[], tools: ToolMeta): Block[] {
  return calls.map((c) => {
    if (isDestructive(c.name)) {
      tools[c.id] = { summary: "Cancelled", batchId: null };
      return declined(c.id);
    }
    tools[c.id] = { summary: "Interrupted", batchId: null, error: true };
    return {
      type: "tool_result",
      tool_use_id: c.id,
      content: INTERRUPTED,
      is_error: true,
    };
  });
}

async function append(t: Turn, messages: NewChatMessage[]): Promise<void> {
  const rows = await runAction(t.action, appendMessages, {
    conversationId: t.conversationId,
    messages,
  });
  t.history.push(...rows);
}

const metaOf = (tools: ToolMeta): ChatMeta | null =>
  Object.keys(tools).length > 0 ? { tools } : null;

/**
 * Rule 2: the owner's new message, persisted before any request. The app's
 * context (date, settings, profile) leads the first message, and comes again
 * in a later one when the owner's day has turned or the profile changed since
 * the last message. It rides in the user message, after any results that
 * close pending calls (those must come first), never as a separate system
 * message: one left behind by a failed turn would sit before the owner's next
 * message, which the API refuses.
 */
async function addUserText(t: Turn, text: string): Promise<void> {
  const tools: ToolMeta = {};
  const content = closeOut(unanswered(t.history), tools);
  const profile = await runAction(t.action, getProfile, {});
  const settings = await runAction(t.action, getSettings, {});
  const now = t.deps.now();
  const last = t.history.at(-1);
  const refresh =
    last === undefined ||
    // An older stored refresh this message would orphan (see `orphaned`).
    last.role === "system" ||
    (profile.updatedAt !== null && last.createdAt < profile.updatedAt) ||
    localDate(last.createdAt, settings.timeZone) !==
      localDate(now, settings.timeZone);
  if (refresh)
    content.push({ type: "text", text: contextBlock(profile, settings, now) });
  content.push({ type: "text", text });
  await append(t, [{ role: "user", content, meta: metaOf(tools) }]);
}

/** Records a tool call's outcome and tells the panel; returns its result block. */
function record(
  t: Turn,
  call: ToolUse,
  tools: ToolMeta,
  out: Awaited<ReturnType<typeof runChatTool>>,
): Block {
  const error = out.result.is_error === true;
  tools[call.id] = { summary: out.summary, batchId: out.batchId, error };
  if (out.batchId) t.changed = true;
  t.emit({
    type: "tool",
    id: call.id,
    name: call.name,
    summary: out.summary,
    batchId: out.batchId,
    error,
  });
  return out.result as unknown as Block;
}

async function runTool(t: Turn, call: ToolUse, tools: ToolMeta) {
  const out = await runChatTool(
    { db: t.deps.db, ownerId: t.deps.ownerId },
    call,
  );
  return record(t, call, tools, out);
}

async function askConfirm(t: Turn, call: ToolUse): Promise<void> {
  const prompt = await describeDestructive(
    { db: t.deps.db, ownerId: t.deps.ownerId },
    call.name,
    call.input,
  );
  t.emit({ type: "confirm", toolUseId: call.id, name: call.name, prompt });
}

/** Rule 3. Returns true when the turn ends here (another call awaits the owner). */
async function answerConfirm(
  t: Turn,
  confirm: NonNullable<TurnInput["confirm"]>,
): Promise<boolean> {
  const pending = unanswered(t.history);
  const call = pending.find(
    (c) => c.id === confirm.toolUseId && isDestructive(c.name),
  );
  if (!call) throw new TurnError("That request is no longer waiting.");
  const tools: ToolMeta = {};
  let result: Block;
  if (confirm.approve) {
    result = await runTool(t, call, tools);
  } else {
    tools[call.id] = { summary: "Cancelled", batchId: null };
    result = declined(call.id);
  }
  const rest = pending.filter((c) => c !== call);
  const next = rest.find((c) => isDestructive(c.name));
  // Calls that would have run already have results; any left were cut off.
  const cutOff = rest.filter((c) => !isDestructive(c.name));
  await append(t, [
    {
      role: "user",
      content: [result, ...closeOut(cutOff, tools)],
      meta: metaOf(tools),
    },
  ]);
  t.emit({ type: "saved" });
  if (next) {
    await askConfirm(t, next);
    return true;
  }
  return false;
}

/**
 * Older versions stored a profile refresh as a system row after the owner's
 * message. When that turn failed, the owner's next message followed it, and
 * the API refuses a system message right before a user one. Such a row is left
 * out of the request (it stays stored); the message after it carries the
 * context again (see `addUserText`).
 */
const orphaned = (history: ChatMessage[], i: number) =>
  history[i]!.role === "system" && history[i + 1]?.role === "user";

function requestBody(t: Turn, model: string, withTools: boolean): ChatRequest {
  const fallback = t.tier !== "quick";
  return {
    model,
    max_tokens: MAX_TOKENS,
    system: systemPrompt(),
    // History holds tool blocks, so tools stay defined even when Claude may
    // no longer call them.
    tools: chatToolDefs(),
    ...(withTools ? {} : { tool_choice: { type: "none" as const } }),
    // Sent exactly as stored: thinking and compaction blocks included.
    messages: t.history
      .filter((_, i) => !orphaned(t.history, i))
      .map(
        (m) =>
          ({
            role: m.role,
            content: m.content,
          }) as ChatRequest["messages"][number],
      ),
    // Automatic caching: a breakpoint on the last block, so each request
    // reads the history the previous one wrote.
    cache_control: { type: "ephemeral" },
    output_config: { effort: TIERS[t.tier].effort },
    context_management: { edits: [{ type: "compact_20260112" }] },
    betas: [
      "compact-2026-01-12",
      ...(fallback ? ["server-side-fallback-2026-07-01"] : []),
    ],
    ...(fallback ? { fallbacks: "default" as const } : {}),
  };
}

/** Rule 6: one request, retried once on the tier's fallback after a 400. */
async function request(
  t: Turn,
  withTools: boolean,
): Promise<BetaMessage | null> {
  for (;;) {
    try {
      const stream = t.deps.client.beta.messages.stream(
        requestBody(t, t.model, withTools),
      );
      stream.on("text", (delta) => t.emit({ type: "text", delta }));
      return await stream.finalMessage();
    } catch (e) {
      const fallback = fallbackFor(t.tier);
      if (e instanceof Anthropic.BadRequestError && t.model !== fallback) {
        Sentry.captureException(e, {
          tags: { surface: "chat" },
          extra: { model: t.model, fallback },
        });
        t.model = fallback;
        continue;
      }
      console.error("chat request failed", t.model, e);
      if (
        !(e instanceof Anthropic.APIError) ||
        e instanceof Anthropic.BadRequestError
      )
        Sentry.captureException(e, {
          tags: { surface: "chat" },
          extra: { model: t.model },
        });
      t.emit({ type: "error", message: API_FAILED, retryable: true });
      return null;
    }
  }
}

/** Rule 5: request, store, run tools, repeat. */
async function loop(t: Turn): Promise<void> {
  let withTools = true;
  for (let n = 1; ; n++) {
    const reply = await request(t, withTools);
    if (!reply) return;
    // An empty assistant message mid-history is rejected by the API, so an
    // empty reply (e.g. a refusal before any text) is never stored.
    if (reply.content.length > 0)
      await append(t, [
        {
          role: "assistant",
          content: reply.content as unknown as Block[],
          model: reply.model,
          usage: reply.usage as unknown as Record<string, unknown>,
        },
      ]);
    if (reply.stop_reason === "refusal") {
      t.emit({ type: "error", message: REFUSED, retryable: false });
      return;
    }
    if (reply.stop_reason !== "tool_use" || !withTools) break;
    const calls = reply.content.filter(
      (b): b is Anthropic.Beta.Messages.BetaToolUseBlock =>
        b.type === "tool_use",
    );
    if (calls.length === 0) break;

    const tools: ToolMeta = {};
    const results: Block[] = [];
    // Destructive calls the owner will be asked about; a malformed one is
    // answered with an error now, like any other call's bad input.
    const held: typeof calls = [];
    for (const call of calls) {
      if (!isDestructive(call.name)) {
        results.push(await runTool(t, call, tools));
        continue;
      }
      const invalid = rejectInvalid(call);
      if (invalid) results.push(record(t, call, tools, invalid));
      else held.push(call);
    }
    const destructive = held[0];
    const stop = !destructive && n >= MAX_TOOL_REQUESTS;
    if (stop) results.push({ type: "text", text: STOP_TOOLS });
    if (results.length > 0)
      await append(t, [
        { role: "user", content: results, meta: metaOf(tools) },
      ]);
    if (destructive) {
      await askConfirm(t, destructive);
      break;
    }
    if (stop) withTools = false;
  }
  t.emit({ type: "done", model: t.model, changed: t.changed });
}

const titleFrom = (text: string) =>
  text.replace(/\s+/g, " ").trim().slice(0, TITLE_CHARS).trim();

async function start(
  deps: TurnDeps,
  input: TurnInput,
  emit: (e: ChatEvent) => void,
): Promise<Turn> {
  const action: ActionDeps = {
    db: deps.db,
    ownerId: deps.ownerId,
    actor: "chat",
    now: deps.now,
  };
  const turn = (
    conversationId: string,
    tier: Tier,
    model: string,
    history: ChatMessage[],
  ): Turn => ({
    deps,
    action,
    emit,
    conversationId,
    tier,
    model,
    history,
    changed: false,
  });

  if (!input.conversationId) {
    if (input.text === undefined) throw new TurnError("Start with a message.");
    const tier = input.tier ?? "quick";
    const c = await runAction(action, createConversation, {
      title: titleFrom(input.text),
      model: deps.models[tier].id,
    });
    emit({ type: "conversation", id: c.id, title: c.title, model: c.model });
    return turn(c.id, tier, c.model, []);
  }

  const { conversation, messages } = await runAction(action, getConversation, {
    id: input.conversationId,
  });
  let model = conversation.model;
  if (input.tier && deps.models[input.tier].id !== model) {
    model = deps.models[input.tier].id;
    await runAction(action, setConversationModel, {
      id: conversation.id,
      model,
    });
  }
  const tier = input.tier ?? tierOf(model) ?? "quick";
  return turn(conversation.id, tier, model, messages);
}

/** One turn of the chat: the owner's message (or answer, or retry) through to Claude's reply. */
export async function runTurn(
  deps: TurnDeps,
  input: TurnInput,
  emit: (e: ChatEvent) => void,
): Promise<void> {
  try {
    const kinds = [input.text !== undefined, !!input.confirm, !!input.retry];
    if (kinds.filter(Boolean).length !== 1)
      throw new TurnError("Send a message, an answer or a retry.");
    if (input.text !== undefined && input.text.trim() === "")
      throw new TurnError("Type a message first.");

    const t = await start(deps, input, emit);
    if (input.text !== undefined) {
      await addUserText(t, input.text);
      emit({ type: "saved" });
    } else if (input.confirm) {
      if (await answerConfirm(t, input.confirm)) {
        t.emit({ type: "done", model: t.model, changed: t.changed });
        return;
      }
    } else {
      // Rule 4: resend what's stored; nothing is added.
      const last = t.history.findLast((m) => m.role !== "system");
      if (last?.role !== "user" || unanswered(t.history).length > 0)
        throw new TurnError("There's nothing to retry.");
    }
    await loop(t);
  } catch (e) {
    if (e instanceof TurnError) {
      emit({ type: "error", message: e.message, retryable: false });
    } else if (e instanceof DomainError) {
      emit({
        type: "error",
        message: messageFor(e.code, e.details),
        retryable: false,
      });
    } else {
      console.error("chat turn failed", e);
      Sentry.captureException(e, { tags: { surface: "chat" } });
      emit({
        type: "error",
        message: "Something went wrong. Try again.",
        retryable: false,
      });
    }
  }
}
