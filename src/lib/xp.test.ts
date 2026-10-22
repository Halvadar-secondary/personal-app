import { describe, expect, it } from "vitest";
import { type Effort, xpForEffort } from "./xp";

describe("xpForEffort", () => {
  it.each([
    [1, 10],
    [2, 25],
    [3, 50],
    [4, 100],
    [5, 200],
  ])("effort %i → %i xp", (effort, xp) => {
    expect(xpForEffort(effort as Effort)).toBe(xp);
  });
});
