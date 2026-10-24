import { expect, it } from "vitest";
import { currentStreak } from "./streaks";

const today = "2026-10-24";

it.each([
  [[], 0],
  [[today], 1],
  [["2026-10-23"], 1], // not broken until today ends
  [[today, "2026-10-23", "2026-10-22"], 3],
  [["2026-10-23", "2026-10-22", "2026-10-20"], 2],
  [["2026-10-22"], 0],
  [[today, today, "2026-10-23"], 2], // duplicates
  [["2026-10-25", today], 1], // future days ignored
])("currentStreak(%j)", (days: string[], n: number) =>
  expect(currentStreak(days, today)).toBe(n),
);
