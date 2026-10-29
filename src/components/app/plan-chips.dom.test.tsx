import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type ChipPlan,
  ProgressButton,
  SectionPicker,
  TargetPicker,
  WhenPicker,
  whenText,
} from "./plan-chips";

const server = vi.hoisted(() => ({
  logProgressAction: vi.fn(),
  undoAction: vi.fn(),
  toast: vi.fn(),
}));
vi.mock("@/server/actions/plan", () => ({
  logProgressAction: (i: unknown) => server.logProgressAction(i),
}));
vi.mock("@/server/actions/history", () => ({
  undoAction: (i: unknown) => server.undoAction(i),
}));
vi.mock("sonner", () => ({
  toast: Object.assign((...a: unknown[]) => server.toast(...a), {
    error: vi.fn(),
    success: vi.fn(),
  }),
}));

const TODAY = "2026-03-10"; // a Tuesday

beforeEach(() => {
  for (const f of Object.values(server)) f.mockReset();
});

describe("whenText", () => {
  it("names each kind of plan", () => {
    const t = (p: ChipPlan) => whenText(p, TODAY, 1);
    expect(t(null)).toBe("When");
    expect(t({ type: "day", date: TODAY })).toBe("Today");
    expect(t({ type: "day", date: "2026-03-11" })).toBe("Tomorrow");
    expect(t({ type: "day", date: "2026-03-12" })).toBe("Thu Mar 12");
    expect(t({ type: "week", date: "2026-03-09" })).toBe("This week");
    expect(t({ type: "week", date: "2026-03-16" })).toBe("Next week");
    expect(t({ type: "week", date: "2026-03-23" })).toBe("Week of Mar 23");
  });
});

describe("WhenPicker", () => {
  it("picks tomorrow, next week, a day, or no date", async () => {
    const onChange = vi.fn();
    render(
      <WhenPicker
        value={null}
        today={TODAY}
        weekStart={1}
        onChange={onChange}
      />,
    );
    const chip = screen.getByRole("button", { name: "When: none" });
    await userEvent.click(chip);
    await userEvent.click(screen.getByRole("menuitem", { name: "Tomorrow" }));
    expect(onChange).toHaveBeenLastCalledWith({
      type: "day",
      date: "2026-03-11",
    });
    await userEvent.click(chip);
    await userEvent.click(screen.getByRole("menuitem", { name: "Next week" }));
    expect(onChange).toHaveBeenLastCalledWith({
      type: "week",
      date: "2026-03-16",
    });
    await userEvent.click(chip);
    await userEvent.click(
      screen.getByRole("menuitem", { name: "Pick a day…" }),
    );
    const input = screen.getByLabelText("Pick a day");
    await userEvent.type(input, "2026-04-02");
    await userEvent.tab();
    expect(onChange).toHaveBeenLastCalledWith({
      type: "day",
      date: "2026-04-02",
    });
  });

  it("clears a plan", async () => {
    const onChange = vi.fn();
    render(
      <WhenPicker
        value={{ type: "day", date: TODAY }}
        today={TODAY}
        weekStart={1}
        onChange={onChange}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "When: Today" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "No date" }));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});

it("SectionPicker switches between Work and Spare time", async () => {
  const onChange = vi.fn();
  render(<SectionPicker value="spare" onChange={onChange} />);
  await userEvent.click(
    screen.getByRole("button", { name: "Section: Spare time" }),
  );
  await userEvent.click(screen.getByRole("menuitemradio", { name: "Work" }));
  expect(onChange).toHaveBeenCalledWith("work");
});

describe("TargetPicker", () => {
  it("sets an amount and unit, or a word of the owner's", async () => {
    const onChange = vi.fn();
    render(<TargetPicker value={null} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Target: none" }));
    await userEvent.clear(screen.getByLabelText("Amount"));
    await userEvent.type(screen.getByLabelText("Amount"), "100");
    await userEvent.click(screen.getByRole("button", { name: "Set target" }));
    expect(onChange).toHaveBeenLastCalledWith({ amount: 100, unit: "times" });

    await userEvent.click(screen.getByRole("button", { name: "Target: none" }));
    await userEvent.selectOptions(screen.getByLabelText("Unit"), "other");
    await userEvent.type(screen.getByLabelText("Unit name"), "chapters");
    await userEvent.click(screen.getByRole("button", { name: "Set target" }));
    expect(onChange).toHaveBeenLastCalledWith({ amount: 1, unit: "chapters" });
  });

  it("shows a set target and clears it", async () => {
    const onChange = vi.fn();
    render(
      <TargetPicker
        value={{ amount: 10, unit: "hours" }}
        onChange={onChange}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Target: 10 hours" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Clear target" }));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});

describe("ProgressButton", () => {
  it("logs minutes toward an hours target and offers Undo", async () => {
    server.logProgressAction.mockResolvedValue({
      ok: true,
      data: { progress: 1.5, completed: false },
      batchId: "b1",
    });
    render(
      <ProgressButton
        taskId="t1"
        title="Arpeggios"
        unit="hours"
        amount={10}
        progress={1}
      />,
    );
    expect(screen.getByText("1 / 10 hours")).toBeVisible();
    await userEvent.click(
      screen.getByRole("button", { name: "Log progress on Arpeggios" }),
    );
    expect(screen.getByLabelText("Minutes")).toHaveValue(30);
    await userEvent.click(screen.getByRole("button", { name: "Log" }));
    expect(server.logProgressAction).toHaveBeenCalledWith({
      taskId: "t1",
      amount: 30,
    });
    expect(server.toast).toHaveBeenCalledWith(
      "Logged",
      expect.objectContaining({
        action: expect.objectContaining({ label: "Undo" }),
      }),
    );
  });

  it("says when the target is reached", async () => {
    server.logProgressAction.mockResolvedValue({
      ok: true,
      data: { progress: 100, completed: true },
      batchId: "b1",
    });
    render(
      <ProgressButton
        taskId="t1"
        title="Talk"
        unit="times"
        amount={100}
        progress={99}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Log progress on Talk" }),
    );
    await userEvent.type(screen.getByLabelText("Note"), "barista");
    await userEvent.click(screen.getByRole("button", { name: "Log" }));
    expect(server.logProgressAction).toHaveBeenCalledWith({
      taskId: "t1",
      amount: 1,
      note: "barista",
    });
    expect(server.toast).toHaveBeenCalledWith(
      "Target reached",
      expect.anything(),
    );
  });
});
