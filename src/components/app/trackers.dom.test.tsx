import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import type { TrackerSummary } from "@/server/domain/trackers";
import { TrackerCard } from "./tracker-card";
import { NewTracker } from "./tracker-manage";

const server = vi.hoisted(() => ({
  createTrackerAction: vi.fn(),
  updateTrackerAction: vi.fn(),
  moveTrackerAction: vi.fn(),
  deleteTrackerAction: vi.fn(),
  deleteMomentAction: vi.fn(),
  momentsAction: vi.fn(),
  undoAction: vi.fn(),
}));
vi.mock("@/server/actions/trackers", () => ({
  createTrackerAction: (i: unknown) => server.createTrackerAction(i),
  updateTrackerAction: (i: unknown) => server.updateTrackerAction(i),
  moveTrackerAction: (i: unknown) => server.moveTrackerAction(i),
  deleteTrackerAction: (i: unknown) => server.deleteTrackerAction(i),
  deleteMomentAction: (i: unknown) => server.deleteMomentAction(i),
  momentsAction: (i: unknown) => server.momentsAction(i),
}));
vi.mock("@/server/actions/history", () => ({
  undoAction: (i: unknown) => server.undoAction(i),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const CLOCK = {
  timeZone: "UTC",
  weekStart: 1,
  now: new Date("2026-03-11T12:00:00Z"),
};

const tracker = (over: Partial<TrackerSummary> = {}): TrackerSummary => ({
  id: "t1",
  ownerId: "o",
  name: "Anger",
  emoji: "😠",
  direction: "less",
  archivedAt: null,
  sortKey: "a0",
  createdAt: new Date(0),
  updatedAt: new Date(0),
  deletedAt: null,
  today: 1,
  thisWeek: 2,
  lastWeek: 5,
  avgIntensity: 2.5,
  weeks: Array.from({ length: 8 }, (_, i) => ({
    start: `2026-01-${String(19 + i).padStart(2, "0")}`,
    count: i,
  })),
  ...over,
});

const moment = (id: string, note: string | null) => ({
  id,
  ownerId: "o",
  trackerId: "t1",
  at: new Date("2026-03-10T18:30:00"),
  intensity: 3,
  note,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  deletedAt: null,
});

beforeEach(() => {
  for (const f of Object.values(server)) {
    f.mockReset();
    f.mockResolvedValue({ ok: true, data: { id: "x" }, batchId: "b" });
  }
});

it("shows this week so far, a kind trend, intensity and eight weekly bars", () => {
  render(<TrackerCard clock={CLOCK} tracker={tracker()} moments={[]} />);
  const card = within(screen.getByRole("region", { name: "😠 Anger" }));
  expect(card.getByText("This week so far: 2")).toBeVisible();
  const trend = card.getByText("3 fewer than last week");
  expect(trend).toHaveAttribute("data-good", "true");
  expect(card.getByText("Avg intensity 2.5")).toBeVisible();
  const bars = within(card.getByRole("list", { name: "Last 8 weeks" }));
  expect(bars.getAllByRole("listitem")).toHaveLength(8);
  expect(bars.getByLabelText("Week of Jan 26: 7")).toBeInTheDocument();
});

it("a trend the wrong way is neutral, not alarming", () => {
  render(
    <TrackerCard
      clock={CLOCK}
      tracker={tracker({ thisWeek: 6, lastWeek: 1 })}
      moments={[]}
    />,
  );
  expect(screen.getByText("5 more than last week")).toHaveAttribute(
    "data-good",
    "false",
  );
});

it("lists moments and deletes one with Undo", async () => {
  render(
    <TrackerCard
      clock={CLOCK}
      tracker={tracker()}
      moments={[moment("m1", "traffic"), moment("m2", null)]}
    />,
  );
  expect(screen.getByText("traffic")).toBeVisible();
  await userEvent.click(
    screen.getAllByRole("button", { name: "Delete moment" })[0]!,
  );
  expect(server.deleteMomentAction).toHaveBeenCalledWith({ momentId: "m1" });
});

it("loads more moments from before the last one", async () => {
  server.momentsAction.mockResolvedValue([moment("m3", "older")]);
  const many = Array.from({ length: 20 }, (_, i) => moment(`m${i}`, null));
  render(<TrackerCard clock={CLOCK} tracker={tracker()} moments={many} />);
  await userEvent.click(screen.getByRole("button", { name: "Show more" }));
  expect(server.momentsAction).toHaveBeenCalledWith({
    trackerId: "t1",
    before: many[19]!.at.toISOString(),
  });
  expect(await screen.findByText("older")).toBeVisible();
});

it("the menu archives a tracker", async () => {
  render(<TrackerCard clock={CLOCK} tracker={tracker()} moments={[]} />);
  await userEvent.click(
    screen.getByRole("button", { name: "Tracker menu Anger" }),
  );
  await userEvent.click(screen.getByRole("menuitem", { name: "Archive" }));
  expect(server.updateTrackerAction).toHaveBeenCalledWith({
    trackerId: "t1",
    archived: true,
  });
});

it("starters create common trackers in one tap; the form makes any", async () => {
  render(<NewTracker starters />);
  await userEvent.click(screen.getByRole("button", { name: "💛 Kindness" }));
  expect(server.createTrackerAction).toHaveBeenCalledWith({
    name: "Kindness",
    emoji: "💛",
    direction: "more",
  });
  await userEvent.click(screen.getByRole("button", { name: "New tracker" }));
  await userEvent.type(screen.getByLabelText("Name"), "Doomscrolling");
  await userEvent.click(screen.getByRole("radio", { name: "Fewer is better" }));
  await userEvent.click(screen.getByRole("button", { name: "Add tracker" }));
  expect(server.createTrackerAction).toHaveBeenLastCalledWith({
    name: "Doomscrolling",
    emoji: null,
    direction: "less",
  });
});

it("an active tracker logs with details from its card; an archived one can't", () => {
  const { unmount } = render(
    <TrackerCard clock={CLOCK} tracker={tracker()} moments={[]} />,
  );
  expect(
    screen.getByRole("button", { name: "Log with details for Anger" }),
  ).toBeVisible();
  expect(screen.getByText("Today: 1")).toBeVisible();
  unmount();
  render(
    <TrackerCard
      clock={CLOCK}
      tracker={tracker({ archivedAt: new Date(0) })}
      moments={[]}
    />,
  );
  expect(
    screen.queryByRole("button", { name: "Log with details for Anger" }),
  ).toBeNull();
});
