import { describe, expect, it } from "vitest";
import { sortKeyFor } from "./position";

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const C = "00000000-0000-4000-8000-00000000000c";
const MISSING = "00000000-0000-4000-8000-0000000000ff";
const sibs = [
  { id: A, sortKey: "a0" },
  { id: B, sortKey: "a1" },
  { id: C, sortKey: "a2" },
];

const between = (k: string, lo: string | null, hi: string | null) =>
  (lo === null || lo < k) && (hi === null || k < hi);

describe("sortKeyFor", () => {
  it("appends after the last sibling with no position", () => {
    expect(sortKeyFor(sibs, {}) > "a2").toBe(true);
  });

  it("gives a first key with no siblings", () => {
    expect(typeof sortKeyFor([], {})).toBe("string");
  });

  it("places after a sibling, before the next one", () => {
    expect(between(sortKeyFor(sibs, { afterId: A }), "a0", "a1")).toBe(true);
    expect(sortKeyFor(sibs, { afterId: C }) > "a2").toBe(true);
  });

  it("places before a sibling, after the previous one", () => {
    expect(between(sortKeyFor(sibs, { beforeId: B }), "a0", "a1")).toBe(true);
    expect(sortKeyFor(sibs, { beforeId: A }) < "a0").toBe(true);
  });

  it("places between both neighbours", () => {
    expect(
      between(sortKeyFor(sibs, { afterId: A, beforeId: C }), "a0", "a2"),
    ).toBe(true);
  });

  it("rejects inverted or equal neighbours", () => {
    expect(() => sortKeyFor(sibs, { afterId: C, beforeId: A })).toThrow(
      expect.objectContaining({ code: "invalid_input" }),
    );
    expect(() => sortKeyFor(sibs, { afterId: B, beforeId: B })).toThrow(
      expect.objectContaining({ code: "invalid_input" }),
    );
  });

  it("rejects a neighbour that is not a sibling", () => {
    for (const pos of [{ afterId: MISSING }, { beforeId: MISSING }]) {
      expect(() => sortKeyFor(sibs, pos)).toThrow(
        expect.objectContaining({ code: "invalid_input" }),
      );
    }
  });
});
