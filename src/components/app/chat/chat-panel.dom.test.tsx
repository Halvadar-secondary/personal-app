import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatEvent } from "@/server/chat/events";
import { ChatButton } from "./chat-button";
import { ChatProvider, useChatPanel } from "./chat-panel";

const nav = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: nav.refresh, push: vi.fn() }),
  usePathname: () => "/",
}));
const actions = vi.hoisted(() => ({
  listChats: vi.fn(),
  openChat: vi.fn(),
  removeChat: vi.fn(),
  chatTiers: vi.fn(),
}));
vi.mock("@/server/actions/chat", () => actions);
const history = vi.hoisted(() => ({ undoAction: vi.fn() }));
vi.mock("@/server/actions/history", () => history);

const fetchMock = vi.fn();

function ndjson(events: ChatEvent[]): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array>({
      start(c) {
        for (const e of events)
          c.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
        c.close();
      },
    }),
  );
}

const sent = (n: number) =>
  JSON.parse(fetchMock.mock.calls[n]![1].body as string) as unknown;

const reply = (text: string): ChatEvent[] => [
  { type: "conversation", id: "c1", title: "t", model: "claude-haiku-5-5" },
  { type: "text", delta: text },
  { type: "done", model: "claude-haiku-5-5", changed: false },
];

beforeEach(() => {
  nav.refresh.mockReset();
  for (const f of Object.values(actions)) f.mockReset();
  history.undoAction.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  // No API key: the panel falls back to the built-in tier names.
  actions.chatTiers.mockRejectedValue(new Error("ANTHROPIC_API_KEY is unset"));
  actions.listChats.mockResolvedValue([]);
});

afterEach(() => {
  delete (window as { SpeechRecognition?: unknown }).SpeechRecognition;
  delete (window as { webkitSpeechRecognition?: unknown })
    .webkitSpeechRecognition;
});

function setup() {
  render(
    <ChatProvider>
      <ChatButton />
    </ChatProvider>,
  );
}

const panel = () => screen.getByRole("dialog", { name: "Claude" });
const box = () => screen.getByRole("textbox", { name: "Message Claude" });

async function openPanel() {
  await userEvent.click(screen.getByRole("button", { name: "Ask Claude" }));
  return panel();
}

async function say(text: string) {
  await userEvent.type(box(), text);
  await userEvent.click(screen.getByRole("button", { name: "Send" }));
}

