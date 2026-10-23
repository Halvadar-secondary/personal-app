import { describe, expect, it } from "vitest";
import { localDate } from "./dates";

describe("localDate", () => {
  it("uses the owner's zone, not UTC", () => {
    expect(
      localDate(new Date("2026-03-10T11:30:00Z"), "Pacific/Auckland"),
    ).toBe("2026-03-11");
    expect(localDate(new Date("2026-03-10T11:30:00Z"), "UTC")).toBe(
      "2026-03-10",
    );
    expect(
      localDate(new Date("2026-03-10T02:00:00Z"), "America/Los_Angeles"),
    ).toBe("2026-03-09");
  });
});
