import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QuickLog } from "./quick-log";

const server = vi.hoisted(() => ({
  logMomentAction: vi.fn(),
  noteMomentAction: vi.fn(),
  undoAction: vi.fn(),
  toast: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@/server/actions/trackers", () => ({
  logMomentAction: (i: unknown) => server.logMomentAction(i),
  noteMomentAction: (i: unknown) => server.noteMomentAction(i),
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

const TRACKERS = [
  { id: "t-anger", name: "Anger", emoji: "😠", today: 3 },
  { id: "t-kind", name: "Kindness", emoji: null, today: 0 },
];

type ToastOpts = {
  action: { label: string; onClick: () => void };
  cancel: { label: string; onClick: () => void };
};
const lastToast = () => server.toast.mock.calls.at(-1) as [string, ToastOpts];

describe("QuickLog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    server.logMomentAction.mockResolvedValue({
      ok: true,
      data: { id: "m1" },
      batchId: "b1",
    });
    server.noteMomentAction.mockResolvedValue({
      ok: true,
      data: {},
      batchId: "b2",
    });
    server.undoAction.mockResolvedValue({ ok: true, data: {}, batchId: "u" });
  });

  it("renders nothing without trackers", () => {
    const { container } = render(<QuickLog trackers={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows one button per tracker with today's count", () => {
    render(<QuickLog trackers={TRACKERS} />);
    const anger = screen.getByRole("button", {
      name: /^Log 😠 Anger \d+ today$/,
    });
    expect(anger).toHaveTextContent("😠 Anger");
    expect(anger).toHaveTextContent("3");
    expect(
      screen.getByRole("button", { name: "Log Kindness 0 today" }),
    ).toBeVisible();
  });

  it("logs a moment with one tap, no score, and offers Undo", async () => {
    render(<QuickLog trackers={TRACKERS} />);
    await userEvent.click(
      screen.getByRole("button", { name: /^Log 😠 Anger \d+ today$/ }),
    );
    expect(server.logMomentAction).toHaveBeenCalledWith({
      trackerId: "t-anger",
    });
    const [msg, opts] = lastToast();
    expect(msg).toBe("Logged Anger");
    expect(opts.action.label).toBe("Undo");
    opts.action.onClick();
    expect(server.undoAction).toHaveBeenCalledWith({ batchId: "b1" });
  });

  it("counts the tap at once, and takes it back if the log fails", async () => {
    render(<QuickLog trackers={TRACKERS} />);
    const anger = screen.getByRole("button", {
      name: /^Log 😠 Anger \d+ today$/,
    });
    await userEvent.click(anger);
    expect(anger).toHaveTextContent("4");
    server.logMomentAction.mockResolvedValueOnce({ ok: false, message: "No." });
    await userEvent.click(anger);
    expect(anger).toHaveTextContent("4");
  });

  it("logs again on every tap", async () => {
    render(<QuickLog trackers={TRACKERS} />);
    const anger = screen.getByRole("button", {
      name: /^Log 😠 Anger \d+ today$/,
    });
    await userEvent.click(anger);
    await userEvent.click(anger);
    expect(server.logMomentAction).toHaveBeenCalledTimes(2);
  });

  it("adds a note to the logged moment from the toast", async () => {
    render(<QuickLog trackers={TRACKERS} />);
    await userEvent.click(
      screen.getByRole("button", { name: /^Log 😠 Anger \d+ today$/ }),
    );
    const [, opts] = lastToast();
    expect(opts.cancel.label).toBe("Add note");
    opts.cancel.onClick();
    const dialog = await screen.findByRole("dialog", {
      name: "Note for Anger",
    });
    const box = screen.getByRole("textbox", { name: "Note" });
    expect(box).toHaveAttribute("placeholder", "What was happening?");
    await userEvent.type(box, "tired, the client email");
    await userEvent.click(screen.getByRole("button", { name: "Save note" }));
    expect(server.noteMomentAction).toHaveBeenCalledWith({
      momentId: "m1",
      note: "tired, the client email",
    });
    expect(dialog).not.toBeInTheDocument();
  });

  it("keeps the note open and says why when saving it fails", async () => {
    server.noteMomentAction.mockResolvedValue({
      ok: false,
      message: "That moment is gone.",
    });
    render(<QuickLog trackers={TRACKERS} />);
    await userEvent.click(
      screen.getByRole("button", { name: /^Log 😠 Anger \d+ today$/ }),
    );
    lastToast()[1].cancel.onClick();
    await userEvent.type(
      await screen.findByRole("textbox", { name: "Note" }),
      "x",
    );
    await userEvent.click(screen.getByRole("button", { name: "Save note" }));
    expect(server.error).toHaveBeenCalledWith("That moment is gone.");
    expect(
      screen.getByRole("dialog", { name: "Note for Anger" }),
    ).toBeVisible();
  });

  it("reports a refused log and a thrown one", async () => {
    server.logMomentAction.mockResolvedValueOnce({
      ok: false,
      message: "That tracker is archived.",
    });
    render(<QuickLog trackers={TRACKERS} />);
    const anger = screen.getByRole("button", {
      name: /^Log 😠 Anger \d+ today$/,
    });
    await userEvent.click(anger);
    expect(server.error).toHaveBeenCalledWith("That tracker is archived.");
    server.logMomentAction.mockRejectedValueOnce(new Error("stale"));
    await userEvent.click(anger);
    expect(server.error).toHaveBeenLastCalledWith(
      "Couldn't save. Reload the page and try again.",
    );
    expect(server.toast).not.toHaveBeenCalled();
  });
});
