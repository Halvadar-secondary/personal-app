import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import type { HistoryBatch } from "@/server/domain/history-view";
import { HistoryList } from "./history-list";

const actions = vi.hoisted(() => ({ undoAction: vi.fn() }));
vi.mock("@/server/actions/history", () => actions);

const batch = (over: Partial<HistoryBatch> = {}): HistoryBatch => ({
  batchId: "b1",
  actor: "ui",
  who: "You",
  when: "just now",
  summary: "Created area “Guitar”",
  undone: false,
  ...over,
});

beforeEach(() => {
  actions.undoAction.mockReset();
});

it("undo sends the batch once and says who and when", async () => {
  // Pending: a second click lands while the first is in flight.
  actions.undoAction.mockReturnValue(new Promise(() => {}));
  render(<HistoryList batches={[batch()]} />);
  expect(screen.getByText("Created area “Guitar”")).toBeInTheDocument();
  expect(screen.getByText("You · just now")).toBeInTheDocument();
  const undo = screen.getByRole("button", { name: "Undo" });
  await userEvent.click(undo);
  await userEvent.click(undo);
  expect(actions.undoAction).toHaveBeenCalledTimes(1);
  expect(actions.undoAction).toHaveBeenCalledWith({ batchId: "b1" });
});

it("an undone batch shows the tag, not the button", () => {
  render(<HistoryList batches={[batch({ undone: true })]} />);
  expect(screen.getByText("Undone")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
});
