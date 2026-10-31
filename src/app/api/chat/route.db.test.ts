import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ChatEvent } from "@/server/chat/events";
import type { Db } from "@/server/db/types";
import { createTestDb } from "@/test/db";
import { createOwner } from "@/test/factories";

const state = vi.hoisted(() => ({
  owner: null as { id: string; email: string } | null,
  db: null as unknown,
  run: vi.fn(),
}));

vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => ({ default: class {} }));
vi.mock("@/server/auth/require-owner", () => ({
  requireOwnerApi: async () =>
    state.owner ?? Response.json({ error: "unauthorized" }, { status: 401 }),
}));
vi.mock("@/server/db/client", () => ({ getDb: () => state.db }));
vi.mock("@/server/chat/engine", () => ({ runTurn: state.run }));
vi.mock("@/server/chat/models", () => ({
  listModels: () => async () => [],
  resolveTiers: async () => ({
    quick: { id: "q", name: "Q" },
    smart: { id: "s", name: "S" },
    deep: { id: "d", name: "D" },
  }),
}));

import { POST } from "./route";

let db: Db;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  state.db = db;
  state.owner = { id: await createOwner(db), email: "o@test.local" };
  state.run.mockReset();
  state.run.mockImplementation(
    async (_deps: unknown, _input: unknown, emit: (e: ChatEvent) => void) => {
      emit({ type: "conversation", id: "c1", title: "Hi", model: "q" });
      emit({ type: "text", delta: "Hello" });
      emit({ type: "done", model: "q", changed: false });
    },
  );
});
afterEach(() => close());

const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api/chat", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

it("refuses anyone but the owner", async () => {
  state.owner = null;
  expect((await post({ text: "hi" })).status).toBe(401);
  expect(state.run).not.toHaveBeenCalled();
});

it("rejects bad input", async () => {
  expect((await post("not json")).status).toBe(400);
  expect((await post({ tier: "huge", text: "hi" })).status).toBe(400);
  expect((await post({ conversationId: "nope", text: "hi" })).status).toBe(400);
});

it("streams the engine's events as NDJSON, in order", async () => {
  const res = await post({ text: "hi" });
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("application/x-ndjson");
  const lines = (await res.text()).trim().split("\n");
  const events = lines.map((l) => JSON.parse(l) as ChatEvent);
  expect(events.map((e) => e.type)).toEqual(["conversation", "text", "done"]);
  expect(state.run.mock.calls[0]![1]).toEqual({ text: "hi" });
});

it("ends the stream with one error line when the engine throws", async () => {
  state.run.mockRejectedValue(new Error("boom"));
  const res = await post({ text: "hi" });
  const lines = (await res.text()).trim().split("\n");
  expect(lines.map((l) => JSON.parse(l))).toEqual([
    {
      type: "error",
      message: "Claude couldn't answer. Try again.",
      retryable: true,
    },
  ]);
});

it("limits the owner to 20 turns a minute", async () => {
  for (let i = 0; i < 20; i++) {
    expect((await post({ text: "hi" })).status).toBe(200);
  }
  const res = await post({ text: "hi" });
  expect(res.status).toBe(429);
  expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
});
