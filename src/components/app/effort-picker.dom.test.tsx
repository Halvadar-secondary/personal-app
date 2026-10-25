import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { EffortPicker } from "./effort-picker";

it("shows the current label and calls onChange with the chosen level", async () => {
  const onChange = vi.fn();
  render(<EffortPicker value={2} onChange={onChange} />);
  const trigger = screen.getByRole("button", { name: "Effort: Easy" });
  await userEvent.click(trigger);
  for (const label of ["Trivial", "Easy", "Medium", "Hard", "Brutal"]) {
    expect(screen.getByRole("menuitemradio", { name: label })).toBeVisible();
  }
  await userEvent.click(screen.getByRole("menuitemradio", { name: "Hard" }));
  expect(onChange).toHaveBeenCalledWith(4);
});

it("with a prefix the chip reads 'Effort: Medium'", () => {
  render(
    <EffortPicker
      value={3}
      onChange={() => {}}
      prefix="Effort: "
      className="chip"
    />,
  );
  const trigger = screen.getByRole("button", { name: "Effort: Medium" });
  expect(trigger).toHaveTextContent("Effort: Medium");
  expect(trigger).toHaveClass("chip");
});
