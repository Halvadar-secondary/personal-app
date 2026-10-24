import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { DateField } from "./date-field";

it("saves once, on blur, not on every partial year", () => {
  const onSave = vi.fn();
  render(<DateField label="Deadline" value={null} onSave={onSave} />);
  const input = screen.getByLabelText("Deadline");
  // Typing a year in Chrome fires a valid date per digit.
  for (const v of ["0002-10-24", "0020-10-24", "0202-10-24", "2027-10-24"]) {
    fireEvent.change(input, { target: { value: v } });
  }
  expect(onSave).not.toHaveBeenCalled();
  fireEvent.blur(input);
  expect(onSave).toHaveBeenCalledTimes(1);
  expect(onSave).toHaveBeenCalledWith("2027-10-24");
});

it("does not save an implausible year", () => {
  const onSave = vi.fn();
  render(<DateField label="Deadline" value="2026-01-01" onSave={onSave} />);
  const input = screen.getByLabelText("Deadline");
  fireEvent.change(input, { target: { value: "0020-10-24" } });
  fireEvent.blur(input);
  expect(onSave).not.toHaveBeenCalled();
  expect(input).toHaveValue("2026-01-01");
});

it("does not save when nothing changed", () => {
  const onSave = vi.fn();
  render(<DateField label="Deadline" value="2026-01-01" onSave={onSave} />);
  fireEvent.blur(screen.getByLabelText("Deadline"));
  expect(onSave).not.toHaveBeenCalled();
});

it("clears with the clear button", async () => {
  const onSave = vi.fn();
  render(<DateField label="Deadline" value="2026-01-01" onSave={onSave} />);
  await userEvent.click(screen.getByRole("button", { name: "Clear Deadline" }));
  expect(onSave).toHaveBeenCalledWith(null);
});
