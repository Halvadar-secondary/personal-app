import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import type { AchievementCard } from "@/server/domain/views";
import { AreaBoard } from "./area-board";

const moveAchievementAction = vi.fn();
vi.mock("@/server/actions/achievements", () => ({
  moveAchievementAction: (i: unknown) => moveAchievementAction(i),
  createAchievementAction: vi.fn(),
  deleteAchievementAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const STATUSES = ["backlog", "active", "done"];

// jsdom has no layout. Lay columns out left to right and cards top to
// bottom, so dnd-kit's keyboard sensor can find its neighbours.
const original = Element.prototype.getBoundingClientRect;
beforeAll(() => {
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const col = this.closest("[data-column]");
    if (!col) return original.call(this);
    const x = STATUSES.indexOf(col.getAttribute("data-column")!) * 300;
    const card = this.closest("[data-card]");
    const index = card
      ? [...col.querySelectorAll("[data-card]")].indexOf(card)
      : -1;
    const [y, height] = card ? [100 + index * 60, 50] : [0, 600];
    return DOMRect.fromRect({ x, y, width: 280, height });
  };
});
afterAll(() => {
  Element.prototype.getBoundingClientRect = original;
});

const card = (
  id: string,
  status: AchievementCard["status"],
  title = id,
): AchievementCard => ({
  id,
  status,
  title,
  ownerId: "o",
  areaId: "area",
  notes: null,
  deadline: null,
  completedAt: null,
  sortKey: id,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  deletedAt: null,
  taskCount: 0,
  doneCount: 0,
  categoryIds: [],
});

beforeEach(() => {
  moveAchievementAction.mockReset();
  moveAchievementAction.mockResolvedValue({
    ok: true,
    data: undefined,
    batchId: "b",
  });
});

it("keyboard-drags a card from Backlog onto the Active card beside it", async () => {
  render(
    <AreaBoard
      areaId="area"
      achievements={[
        card("x", "backlog", "Sweep picking"),
        card("y", "backlog"),
        card("p", "active"),
      ]}
      categories={[]}
    />,
  );
  const board = screen.getByRole("region", { name: "Board" });
  const handle = within(board).getByRole("button", {
    name: "Move Sweep picking",
  });
  handle.focus();
  await userEvent.keyboard(" ");
  await userEvent.keyboard("{ArrowRight}");
  await userEvent.keyboard(" ");
  await act(async () => {});
  expect(moveAchievementAction).toHaveBeenCalledWith({
    achievementId: "x",
    status: "active",
    afterId: null,
    beforeId: "p",
  });
});

it("sends nothing when a card is dropped where it was", async () => {
  render(
    <AreaBoard
      areaId="area"
      achievements={[card("x", "backlog", "Sweep picking")]}
      categories={[]}
    />,
  );
  const handle = within(
    screen.getByRole("region", { name: "Board" }),
  ).getByRole("button", { name: "Move Sweep picking" });
  handle.focus();
  await userEvent.keyboard(" ");
  await userEvent.keyboard(" ");
  await act(async () => {});
  expect(moveAchievementAction).not.toHaveBeenCalled();
});

it("leaves an unconfirmed card out of the move position", async () => {
  render(
    <AreaBoard
      areaId="area"
      achievements={[
        card("x", "backlog", "Sweep picking"),
        card("p", "active"),
        card("draft-1", "active"),
      ]}
      categories={[]}
    />,
  );
  const list = screen.getByRole("region", { name: "List" });
  await userEvent.click(
    within(list).getByRole("button", { name: "Move to… Sweep picking" }),
  );
  await userEvent.click(screen.getByRole("menuitem", { name: "Active" }));
  await act(async () => {});
  expect(moveAchievementAction).toHaveBeenCalledWith({
    achievementId: "x",
    status: "active",
    afterId: "p",
    beforeId: null,
  });
});

it("the drag handle is its own button, not a wrapper around the link", () => {
  render(
    <AreaBoard
      areaId="area"
      achievements={[card("x", "backlog", "Sweep picking")]}
      categories={[]}
    />,
  );
  const board = screen.getByRole("region", { name: "Board" });
  const handle = within(board).getByRole("button", {
    name: "Move Sweep picking",
  });
  // A button wrapping a link is nested-interactive (axe, WCAG 4.1.2).
  expect(within(handle).queryByRole("link")).toBeNull();
  expect(
    within(board).getByRole("link", { name: "Sweep picking" }),
  ).toBeInTheDocument();
});

it("screen readers hear the card's title, not its id", async () => {
  render(
    <AreaBoard
      areaId="area"
      achievements={[card("x", "backlog", "Sweep picking")]}
      categories={[]}
    />,
  );
  within(screen.getByRole("region", { name: "Board" }))
    .getByRole("button", { name: "Move Sweep picking" })
    .focus();
  await userEvent.keyboard(" ");
  // dnd-kit's live region: it names the card, never its id.
  const live = document.querySelector('[id^="DndLiveRegion"]');
  await waitFor(() => expect(live).toHaveTextContent(/Sweep picking/));
  expect(live).not.toHaveTextContent(/x/);
  await userEvent.keyboard("{Escape}");
});
