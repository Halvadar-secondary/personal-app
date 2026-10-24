import { expect, it } from "vitest";
import {
  buildRecurrence,
  completionStrip,
  describeRecurrence,
  hasEnded,
  isDueOn,
  occurrencesBetween,
  type Recurrence,
} from "./recurrence";

const daily = (over: Partial<Recurrence> = {}): Recurrence => ({
  freq: "daily",
  interval: 1,
  start: "2026-10-01",
  ...over,
});

it("daily: every day from start, none before", () => {
  expect(isDueOn(daily(), "2026-09-30")).toBe(false);
  expect(occurrencesBetween(daily(), "2026-09-29", "2026-10-03")).toEqual([
    "2026-10-01",
    "2026-10-02",
    "2026-10-03",
  ]);
});

it("daily across DST changes has no gaps or doubles", () => {
  // US spring-forward on Mar 8, EU on Mar 29, US fall-back on Nov 1 2026.
  const r = daily({ start: "2026-03-01" });
  expect(occurrencesBetween(r, "2026-03-01", "2026-03-31")).toHaveLength(31);
  expect(occurrencesBetween(r, "2026-10-28", "2026-11-03")).toHaveLength(7);
});

it("every 2 days", () => {
  expect(
    occurrencesBetween(daily({ interval: 2 }), "2026-10-01", "2026-10-06"),
  ).toEqual(["2026-10-01", "2026-10-03", "2026-10-05"]);
});

it("weekly on Mon and Thu; default weekday is the start's", () => {
  const r: Recurrence = {
    freq: "weekly",
    interval: 1,
    byWeekday: [1, 4],
    start: "2026-10-01",
  };
  expect(occurrencesBetween(r, "2026-10-01", "2026-10-12")).toEqual([
    "2026-10-01",
    "2026-10-05",
    "2026-10-08",
    "2026-10-12",
  ]);
  const plain: Recurrence = {
    freq: "weekly",
    interval: 1,
    start: "2026-10-01",
  }; // a Thursday
  expect(occurrencesBetween(plain, "2026-10-01", "2026-10-15")).toEqual([
    "2026-10-01",
    "2026-10-08",
    "2026-10-15",
  ]);
});

it("every 2 weeks counts Monday-weeks from the start", () => {
  const r: Recurrence = {
    freq: "weekly",
    interval: 2,
    byWeekday: [1],
    start: "2026-10-05",
  };
  expect(occurrencesBetween(r, "2026-10-05", "2026-11-02")).toEqual([
    "2026-10-05",
    "2026-10-19",
    "2026-11-02",
  ]);
});

it("ends: until is inclusive, count stops after n, never runs on", () => {
  const until = daily({ end: { type: "until", date: "2026-10-07" } });
  expect(isDueOn(until, "2026-10-07")).toBe(true);
  expect(isDueOn(until, "2026-10-08")).toBe(false);
  expect(hasEnded(until, "2026-10-07")).toBe(false);
  expect(hasEnded(until, "2026-10-08")).toBe(true);
  const count = daily({ interval: 2, end: { type: "count", count: 3 } });
  expect(occurrencesBetween(count, "2026-10-01", "2026-10-31")).toEqual([
    "2026-10-01",
    "2026-10-03",
    "2026-10-05",
  ]);
  expect(hasEnded(count, "2026-10-05")).toBe(false);
  expect(hasEnded(count, "2026-10-06")).toBe(true);
  expect(hasEnded(daily({ end: { type: "never" } }), "2099-01-01")).toBe(false);
  expect(hasEnded(daily(), "2099-01-01")).toBe(false);
});

it("presets", () => {
  expect(
    buildRecurrence({ preset: "daily", span: "forever" }, "2026-10-24"),
  ).toEqual({
    freq: "daily",
    interval: 1,
    start: "2026-10-24",
    end: { type: "never" },
  });
  expect(
    buildRecurrence({ preset: "weekdays", span: "week" }, "2026-10-24"),
  ).toEqual({
    freq: "weekly",
    interval: 1,
    byWeekday: [1, 2, 3, 4, 5],
    start: "2026-10-24",
    end: { type: "until", date: "2026-10-30" },
  });
  expect(
    buildRecurrence(
      { preset: "weekly", days: [4, 1], span: "month" },
      "2026-10-24",
    ),
  ).toEqual({
    freq: "weekly",
    interval: 1,
    byWeekday: [1, 4],
    start: "2026-10-24",
    end: { type: "until", date: "2026-11-22" },
  });
});

it("a span counts from today when the rule started earlier", () => {
  expect(
    buildRecurrence(
      { preset: "daily", span: "week" },
      "2026-10-01",
      "2026-10-24",
    ),
  ).toEqual({
    freq: "daily",
    interval: 1,
    start: "2026-10-01",
    end: { type: "until", date: "2026-10-30" },
  });
  // A future start still counts from the start.
  expect(
    buildRecurrence(
      { preset: "daily", span: "week" },
      "2026-11-01",
      "2026-10-24",
    ).end,
  ).toEqual({ type: "until", date: "2026-11-07" });
});

it("describes", () => {
  expect(describeRecurrence(daily())).toBe("Daily");
  expect(describeRecurrence(daily({ interval: 2 }))).toBe("Every 2 days");
  expect(
    describeRecurrence({
      freq: "weekly",
      interval: 1,
      byWeekday: [1, 2, 3, 4, 5],
      start: "2026-10-01",
    }),
  ).toBe("Weekdays");
  expect(
    describeRecurrence({
      freq: "weekly",
      interval: 1,
      byWeekday: [4, 1],
      start: "2026-10-01",
    }),
  ).toBe("Weekly on Mon, Thu");
  expect(
    describeRecurrence({ freq: "weekly", interval: 2, start: "2026-10-01" }),
  ).toBe("Every 2 weeks on Thu");
  expect(
    describeRecurrence(daily({ end: { type: "until", date: "2026-10-07" } })),
  ).toBe("Daily · until Oct 7");
  expect(describeRecurrence(daily({ end: { type: "count", count: 10 } }))).toBe(
    "Daily · 10 times",
  );
});

it("strip: 28 days ending with this week, with each state", () => {
  const strip = completionStrip(
    daily({ start: "2026-10-01" }),
    new Set(["2026-10-20"]),
    "2026-10-22",
    1,
  );
  expect(strip).toHaveLength(28);
  expect(strip[0]!.date).toBe("2026-09-28");
  expect(strip.at(-1)!.date).toBe("2026-10-25");
  const at = (d: string) => strip.find((s) => s.date === d)!.state;
  expect([
    at("2026-09-30"),
    at("2026-10-20"),
    at("2026-10-21"),
    at("2026-10-22"),
    at("2026-10-23"),
  ]).toEqual(["off", "done", "missed", "due", "upcoming"]);
});
