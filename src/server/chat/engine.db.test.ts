import Anthropic from "@anthropic-ai/sdk";
import * as Sentry from "@sentry/nextjs";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, expectTypeOf, it, vi } from "vitest";
import { achievements } from "@/server/db/schema";
import type { Db } from "@/server/db/types";
import { createAchievement } from "@/server/domain/achievements";
import { createArea } from "@/server/domain/areas";
import { CONTEXT_MARKER } from "@/lib/chat-context";
import { appendMessages, getConversation } from "@/server/domain/conversations";
import { updateProfile } from "@/server/domain/profile";
import { messageFor } from "@/server/messages";
import { createTestDb } from "@/test/db";
import { createOwner, FIXED_NOW, type Run, runner } from "@/test/factories";
import { type ChatClient, runTurn, type TurnInput } from "./engine";
import type { ChatEvent } from "./events";
import type { Resolved, Tier } from "./models";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

let db: Db;
let close: () => Promise<void>;
let owner: string;
let run: Run;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  owner = await createOwner(db, { timeZone: "Europe/London" });
  run = runner(db, owner);
  vi.mocked(Sentry.captureException).mockClear();
});
afterEach(() => close());

const MODELS: Record<Tier, Resolved> = {
  quick: { id: "claude-haiku-5-5", name: "Claude Haiku 5.5" },
  smart: { id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5" },
  deep: { id: "claude-opus-5-5", name: "Claude Opus 5.5" },
};

type Block = Record<string, unknown> & { type: string };
type Reply = {
  content: Block[];
  stop_reason: string;
  model?: string;
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- request bodies are plain JSON
type Body = Record<string, any>;

const text = (t: string): Block => ({ type: "text", text: t, citations: null });
const toolUse = (id: string, name: string, input: unknown): Block => ({
  type: "tool_use",
  id,
  name,
  input,
});
const say = (t: string): Reply => ({
  content: [text(t)],
  stop_reason: "end_turn",
});
const calls = (...blocks: Block[]): Reply => ({
  content: blocks,
  stop_reason: "tool_use",
});

/** A ChatClient that answers from a script and records each request body. */
function fake(script: (Reply | Error)[]) {
  const requests: Body[] = [];
  const client: ChatClient = {
    beta: {
      messages: {
        stream(body) {
          requests.push(JSON.parse(JSON.stringify(body)) as Body);
          const next = script.shift();
          const listeners: ((delta: string) => void)[] = [];
          return {
            on(_event: "text", listener: (delta: string) => void) {
              listeners.push(listener);
              return this;
            },
            async finalMessage() {
              if (!next) throw new Error("script ran out");
              if (next instanceof Error) throw next;
              for (const b of next.content)
                if (b.type === "text")
                  for (const l of listeners) l(b.text as string);
              return {
                id: `msg_${requests.length}`,
                type: "message",
                role: "assistant",
                model: next.model ?? (body.model as string),
                content: next.content,
                stop_reason: next.stop_reason,
                stop_sequence: null,
                stop_details: null,
                usage: { input_tokens: 10, output_tokens: 5 },
              } as unknown as Anthropic.Beta.Messages.BetaMessage;
            },
          };
        },
      },
    },
  };
  return { client, requests, script };
}

async function turn(
  client: ChatClient,
  input: TurnInput,
  opts: { now?: Date; models?: Record<Tier, Resolved> } = {},
): Promise<ChatEvent[]> {
  const events: ChatEvent[] = [];
  await runTurn(
    {
      db,
      ownerId: owner,
      client,
      now: () => opts.now ?? FIXED_NOW,
      models: opts.models ?? MODELS,
    },
    input,
    (e) => events.push(e),
  );
  return events;
}

const stored = async (id: string) =>
  (await run(getConversation, { id })).messages;
const conversationOf = (events: ChatEvent[]) => {
  const e = events.find((x) => x.type === "conversation");
  if (!e || e.type !== "conversation") throw new Error("no conversation event");
  return e.id;
};
const last = <T>(xs: T[]) => xs[xs.length - 1]!;
const badRequest = () =>
  new Anthropic.BadRequestError(
    400,
    { type: "error", error: { type: "invalid_request_error", message: "bad" } },
    "bad",
    new Headers(),
  );

it("lets the SDK client stand in for ChatClient", () => {
  expectTypeOf<Anthropic>().toExtend<ChatClient>();
});

it("starts a conversation from the first message", async () => {
  await run(updateProfile, { section: "focus", text: "Learning guitar" });
  const f = fake([say("Hello!")]);
  const events = await turn(f.client, { text: "  Plan my week please  " });

  expect(events[0]).toEqual({
    type: "conversation",
    id: expect.any(String),
    title: "Plan my week please",
    model: "claude-haiku-5-5",
  });
  expect(events).toContainEqual({ type: "text", delta: "Hello!" });
  expect(last(events)).toEqual({
    type: "done",
    model: "claude-haiku-5-5",
    changed: false,
  });

  expect(f.requests).toHaveLength(1);
  const [msg] = f.requests[0]!.messages;
  expect(f.requests[0]!.messages).toHaveLength(1);
  expect(msg.role).toBe("user");
  expect(msg.content[0].type).toBe("text");
  expect(msg.content[0].text).toContain("Current focus");
  expect(msg.content[0].text).toContain("Learning guitar");
  expect(msg.content[0].text).toContain("2026-03-10");
  expect(msg.content[0].text).toContain("Tuesday");
  expect(msg.content[0].text).toContain("Europe/London");
  expect(msg.content[1]).toEqual({
    type: "text",
    text: "  Plan my week please  ",
  });

  const rows = await stored(conversationOf(events));
  expect(rows.map((r) => r.role)).toEqual(["user", "assistant"]);
  expect(rows[1]!.content).toEqual([text("Hello!")]);
  expect(rows[1]!.model).toBe("claude-haiku-5-5");
  expect(rows[1]!.usage).toEqual({ input_tokens: 10, output_tokens: 5 });
});

it("runs a tool and sends its result back", async () => {
  const f = fake([
    calls(toolUse("tu_1", "create_area", { name: "Guitar" })),
    say("Added it."),
  ]);
  const events = await turn(f.client, { text: "Add a Guitar area" });

  const tool = events.find((e) => e.type === "tool");
  expect(tool).toEqual({
    type: "tool",
    id: "tu_1",
    name: "create_area",
    summary: "Added area “Guitar”",
    batchId: expect.any(String),
    error: false,
  });
  expect(f.requests).toHaveLength(2);
  const sent = last(f.requests[1]!.messages as Body[]);
  expect(sent.role).toBe("user");
  expect(sent.content).toHaveLength(1);
  expect(sent.content[0]).toMatchObject({
    type: "tool_result",
    tool_use_id: "tu_1",
  });
  expect(last(events)).toEqual({
    type: "done",
    model: "claude-haiku-5-5",
    changed: true,
  });
  const rows = await stored(conversationOf(events));
  expect(rows[2]!.meta?.tools?.tu_1).toEqual({
    summary: "Added area “Guitar”",
    batchId: (tool as { batchId: string }).batchId,
    error: false,
  });
});

async function pendingDelete() {
  const area = await run(createArea, { name: "Guitar" });
  const ach = await run(createAchievement, {
    areaId: area.id,
    title: "Learn barre chords",
  });
  const f = fake([
    calls(toolUse("tu_1", "delete_item", { kind: "achievement", id: ach.id })),
  ]);
  const events = await turn(f.client, { text: "Delete barre chords" });
  return { f, events, ach, id: conversationOf(events) };
}

const alive = async (id: string) => {
  const [row] = await db
    .select({ deletedAt: achievements.deletedAt })
    .from(achievements)
    .where(eq(achievements.id, id));
  return row!.deletedAt === null;
};

it("asks before a destructive call and deletes on approval", async () => {
  const { events, ach, id } = await pendingDelete();
  expect(events).toContainEqual({
    type: "confirm",
    toolUseId: "tu_1",
    name: "delete_item",
    prompt: "Delete achievement “Learn barre chords”?",
  });
  expect(events.some((e) => e.type === "error")).toBe(false);
  expect(await alive(ach.id)).toBe(true);
  expect((await stored(id)).map((r) => r.role)).toEqual(["user", "assistant"]);

  const f = fake([say("Deleted.")]);
  const after = await turn(f.client, {
    conversationId: id,
    confirm: { toolUseId: "tu_1", approve: true },
  });
  expect(await alive(ach.id)).toBe(false);
  expect(after).toContainEqual(
    expect.objectContaining({ type: "tool", id: "tu_1", error: false }),
  );
  expect(last(after)).toMatchObject({ type: "done", changed: true });
  const sent = last(f.requests[0]!.messages as Body[]);
  expect(sent.role).toBe("user");
  expect(sent.content).toHaveLength(1);
  expect(sent.content[0]).toMatchObject({
    type: "tool_result",
    tool_use_id: "tu_1",
  });
  expect(sent.content[0].is_error).toBeFalsy();
});

it("tells Claude when the owner declines", async () => {
  const { ach, id } = await pendingDelete();
  const f = fake([say("Okay, kept it.")]);
  const after = await turn(f.client, {
    conversationId: id,
    confirm: { toolUseId: "tu_1", approve: false },
  });
  expect(await alive(ach.id)).toBe(true);
  expect(last(f.requests[0]!.messages as Body[]).content).toEqual([
    {
      type: "tool_result",
      tool_use_id: "tu_1",
      content: "The owner declined.",
    },
  ]);
  expect(last(after)).toMatchObject({ type: "done", changed: false });
});

it("refuses a confirmation for a call that isn't pending", async () => {
  const { id } = await pendingDelete();
  const f = fake([say("x")]);
  const after = await turn(f.client, {
    conversationId: id,
    confirm: { toolUseId: "tu_nope", approve: true },
  });
  expect(f.requests).toHaveLength(0);
  expect(last(after)).toMatchObject({ type: "error", retryable: false });
});

it("runs the safe calls and holds the destructive one in a mixed batch", async () => {
  const area = await run(createArea, { name: "Guitar" });
  const f = fake([
    calls(
      toolUse("tu_1", "create_area", { name: "Piano" }),
      toolUse("tu_2", "delete_item", { kind: "area", id: area.id }),
    ),
  ]);
  const events = await turn(f.client, { text: "Swap Guitar for Piano" });
  const id = conversationOf(events);
  expect(events).toContainEqual(
    expect.objectContaining({ type: "tool", id: "tu_1" }),
  );
  expect(events).toContainEqual(
    expect.objectContaining({ type: "confirm", toolUseId: "tu_2" }),
  );
  expect(last(events)).toMatchObject({ type: "done", changed: true });

  const g = fake([say("Done.")]);
  await turn(g.client, {
    conversationId: id,
    confirm: { toolUseId: "tu_2", approve: true },
  });
  const msgs = g.requests[0]!.messages as Body[];
  expect(msgs.map((m) => m.role)).toEqual([
    "user",
    "assistant",
    "user",
    "user",
  ]);
  expect(msgs[2]!.content[0].tool_use_id).toBe("tu_1");
  expect(msgs[3]!.content[0].tool_use_id).toBe("tu_2");
});

it("declines a pending call when the owner sends text instead", async () => {
  const { ach, id } = await pendingDelete();
  const f = fake([say("Sure.")]);
  await turn(f.client, { conversationId: id, text: "Never mind, keep it" });
  expect(await alive(ach.id)).toBe(true);
  const sent = last(f.requests[0]!.messages as Body[]);
  expect(sent.role).toBe("user");
  expect(sent.content).toEqual([
    {
      type: "tool_result",
      tool_use_id: "tu_1",
      content: "The owner declined.",
    },
    { type: "text", text: "Never mind, keep it" },
  ]);
});

it("sends the stored history unchanged after a model switch", async () => {
  const thinking = { type: "thinking", thinking: "Hmm.", signature: "sig_1" };
  const f = fake([
    { content: [thinking, text("Hi")], stop_reason: "end_turn" },
    say("Deeper answer"),
  ]);
  const first = await turn(f.client, { text: "Hello" });
  const id = conversationOf(first);
  const second = await turn(f.client, {
    conversationId: id,
    tier: "smart",
    text: "Go deeper",
  });
  expect(f.requests[1]!.model).toBe("claude-sonnet-5-5");
  const rows = await stored(id);
  const history = rows.slice(0, 3).map((r) => ({
    role: r.role,
    content: r.content,
  }));
  expect(f.requests[1]!.messages).toEqual(history);
  expect(f.requests[1]!.messages[1].content[0]).toEqual(thinking);
  expect(last(second)).toMatchObject({ model: "claude-sonnet-5-5" });
  expect(rows[3]!.model).toBe("claude-sonnet-5-5");
  const { conversation } = await run(getConversation, { id });
  expect(conversation.model).toBe("claude-sonnet-5-5");
});

it("keeps everything stored when the API fails, and retries without duplicates", async () => {
  const f = fake([
    calls(toolUse("tu_1", "create_area", { name: "Guitar" })),
    new Error("socket hang up"),
  ]);
  const events = await turn(f.client, { text: "Add a Guitar area" });
  const id = conversationOf(events);
  expect(last(events)).toEqual({
    type: "error",
    message: "Claude couldn't answer. Try again.",
    retryable: true,
  });
  expect((await stored(id)).map((r) => r.role)).toEqual([
    "user",
    "assistant",
    "user",
  ]);

  const g = fake([say("Added it.")]);
  const again = await turn(g.client, { conversationId: id, retry: true });
  expect(g.requests).toHaveLength(1);
  expect(g.requests[0]!.messages).toEqual(f.requests[1]!.messages);
  expect(last(again)).toMatchObject({ type: "done" });
  expect((await stored(id)).map((r) => r.role)).toEqual([
    "user",
    "assistant",
    "user",
    "assistant",
  ]);
});

it("won't retry when the history doesn't end with the owner", async () => {
  const f = fake([say("Hi")]);
  const id = conversationOf(await turn(f.client, { text: "Hello" }));
  const after = await turn(f.client, { conversationId: id, retry: true });
  expect(f.requests).toHaveLength(1);
  expect(last(after)).toMatchObject({ type: "error", retryable: false });
});

it("stops tools after ten round-trips", async () => {
  const script: Reply[] = [];
  for (let i = 1; i <= 10; i++)
    script.push(calls(toolUse(`tu_${i}`, "get_overview", {})));
  script.push(say("Here is what I did."));
  script.push(calls(toolUse("tu_extra", "get_overview", {})));
  const f = fake(script);
  const events = await turn(f.client, { text: "Look around" });

  expect(f.requests).toHaveLength(11);
  for (const r of f.requests) expect(r.tools).toBeDefined();
  for (const r of f.requests.slice(0, 10))
    expect(r).not.toHaveProperty("tool_choice");
  // Tools stay defined (history holds tool blocks); Claude just can't call one.
  expect(f.requests[10]!.tool_choice).toEqual({ type: "none" });
  for (const r of f.requests)
    expect(["any", "tool"]).not.toContain(r.tool_choice?.type);
  const sent = last(f.requests[10]!.messages as Body[]);
  expect(sent.role).toBe("user");
  expect(sent.content[0]).toMatchObject({ tool_use_id: "tu_10" });
  expect(last(sent.content as Block[])).toEqual({
    type: "text",
    text: "Stop using tools now and summarise what you did.",
  });
  expect(last(events)).toMatchObject({ type: "done" });
});

it("sends the right settings for each tier", async () => {
  const f = fake([say("a"), say("b")]);
  await turn(f.client, { text: "Hi", tier: "smart" });
  await turn(f.client, { text: "Hi", tier: "quick" });
  const [smart, quick] = f.requests as [Body, Body];

  expect(smart.model).toBe("claude-sonnet-5-5");
  expect(smart.fallbacks).toBe("default");
  expect(smart.betas).toEqual([
    "compact-2026-01-12",
    "server-side-fallback-2026-07-01",
  ]);
  expect(smart.output_config).toEqual({ effort: "medium" });

  expect(quick.model).toBe("claude-haiku-5-5");
  expect(quick).not.toHaveProperty("fallbacks");
  expect(quick.betas).toEqual(["compact-2026-01-12"]);
  expect(quick.output_config).toEqual({ effort: "low" });

  for (const r of f.requests) {
    expect(r.max_tokens).toBe(8000);
    expect(r.context_management).toEqual({
      edits: [{ type: "compact_20260112" }],
    });
    expect(r.system[0].cache_control).toEqual({ type: "ephemeral" });
    // Automatic caching: the breakpoint moves with the history.
    expect(r.cache_control).toEqual({ type: "ephemeral" });
    expect(last(r.tools as Block[]).cache_control).toEqual({
      type: "ephemeral",
    });
    for (const key of [
      "thinking",
      "temperature",
      "top_p",
      "top_k",
      "tool_choice",
    ])
      expect(r).not.toHaveProperty(key);
  }
});

it("retries a 400 once on the tier's fallback model", async () => {
  const models = {
    ...MODELS,
    smart: { id: "claude-sonnet-6", name: "Sonnet 6" },
  };
  const f = fake([badRequest(), say("Fine.")]);
  const events = await turn(
    f.client,
    { text: "Hi", tier: "smart" },
    { models },
  );
  expect(f.requests.map((r) => r.model)).toEqual([
    "claude-sonnet-6",
    "claude-sonnet-5-5",
  ]);
  expect(f.requests[1]!.messages).toEqual(f.requests[0]!.messages);
  expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  expect(last(events)).toEqual({
    type: "done",
    model: "claude-sonnet-5-5",
    changed: false,
  });
});

it("doesn't retry a 400 from the fallback model itself", async () => {
  const f = fake([badRequest(), say("unused")]);
  const events = await turn(f.client, { text: "Hi", tier: "smart" });
  expect(f.requests).toHaveLength(1);
  expect(last(events)).toEqual({
    type: "error",
    message: "Claude couldn't answer. Try again.",
    retryable: true,
  });
});

it("reports a refusal without storing an empty reply", async () => {
  const f = fake([{ content: [], stop_reason: "refusal" }, say("Hello.")]);
  const events = await turn(f.client, { text: "Hi" });
  expect(last(events)).toEqual({
    type: "error",
    message: "Claude declined to answer this one.",
    retryable: false,
  });
  const id = conversationOf(events);
  expect((await stored(id)).map((r) => r.role)).toEqual(["user"]);

  await turn(f.client, { conversationId: id, text: "Something else" });
  const msgs = f.requests[1]!.messages as Body[];
  expect(msgs.map((m) => m.role)).toEqual(["user", "user"]);
  for (const m of msgs) expect(m.content).not.toEqual([]);
});

it("stores a refusal that has text", async () => {
  const f = fake([
    { content: [text("I can't help with that.")], stop_reason: "refusal" },
  ]);
  const events = await turn(f.client, { text: "Hi" });
  expect((await stored(conversationOf(events))).map((r) => r.role)).toEqual([
    "user",
    "assistant",
  ]);
});

const later = (h: number) => new Date(FIXED_NOW.getTime() + h * 3600e3);
const isContext = (b: Block) =>
  b.type === "text" && String(b.text).startsWith(CONTEXT_MARKER);
/** No stored system row may sit right before a user message: the API refuses it. */
const noSystemBeforeUser = (msgs: Body[]) =>
  msgs.every((m, i) => !(m.role === "system" && msgs[i + 1]?.role === "user"));

it("puts the new profile in the owner's next message once it changes", async () => {
  const f = fake([say("a"), say("b"), say("c")]);
  const id = conversationOf(
    await turn(f.client, { text: "Hello" }, { now: FIXED_NOW }),
  );

  await turn(
    f.client,
    { conversationId: id, text: "Again" },
    { now: later(1) },
  );
  // Same day, same profile: no context again.
  expect(last(f.requests[1]!.messages as Body[]).content).toEqual([
    { type: "text", text: "Again" },
  ]);

  await runner(db, owner, { now: later(2) })(updateProfile, {
    section: "focus",
    text: "Marathon training",
  });
  await turn(
    f.client,
    { conversationId: id, text: "And now?" },
    { now: later(3) },
  );
  const msgs = f.requests[2]!.messages as Body[];
  expect(msgs.some((m) => m.role === "system")).toBe(false);
  const sent = last(msgs);
  expect(sent.role).toBe("user");
  expect(isContext(sent.content[0])).toBe(true);
  expect(sent.content[0].text).toContain("Marathon training");
  expect(sent.content[1]).toEqual({ type: "text", text: "And now?" });
  expect((await stored(id)).some((r) => r.role === "system")).toBe(false);
});

it("still works after a failed turn that refreshed the context", async () => {
  const f = fake([say("a"), new Error("socket hang up"), say("c")]);
  const id = conversationOf(await turn(f.client, { text: "Hello" }));
  await runner(db, owner, { now: later(1) })(updateProfile, {
    section: "focus",
    text: "Marathon training",
  });
  const failed = await turn(
    f.client,
    { conversationId: id, text: "And now?" },
    { now: later(2) },
  );
  expect(last(failed)).toMatchObject({ type: "error", retryable: true });

  await turn(
    f.client,
    { conversationId: id, text: "Hello again?" },
    { now: later(3) },
  );
  const msgs = f.requests[2]!.messages as Body[];
  expect(noSystemBeforeUser(msgs)).toBe(true);
  expect(msgs.map((m) => m.role)).toEqual([
    "user",
    "assistant",
    "user",
    "user",
  ]);
  const refreshed = msgs[2]!.content as Block[];
  expect(isContext(refreshed[0]!)).toBe(true);
  expect(refreshed[0]!.text).toContain("Marathon training");
  // The profile hasn't changed again since: no second copy.
  expect((msgs[3]!.content as Block[]).some(isContext)).toBe(false);
});

it("drops a stored system row the owner's next message follows", async () => {
  const f = fake([say("a"), say("b")]);
  const id = conversationOf(await turn(f.client, { text: "Hello" }));
  // Stored by an older version: a profile refresh whose turn then failed.
  await run(appendMessages, {
    conversationId: id,
    messages: [
      { role: "user", content: [{ type: "text", text: "And now?" }] },
      { role: "system", content: "The owner's profile changed." },
    ],
  });
  await turn(f.client, { conversationId: id, text: "Hello?" });
  const msgs = f.requests[1]!.messages as Body[];
  expect(noSystemBeforeUser(msgs)).toBe(true);
  expect(msgs.map((m) => m.role)).toEqual([
    "user",
    "assistant",
    "user",
    "user",
  ]);
  // The dropped row's refresh comes again with the new message.
  expect(isContext(last(msgs).content[0])).toBe(true);
  expect((await stored(id)).map((r) => r.role)).toContain("system");
});

it("tells a resumed conversation today's date", async () => {
  const f = fake([say("a"), say("b"), say("c")]);
  const id = conversationOf(
    await turn(f.client, { text: "Hello" }, { now: FIXED_NOW }),
  );
  await turn(
    f.client,
    { conversationId: id, text: "Morning" },
    { now: later(24) },
  );
  const sent = last(f.requests[1]!.messages as Body[]);
  expect(isContext(sent.content[0])).toBe(true);
  expect(sent.content[0].text).toContain("Wednesday, 2026-03-11");
  expect(sent.content[1]).toEqual({ type: "text", text: "Morning" });

  await turn(
    f.client,
    { conversationId: id, text: "Later" },
    { now: later(26) },
  );
  expect(last(f.requests[2]!.messages as Body[]).content).toEqual([
    { type: "text", text: "Later" },
  ]);
});

it("puts the context after the results that close pending calls", async () => {
  const { id } = await pendingDelete();
  const f = fake([say("Sure.")]);
  await turn(
    f.client,
    { conversationId: id, text: "Never mind" },
    { now: later(24) },
  );
  const sent = last(f.requests[0]!.messages as Body[]).content as Block[];
  expect(sent.map((b) => b.type)).toEqual(["tool_result", "text", "text"]);
  expect(isContext(sent[1]!)).toBe(true);
  expect(sent[2]).toEqual({ type: "text", text: "Never mind" });
});

it("answers a malformed destructive call with an error instead of asking", async () => {
  const f = fake([
    calls(
      toolUse("tu_1", "delete_item", {
        kind: "achievement",
        id: "Learn barre chords",
      }),
    ),
    say("Let me look it up first."),
  ]);
  const events = await turn(f.client, { text: "Delete barre chords" });
  expect(events.some((e) => e.type === "confirm")).toBe(false);
  expect(events).toContainEqual(
    expect.objectContaining({ type: "tool", id: "tu_1", error: true }),
  );
  expect(f.requests).toHaveLength(2);
  const sent = last(f.requests[1]!.messages as Body[]);
  expect(sent.content).toEqual([
    {
      type: "tool_result",
      tool_use_id: "tu_1",
      content: messageFor("invalid_input"),
      is_error: true,
    },
  ]);
  expect(last(events)).toMatchObject({ type: "done" });
});

it("tells the client the message is saved before asking Claude", async () => {
  const events: ChatEvent[] = [];
  const seen: ChatEvent[][] = [];
  const f = fake([say("Hi"), say("Again")]);
  const client: ChatClient = {
    beta: {
      messages: {
        stream(body) {
          seen.push([...events]);
          return f.client.beta.messages.stream(body);
        },
      },
    },
  };
  const go = (input: TurnInput) =>
    runTurn(
      { db, ownerId: owner, client, now: () => FIXED_NOW, models: MODELS },
      input,
      (e) => events.push(e),
    );
  await go({ text: "Hello" });
  expect(seen[0]!.map((e) => e.type)).toEqual(["conversation", "saved"]);
  const id = conversationOf(events);
  events.length = 0;
  await go({ conversationId: id, text: "More" });
  expect(seen[1]!.map((e) => e.type)).toEqual(["saved"]);
});

it("says the answer to a confirm is saved", async () => {
  const { id } = await pendingDelete();
  const after = await turn(fake([say("Kept.")]).client, {
    conversationId: id,
    confirm: { toolUseId: "tu_1", approve: false },
  });
  expect(after[0]).toEqual({ type: "saved" });
});
