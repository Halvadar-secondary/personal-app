import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import type { Recurrence } from "@/lib/recurrence";
import { CaptureProvider, useCapture } from "./capture-context";
import { TaskList } from "./task-list";
import type { TaskItem } from "./task-row";

const actions = vi.hoisted(() => ({
  completeTaskAction: vi.fn(),
  uncompleteTaskAction: vi.fn(),
  updateTaskAction: vi.fn(),
}));
vi.mock("@/server/actions/tasks", () => actions);
const plan = vi.hoisted(() => ({
  planTaskAction: vi.fn(),
  logProgressAction: vi.fn(),
}));
vi.mock("@/server/actions/plan", () => plan);
vi.mock("@/server/actions/categories", () => ({}));

const task = (id: string, title: string): TaskItem => ({
  id,
  title,
  ownerId: "o",
  achievementId: "a",
  areaId: null,
  notes: null,
  effort: 2,
  deadline: null,
  recurrence: null,
  completedAt: null,
  sortKey: id,
  plannedOn: null,
  plannedWeek: null,
  planSection: null,
  planSortKey: null,
  targetAmount: null,
  targetUnit: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  deletedAt: null,
  categoryIds: [],
  recentDone: [],
  hasCompletions: false,
  progress: null,
});

const TODAY = "2026-10-24"; // a Saturday
const daily: Recurrence = { freq: "daily", interval: 1, start: "2026-10-01" };

it("a task the server hasn't confirmed can't be edited yet", () => {
  render(
    <TaskList
      tasks={[task("t1", "Saved"), task("draft-1", "Pending")]}
      categories={[]}
      today={TODAY}
      weekStart={1}
    />,
  );
  expect(
    screen.getByRole("button", { name: /Edit Task title/ }),
  ).toHaveTextContent("Saved");
  expect(
    screen.getAllByRole("button", { name: /Edit Task title/ }),
  ).toHaveLength(1);
  expect(screen.getByText("Pending")).toBeVisible();
});

it("ticking a repeating task marks today done at once and calls complete", async () => {
  // Never resolves: what shows is the optimistic state.
  actions.completeTaskAction.mockReturnValue(new Promise(() => {}));
  render(
    <TaskList
      tasks={[{ ...task("t1", "Scales"), recurrence: daily }]}
      categories={[]}
      today={TODAY}
      weekStart={1}
    />,
  );
  expect(screen.getByTitle("Oct 24: due")).toBeInTheDocument();
  await userEvent.click(
    screen.getByRole("checkbox", { name: "Complete Scales for today" }),
  );
  expect(await screen.findByTitle("Oct 24: done")).toBeInTheDocument();
  expect(actions.completeTaskAction).toHaveBeenCalledWith({ taskId: "t1" });
});

it("a repeating task not due today can't be ticked", () => {
  render(
    <TaskList
      tasks={[
        {
          ...task("t1", "Mondays"),
          recurrence: { ...daily, freq: "weekly", byWeekday: [1] },
        },
      ]}
      categories={[]}
      today={TODAY}
      weekStart={1}
    />,
  );
  expect(
    screen.getByRole("checkbox", { name: "Complete Mondays for today" }),
  ).toBeDisabled();
});

it("Add task opens the create dialog as a task", async () => {
  function Probe() {
    const c = useCapture();
    return (
      <output aria-label="capture">{JSON.stringify([c.open, c.preset])}</output>
    );
  }
  render(
    <CaptureProvider>
      <TaskList tasks={[]} categories={[]} today={TODAY} weekStart={1} />
      <Probe />
    </CaptureProvider>,
  );
  expect(screen.queryByRole("textbox", { name: "Add task" })).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Add task" }));
  expect(screen.getByLabelText("capture")).toHaveTextContent(
    JSON.stringify([true, { kind: "task" }]),
  );
});

