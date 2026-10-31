import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { ChatEvent } from "@/server/chat/events";
import { useChat } from "./use-chat";

const nav = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: nav.refresh }),
}));
const actions = vi.hoisted(() => ({ openChat: vi.fn() }));
vi.mock("@/server/actions/chat", () => actions);

const fetchMock = vi.fn();

/** A response that streams `events` as NDJSON, one chunk per event. */
function ndjson(events: ChatEvent[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      for (const e of events)
        c.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
      c.close();
    },
  });
  return new Response(body, {
    headers: { "content-type": "application/x-ndjson" },
  });
}

const sent = (n: number) =>
  JSON.parse(fetchMock.mock.calls[n]![1].body as string) as unknown;

beforeEach(() => {
  nav.refresh.mockReset();
  actions.openChat.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

it("streams a turn into items and refreshes the page once after a change", async () => {
  fetchMock.mockResolvedValueOnce(
    ndjson([
      {
        type: "conversation",
        id: "c1",
        title: "Add guitar",
        model: "claude-haiku-5-5",
      },
      { type: "text", delta: "Adding " },
      { type: "text", delta: "it now." },
      {
        type: "tool",
        id: "t1",
        name: "create_area",
        summary: "Created area “Guitar”",
        batchId: "b1",
        error: false,
      },
      { type: "done", model: "claude-haiku-5-5", changed: true },
    ]),
  );
  const { result } = renderHook(() => useChat());
  await act(() => result.current.send("Add guitar area"));

  expect(fetchMock).toHaveBeenCalledWith("/api/chat", expect.anything());
  expect(sent(0)).toEqual({ tier: "quick", text: "Add guitar area" });
  // Text before a tool call is its own stored message, so it stays before
  // the tool line, as the conversation reads when reopened.
  expect(result.current.items).toEqual([
    { kind: "user", text: "Add guitar area" },
    { kind: "assistant", text: "Adding it now.", model: "claude-haiku-5-5" },
    {
      kind: "tool",
      summary: "Created area “Guitar”",
      batchId: "b1",
      error: false,
    },
  ]);
  expect(result.current.conversationId).toBe("c1");
  expect(result.current.running).toBe(false);
  expect(nav.refresh).toHaveBeenCalledTimes(1);
});

it("keeps the reply after the tool line when Claude answers after it", async () => {
  fetchMock.mockResolvedValueOnce(
    ndjson([
      { type: "conversation", id: "c1", title: "t", model: "claude-haiku-5-5" },
      {
        type: "tool",
        id: "t1",
        name: "create_area",
        summary: "Created area “Guitar”",
        batchId: "b1",
        error: false,
      },
      { type: "text", delta: "Done." },
      { type: "done", model: "claude-haiku-5-5", changed: false },
    ]),
  );
  const { result } = renderHook(() => useChat());
  await act(() => result.current.send("Add guitar area"));
  expect(result.current.items.map((i) => i.kind)).toEqual([
    "user",
    "tool",
    "assistant",
  ]);
  expect(nav.refresh).not.toHaveBeenCalled();
});

it("drops the partial reply on a retryable error; Retry resends the turn", async () => {
  fetchMock.mockResolvedValueOnce(
    ndjson([
      { type: "conversation", id: "c1", title: "t", model: "claude-haiku-5-5" },
      { type: "text", delta: "Half a rep" },
      {
        type: "error",
        message: "Claude couldn't answer. Try again.",
        retryable: true,
      },
    ]),
  );
  const { result } = renderHook(() => useChat());
  await act(() => result.current.send("Hi"));
  expect(result.current.items).toEqual([{ kind: "user", text: "Hi" }]);
  expect(result.current.streaming).toBe("");
  expect(result.current.error).toEqual({
    message: "Claude couldn't answer. Try again.",
    retryable: true,
  });

  fetchMock.mockResolvedValueOnce(
    ndjson([
      { type: "text", delta: "Hello!" },
      { type: "done", model: "claude-haiku-5-5", changed: false },
    ]),
  );
  await act(() => result.current.retry());
  expect(sent(1)).toEqual({ conversationId: "c1", retry: true });
  expect(result.current.error).toBeNull();
  expect(result.current.items).toEqual([
    { kind: "user", text: "Hi" },
    { kind: "assistant", text: "Hello!", model: "claude-haiku-5-5" },
  ]);
});

it("resends the message itself when the server never took it", async () => {
  fetchMock.mockResolvedValueOnce(
    Response.json({ error: "rate_limited" }, { status: 429 }),
  );
  const { result } = renderHook(() => useChat());
  await act(() => result.current.send("Hi"));
  expect(result.current.error?.retryable).toBe(true);
  fetchMock.mockResolvedValueOnce(
    ndjson([
      { type: "conversation", id: "c1", title: "t", model: "claude-haiku-5-5" },
      { type: "done", model: "claude-haiku-5-5", changed: false },
    ]),
  );
  await act(() => result.current.retry());
  expect(sent(1)).toEqual({ tier: "quick", text: "Hi" });
  expect(result.current.items).toEqual([{ kind: "user", text: "Hi" }]);
});

it("sends the tier only when it changes, and answers a confirm", async () => {
  fetchMock.mockResolvedValueOnce(
    ndjson([
      { type: "conversation", id: "c1", title: "t", model: "claude-haiku-5-5" },
      {
        type: "confirm",
        toolUseId: "tu1",
        name: "delete_item",
        prompt: "Delete area “Guitar”?",
      },
      { type: "done", model: "claude-haiku-5-5", changed: false },
    ]),
  );
  const { result } = renderHook(() => useChat());
  await act(() => result.current.send("Delete guitar"));
  expect(result.current.items.at(-1)).toEqual({
    kind: "confirm",
    toolUseId: "tu1",
    prompt: "Delete area “Guitar”?",
  });

  fetchMock.mockImplementation(async () =>
    ndjson([{ type: "done", model: "claude-haiku-5-5", changed: true }]),
  );
  await act(() => result.current.answer("tu1", true));
  expect(sent(1)).toEqual({
    conversationId: "c1",
    confirm: { toolUseId: "tu1", approve: true },
  });
  expect(result.current.items.some((i) => i.kind === "confirm")).toBe(false);

  await act(() => result.current.send("Thanks"));
  expect(sent(2)).toEqual({ conversationId: "c1", text: "Thanks" });
  act(() => result.current.setTier("deep"));
  await act(() => result.current.send("Think hard"));
  expect(sent(3)).toEqual({
    conversationId: "c1",
    tier: "deep",
    text: "Think hard",
  });
  await act(() => result.current.send("Again"));
  expect(sent(4)).toEqual({ conversationId: "c1", text: "Again" });
});

it("opens a stored conversation on its tier, and reset starts over", async () => {
  actions.openChat.mockResolvedValue({
    conversation: { id: "c9", title: "Old", model: "claude-sonnet-5-5" },
    items: [
      { kind: "user", text: "Old question" },
      { kind: "assistant", text: "Old answer", model: "claude-sonnet-5-5" },
    ],
  });
  const { result } = renderHook(() => useChat());
  await act(() => result.current.load("c9"));
  expect(actions.openChat).toHaveBeenCalledWith("c9");
  expect(result.current.conversationId).toBe("c9");
  expect(result.current.tier).toBe("smart");
  expect(result.current.items).toHaveLength(2);

  act(() => result.current.reset());
  expect(result.current.conversationId).toBeNull();
  expect(result.current.items).toEqual([]);
  expect(result.current.tier).toBe("quick");
});

it("ignores a turn still streaming after reset", async () => {
  let push!: (e: ChatEvent) => void;
  const encoder = new TextEncoder();
  fetchMock.mockResolvedValueOnce(
    new Response(
      new ReadableStream<Uint8Array>({
        start(c) {
          push = (e) => c.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
        },
      }),
    ),
  );
  const { result } = renderHook(() => useChat());
  act(() => void result.current.send("Hi"));
  await waitFor(() => expect(push).toBeDefined());
  act(() => result.current.reset());
  act(() => push({ type: "text", delta: "late" }));
  expect(result.current.streaming).toBe("");
  expect(result.current.items).toEqual([]);
});

it("sends nothing while a stored conversation loads", async () => {
  let resolve!: (v: unknown) => void;
  actions.openChat.mockReturnValue(new Promise((r) => (resolve = r)));
  const { result } = renderHook(() => useChat());
  act(() => void result.current.load("c9"));
  expect(result.current.loading).toBe(true);
  await act(() => result.current.send("Too soon"));
  expect(fetchMock).not.toHaveBeenCalled();
  await act(async () =>
    resolve({
      conversation: { id: "c9", title: "Old", model: "claude-haiku-5-5" },
      items: [{ kind: "user", text: "Old question" }],
    }),
  );
  expect(result.current.loading).toBe(false);
  expect(result.current.items).toEqual([
    { kind: "user", text: "Old question" },
  ]);
});
