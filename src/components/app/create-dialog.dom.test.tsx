import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CaptureDestination,
  CaptureProvider,
  useCapture,
} from "./capture-context";
import { CreateDialog } from "./create-dialog";

const server = vi.hoisted(() => ({
  createItemAction: vi.fn(),
  createOptionsAction: vi.fn(),
  undoAction: vi.fn(),
  createCategoryAction: vi.fn(),
  logMomentAction: vi.fn(),
  toast: vi.fn(),
}));
vi.mock("@/server/actions/create", () => ({
  createItemAction: (i: unknown) => server.createItemAction(i),
  createOptionsAction: (i: unknown) => server.createOptionsAction(i),
}));
vi.mock("@/server/actions/history", () => ({
  undoAction: (i: unknown) => server.undoAction(i),
}));
vi.mock("@/server/actions/trackers", () => ({
  logMomentAction: (i: unknown) => server.logMomentAction(i),
}));
vi.mock("@/server/actions/categories", () => ({
  createCategoryAction: (i: unknown) => server.createCategoryAction(i),
}));
vi.mock("sonner", () => ({
  toast: Object.assign((...a: unknown[]) => server.toast(...a), {
    error: vi.fn(),
    success: vi.fn(),
  }),
}));

const guitar = { id: "g", name: "Guitar", emoji: "🎸" };
const sweep = { id: "s", title: "Sweep" };
const OPTIONS = {
  targets: [
    {
      ...guitar,
      achievements: [
        { id: "s", title: "Sweep", status: "active" },
        { id: "o", title: "Other", status: "backlog" },
      ],
    },
  ],
  categories: [
    { id: "c-tech", name: "Technique", color: "#f59e0b", usedInArea: 1 },
  ],
  today: "2026-10-24",
  weekStart: 1,
  trackers: [
    { id: "t-anger", name: "Anger", emoji: "😠" },
    { id: "t-kind", name: "Kindness", emoji: null },
  ],
};

beforeEach(() => {
  localStorage.clear();
  for (const f of Object.values(server)) f.mockReset();
  server.createOptionsAction.mockResolvedValue(OPTIONS);
  server.createItemAction.mockResolvedValue({
    ok: true,
    data: { kind: "task", id: "t" },
    batchId: "b1",
  });
  server.undoAction.mockResolvedValue({ ok: true, batchId: "b2" });
});

function Opener() {
  const { openCreate } = useCapture();
  return (
    <button
      onClick={() => openCreate({ kind: "achievement", status: "active" })}
    >
      Open active column
    </button>
  );
}

function setup(page?: "area" | "achievement") {
  render(
    <CaptureProvider>
      <input aria-label="Somewhere else" />
      <Opener />
      {page === "area" && <CaptureDestination area={guitar} />}
      {page === "achievement" && (
        <CaptureDestination area={guitar} achievement={sweep} />
      )}
      <CreateDialog />
    </CaptureProvider>,
  );
}

const dialog = () => screen.getByRole("dialog");
const title = () => screen.getByRole("textbox", { name: "Title" });
const notes = () => screen.getByRole("textbox", { name: "Notes" });
const destination = () =>
  screen.getByRole("button", { name: /^Destination: / });
const open = async () => {
  await userEvent.keyboard("c");
  // The destination list unlocks once the options have arrived.
  await waitFor(() => expect(destination()).toBeEnabled());
};
const submit = () => userEvent.keyboard("{Control>}{Enter}{/Control}");

it("C opens a new task bound for the Inbox, title focused", async () => {
  setup();
  await userEvent.type(screen.getByLabelText("Somewhere else"), "chocolate");
  expect(screen.queryByRole("dialog")).toBeNull();
  await userEvent.click(document.body);
  await open();
  expect(screen.getByRole("dialog", { name: "New task" })).toBeVisible();
  expect(destination()).toHaveAccessibleName("Destination: Inbox");
  expect(title()).toHaveFocus();
  expect(title()).toHaveAttribute("placeholder", "Task title");
  expect(notes()).toHaveAttribute("placeholder", "Add notes…");
});

