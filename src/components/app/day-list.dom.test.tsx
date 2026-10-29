import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import type { DayItem, Sections } from "@/server/domain/plan";
import { CaptureProvider } from "./capture-context";
import { DayList } from "./day-list";

const server = vi.hoisted(() => ({
  completeTaskAction: vi.fn(),
  uncompleteTaskAction: vi.fn(),
  planTaskAction: vi.fn(),
  placeTaskAction: vi.fn(),
  logProgressAction: vi.fn(),
  undoAction: vi.fn(),
}));
vi.mock("@/server/actions/tasks", () => ({
  completeTaskAction: (i: unknown) => server.completeTaskAction(i),
  uncompleteTaskAction: (i: unknown) => server.uncompleteTaskAction(i),
}));
vi.mock("@/server/actions/plan", () => ({
  planTaskAction: (i: unknown) => server.planTaskAction(i),
  placeTaskAction: (i: unknown) => server.placeTaskAction(i),
  logProgressAction: (i: unknown) => server.logProgressAction(i),
}));
vi.mock("@/server/actions/history", () => ({
  undoAction: (i: unknown) => server.undoAction(i),
}));

const TODAY = "2026-03-10";

const item = (id: string, over: Partial<DayItem> = {}): DayItem => ({
  id,
  title: id,
  kind: "once",
  section: "spare",
  key: "a0",
  done: false,
  rolledFrom: null,
  rolledLabel: null,
  achievement: null,
  area: null,
  effort: 2,
  recurrence: null,
  target: null,
  createdAt: new Date(0),
  ...over,
});

beforeEach(() => {
  for (const f of Object.values(server)) {
    f.mockReset();
    f.mockResolvedValue({ ok: true, data: undefined, batchId: "b" });
  }
});

function setup(sections: Sections, day = TODAY) {
  render(
    <CaptureProvider>
      <DayList day={day} today={TODAY} sections={sections} />
    </CaptureProvider>,
  );
}

const section = (name: string) => screen.getByRole("region", { name });

it("shows Work then Spare time, with a rolled task's badge first", () => {
  setup({
    work: [item("Email client", { section: "work" })],
    spare: [
      item("Groceries", { rolledFrom: "2026-03-09", rolledLabel: "from Mon" }),
      item("Gym", {
        kind: "repeat",
        achievement: { id: "a", title: "Fitness" },
        area: { id: "h", name: "Health", emoji: "💪" },
      }),
    ],
  });
  const regions = screen.getAllByRole("region");
  expect(regions.map((r) => r.getAttribute("aria-label"))).toEqual([
    "Work",
    "Spare time",
  ]);
  const spare = within(section("Spare time"));
  const rows = spare.getAllByRole("listitem");
  expect(rows[0]).toHaveTextContent("Groceries");
  expect(rows[0]).toHaveTextContent("from Mon");
  expect(
    spare.getByRole("link", { name: "💪 Health · Fitness" }),
  ).toHaveAttribute("href", "/achievements/a");
});

it("ticks a one-off task on any day, a repeating one only today", async () => {
  setup(
    {
      work: [],
      spare: [item("Gym", { kind: "repeat" }), item("Groceries")],
    },
    "2026-03-11",
  );
  const gym = screen.getByRole("checkbox", { name: "Complete Gym" });
  expect(gym).toBeDisabled();
  expect(gym).toHaveAttribute("title", "Only today");
  await userEvent.click(
    screen.getByRole("checkbox", { name: "Complete Groceries" }),
  );
  expect(server.completeTaskAction).toHaveBeenCalledWith({
    taskId: "Groceries",
  });
});

it("unticks a done task", async () => {
  setup({ work: [], spare: [item("Done", { done: true })] });
  await userEvent.click(
    screen.getByRole("checkbox", { name: "Complete Done" }),
  );
  expect(server.uncompleteTaskAction).toHaveBeenCalledWith({ taskId: "Done" });
});

it("moves a task to the week's list, the next day, or off the plan", async () => {
  setup({ work: [], spare: [item("A"), item("B"), item("C")] });
  const menu = (t: string) =>
    userEvent.click(screen.getByRole("button", { name: `Task menu ${t}` }));
  await menu("A");
  await userEvent.click(
    screen.getByRole("menuitem", { name: "Move to this week's list" }),
  );
  expect(server.planTaskAction).toHaveBeenLastCalledWith({
    taskId: "A",
    plan: { type: "week", date: TODAY },
  });
  await menu("B");
  await userEvent.click(
    screen.getByRole("menuitem", { name: "Move to tomorrow" }),
  );
  expect(server.planTaskAction).toHaveBeenLastCalledWith({
    taskId: "B",
    plan: { type: "day", date: "2026-03-11" },
  });
  await menu("C");
  await userEvent.click(
    screen.getByRole("menuitem", { name: "Remove from plan" }),
  );
  expect(server.planTaskAction).toHaveBeenLastCalledWith({
    taskId: "C",
    plan: null,
  });
});

it("a repeating task has no plan menu", () => {
  setup({ work: [], spare: [item("Gym", { kind: "repeat" })] });
  expect(screen.queryByRole("button", { name: "Task menu Gym" })).toBeNull();
});

it("moves a task between sections with the keyboard", async () => {
  setup({
    work: [item("W", { section: "work" })],
    spare: [item("S")],
  });
  const handle = screen.getByRole("button", { name: "Move S" });
  handle.focus();
  await userEvent.keyboard(" ");
  await userEvent.keyboard("{ArrowUp}");
  await userEvent.keyboard(" ");
  await act(async () => {});
  expect(server.placeTaskAction).toHaveBeenCalledWith(
    expect.objectContaining({ taskId: "S", day: TODAY, section: "work" }),
  );
});

it("shows a target's progress with a log button", () => {
  setup({
    work: [],
    spare: [
      item("Read", { target: { amount: 400, unit: "pages", progress: 34 } }),
    ],
  });
  expect(screen.getByText("34 / 400 pages")).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Log progress on Read" }),
  ).toBeVisible();
});
