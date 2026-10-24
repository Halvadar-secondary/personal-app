import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { LevelBadge, Streak, Trophies, XpBar } from "./progress";

it("shows level, XP toward the next level, streak and trophies", () => {
  render(
    <>
      <LevelBadge level={3} />
      <XpBar progress={{ level: 3, into: 120, span: 300 }} />
      <Streak days={12} />
      <Streak days={0} />
      <Trophies count={0} />
      <Trophies count={2} />
    </>,
  );
  expect(screen.getByLabelText("Level 3")).toHaveTextContent("LV 3");
  const bar = screen.getByRole("progressbar", { name: "XP toward level 4" });
  expect(bar).toHaveAttribute("aria-valuenow", "120");
  expect(bar).toHaveAttribute("aria-valuemax", "300");
  expect(screen.getAllByLabelText(/day streak/)).toHaveLength(1);
  expect(screen.getByLabelText("12-day streak")).toHaveTextContent("🔥 12");
  expect(screen.getAllByLabelText(/trophies/)).toHaveLength(1);
  expect(screen.getByLabelText("2 trophies")).toHaveTextContent("🏆 2");
});
