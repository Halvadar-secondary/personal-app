import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import type { DayItem } from "@/server/domain/plan";
import { CaptureProvider } from "./capture-context";
import { type Week, WeekView } from "./week-view";

const server = vi.hoisted(() => ({
  planTaskAction: vi.fn(),
  completeTaskAction: vi.fn(),
  uncompleteTaskAction: vi.fn(),
}));
vi.mock("@/server/actions/plan", () => ({
  planTaskAction: (i: unknown) => server.planTaskAction(i),
}));
vi.mock("@/server/actions/tasks", () => ({
  completeTaskAction: (i: unknown) => server.completeTaskAction(i),
  uncompleteTaskAction: (i: unknown) => server.uncompleteTaskAction(i),
}));

const item = (id: string, over: Partial<DayItem> = {}): DayItem => ({
  id,
  title: id,
  kind: "once",
  section: "spare",
  key: null,
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

const START = "2026-03-09";
const days = Array.from({ length: 7 }, (_, i) => ({
  day: `2026-03-${String(9 + i).padStart(2, "0")}`,
  sections: { work: [] as DayItem[], spare: [] as DayItem[] },
}));
days[3]!.sections.spare = [item("Thu thing")];
days[1]!.sections.work = [item("Gym", { kind: "repeat", section: "work" })];

const WEEK: Week = {
  start: START,
  end: "2026-03-15",
  today: "2026-03-10",
  days,
  list: [
    {
      id: "w1",
      title: "Dentist",
      done: false,
      rolledLabel: "from last week",
      achievement: null,
      area: null,
    },
  ],
};

beforeEach(() => {
  for (const f of Object.values(server)) {
    f.mockReset();
    f.mockResolvedValue({ ok: true, data: undefined, batchId: "b" });
  }
});

function setup() {
  render(
    <CaptureProvider>
      <WeekView week={WEEK} />
    </CaptureProvider>,
  );
}

it("shows seven days, each with its plan and a link to plan it", () => {
  setup();
  const labels = screen
    .getAllByRole("region")
    .map((r) => r.getAttribute("aria-label"));
  expect(labels).toEqual([
    "Mon Mar 9",
    "Tue Mar 10",
    "Wed Mar 11",
    "Thu Mar 12",
    "Fri Mar 13",
    "Sat Mar 14",
    "Sun Mar 15",
    "This week's list",
  ]);
  const thu = within(screen.getByRole("region", { name: "Thu Mar 12" }));
  expect(thu.getByText("Thu thing")).toBeVisible();
  expect(thu.getByRole("link", { name: "Plan Thu Mar 12" })).toHaveAttribute(
    "href",
    "/plan?day=2026-03-12",
  );
  // Today is marked.
  expect(screen.getByRole("region", { name: "Tue Mar 10" })).toHaveAttribute(
    "aria-current",
    "date",
  );
});

it("only today's repeating tasks can be ticked", () => {
  setup();
  const tue = within(screen.getByRole("region", { name: "Tue Mar 10" }));
  expect(tue.getByRole("checkbox", { name: "Complete Gym" })).toBeEnabled();
});

it("gives a week task a day", async () => {
  setup();
  const list = within(screen.getByRole("region", { name: "This week's list" }));
  expect(list.getByText("from last week")).toBeVisible();
  await userEvent.click(
    list.getByRole("button", { name: "Give Dentist a day" }),
  );
  await userEvent.click(screen.getByRole("menuitem", { name: "Thu Mar 12" }));
  expect(server.planTaskAction).toHaveBeenCalledWith({
    taskId: "w1",
    plan: { type: "day", date: "2026-03-12" },
  });
});