it("the button opens a new, empty conversation every time", async () => {
  setup();
  expect(screen.queryByRole("dialog")).toBeNull();
  await openPanel();
  for (const chip of ["Plan my day", "Add a task", "How am I doing this week?"])
    expect(screen.getByRole("button", { name: chip })).toBeVisible();

  fetchMock.mockResolvedValueOnce(ndjson(reply("Hello there.")));
  await say("Hi");
  expect(await screen.findByText("Hello there.")).toBeVisible();
  // Each assistant message names its model.
  expect(within(panel()).getByText("Claude Haiku 5.5")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Close" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await openPanel();
  expect(screen.queryByText("Hello there.")).toBeNull();
  expect(screen.getByRole("button", { name: "Plan my day" })).toBeVisible();

  // The next message starts a new conversation.
  fetchMock.mockResolvedValueOnce(ndjson(reply("Again.")));
  await say("Hi again");
  await screen.findByText("Again.");
  expect(sent(1)).toEqual({ tier: "quick", text: "Hi again" });
});

it("the picker offers each tier with its model, defaults to Quick, and sends the choice", async () => {
  setup();
  await openPanel();
  const picker = screen.getByRole("button", { name: "Model: Quick" });
  await userEvent.click(picker);
  for (const [label, name] of [
    ["Quick", "Claude Haiku 5.5"],
    ["Smart", "Claude Sonnet 5.5"],
    ["Deepest", "Claude Opus 5.5"],
  ])
    expect(
      screen.getByRole("menuitemradio", { name: `${label} ${name}` }),
    ).toBeVisible();
  expect(screen.getByRole("menuitemradio", { name: /^Quick/ })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await userEvent.click(screen.getByRole("menuitemradio", { name: /^Smart/ }));
  expect(screen.getByRole("button", { name: "Model: Smart" })).toBeVisible();

  fetchMock.mockResolvedValueOnce(ndjson(reply("Ok.")));
  await say("Hi");
  await screen.findByText("Ok.");
  expect(sent(0)).toEqual({ tier: "smart", text: "Hi" });
});

it("shows the tiers' current models when the server has them", async () => {
  actions.chatTiers.mockResolvedValue({
    quick: { id: "claude-haiku-6", name: "Claude Haiku 6", label: "Quick" },
    smart: { id: "claude-sonnet-6", name: "Claude Sonnet 6", label: "Smart" },
    deep: { id: "claude-opus-6", name: "Claude Opus 6", label: "Deepest" },
  });
  setup();
  await openPanel();
  await userEvent.click(screen.getByRole("button", { name: "Model: Quick" }));
  expect(
    await screen.findByRole("menuitemradio", { name: "Smart Claude Sonnet 6" }),
  ).toBeVisible();
});

it("Conversations lists past chats and opens one", async () => {
  actions.listChats.mockResolvedValue([
    {
      id: "c7",
      title: "Plan my week",
      model: "claude-sonnet-5-5",
      updatedAt: new Date(),
    },
  ]);
  actions.openChat.mockResolvedValue({
    conversation: {
      id: "c7",
      title: "Plan my week",
      model: "claude-sonnet-5-5",
    },
    items: [
      { kind: "user", text: "Plan my week" },
      {
        kind: "tool",
        summary: "Planned task “Scales”",
        batchId: "b7",
        error: false,
      },
      { kind: "assistant", text: "Planned.", model: "claude-sonnet-5-5" },
    ],
  });
  setup();
  await openPanel();
  await userEvent.click(screen.getByRole("button", { name: "Conversations" }));
  const row = await screen.findByRole("button", { name: /^Plan my week/ });
  expect(row).toHaveTextContent("Claude Sonnet 5.5");
  await userEvent.click(row);
  expect(actions.openChat).toHaveBeenCalledWith("c7");
  expect(await screen.findByText("Planned.")).toBeVisible();
  expect(screen.getByText("Planned task “Scales”")).toBeVisible();
  // It carries on in that conversation, on its tier.
  expect(screen.getByRole("button", { name: "Model: Smart" })).toBeVisible();
  fetchMock.mockResolvedValueOnce(ndjson(reply("Sure.")));
  await say("More");
  await screen.findByText("Sure.");
  expect(sent(0)).toEqual({ conversationId: "c7", text: "More" });
});

it("deletes a conversation from the list", async () => {
  actions.listChats
    .mockResolvedValueOnce([
      {
        id: "c7",
        title: "Old chat",
        model: "claude-haiku-5-5",
        updatedAt: new Date(),
      },
    ])
    .mockResolvedValue([]);
  actions.removeChat.mockResolvedValue({
    ok: true,
    data: undefined,
    batchId: "b",
  });
  setup();
  await openPanel();
  await userEvent.click(screen.getByRole("button", { name: "Conversations" }));
  await userEvent.click(
    await screen.findByRole("button", { name: "Delete “Old chat”" }),
  );
  expect(actions.removeChat).toHaveBeenCalledWith("c7");
  await waitFor(() => expect(screen.queryByText("Old chat")).toBeNull());
});

it("a confirm card's Confirm and Cancel answer it", async () => {
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
  setup();
  await openPanel();
  await say("Delete guitar");
  expect(await screen.findByText("Delete area “Guitar”?")).toBeVisible();
  fetchMock.mockResolvedValueOnce(
    ndjson([{ type: "done", model: "claude-haiku-5-5", changed: true }]),
  );
  await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
  expect(sent(1)).toEqual({
    conversationId: "c1",
    confirm: { toolUseId: "tu1", approve: true },
  });
  await waitFor(() => expect(nav.refresh).toHaveBeenCalledTimes(1));
});

it("Cancel declines", async () => {
  actions.listChats.mockResolvedValue([]);
  actions.openChat.mockResolvedValue({
    conversation: { id: "c2", title: "t", model: "claude-haiku-5-5" },
    items: [
      { kind: "user", text: "Delete guitar" },
      { kind: "confirm", toolUseId: "tu2", prompt: "Delete area “Guitar”?" },
    ],
  });
  render(
    <ChatProvider>
      <OpenById id="c2" />
    </ChatProvider>,
  );
  await userEvent.click(screen.getByRole("button", { name: "Open c2" }));
  fetchMock.mockResolvedValueOnce(
    ndjson([
      { type: "text", delta: "Kept it." },
      { type: "done", model: "claude-haiku-5-5", changed: false },
    ]),
  );
  await userEvent.click(await screen.findByRole("button", { name: "Cancel" }));
  expect(sent(0)).toEqual({
    conversationId: "c2",
    confirm: { toolUseId: "tu2", approve: false },
  });
  expect(await screen.findByText("Kept it.")).toBeVisible();
});

function OpenById({ id }: { id: string }) {
  const { openChat } = useChatPanel();
  return (
    <button type="button" onClick={() => openChat(id)}>
      Open {id}
    </button>
  );
}

it("a tool line with a batch id offers Undo", async () => {
  history.undoAction.mockResolvedValue({
    ok: true,
    data: undefined,
    batchId: "u",
  });
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
      {
        type: "tool",
        id: "t2",
        name: "list_areas",
        summary: "Looked at your areas",
        batchId: null,
        error: false,
      },
      { type: "done", model: "claude-haiku-5-5", changed: true },
    ]),
  );
  setup();
  await openPanel();
  await say("Add guitar area");
  const line = (await screen.findByText("Created area “Guitar”")).closest(
    "li",
  )!;
  await userEvent.click(within(line).getByRole("button", { name: "Undo" }));
  expect(history.undoAction).toHaveBeenCalledWith({ batchId: "b1" });
  const read = screen.getByText("Looked at your areas").closest("li")!;
  expect(within(read).queryByRole("button", { name: "Undo" })).toBeNull();
});