it("C with a modifier does not open it", async () => {
  setup();
  await userEvent.keyboard("{Control>}c{/Control}{Alt>}c{/Alt}");
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("on an achievement page it opens a task there; flipping to Achievement files it in the area", async () => {
  setup("achievement");
  await open();
  expect(destination()).toHaveAccessibleName("Destination: 🎸 Guitar › Sweep");
  const kind = screen.getByRole("group", { name: "Kind" });
  await userEvent.click(
    within(kind).getByRole("button", { name: "Achievement" }),
  );
  expect(screen.getByRole("dialog", { name: "New achievement" })).toBeVisible();
  expect(destination()).toHaveAccessibleName("Destination: 🎸 Guitar");
  expect(
    screen.getByRole("button", { name: "Create achievement" }),
  ).toBeVisible();
});

it("on an area page it opens an achievement in that area", async () => {
  setup("area");
  await open();
  expect(screen.getByRole("dialog", { name: "New achievement" })).toBeVisible();
  expect(destination()).toHaveAccessibleName("Destination: 🎸 Guitar");
  expect(title()).toHaveAttribute("placeholder", "Achievement title");
});

it("a preset status from a board column is what gets saved", async () => {
  setup("area");
  await userEvent.click(screen.getByText("Open active column"));
  expect(screen.getByRole("button", { name: /^Status/ })).toHaveTextContent(
    "Active",
  );
  await userEvent.type(title(), "Arpeggios");
  await submit();
  expect(server.createItemAction).toHaveBeenCalledWith(
    expect.objectContaining({
      kind: "achievement",
      areaId: "g",
      title: "Arpeggios",
      status: "active",
    }),
  );
});

it("Ctrl+Enter with an empty title does nothing; Create is disabled", async () => {
  setup();
  await open();
  expect(screen.getByRole("button", { name: "Create task" })).toBeDisabled();
  await userEvent.type(title(), "   ");
  await submit();
  expect(server.createItemAction).not.toHaveBeenCalled();
});

it("Ctrl+Enter twice creates once", async () => {
  let finish!: (v: unknown) => void;
  server.createItemAction.mockReturnValue(new Promise((r) => (finish = r)));
  setup();
  await open();
  await userEvent.type(title(), "Buy strings");
  await submit();
  await submit();
  await userEvent.type(title(), "{Enter}");
  expect(server.createItemAction).toHaveBeenCalledTimes(1);
  await act(async () =>
    finish({ ok: true, data: { kind: "task", id: "t" }, batchId: "b" }),
  );
});

it("Enter in the title creates, as Capture did", async () => {
  setup();
  await open();
  await userEvent.type(title(), "Buy strings{Enter}");
  expect(server.createItemAction).toHaveBeenCalledWith({
    kind: "task",
    achievementId: null,
    title: "Buy strings",
    notes: null,
    effort: 2,
    deadline: null,
    recurrence: null,
    categoryIds: [],
  });
});

it("a task sends its notes, effort, repeat and categories", async () => {
  setup("achievement");
  await open();
  await userEvent.type(title(), "Sweeps");
  await userEvent.type(notes(), "slow first");
  await userEvent.click(screen.getByRole("button", { name: "Effort: Easy" }));
  await userEvent.click(screen.getByRole("menuitemradio", { name: "Medium" }));
  await userEvent.click(screen.getByRole("button", { name: /^Repeat/ }));
  await userEvent.click(screen.getByRole("radio", { name: "Daily" }));
  await userEvent.click(screen.getByRole("button", { name: "Save" }));
  await userEvent.click(screen.getByRole("button", { name: "Category" }));
  await userEvent.click(screen.getByRole("checkbox", { name: "Technique" }));
  await userEvent.keyboard("{Escape}");
  expect(
    screen.getByRole("button", { name: "Remove Technique" }),
  ).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Create task" }));
  expect(server.createItemAction).toHaveBeenCalledWith(
    expect.objectContaining({
      kind: "task",
      achievementId: "s",
      notes: "slow first",
      effort: 3,
      recurrence: expect.objectContaining({
        freq: "daily",
        start: "2026-10-24",
      }),
      categoryIds: ["c-tech"],
    }),
  );
});

it("with Create more on, saving clears title and notes and keeps the chips", async () => {
  setup();
  await open();
  await userEvent.click(screen.getByRole("switch", { name: "Create more" }));
  await userEvent.click(screen.getByRole("button", { name: "Effort: Easy" }));
  await userEvent.click(screen.getByRole("menuitemradio", { name: "Hard" }));
  await userEvent.type(title(), "One");
  await userEvent.type(notes(), "n");
  await submit();
  expect(await screen.findByRole("status")).toHaveTextContent("Created “One”");
  expect(title()).toHaveValue("");
  expect(notes()).toHaveValue("");
  expect(title()).toHaveFocus();
  expect(screen.getByRole("button", { name: "Effort: Hard" })).toBeVisible();
  expect(server.toast).not.toHaveBeenCalled();
});

it("with it off, saving closes and toasts with Undo", async () => {
  setup();
  await open();
  await userEvent.type(title(), "One");
  await submit();
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(server.toast).toHaveBeenCalledWith(
    "Task created",
    expect.objectContaining({
      action: expect.objectContaining({ label: "Undo" }),
    }),
  );
  const [, opts] = server.toast.mock.calls[0]!;
  await act(async () => opts.action.onClick());
  expect(server.undoAction).toHaveBeenCalledWith({ batchId: "b1" });
});

it.each([
  [
    "refused",
    () =>
      server.createItemAction.mockResolvedValue({
        ok: false,
        code: "not_found",
        message: "That item no longer exists. Refresh to see the latest.",
      }),
    "That item no longer exists. Refresh to see the latest.",
  ],
  [
    "a thrown call",
    () => server.createItemAction.mockRejectedValue(new Error("stale")),
    "Couldn't save. Reload the page and try again.",
  ],
])(
  "an error (%s) shows in the dialog and keeps the text",
  async (_n, arrange, message) => {
    arrange();
    setup();
    await open();
    await userEvent.type(title(), "Buy strings");
    await submit();
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(title()).toHaveValue("Buy strings");
    expect(dialog()).toBeVisible();
  },
);

it("Escape with text asks before discarding; Keep editing keeps it, Discard closes", async () => {
  setup();
  await open();
  await userEvent.type(title(), "Half a thought");
  await userEvent.keyboard("{Escape}");
  expect(screen.getByText("Discard this task?")).toBeVisible();
  expect(dialog()).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Keep editing" }));
  expect(screen.queryByText("Discard this task?")).toBeNull();
  expect(title()).toHaveValue("Half a thought");
  await userEvent.click(screen.getByRole("button", { name: "Close" }));
  await userEvent.click(screen.getByRole("button", { name: "Discard" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  await userEvent.keyboard("c");
  expect(title()).toHaveValue("");
});

it("Escape with only chips set closes straight away", async () => {
  setup();
  await open();
  await userEvent.click(screen.getByRole("button", { name: "Effort: Easy" }));
  await userEvent.click(screen.getByRole("menuitemradio", { name: "Hard" }));
  await userEvent.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("Escape in an open picker closes the picker, not the dialog", async () => {
  setup();
  await open();
  await userEvent.type(title(), "Keep me");
  await userEvent.click(screen.getByRole("button", { name: "Effort: Easy" }));
  await userEvent.keyboard("{Escape}");
  expect(screen.queryByRole("menu")).toBeNull();
  expect(dialog()).toBeVisible();
  expect(screen.queryByText("Discard this task?")).toBeNull();
  expect(title()).toHaveValue("Keep me");
});

it("a destination picked by hand sticks while it can hold the kind", async () => {
  setup("achievement");
  await open();
  await userEvent.click(destination());
  await userEvent.click(screen.getByRole("option", { name: "Other" }));
  expect(destination()).toHaveAccessibleName("Destination: 🎸 Guitar › Other");
  const kind = screen.getByRole("group", { name: "Kind" });
  // An achievement can't go in an achievement: the table applies.
  await userEvent.click(
    within(kind).getByRole("button", { name: "Achievement" }),
  );
  expect(destination()).toHaveAccessibleName("Destination: 🎸 Guitar");
  await userEvent.click(destination());
  await userEvent.click(screen.getByRole("option", { name: "Inbox" }));
  await userEvent.click(within(kind).getByRole("button", { name: "Task" }));
  expect(destination()).toHaveAccessibleName("Destination: Inbox");
  await userEvent.type(title(), "x");
  await submit();
  expect(server.createItemAction).toHaveBeenCalledWith(
    expect.objectContaining({ kind: "task", achievementId: null }),
  );
});

it("the kind and Create more are remembered", async () => {
  setup();
  await open();
  const kind = screen.getByRole("group", { name: "Kind" });
  await userEvent.click(
    within(kind).getByRole("button", { name: "Achievement" }),
  );
  await userEvent.click(screen.getByRole("switch", { name: "Create more" }));
  await userEvent.keyboard("{Escape}");
  await open();
  expect(screen.getByRole("dialog", { name: "New achievement" })).toBeVisible();
  expect(screen.getByRole("switch", { name: "Create more" })).toBeChecked();
});

it("a storage that throws still opens a new task", async () => {
  const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("denied");
  });
  setup();
  await open();
  expect(screen.getByRole("dialog", { name: "New task" })).toBeVisible();
  get.mockRestore();
});

it("Ctrl+Enter creates even when focus has slipped out of the fields", async () => {
  setup();
  await open();
  await userEvent.type(title(), "Buy strings");
  (document.activeElement as HTMLElement).blur();
  expect(document.activeElement).toBe(document.body);
  await submit();
  expect(server.createItemAction).toHaveBeenCalledTimes(1);
});

it("Ctrl+Enter inside an open picker doesn't save around it", async () => {
  setup("achievement");
  await open();
  await userEvent.type(title(), "Sweeps");
  await userEvent.click(screen.getByRole("button", { name: /^Repeat/ }));
  await userEvent.click(screen.getByRole("radio", { name: "Daily" }));
  await submit();
  expect(server.createItemAction).not.toHaveBeenCalled();
  await userEvent.click(destination());
  await submit();
  expect(server.createItemAction).not.toHaveBeenCalled();
});

it("a page that registers after C re-derives the kind as well as the destination", async () => {
  localStorage.setItem("create-dialog", '{"kind":"achievement","more":false}');
  const ui = (page: boolean) => (
    <CaptureProvider>
      {page && <CaptureDestination area={guitar} achievement={sweep} />}
      <CreateDialog />
    </CaptureProvider>
  );
  const { rerender } = render(ui(false));
  await open();
  expect(screen.getByRole("dialog", { name: "New achievement" })).toBeVisible();
  rerender(ui(true));
  expect(await screen.findByRole("dialog", { name: "New task" })).toBeVisible();
  expect(destination()).toHaveAccessibleName("Destination: 🎸 Guitar › Sweep");
});

it("a kind flipped by hand survives a late page", async () => {
  const ui = (page: boolean) => (
    <CaptureProvider>
      {page && <CaptureDestination area={guitar} />}
      <CreateDialog />
    </CaptureProvider>
  );
  const { rerender } = render(ui(false));
  await open();
  const kind = screen.getByRole("group", { name: "Kind" });
  await userEvent.click(
    within(kind).getByRole("button", { name: "Achievement" }),
  );
  await userEvent.click(within(kind).getByRole("button", { name: "Task" }));
  rerender(ui(true));
  expect(screen.getByRole("dialog", { name: "New task" })).toBeVisible();
  expect(destination()).toHaveAccessibleName("Destination: Inbox");
});

it("on a phone the sheet is as tall as what the keyboard leaves", async () => {
  const listeners: (() => void)[] = [];
  const vv = {
    height: 800,
    addEventListener: (_: string, f: () => void) => listeners.push(f),
    removeEventListener: () => {},
  };
  Object.defineProperty(window, "visualViewport", {
    value: vv,
    configurable: true,
  });
  setup();
  await open();
  expect(dialog().style.getPropertyValue("--sheet-height")).toBe("800px");
  vv.height = 420; // the keyboard came up
  act(() => listeners.forEach((f) => f()));
  expect(dialog().style.getPropertyValue("--sheet-height")).toBe("420px");
  Object.defineProperty(window, "visualViewport", {
    value: undefined,
    configurable: true,
  });
});

function PlanOpener() {
  const { openCreate } = useCapture();
  return (
    <button
      onClick={() =>
        openCreate({
          kind: "task",
          plan: { type: "day", date: "2026-10-25", section: "work" },
        })
      }
    >
      Add to Work
    </button>
  );
}

it("a planner preset files a loose task on that day and section", async () => {
  render(
    <CaptureProvider>
      <PlanOpener />
      <CreateDialog />
    </CaptureProvider>,
  );
  await userEvent.click(screen.getByRole("button", { name: "Add to Work" }));
  await waitFor(() => expect(destination()).toBeEnabled());
  expect(destination()).toHaveAccessibleName("Destination: No achievement");
  expect(screen.getByRole("button", { name: "When: Tomorrow" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Section: Work" })).toBeVisible();
  await userEvent.type(title(), "Client email");
  await submit();
  expect(server.createItemAction).toHaveBeenCalledWith(
    expect.objectContaining({
      kind: "task",
      achievementId: null,
      title: "Client email",
      plan: { type: "day", date: "2026-10-25", section: "work" },
    }),
  );
});

it("a target chip sends the target; Repeat waits while When or Target is set", async () => {
  setup("achievement");
  await open();
  const repeat = screen.getByRole("button", { name: /^Repeat/ });
  await userEvent.click(screen.getByRole("button", { name: "When: none" }));
  await userEvent.click(screen.getByRole("menuitem", { name: "This week" }));
  expect(repeat).toBeDisabled();
  expect(destination()).toHaveAccessibleName("Destination: 🎸 Guitar › Sweep");
  await userEvent.click(
    screen.getByRole("button", { name: "When: This week" }),
  );
  await userEvent.click(screen.getByRole("menuitem", { name: "No date" }));
  expect(repeat).toBeEnabled();
  await userEvent.click(screen.getByRole("button", { name: "Target: none" }));
  await userEvent.clear(screen.getByLabelText("Amount"));
  await userEvent.type(screen.getByLabelText("Amount"), "100");
  await userEvent.click(screen.getByRole("button", { name: "Set target" }));
  expect(repeat).toBeDisabled();
  await userEvent.type(title(), "Talk to strangers");
  await submit();
  expect(server.createItemAction).toHaveBeenCalledWith(
    expect.objectContaining({
      title: "Talk to strangers",
      target: { amount: 100, unit: "times" },
    }),
  );
  expect(server.createItemAction.mock.calls[0]![0]).not.toHaveProperty("plan");
});

describe("a moment", () => {
  const toMoment = async () => {
    await open();
    await userEvent.click(
      within(screen.getByRole("group", { name: "Kind" })).getByRole("button", {
        name: "Moment",
      }),
    );
  };

  beforeEach(() => {
    server.logMomentAction.mockResolvedValue({
      ok: true,
      data: { id: "m1" },
      batchId: "b9",
    });
  });

  it("swaps the title for trackers, intensity and a note, and logs it", async () => {
    setup();
    await toMoment();
    expect(screen.getByRole("dialog", { name: "Log a moment" })).toBeVisible();
    expect(screen.queryByRole("textbox", { name: "Title" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Destination/ })).toBeNull();
    const anger = screen.getByRole("radio", { name: "😠 Anger" });
    expect(anger).toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: "Intensity 3" }));
    await userEvent.type(notes(), "traffic");
    expect(notes()).toHaveAttribute("placeholder", "What was happening?");
    await userEvent.click(screen.getByRole("button", { name: "Log moment" }));
    expect(server.logMomentAction).toHaveBeenCalledWith({
      trackerId: "t-anger",
      intensity: 3,
      note: "traffic",
    });
    expect(server.toast).toHaveBeenCalledWith(
      "Logged Anger",
      expect.objectContaining({
        action: expect.objectContaining({ label: "Undo" }),
      }),
    );
  });

  it("taps the chosen intensity again to clear it; Ctrl+Enter logs", async () => {
    setup();
    await toMoment();
    await userEvent.click(screen.getByRole("radio", { name: "Kindness" }));
    const three = screen.getByRole("button", { name: "Intensity 3" });
    await userEvent.click(three);
    expect(three).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(three);
    expect(three).toHaveAttribute("aria-pressed", "false");
    await submit();
    expect(server.logMomentAction).toHaveBeenCalledWith({
      trackerId: "t-kind",
    });
  });

  it("logs an earlier time from the When chip", async () => {
    setup();
    await toMoment();
    await userEvent.click(screen.getByRole("button", { name: "When: Now" }));
    const when = screen.getByLabelText("When it happened");
    await userEvent.type(when, "2026-10-24T08:15");
    await userEvent.click(screen.getByRole("button", { name: "Log moment" }));
    const sent = server.logMomentAction.mock.calls[0]![0] as { at: string };
    expect(new Date(sent.at).getTime()).toBe(
      new Date("2026-10-24T08:15").getTime(),
    );
  });

  it("says so when there are no trackers", async () => {
    server.createOptionsAction.mockResolvedValue({ ...OPTIONS, trackers: [] });
    setup();
    await toMoment();
    expect(screen.getByText("No trackers yet.")).toBeVisible();
    expect(screen.getByRole("link", { name: "Add one" })).toHaveAttribute(
      "href",
      "/trackers",
    );
    expect(screen.getByRole("button", { name: "Log moment" })).toBeDisabled();
  });

  it("is remembered as the last kind, with its tracker", async () => {
    setup();
    await toMoment();
    await userEvent.click(screen.getByRole("radio", { name: "Kindness" }));
    expect(JSON.parse(localStorage.getItem("create-dialog")!)).toMatchObject({
      kind: "moment",
      tracker: "t-kind",
    });
  });
});
