import { describe, expect, it } from "vitest";
import { formatDeadline, isOverdue, localDate } from "./dates";

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

describe("deadlines", () => {
  it("is overdue only strictly before today", () => {
    expect(isOverdue("2026-03-09", "2026-03-10")).toBe(true);
    expect(isOverdue("2026-03-10", "2026-03-10")).toBe(false);
    expect(isOverdue(null, "2026-03-10")).toBe(false);
  });
  it("formats a date as a short month and day", () => {
    expect(formatDeadline("2026-06-01")).toBe("Jun 1");
    expect(formatDeadline("2026-12-31")).toBe("Dec 31");
  });
});
