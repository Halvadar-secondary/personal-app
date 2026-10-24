import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import type { Recurrence } from "@/lib/recurrence";
import { TaskList } from "./task-list";
import type { TaskItem } from "./task-row";

const actions = vi.hoisted(() => ({
  completeTaskAction: vi.fn(),
  uncompleteTaskAction: vi.fn(),
}));
vi.mock("@/server/actions/tasks", () => actions);
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
  createdAt: new Date(0),
  updatedAt: new Date(0),
  deletedAt: null,
  categoryIds: [],
  recentDone: [],
  hasCompletions: false,
});

const TODAY = "2026-10-24"; // a Saturday
const daily: Recurrence = { freq: "daily", interval: 1, start: "2026-10-01" };

it("a task the server hasn't confirmed can't be edited yet", () => {
  render(
    <TaskList
      achievementId="a"
      tasks={[task("t1", "Saved"), task("draft-1", "Pending")]}
      categories={[]}
      today={TODAY}
      weekStart={1}
    />,
  );
  expect(
    screen.getByRole("button", { name: "Edit Task title" }),
  ).toHaveTextContent("Saved");
  expect(
    screen.getAllByRole("button", { name: "Edit Task title" }),
  ).toHaveLength(1);
  expect(screen.getByText("Pending")).toBeVisible();
});

it("ticking a repeating task marks today done at once and calls complete", async () => {
  // Never resolves: what shows is the optimistic state.
  actions.completeTaskAction.mockReturnValue(new Promise(() => {}));
  render(
    <TaskList
      achievementId="a"
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
      achievementId="a"
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
