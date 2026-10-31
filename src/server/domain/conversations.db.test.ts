import { afterEach, beforeEach, expect, it } from "vitest";
import type { Db } from "@/server/db/types";
import { CONTEXT_MARKER } from "@/lib/chat-context";
import { createTestDb } from "@/test/db";
import { createOwner, type Run, runner } from "@/test/factories";
import {
  appendMessages,
  createConversation,
  deleteConversation,
  getConversation,
  listConversations,
  searchConversations,
  setConversationModel,
} from "./conversations";
import { DomainError } from "./errors";

let db: Db;
let close: () => Promise<void>;
let run: Run;
let owner: string;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  owner = await createOwner(db);
  run = runner(db, owner);
});
afterEach(() => close());

const text = (role: "user" | "assistant", t: string) => ({
  role,
  content: [{ type: "text", text: t }],
});

it("assigns seqs 1..n in order across appends", async () => {
  const c = await run(createConversation, { title: "Hi", model: "m1" });
  await run(appendMessages, {
    conversationId: c.id,
    messages: [text("user", "a"), text("assistant", "b")],
  });
  const added = await run(appendMessages, {
    conversationId: c.id,
    messages: [text("user", "c")],
  });
  expect(added.map((m) => m.seq)).toEqual([3]);
  const g = await run(getConversation, { id: c.id });
  expect(g.messages.map((m) => m.seq)).toEqual([1, 2, 3]);
});

it("lists newest-appended first and hides deleted", async () => {
  const a = await run(createConversation, { title: "A", model: "m" });
  const b = await run(createConversation, { title: "B", model: "m" });
  await runner(db, owner, { now: new Date("2026-03-11T12:00:00Z") })(
    appendMessages,
    {
      conversationId: a.id,
      messages: [text("user", "x")],
    },
  );
  expect((await run(listConversations, {})).map((c) => c.title)).toEqual([
    "A",
    "B",
  ]);
  await run(deleteConversation, { id: a.id });
  expect((await run(listConversations, {})).map((c) => c.id)).toEqual([b.id]);
});

it("changes the model", async () => {
  const c = await run(createConversation, { title: "A", model: "m1" });
  await run(setConversationModel, { id: c.id, model: "m2" });
  expect((await run(getConversation, { id: c.id })).conversation.model).toBe(
    "m2",
  );
});

it("searches assistant text blocks and returns a snippet; not tool inputs", async () => {
  const c = await run(createConversation, { title: "Guitar", model: "m" });
  await run(appendMessages, {
    conversationId: c.id,
    messages: [
      text("user", "help"),
      {
        role: "assistant",
        content: [
          { type: "tool_use", id: "t1", name: "x", input: { q: "secretword" } },
          { type: "text", text: "Practice barre chords slowly." },
        ],
      },
    ],
  });
  const r = await run(searchConversations, { query: "barre" });
  expect(r).toHaveLength(1);
  expect(r[0]!.snippets[0]).toContain("barre");
  expect(await run(searchConversations, { query: "secretword" })).toEqual([]);
  expect(await run(searchConversations, { query: "guit" })).toHaveLength(1);
});

it("keeps conversations private to their owner", async () => {
  const c = await run(createConversation, { title: "Mine", model: "m" });
  await run(appendMessages, {
    conversationId: c.id,
    messages: [text("assistant", "barre")],
  });
  const other = runner(db, await createOwner(db));
  await expect(other(getConversation, { id: c.id })).rejects.toBeInstanceOf(
    DomainError,
  );
  expect(await other(searchConversations, { query: "barre" })).toEqual([]);
  expect(await other(listConversations, {})).toEqual([]);
});

it("doesn't match the app's hidden context blocks", async () => {
  const c = await run(createConversation, { title: "Chat", model: "m" });
  await run(appendMessages, {
    conversationId: c.id,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `${CONTEXT_MARKER}\nThe owner's profile:\n\n## Current focus\nMarathon training`,
          },
          { type: "text", text: "hello" },
        ],
      },
    ],
  });
  expect(await run(searchConversations, { query: "marathon" })).toEqual([]);
  expect(await run(searchConversations, { query: "hello" })).toHaveLength(1);
});