it("a one-off task's When chip plans it", async () => {
  plan.planTaskAction.mockResolvedValue({ ok: true, batchId: "b" });
  render(
    <TaskList
      tasks={[task("t1", "Dentist")]}
      categories={[]}
      today={TODAY}
      weekStart={1}
    />,
  );
  await userEvent.click(screen.getByRole("button", { name: "When: none" }));
  await userEvent.click(screen.getByRole("menuitem", { name: "Tomorrow" }));
  expect(plan.planTaskAction).toHaveBeenCalledWith({
    taskId: "t1",
    plan: { type: "day", date: "2026-10-25" },
  });
});

it("a repeating task has no When or Target chip", () => {
  render(
    <TaskList
      tasks={[{ ...task("t1", "Scales"), recurrence: daily }]}
      categories={[]}
      today={TODAY}
      weekStart={1}
    />,
  );
  expect(screen.queryByRole("button", { name: /^When/ })).toBeNull();
  expect(screen.queryByRole("button", { name: /^Target/ })).toBeNull();
});

it("a target task shows its progress", () => {
  render(
    <TaskList
      tasks={[
        {
          ...task("t1", "Read"),
          targetAmount: 400,
          targetUnit: "pages",
          progress: 34,
        },
      ]}
      categories={[]}
      today={TODAY}
      weekStart={1}
    />,
  );
  expect(screen.getByText("34 / 400 pages")).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Target: 400 pages" }),
  ).toBeVisible();
});

it("a task's notes show under it, with web links you can tap", () => {
  render(
    <TaskList
      tasks={[
        {
          ...task("t1", "Learn Wonderwall"),
          notes: "Capo 2. Tab: https://tabs.example.com/wonderwall",
        },
      ]}
      categories={[]}
      today={TODAY}
      weekStart={1}
    />,
  );
  expect(screen.getByText(/Capo 2\. Tab:/)).toBeVisible();
  const link = screen.getByRole("link", {
    name: "https://tabs.example.com/wonderwall",
  });
  expect(link).toHaveAttribute("href", "https://tabs.example.com/wonderwall");
  // Opens outside the app, without handing it this page.
  expect(link).toHaveAttribute("target", "_blank");
  expect(link).toHaveAttribute("rel", "noopener noreferrer");
});

it("notes are added from the task's menu and saved", async () => {
  actions.updateTaskAction.mockResolvedValue({
    ok: true,
    data: undefined,
    batchId: "b",
  });
  render(
    <TaskList
      tasks={[task("t1", "Learn Wonderwall")]}
      categories={[]}
      today={TODAY}
      weekStart={1}
    />,
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Task menu Learn Wonderwall" }),
  );
  await userEvent.click(screen.getByRole("menuitem", { name: "Add notes" }));
  const box = screen.getByRole("textbox", { name: "Notes" });
  await userEvent.type(box, "Song: https://youtu.be/x");
  await userEvent.click(screen.getByRole("button", { name: "Save notes" }));
  expect(actions.updateTaskAction).toHaveBeenCalledWith({
    taskId: "t1",
    notes: "Song: https://youtu.be/x",
  });
  expect(
    screen.getByRole("link", { name: "https://youtu.be/x" }),
  ).toBeVisible();
});

it("existing notes are edited in place, and clearing them removes them", async () => {
  actions.updateTaskAction.mockResolvedValue({
    ok: true,
    data: undefined,
    batchId: "b",
  });
  render(
    <TaskList
      tasks={[{ ...task("t1", "Learn Wonderwall"), notes: "Capo 2" }]}
      categories={[]}
      today={TODAY}
      weekStart={1}
    />,
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Edit notes for Learn Wonderwall" }),
  );
  const box = screen.getByRole("textbox", { name: "Notes" });
  expect(box).toHaveValue("Capo 2");
  await userEvent.clear(box);
  await userEvent.click(screen.getByRole("button", { name: "Save notes" }));
  expect(actions.updateTaskAction).toHaveBeenCalledWith({
    taskId: "t1",
    notes: null,
  });
  expect(screen.queryByText("Capo 2")).toBeNull();
});
