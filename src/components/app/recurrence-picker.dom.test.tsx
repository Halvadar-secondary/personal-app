import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import type { Recurrence } from "@/lib/recurrence";
import { RecurrencePicker } from "./recurrence-picker";

const today = "2026-10-24";
const daily: Recurrence = {
  freq: "daily",
  interval: 1,
  start: "2026-10-01",
  end: { type: "never" },
};

function setup(value: Recurrence | null, locked = false) {
  const onSave = vi.fn();
  render(
    <RecurrencePicker
      value={value}
      today={today}
      locked={locked}
      onSave={onSave}
    />,
  );
  return onSave;
}

const choose = (name: string) =>
  userEvent.click(screen.getByRole("radio", { name }));
const save = () =>
  userEvent.click(screen.getByRole("button", { name: "Save" }));

it("daily forever", async () => {
  const onSave = setup(null);
  await userEvent.click(
    screen.getByRole("button", { name: "Repeat: Doesn't repeat" }),
  );
  await choose("Daily");
  await choose("Forever");
  await save();
  expect(onSave).toHaveBeenCalledWith({
    freq: "daily",
    interval: 1,
    start: today,
    end: { type: "never" },
  });
});

it("weekdays for 1 week", async () => {
  const onSave = setup(null);
  await userEvent.click(screen.getByRole("button", { name: /^Repeat:/ }));
  await choose("Weekdays");
  await choose("1 week");
  await save();
  expect(onSave).toHaveBeenCalledWith({
    freq: "weekly",
    interval: 1,
    byWeekday: [1, 2, 3, 4, 5],
    start: today,
    end: { type: "until", date: "2026-10-30" },
  });
});

it("weekly needs a day", async () => {
  const onSave = setup(null);
  await userEvent.click(screen.getByRole("button", { name: /^Repeat:/ }));
  await choose("Weekly on…");
  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  await userEvent.click(screen.getByRole("button", { name: "Thu" }));
  await userEvent.click(screen.getByRole("button", { name: "Mon" }));
  expect(screen.getByRole("button", { name: "Mon" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await save();
  expect(onSave).toHaveBeenCalledWith(
    expect.objectContaining({ freq: "weekly", byWeekday: [1, 4] }),
  );
});

it("doesn't repeat saves null", async () => {
  const onSave = setup(daily);
  await userEvent.click(screen.getByRole("button", { name: "Repeat: Daily" }));
  await choose("Doesn't repeat");
  await save();
  expect(onSave).toHaveBeenCalledWith(null);
});

it("locked: offers Stop after today instead", async () => {
  const onSave = setup(daily, true);
  await userEvent.click(screen.getByRole("button", { name: "Repeat: Daily" }));
  expect(screen.queryByRole("radio", { name: "Doesn't repeat" })).toBeNull();
  await choose("Stop after today");
  await save();
  expect(onSave).toHaveBeenCalledWith({
    ...daily,
    end: { type: "until", date: today },
  });
});

it("keeps the original start when editing", async () => {
  const onSave = setup(daily);
  await userEvent.click(screen.getByRole("button", { name: "Repeat: Daily" }));
  await choose("Weekdays");
  await save();
  expect(onSave).toHaveBeenCalledWith(
    expect.objectContaining({
      byWeekday: [1, 2, 3, 4, 5],
      start: "2026-10-01",
    }),
  );
});

it("1 week on an older rule runs a week from today", async () => {
  const onSave = setup(daily);
  await userEvent.click(screen.getByRole("button", { name: "Repeat: Daily" }));
  await choose("1 week");
  await save();
  expect(onSave).toHaveBeenCalledWith({
    freq: "daily",
    interval: 1,
    start: "2026-10-01",
    end: { type: "until", date: "2026-10-30" },
  });
});
