import { describe, expect, it } from "vitest";
import { keyBetween, keysAfter } from "./ordering";

describe("ordering", () => {
  it("orders a key between two neighbours", () => {
    const k = keyBetween("a0", "a1");
    expect("a0" < k && k < "a1").toBe(true);
  });

  it("appends and prepends with null bounds", () => {
    expect(keyBetween("a0", null) > "a0").toBe(true);
    expect(keyBetween(null, "a0") < "a0").toBe(true);
  });

  it("keysAfter returns n strictly increasing keys after last", () => {
    const ks = keysAfter("a3", 15);
    expect(ks).toHaveLength(15);
    expect([...ks].sort()).toEqual(ks);
    expect(new Set(ks).size).toBe(15);
    expect(ks[0]! > "a3").toBe(true);
  });

  it("survives 50 inserts at the same spot", () => {
    let lo = "a0";
    const hi = "a1";
    for (let i = 0; i < 50; i++) {
      const k = keyBetween(lo, hi);
      expect(lo < k && k < hi).toBe(true);
      lo = k;
    }
  });

  it("rejects equal or inverted bounds", () => {
    expect(() => keyBetween("a1", "a1")).toThrow();
    expect(() => keyBetween("a2", "a1")).toThrow();
  });
});
