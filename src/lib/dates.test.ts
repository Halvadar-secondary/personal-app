import { describe, expect, it } from "vitest";
import {
  addDays,
  daysBetween,
  formatDeadline,
  isOverdue,
  localDate,
  timeAgo,
  weekdayOf,
  weekStartOf,
} from "./dates";

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

describe("date arithmetic", () => {
  it("does calendar arithmetic on date strings", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(daysBetween("2026-03-07", "2026-03-09")).toBe(2); // across US DST start
    expect(weekdayOf("2026-10-24")).toBe(6);
    expect(weekStartOf("2026-10-24", 1)).toBe("2026-10-19");
    expect(weekStartOf("2026-10-24", 0)).toBe("2026-10-18");
    expect(weekStartOf("2026-10-19", 1)).toBe("2026-10-19");
  });

  it("localDate gives the owner's day around DST changes", () => {
    // 2026-03-08 02:00 local is the US spring-forward.
    expect(
      localDate(new Date("2026-03-09T03:30:00Z"), "America/New_York"),
    ).toBe("2026-03-08");
    expect(
      localDate(new Date("2026-10-24T11:30:00Z"), "Pacific/Auckland"),
    ).toBe("2026-10-25");
  });
});

describe("timeAgo", () => {
  const now = new Date("2026-10-24T12:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms);
  it("says how long ago, in the owner's days", () => {
    expect(timeAgo(ago(30_000), now, "UTC")).toBe("just now");
    expect(timeAgo(ago(5 * 60_000), now, "UTC")).toBe("5 min ago");
    expect(timeAgo(ago(3 * 3_600_000), now, "UTC")).toBe("3 h ago");
    expect(timeAgo(new Date("2026-10-23T09:00:00Z"), now, "UTC")).toBe(
      "Yesterday",
    );
    expect(timeAgo(new Date("2026-10-03T09:00:00Z"), now, "UTC")).toBe("Oct 3");
    expect(
      timeAgo(
        new Date("2026-10-24T10:30:00Z"),
        new Date("2026-10-24T11:30:00Z"),
        "Pacific/Auckland",
      ),
    ).toBe("1 h ago");
  });
});
