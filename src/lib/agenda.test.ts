import { expect, it } from "vitest";
import { isOpenToday, type OpenCandidate, pickUpNext } from "./agenda";
import type { Recurrence } from "./recurrence";

const today = "2026-10-24"; // a Saturday
const task = (over: Partial<OpenCandidate> & { id?: string } = {}) => ({
  id: "t",
  deadline: null,
  recurrence: null,
  completedAt: null,
  doneToday: false,
  ...over,
});
const daily: Recurrence = { freq: "daily", interval: 1, start: "2026-10-01" };

it("open today", () => {
  expect(isOpenToday(task(), today)).toBe(true);
  expect(isOpenToday(task({ completedAt: new Date() }), today)).toBe(false);
  expect(isOpenToday(task({ recurrence: daily }), today)).toBe(true);
  expect(isOpenToday(task({ recurrence: daily, doneToday: true }), today)).toBe(
    false,
  );
  const monday: Recurrence = { ...daily, freq: "weekly", byWeekday: [1] };
  expect(isOpenToday(task({ recurrence: monday }), today)).toBe(false);
});

it("up next prefers the earliest deadline, else board order", () => {
  const list = [
    task({ id: "a" }),
    task({ id: "b", deadline: "2026-11-01" }),
    task({ id: "c", deadline: "2026-10-30" }),
  ];
  expect(pickUpNext(list, today)?.id).toBe("c");
  expect(
    pickUpNext(
      [
        task({ id: "x", completedAt: new Date() }),
        task({ id: "y" }),
        task({ id: "z" }),
      ],
      today,
    )?.id,
  ).toBe("y");
  expect(pickUpNext([task({ completedAt: new Date() })], today)).toBeNull();
});
