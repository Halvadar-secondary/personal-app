import { describe, expect, it } from "vitest";
import {
  momentTime,
  soFarCounts,
  trendGood,
  trendText,
  weekBuckets,
} from "./trackers";

const at = (iso: string) => new Date(iso);

describe("soFarCounts", () => {
  it("compares this week so far with last week up to the same moment", () => {
    // Wednesday 2026-03-11 12:00 UTC; weeks start on Monday.
    const now = at("2026-03-11T12:00:00Z");
    const moments = [
      at("2026-03-09T08:00:00Z"), // this Monday
      at("2026-03-11T11:00:00Z"), // this Wednesday, before now
      at("2026-03-02T09:00:00Z"), // last Monday
      at("2026-03-04T11:00:00Z"), // last Wednesday, before the same time
      at("2026-03-04T13:00:00Z"), // last Wednesday, after it: not counted
      at("2026-03-06T10:00:00Z"), // last Friday: not counted
      at("2026-02-28T10:00:00Z"), // the week before: not counted
    ];
    expect(soFarCounts(moments, now, "UTC", 1)).toEqual({
      thisWeek: 2,
      lastWeek: 2,
    });
  });

  it("uses the owner's time zone for the week's start", () => {
    // Monday 00:30 in Auckland is Sunday 11:30 UTC.
    const now = at("2026-03-09T00:00:00Z"); // Mon 13:00 Auckland
    const moments = [at("2026-03-08T11:30:00Z")];
    expect(soFarCounts(moments, now, "Pacific/Auckland", 1).thisWeek).toBe(1);
    expect(soFarCounts(moments, now, "UTC", 1).thisWeek).toBe(0);
  });
});

describe("weekBuckets", () => {
  it("counts moments per week, oldest first, ending with the given week", () => {
    const moments = [
      at("2026-03-09T10:00:00Z"),
      at("2026-03-15T23:00:00Z"), // still the week of Mar 9 (Sunday)
      at("2026-03-02T10:00:00Z"),
      at("2026-01-01T10:00:00Z"), // too old
    ];
    expect(weekBuckets(moments, "UTC", 1, "2026-03-09", 3)).toEqual([
      { start: "2026-02-23", count: 0 },
      { start: "2026-03-02", count: 1 },
      { start: "2026-03-09", count: 2 },
    ]);
  });

  it("buckets by the owner's local date", () => {
    // 2026-03-15T11:30Z is Monday Mar 16 in Auckland: the next week.
    const moments = [at("2026-03-15T11:30:00Z")];
    expect(
      weekBuckets(moments, "Pacific/Auckland", 1, "2026-03-16", 2),
    ).toEqual([
      { start: "2026-03-09", count: 0 },
      { start: "2026-03-16", count: 1 },
    ]);
  });
});

describe("trends", () => {
  it("words the change without judging it", () => {
    expect(trendText(-3)).toBe("3 fewer than last week");
    expect(trendText(-1)).toBe("1 fewer than last week");
    expect(trendText(2)).toBe("2 more than last week");
    expect(trendText(0)).toBe("Same as last week");
  });

  it("knows which way is good for each direction", () => {
    expect(trendGood("less", -2)).toBe(true);
    expect(trendGood("less", 2)).toBe(false);
    expect(trendGood("more", 2)).toBe(true);
    expect(trendGood("more", -1)).toBe(false);
    expect(trendGood("less", 0)).toBeNull();
  });
});

it("words a trend against another week", () => {
  expect(trendText(-2, "the week before")).toBe("2 fewer than the week before");
  expect(trendText(0, "the week before")).toBe("Same as the week before");
});

it("names a moment's time in the owner's zone, with a date outside this week", () => {
  const now = new Date("2026-03-11T12:00:00Z"); // Wed
  // 19:30 UTC on Tue is 23:30 in Dubai (+04).
  expect(
    momentTime(new Date("2026-03-10T19:30:00Z"), "Asia/Dubai", 1, now),
  ).toBe("Tue 23:30");
  expect(momentTime(new Date("2026-03-03T09:00:00Z"), "UTC", 1, now)).toBe(
    "Mar 3, 09:00",
  );
});
