import { describe, expect, it } from "vitest";
import {
  dayLabel,
  formatProgress,
  orderSection,
  progressOf,
  reviewWeekStart,
  rolledLabel,
  rollsInto,
  weekListLabel,
  weekRange,
} from "./plan";

const TODAY = "2026-03-10"; // a Tuesday

describe("rollsInto", () => {
  it("rolls an earlier unfinished day onto today", () => {
    expect(rollsInto("2026-03-09", TODAY, TODAY)).toBe(true);
    expect(rollsInto(TODAY, TODAY, TODAY)).toBe(false);
  });

  it("rolls today and earlier onto tomorrow, for planning", () => {
    expect(rollsInto(TODAY, "2026-03-11", TODAY)).toBe(true);
    expect(rollsInto("2026-03-02", "2026-03-11", TODAY)).toBe(true);
  });

  it("never rolls onto a later or a past day", () => {
    expect(rollsInto("2026-03-09", "2026-03-12", TODAY)).toBe(false);
    expect(rollsInto("2026-03-08", "2026-03-09", TODAY)).toBe(false);
  });
});

describe("orderSection", () => {
  const at = (n: number) => new Date(n * 1000);
  it("puts rolled items first, oldest day first, then the rest by key", () => {
    const items = [
      { id: "b", key: "a1", rolledFrom: null, createdAt: at(1) },
      { id: "r2", key: "a0", rolledFrom: "2026-03-09", createdAt: at(2) },
      { id: "n", key: null, rolledFrom: null, createdAt: at(3) },
      { id: "a", key: "a0", rolledFrom: null, createdAt: at(4) },
      { id: "r1", key: "a5", rolledFrom: "2026-03-05", createdAt: at(5) },
      { id: "m", key: null, rolledFrom: null, createdAt: at(0) },
    ];
    expect(orderSection(items).map((i) => i.id)).toEqual([
      "r1",
      "r2",
      "a",
      "b",
      "m",
      "n",
    ]);
  });
});

describe("labels", () => {
  it("names a rolled day", () => {
    expect(rolledLabel(TODAY, "2026-03-11", TODAY)).toBe("left from today");
    expect(rolledLabel("2026-03-09", TODAY, TODAY)).toBe("from Mon");
    expect(rolledLabel("2026-03-02", TODAY, TODAY)).toBe("from Mar 2");
  });

  it("names a rolled week", () => {
    expect(weekListLabel("2026-03-02", "2026-03-09", 1)).toBe("from last week");
    expect(weekListLabel("2026-02-23", "2026-03-09", 1)).toBe(
      "from week of Feb 23",
    );
    // A week stored under Monday weeks, read with Sunday weeks.
    expect(weekListLabel("2026-03-02", "2026-03-08", 0)).toBe("from last week");
  });

  it("names a day", () => {
    expect(dayLabel("2026-03-12")).toBe("Thu Mar 12");
  });
});

describe("weeks", () => {
  it("gives a week's first and last day", () => {
    expect(weekRange("2026-03-12", 1)).toEqual({
      start: "2026-03-09",
      end: "2026-03-15",
    });
    expect(weekRange("2026-03-12", 0)).toEqual({
      start: "2026-03-08",
      end: "2026-03-14",
    });
  });

  it("reviews the coming week on the week's last day, else this week", () => {
    expect(reviewWeekStart("2026-03-15", 1)).toBe("2026-03-16");
    expect(reviewWeekStart("2026-03-11", 1)).toBe("2026-03-09");
    expect(reviewWeekStart("2026-03-14", 0)).toBe("2026-03-15");
  });
});

describe("targets", () => {
  it("counts hours from durations and other units from amounts", () => {
    expect(
      progressOf("hours", [
        { amount: null, durationSeconds: 3600 },
        { amount: null, durationSeconds: 1800 },
      ]),
    ).toBe(1.5);
    expect(
      progressOf("pages", [
        { amount: 20, durationSeconds: 600 },
        { amount: null, durationSeconds: null },
        { amount: 14, durationSeconds: null },
      ]),
    ).toBe(34);
  });

  it("formats progress, hours to one decimal", () => {
    expect(formatProgress(34, 100, "times")).toBe("34 / 100 times");
    expect(formatProgress(2.4999, 10, "hours")).toBe("2.5 / 10 hours");
    expect(formatProgress(1, 1, "lessons")).toBe("1 / 1 lessons");
  });
});
