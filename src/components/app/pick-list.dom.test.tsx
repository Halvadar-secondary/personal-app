import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import type { PlanOptions } from "@/server/domain/plan";
import { PickList } from "./pick-list";

const server = vi.hoisted(() => ({ planTaskAction: vi.fn() }));
vi.mock("@/server/actions/plan", () => ({
  planTaskAction: (i: unknown) => server.planTaskAction(i),
}));

const OPTIONS: PlanOptions = {
  week: [
    {
      id: "w1",
      title: "Call grandma",
      done: false,
      rolledLabel: "from last week",
      achievement: null,
      area: null,
    },
  ],
  achievements: [
    {
      area: { id: "g", name: "Guitar", emoji: "🎸" },
      achievement: { id: "a", title: "Arpeggios" },
      tasks: [
        {
          id: "t1",
          title: "Seventh chords",
          plannedOn: null,
          plannedWeek: null,
        },
        {
          id: "t2",
          title: "Sweeps",
          plannedOn: "2026-03-12",
          plannedWeek: null,
        },
      ],
    },
  ],
};

beforeEach(() => {
  server.planTaskAction.mockReset();
  server.planTaskAction.mockResolvedValue({
    ok: true,
    data: undefined,
    batchId: "b",
  });
});

it("adds a week task to Work, and an achievement's task to Spare time", async () => {
  render(<PickList day="2026-03-11" options={OPTIONS} />);
  expect(screen.getByText("from last week")).toBeVisible();
  await userEvent.click(
    screen.getByRole("button", { name: "Add Call grandma to Work" }),
  );
  expect(server.planTaskAction).toHaveBeenCalledWith({
    taskId: "w1",
    plan: { type: "day", date: "2026-03-11", section: "work" },
  });
  // Achievements start collapsed.
  const group = screen.getByText("🎸 Guitar · Arpeggios");
  expect(group.closest("details")).not.toHaveAttribute("open");
  await userEvent.click(group);
  expect(group.closest("details")).toHaveAttribute("open");
  expect(screen.getByText("Thu Mar 12")).toBeVisible();
  await userEvent.click(
    screen.getByRole("button", { name: "Add Seventh chords to Spare time" }),
  );
  expect(server.planTaskAction).toHaveBeenLastCalledWith({
    taskId: "t1",
    plan: { type: "day", date: "2026-03-11", section: "spare" },
  });
});

it("says when there is nothing to pick", () => {
  render(
    <PickList day="2026-03-11" options={{ week: [], achievements: [] }} />,
  );
  expect(screen.getByText(/Nothing to pick/)).toBeVisible();
});
