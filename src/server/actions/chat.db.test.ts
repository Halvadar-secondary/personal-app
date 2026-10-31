import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Db } from "@/server/db/types";
import { createArea } from "@/server/domain/areas";
import {
  appendMessages,
  createConversation,
} from "@/server/domain/conversations";
import { createTestDb } from "@/test/db";
import { createOwner, type Run, runner } from "@/test/factories";

const state = vi.hoisted(() => ({ db: null as unknown, owner: "" }));

vi.mock("next/cache", () => ({ refresh: () => {} }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/server/auth/require-owner", () => ({
  requireOwner: async () => ({ id: state.owner, email: "o@test.local" }),
}));
vi.mock("@/server/db/client", () => ({ getDb: () => state.db }));
vi.mock("@/server/chat/models", async (orig) => ({
  ...(await orig<typeof import("@/server/chat/models")>()),
  resolveTiers: async () => ({
    quick: { id: "q", name: "Q" },
    smart: { id: "s", name: "S" },
    deep: { id: "d", name: "D" },
  }),
  listModels: () => async () => [],
}));
vi.mock("@anthropic-ai/sdk", () => ({ default: class {} }));

import { chatTiers, listChats, openChat, removeChat } from "./chat";

let db: Db;
let close: () => Promise<void>;
let run: Run;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  state.db = db;
  state.owner = await createOwner(db);
  run = runner(db, state.owner);
});
afterEach(() => close());

it("maps a stored conversation to the panel's items", async () => {
  const area = await run(createArea, { name: "Guitar" });
  const c = await run(createConversation, { title: "Chat", model: "q" });
  const t = (type: string, extra: object) => ({ type, ...extra });
  await run(appendMessages, {
    conversationId: c.id,
    messages: [
      {
        role: "user",
        content: [
          t("text", {
            text: "Context from the app (not typed by the owner):\nToday.",
          }),
          t("text", { text: "rename my area" }),
        ],
      },
      {
        role: "assistant",
        content: [
          t("thinking", { thinking: "hmm", signature: "s" }),
          t("tool_use", { id: "t1", name: "list_areas", input: {} }),
        ],
        model: "q",
      },
      {
        role: "user",
        content: [t("tool_result", { tool_use_id: "t1", content: "ok" })],
        meta: { tools: { t1: { summary: "Listed areas", batchId: null } } },
      },
      {
        role: "system",
        content: "The owner's profile changed. Updated context",
      },
      {
        role: "assistant",
        content: [
          t("text", { text: "Done. Delete it?" }),
          t("tool_use", {
            id: "t2",
            name: "delete_item",
            input: { kind: "area", id: area.id },
          }),
        ],
        model: "q",
      },
    ],
  });
  const opened = await openChat(c.id);
  expect(opened.conversation.id).toBe(c.id);
  expect(opened.items).toEqual([
    { kind: "user", text: "rename my area" },
    { kind: "tool", summary: "Listed areas", batchId: null, error: false },
    { kind: "assistant", text: "Done. Delete it?", model: "q" },
    { kind: "confirm", toolUseId: "t2", prompt: "Delete area “Guitar”?" },
  ]);
});

it("lists, removes and 404s chats", async () => {
  const c = await run(createConversation, { title: "Chat", model: "q" });
  expect((await listChats()).map((x) => x.id)).toEqual([c.id]);
  expect(await removeChat(c.id)).toMatchObject({ ok: true });
  expect(await listChats()).toEqual([]);
  await expect(openChat(c.id)).rejects.toThrow("NEXT_NOT_FOUND");
});

it("offers the three tiers with labels", async () => {
  expect(await chatTiers()).toEqual({
    quick: { id: "q", name: "Q", label: "Quick" },
    smart: { id: "s", name: "S", label: "Smart" },
    deep: { id: "d", name: "D", label: "Deepest" },
  });
});

it("opens a conversation that ends in a malformed delete", async () => {
  const c = await run(createConversation, { title: "Chat", model: "q" });
  await run(appendMessages, {
    conversationId: c.id,
    messages: [
      { role: "user", content: [{ type: "text", text: "delete barre" }] },
      {
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id: "t1",
            name: "delete_item",
            input: { kind: "achievement", id: "Learn barre chords" },
          },
        ],
        model: "q",
      },
    ],
  });
  const opened = await openChat(c.id);
  expect(opened.items.at(-1)).toEqual({
    kind: "confirm",
    toolUseId: "t1",
    prompt: "Delete this achievement?",
  });
  expect(opened.pending).toBe(false);
});

it("flags a conversation whose last message Claude never answered", async () => {
  const c = await run(createConversation, { title: "Chat", model: "q" });
  const say = (role: "user" | "assistant", text: string) => ({
    role,
    content: [{ type: "text", text }],
  });
  await run(appendMessages, {
    conversationId: c.id,
    messages: [say("user", "hi"), say("assistant", "hello")],
  });
  expect((await openChat(c.id)).pending).toBe(false);
  await run(appendMessages, {
    conversationId: c.id,
    messages: [
      say("user", "and?"),
      { role: "system", content: "Older stored refresh." },
    ],
  });
  expect((await openChat(c.id)).pending).toBe(true);
});

it("isn't pending while a delete waits on the owner", async () => {
  const area = await run(createArea, { name: "Guitar" });
  const c = await run(createConversation, { title: "Chat", model: "q" });
  await run(appendMessages, {
    conversationId: c.id,
    messages: [
      { role: "user", content: [{ type: "text", text: "swap" }] },
      {
        role: "assistant",
        content: [
          { type: "tool_use", id: "t1", name: "list_areas", input: {} },
          {
            type: "tool_use",
            id: "t2",
            name: "delete_item",
            input: { kind: "area", id: area.id },
          },
        ],
        model: "q",
      },
      {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "t1", content: "ok" }],
      },
    ],
  });
  const opened = await openChat(c.id);
  expect(opened.pending).toBe(false);
  expect(opened.items.at(-1)).toMatchObject({ kind: "confirm" });
});