it("a failed turn shows the message with Retry", async () => {
  fetchMock.mockResolvedValueOnce(
    ndjson([
      { type: "conversation", id: "c1", title: "t", model: "claude-haiku-5-5" },
      { type: "saved" },
      { type: "text", delta: "Half" },
      {
        type: "error",
        message: "Claude couldn't answer. Try again.",
        retryable: true,
      },
    ]),
  );
  setup();
  await openPanel();
  await say("Hi");
  expect(
    await screen.findByText("Claude couldn't answer. Try again."),
  ).toBeVisible();
  expect(screen.queryByText("Half")).toBeNull();
  fetchMock.mockResolvedValueOnce(ndjson(reply("Back.")));
  await userEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(sent(1)).toEqual({ conversationId: "c1", retry: true });
  expect(await screen.findByText("Back.")).toBeVisible();
});

it("a reopened conversation Claude never answered offers Retry", async () => {
  actions.openChat.mockResolvedValue({
    conversation: { id: "c3", title: "t", model: "claude-haiku-5-5" },
    items: [{ kind: "user", text: "Plan my day" }],
    pending: true,
  });
  render(
    <ChatProvider>
      <OpenById id="c3" />
    </ChatProvider>,
  );
  await userEvent.click(screen.getByRole("button", { name: "Open c3" }));
  fetchMock.mockResolvedValueOnce(
    ndjson([
      { type: "text", delta: "Here it is." },
      { type: "done", model: "claude-haiku-5-5", changed: false },
    ]),
  );
  await userEvent.click(await screen.findByRole("button", { name: "Retry" }));
  expect(sent(0)).toEqual({ conversationId: "c3", retry: true });
  expect(await screen.findByText("Here it is.")).toBeVisible();
});

it("Ctrl+J and Cmd+J open it", async () => {
  setup();
  await userEvent.keyboard("{Control>}j{/Control}");
  expect(panel()).toBeVisible();
  await userEvent.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await userEvent.keyboard("{Meta>}j{/Meta}");
  expect(panel()).toBeVisible();
});

describe("dictation", () => {
  let recognitions: FakeRecognition[];

  class FakeRecognition extends EventTarget {
    lang = "";
    continuous = false;
    interimResults = false;
    start = vi.fn(() => {
      recognitions.push(this);
      this.dispatchEvent(new Event("start"));
    });
    stop = vi.fn(() => this.dispatchEvent(new Event("end")));
    abort = vi.fn(() => this.dispatchEvent(new Event("end")));

    /** Results so far: [transcript, isFinal] pairs. */
    hear(results: [string, boolean][]) {
      const e = new Event("result") as Event & { results: unknown };
      e.results = results.map(([transcript, isFinal]) =>
        Object.assign([{ transcript }], { isFinal }),
      );
      act(() => {
        this.dispatchEvent(e);
      });
    }
  }

  beforeEach(() => {
    recognitions = [];
  });

  it("dictates into the box, leaves it editable and unsent, and stops on a second press", async () => {
    (window as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition =
      FakeRecognition;
    setup();
    await openPanel();
    await userEvent.type(box(), "Note:");
    await userEvent.click(screen.getByRole("button", { name: "Dictate" }));
    expect(recognitions).toHaveLength(1);
    expect(recognitions[0]!.lang).toBe(navigator.language);

    recognitions[0]!.hear([["add a", false]]);
    await waitFor(() => expect(box()).toHaveValue("Note: add a"));
    recognitions[0]!.hear([["add a task", true]]);
    await waitFor(() => expect(box()).toHaveValue("Note: add a task"));

    await userEvent.click(
      screen.getByRole("button", { name: "Stop dictation" }),
    );
    expect(recognitions[0]!.stop).toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Dictate" })).toBeVisible(),
    );
    expect(box()).toHaveValue("Note: add a task");
    expect(fetchMock).not.toHaveBeenCalled();
    await userEvent.type(box(), "!");
    expect(box()).toHaveValue("Note: add a task!");
  });

  it("isn't offered without speech recognition", async () => {
    setup();
    await openPanel();
    expect(box()).toBeVisible();
    expect(screen.queryByRole("button", { name: "Dictate" })).toBeNull();
  });

  it("a recognition error says so and keeps the typed text", async () => {
    (window as { SpeechRecognition?: unknown }).SpeechRecognition =
      FakeRecognition;
    vi.spyOn(console, "error").mockImplementation(() => {});
    setup();
    await openPanel();
    await userEvent.type(box(), "Typed");
    await userEvent.click(screen.getByRole("button", { name: "Dictate" }));
    act(() => {
      recognitions[0]!.dispatchEvent(
        Object.assign(new Event("error"), { error: "no-speech" }),
      );
      recognitions[0]!.dispatchEvent(new Event("end"));
    });
    expect(
      await screen.findByText("Couldn't hear that. Try again."),
    ).toBeVisible();
    expect(box()).toHaveValue("Typed");
  });
});
