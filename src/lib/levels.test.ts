import { expect, it } from "vitest";
import { levelOf, xpToReach } from "./levels";

it.each([
  [0, { level: 1, into: 0, span: 100 }],
  [99, { level: 1, into: 99, span: 100 }],
  [100, { level: 2, into: 0, span: 200 }],
  [299, { level: 2, into: 199, span: 200 }],
  [300, { level: 3, into: 0, span: 300 }],
  [1000, { level: 5, into: 0, span: 500 }],
  [4500, { level: 10, into: 0, span: 1000 }],
])("levelOf(%i)", (xp, want) => expect(levelOf(xp)).toEqual(want));

it("xpToReach follows 50·n·(n−1)", () => {
  expect([1, 2, 3, 5, 10].map(xpToReach)).toEqual([0, 100, 300, 1000, 4500]);
});
