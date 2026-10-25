import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { InlineText } from "./inline-text";

it("its accessible name starts with the visible text (WCAG 2.5.3)", () => {
  render(
    <InlineText
      value="Learn scales"
      label="Task title"
      maxLength={200}
      onSave={vi.fn()}
    />,
  );
  expect(
    screen.getByRole("button", { name: "Learn scales, Edit Task title" }),
  ).toBeInTheDocument();
});
