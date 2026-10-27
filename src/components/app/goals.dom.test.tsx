import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GoalSummary } from "@/server/domain/goals";
import { deadlineText, GoalCard } from "./goal-card";
import { GoalChip } from "./goal-chip";
import { GoalLinkPicker } from "./goal-link-picker";
import { ReviewGoal } from "./review-sections";

const server = vi.hoisted(() => ({
  linkAchievementAction: vi.fn(),
  linkableAchievementsAction: vi.fn(),
  planTaskAction: vi.fn(),
}));
vi.mock("@/server/actions/goals", () => ({
  linkAchievementAction: (i: unknown) => server.linkAchievementAction(i),
  linkableAchievementsAction: (i: unknown) =>
    server.linkableAchievementsAction(i),
}));
vi.mock("@/server/actions/plan", () => ({
  planTaskAction: (i: unknown) => server.planTaskAction(i),
}));

const TODAY = "2026-03-10";

const goal = (over: Partial<GoalSummary> = {}): GoalSummary => ({
  id: "g1",
  ownerId: "o",
  title: "Write a song",
  notes: null,
  deadline: "2026-06-01",
  status: "active",
  completedAt: null,
  sortKey: "a0",
  createdAt: new Date(0),
  updatedAt: new Date(0),
  deletedAt: null,
  achievementCount: 5,
  achievementsDone: 2,
  taskCount: 40,
  tasksDone: 14,
  daysLeft: 83,
  ...over,
});

beforeEach(() => {
  for (const f of Object.values(server)) {
    f.mockReset();
    f.mockResolvedValue({ ok: true, data: undefined, batchId: "b" });
  }
});

describe("GoalCard", () => {
  it("shows the deadline, days left and progress, and links to the goal", () => {
    render(<GoalCard goal={goal()} />);
    const link = screen.getByRole("link", { name: /Write a song/ });
    expect(link).toHaveAttribute("href", "/goals/g1");
    expect(link).toHaveTextContent("Due Jun 1 · 83 days left");
    expect(link).toHaveTextContent("2/5 achievements · 14/40 tasks");
  });

  it("words overdue, due today and no deadline", () => {
    expect(deadlineText(goal({ deadline: "2026-03-07", daysLeft: -3 }))).toBe(
      "Due Mar 7 · overdue by 3 days",
    );
    expect(deadlineText(goal({ deadline: TODAY, daysLeft: 0 }))).toBe(
      "Due Mar 10 · today",
    );
    expect(deadlineText(goal({ deadline: "2026-03-11", daysLeft: 1 }))).toBe(
      "Due Mar 11 · 1 day left",
    );
    expect(deadlineText(goal({ deadline: null, daysLeft: null }))).toBe(
      "No deadline",
    );
  });
});

it("GoalLinkPicker links a chosen achievement from any area", async () => {
  server.linkableAchievementsAction.mockResolvedValue([
    {
      id: "a1",
      title: "Arpeggios",
      area: { id: "g", name: "Guitar", emoji: "🎸" },
      goalTitle: null,
    },
    {
      id: "a2",
      title: "Lyrics",
      area: { id: "m", name: "Music", emoji: null },
      goalTitle: "Other goal",
    },
  ]);
  render(<GoalLinkPicker goalId="g1" />);
  await userEvent.click(
    screen.getByRole("button", { name: "Link achievement" }),
  );
  await waitFor(() => expect(screen.getByText("Arpeggios")).toBeVisible());
  expect(screen.getByText("in Other goal")).toBeVisible();
  await userEvent.click(screen.getByText("Arpeggios"));
  expect(server.linkAchievementAction).toHaveBeenCalledWith({
    achievementId: "a1",
    goalId: "g1",
  });
});

it("GoalChip moves an achievement to another goal, or off goals", async () => {
  const goals = [
    { id: "g1", title: "Write a song" },
    { id: "g2", title: "Ask her out" },
  ];
  render(<GoalChip achievementId="a1" goalId="g1" goals={goals} />);
  const chip = screen.getByRole("button", { name: "Goal: Write a song" });
  await userEvent.click(chip);
  await userEvent.click(
    screen.getByRole("menuitemradio", { name: "Ask her out" }),
  );
  expect(server.linkAchievementAction).toHaveBeenLastCalledWith({
    achievementId: "a1",
    goalId: "g2",
  });
});

it("ReviewGoal adds a task to the week or to one of its days", async () => {
  render(
    <ReviewGoal
      start="2026-03-16"
      goal={goal()}
      tasks={[
        {
          id: "t1",
          title: "Chorus",
          achievementTitle: "Lyrics",
          plannedOn: null,
          plannedWeek: null,
        },
        {
          id: "t2",
          title: "Verse",
          achievementTitle: "Lyrics",
          plannedOn: "2026-03-18",
          plannedWeek: null,
        },
      ]}
    />,
  );
  expect(screen.getByRole("region", { name: "Write a song" })).toBeVisible();
  await userEvent.click(
    screen.getByRole("button", { name: "Add Chorus to this week" }),
  );
  expect(server.planTaskAction).toHaveBeenLastCalledWith({
    taskId: "t1",
    plan: { type: "week", date: "2026-03-16" },
  });
  await userEvent.click(
    screen.getByRole("button", { name: "Pick a day for Chorus" }),
  );
  await userEvent.click(screen.getByRole("menuitem", { name: "Thu Mar 19" }));
  expect(server.planTaskAction).toHaveBeenLastCalledWith({
    taskId: "t1",
    plan: { type: "day", date: "2026-03-19" },
  });
  // Already planned: says where, instead of the buttons.
  expect(screen.getByText("Wed Mar 18")).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "Add Verse to this week" }),
  ).toBeNull();
});
