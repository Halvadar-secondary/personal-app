import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { TaskList } from "./task-list";
import type { TaskItem } from "./task-row";

vi.mock("@/server/actions/tasks", () => ({}));
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
});

it("a task the server hasn't confirmed can't be edited yet", () => {
  render(
    <TaskList
      achievementId="a"
      tasks={[task("t1", "Saved"), task("draft-1", "Pending")]}
      categories={[]}
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
