import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { LogMomentButton } from "./log-moment-dialog";

const server = vi.hoisted(() => ({
  logMomentAction: vi.fn(),
  undoAction: vi.fn(),
  toast: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@/server/actions/trackers", () => ({
  logMomentAction: (i: unknown) => server.logMomentAction(i),
}));
vi.mock("@/server/actions/history", () => ({
  undoAction: (i: unknown) => server.undoAction(i),
}));
vi.mock("sonner", () => ({
  toast: Object.assign((...a: unknown[]) => server.toast(...a), {
    error: (...a: unknown[]) => server.error(...a),
    success: vi.fn(),
  }),
}));

const anger = { id: "t-anger", name: "Anger", emoji: "😠" };

beforeEach(() => {
  vi.clearAllMocks();
  server.logMomentAction.mockResolvedValue({
    ok: true,
    data: { id: "m1" },
    batchId: "b9",
  });
});

async function openIt() {
  render(<LogMomentButton tracker={anger} />);
  await userEvent.click(
    screen.getByRole("button", { name: "Log with details for Anger" }),
  );
  return screen.getByRole("dialog", { name: "Log 😠 Anger" });
}

it("logs with intensity and a note, then toasts with Undo", async () => {
  const dialog = await openIt();
  await userEvent.click(screen.getByRole("button", { name: "Intensity 3" }));
  const note = screen.getByRole("textbox", { name: "Note" });
  expect(note).toHaveAttribute("placeholder", "What was happening?");
  await userEvent.type(note, "traffic");
  await userEvent.click(screen.getByRole("button", { name: "Log moment" }));
  expect(server.logMomentAction).toHaveBeenCalledWith({
    trackerId: "t-anger",
    intensity: 3,
    note: "traffic",
  });
  await waitFor(() => expect(dialog).not.toBeInTheDocument());
  expect(server.toast).toHaveBeenCalledWith(
    "Logged Anger",
    expect.objectContaining({
      action: expect.objectContaining({ label: "Undo" }),
    }),
  );
});

it("taps the chosen intensity again to clear it", async () => {
  await openIt();
  const three = screen.getByRole("button", { name: "Intensity 3" });
  await userEvent.click(three);
  expect(three).toHaveAttribute("aria-pressed", "true");
  await userEvent.click(three);
  expect(three).toHaveAttribute("aria-pressed", "false");
  await userEvent.click(screen.getByRole("button", { name: "Log moment" }));
  expect(server.logMomentAction).toHaveBeenCalledWith({ trackerId: "t-anger" });
});

it("logs an earlier time", async () => {
  await openIt();
  await userEvent.click(screen.getByRole("button", { name: "When: Now" }));
  await userEvent.type(
    screen.getByLabelText("When it happened"),
    "2026-10-24T08:15",
  );
  await userEvent.click(screen.getByRole("button", { name: "Log moment" }));
  const sent = server.logMomentAction.mock.calls[0]![0] as { at: string };
  expect(new Date(sent.at).getTime()).toBe(
    new Date("2026-10-24T08:15").getTime(),
  );
});

it("stays open and says why when logging fails", async () => {
  server.logMomentAction.mockResolvedValue({
    ok: false,
    message: "That tracker is archived.",
  });
  const dialog = await openIt();
  await userEvent.click(screen.getByRole("button", { name: "Log moment" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "That tracker is archived.",
  );
  expect(dialog).toBeVisible();
});
