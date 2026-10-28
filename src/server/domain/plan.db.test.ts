import { desc } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Recurrence } from "@/lib/recurrence";
import { changeEvents, tasks } from "@/server/db/schema";
import type { Db } from "@/server/db/types";
import { createTestDb } from "@/test/db";
import { createOwner, type Run, runner } from "@/test/factories";
import { createAchievement, deleteAchievement } from "./achievements";
import { createArea } from "./areas";
import { listInbox } from "./inbox";
import {
  getDay,
  getPlanOptions,
  getWeek,
  markDayPlanned,
  placeTask,
  planTask,
} from "./plan";
import { updateSettings } from "./settings";
import { completeTask, createTask } from "./tasks";
import { undoBatch } from "./undo";
import { getOverview } from "./views";

// FIXED_NOW is 2026-03-10T12:00Z: a Tuesday, in UTC.
const TODAY = "2026-03-10";
const TOMORROW = "2026-03-11";
const MONDAY = "2026-03-09";

let db: Db;
let close: () => Promise<void>;
let owner: string;
let run: Run;
let active: string;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  owner = await createOwner(db);
  run = runner(db, owner);
  const area = (await run(createArea, { name: "Guitar" })).id;
  active = (
    await run(createAchievement, {
      areaId: area,
      title: "Arpeggios",
      status: "active",
    })
  ).id;
});
afterEach(() => close());

const daily: Recurrence = { freq: "daily", interval: 1, start: "2026-03-01" };

async function task(
  title: string,
  opts: {
    achievementId?: string | null;
    plan?: Parameters<typeof planTask.run>[1]["plan"];
    recurrence?: Recurrence;
  } = {},
) {
  const t = await run(createTask, {
    achievementId: opts.achievementId === undefined ? null : opts.achievementId,
    title,
    recurrence: opts.recurrence,
  });
  if (opts.plan) await run(planTask, { taskId: t.id, plan: opts.plan });
  return t.id;
}

const titles = (items: { title: string }[]) => items.map((i) => i.title);
const day = (d: string) => ({ type: "day" as const, date: d });

/** The same runner a day later or earlier. */
const at = (iso: string) => runner(db, owner, { now: new Date(iso) });

describe("planning a task", () => {
  it("plans a task on a day, appends it to the section, and lists it on that day", async () => {
    await task("Groceries", { plan: { ...day(TODAY), section: "spare" } });
    await task("Client email", { plan: { ...day(TODAY), section: "work" } });
    await task("Bins", { plan: day(TODAY) });
    const d = await run(getDay, { day: TODAY });
    expect(titles(d.sections.work)).toEqual(["Client email"]);
    expect(titles(d.sections.spare)).toEqual(["Groceries", "Bins"]);
    expect(d.sections.spare[0]).toMatchObject({
      kind: "once",
      done: false,
      rolledFrom: null,
      achievement: null,
    });
  });

  it("moves a week task to a day and back to the week, clearing the other", async () => {
    const id = await task("Dentist", {
      plan: { type: "week", date: "2026-03-12" },
    });
    let [row] = await db.select().from(tasks);
    expect(row).toMatchObject({ plannedWeek: MONDAY, plannedOn: null });
    await run(planTask, { taskId: id, plan: day("2026-03-12") });
    [row] = await db.select().from(tasks);
    expect(row).toMatchObject({ plannedWeek: null, plannedOn: "2026-03-12" });
    await run(planTask, { taskId: id, plan: { type: "week", date: TODAY } });
    [row] = await db.select().from(tasks);
    expect(row).toMatchObject({
      plannedWeek: MONDAY,
      plannedOn: null,
      planSortKey: null,
    });
    await run(planTask, { taskId: id, plan: null });
    [row] = await db.select().from(tasks);
    expect(row).toMatchObject({ plannedWeek: null, plannedOn: null });
  });

  it("refuses to plan a repeating task", async () => {
    const id = await task("Gym", { recurrence: daily });
    await expect(
      run(planTask, { taskId: id, plan: day(TODAY) }),
    ).rejects.toMatchObject({ code: "invalid_state" });
    await expect(
      run(createTask, {
        achievementId: null,
        title: "Bad",
        recurrence: daily,
        plan: day(TODAY),
      }),
    ).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("undoes a plan change", async () => {
    const id = await task("Groceries");
    await run(planTask, { taskId: id, plan: day(TODAY) });
    const [ev] = await db
      .select()
      .from(changeEvents)
      .orderBy(desc(changeEvents.seq))
      .limit(1);
    await run(undoBatch, { batchId: ev!.batchId });
    const [row] = await db.select().from(tasks);
    expect(row!.plannedOn).toBeNull();
  });
});

describe("rolling", () => {
  it("rolls an unfinished task from Monday onto today with 'from Mon', first in its section", async () => {
    await task("Today's", { plan: day(TODAY) });
    await task("Monday's", { plan: day(MONDAY) });
    const d = await run(getDay, { day: TODAY });
    expect(titles(d.sections.spare)).toEqual(["Monday's", "Today's"]);
    expect(d.sections.spare[0]).toMatchObject({
      rolledFrom: MONDAY,
      rolledLabel: "from Mon",
    });
  });

  it("shows today's unfinished tasks on tomorrow as 'left from today'", async () => {
    await task("Unfinished", { plan: day(TODAY) });
    const d = await run(getDay, { day: TOMORROW });
    expect(d.sections.spare[0]).toMatchObject({
      title: "Unfinished",
      rolledLabel: "left from today",
    });
  });

  it("does not roll onto a day after tomorrow or onto a past day", async () => {
    await task("Monday's", { plan: day(MONDAY) });
    expect((await run(getDay, { day: "2026-03-12" })).sections.spare).toEqual(
      [],
    );
    expect((await run(getDay, { day: "2026-03-08" })).sections.spare).toEqual(
      [],
    );
  });

  it("keeps a task done today after rolling, as done", async () => {
    const id = await task("Monday's", { plan: day(MONDAY) });
    await run(completeTask, { taskId: id });
    const d = await run(getDay, { day: TODAY });
    expect(d.sections.spare[0]).toMatchObject({
      title: "Monday's",
      done: true,
    });
    // Done, it no longer rolls onto tomorrow.
    expect((await run(getDay, { day: TOMORROW })).sections.spare).toEqual([]);
  });

  it("places a rolled task into today, adopting it", async () => {
    const id = await task("Monday's", { plan: day(MONDAY) });
    await run(placeTask, { taskId: id, day: TODAY, section: "work" });
    const d = await run(getDay, { day: TODAY });
    expect(d.sections.work[0]).toMatchObject({
      title: "Monday's",
      rolledFrom: null,
    });
    const [row] = await db.select().from(tasks);
    expect(row!.plannedOn).toBe(TODAY);
  });
});

describe("repeating tasks on a day", () => {
  it("lists repeating tasks due that day from active achievements and loose tasks, not backlog ones", async () => {
    const backlog = (
      await run(createAchievement, {
        areaId: (await run(createArea, { name: "Later" })).id,
        title: "Someday",
      })
    ).id;
    await task("Scales", { achievementId: active, recurrence: daily });
    await task("Gym", { recurrence: daily });
    await task("Parked", { achievementId: backlog, recurrence: daily });
    await task("Weekly", {
      recurrence: {
        freq: "weekly",
        interval: 1,
        byWeekday: [4],
        start: "2026-03-01",
      },
    });
    const d = await run(getDay, { day: TODAY });
    expect(titles(d.sections.spare).sort()).toEqual(["Gym", "Scales"]);
    expect(d.sections.spare.find((i) => i.title === "Scales")).toMatchObject({
      kind: "repeat",
      achievement: { id: active, title: "Arpeggios" },
      area: { name: "Guitar" },
    });
    // Thursday has the weekly one.
    const thu = await run(getDay, { day: "2026-03-12" });
    expect(titles(thu.sections.spare)).toContain("Weekly");
  });

  it("places a repeating task between two one-offs and keeps that place on other days", async () => {
    const a = await task("A", { plan: { ...day(TODAY), section: "work" } });
    const b = await task("B", { plan: { ...day(TODAY), section: "work" } });
    const gym = await task("Gym", { recurrence: daily });
    await run(placeTask, {
      taskId: gym,
      day: TODAY,
      section: "work",
      afterId: a,
      beforeId: b,
    });
    const d = await run(getDay, { day: TODAY });
    expect(titles(d.sections.work)).toEqual(["A", "Gym", "B"]);
    expect(d.sections.spare).toEqual([]);
    const thu = await run(getDay, { day: "2026-03-12" });
    expect(titles(thu.sections.work)).toEqual(["Gym"]);
  });

  it("marks today's repeating task done from its completion", async () => {
    const gym = await task("Gym", { recurrence: daily });
    await run(completeTask, { taskId: gym });
    const d = await run(getDay, { day: TODAY });
    expect(d.sections.spare[0]).toMatchObject({ title: "Gym", done: true });
    expect(
      (await run(getDay, { day: TOMORROW })).sections.spare[0],
    ).toMatchObject({ done: false });
  });
});

describe("edges", () => {
  it("uses the owner's time zone for today", async () => {
    const nz = await createOwner(db, { timeZone: "Pacific/Auckland" });
    const nzRun = runner(db, nz);
    const t = await nzRun(createTask, { achievementId: null, title: "Late" });
    await nzRun(planTask, { taskId: t.id, plan: day(TODAY) });
    const d = await nzRun(getDay, {});
    expect(d.today).toBe("2026-03-11");
    expect(d.day).toBe("2026-03-11");
    expect(d.sections.spare[0]).toMatchObject({
      title: "Late",
      rolledLabel: "from Tue",
    });
  });

  it("finds a week task after the week start changes", async () => {
    await task("Dentist", { plan: { type: "week", date: MONDAY } });
    await run(updateSettings, { weekStart: 0 });
    const w = await run(getWeek, { start: "2026-03-08" });
    expect(w.start).toBe("2026-03-08");
    expect(titles(w.list)).toEqual(["Dentist"]);
  });

  it("hides tasks of a deleted achievement but keeps a planned task of a backlog achievement", async () => {
    const area = (await run(createArea, { name: "Other" })).id;
    const gone = (await run(createAchievement, { areaId: area, title: "X" }))
      .id;
    const parked = (await run(createAchievement, { areaId: area, title: "Y" }))
      .id;
    await task("Gone", { achievementId: gone, plan: day(TODAY) });
    await task("Parked", { achievementId: parked, plan: day(TODAY) });
    await run(deleteAchievement, { achievementId: gone });
    const d = await run(getDay, { day: TODAY });
    expect(titles(d.sections.spare)).toEqual(["Parked"]);
  });

  it("marks a day planned by Done or by any planned task", async () => {
    expect((await run(getDay, { day: TOMORROW })).planned).toBe(false);
    await run(markDayPlanned, { day: TOMORROW });
    await run(markDayPlanned, { day: TOMORROW });
    expect((await run(getDay, { day: TOMORROW })).planned).toBe(true);
    await task("Thing", { plan: day("2026-03-12") });
    expect((await run(getDay, { day: "2026-03-12" })).planned).toBe(true);
  });

  it("keeps planned and repeating loose tasks out of the Inbox", async () => {
    await task("Unsorted");
    await task("Planned", { plan: day(TODAY) });
    await task("Week", { plan: { type: "week", date: TODAY } });
    await task("Gym", { recurrence: daily });
    const inbox = await run(listInbox, {});
    expect(titles(inbox.tasks)).toEqual(["Unsorted"]);
    expect((await run(getOverview, {})).inboxCount).toBe(1);
  });
});

describe("weeks", () => {
  it("lists week tasks, rolling last week's unfinished ones into the current week", async () => {
    await task("This week", { plan: { type: "week", date: TODAY } });
    await task("Last week", { plan: { type: "week", date: "2026-03-03" } });
    const doneOld = await task("Done last week", {
      plan: { type: "week", date: "2026-03-03" },
    });
    await run(completeTask, { taskId: doneOld });
    await task("Next week", { plan: { type: "week", date: "2026-03-17" } });
    const w = await run(getWeek, {});
    expect(w.start).toBe(MONDAY);
    expect(w.days.map((d) => d.day)).toEqual([
      MONDAY,
      TODAY,
      TOMORROW,
      "2026-03-12",
      "2026-03-13",
      "2026-03-14",
      "2026-03-15",
    ]);
    expect(titles(w.list)).toEqual(["Last week", "This week"]);
    expect(w.list[0]!.rolledLabel).toBe("from last week");
    // Rolling is only into the current week.
    const next = await run(getWeek, { start: "2026-03-16" });
    expect(titles(next.list)).toEqual(["Next week"]);
  });

  it("puts each day's planned tasks under that day", async () => {
    await task("Thu thing", { plan: day("2026-03-12") });
    const w = await run(getWeek, { start: MONDAY });
    expect(titles(w.days[3]!.sections.spare)).toEqual(["Thu thing"]);
  });
});

describe("planner options", () => {
  it("offers this week's list and open tasks of active achievements not on the day", async () => {
    await task("Week thing", { plan: { type: "week", date: TODAY } });
    await task("Open", { achievementId: active });
    await task("Already tomorrow", {
      achievementId: active,
      plan: day(TOMORROW),
    });
    const done = await task("Finished", { achievementId: active });
    await run(completeTask, { taskId: done });
    await task("Practice", { achievementId: active, recurrence: daily });
    const o = await run(getPlanOptions, { day: TOMORROW });
    expect(titles(o.week)).toEqual(["Week thing"]);
    expect(o.achievements).toHaveLength(1);
    expect(o.achievements[0]).toMatchObject({
      area: { name: "Guitar" },
      achievement: { title: "Arpeggios" },
    });
    expect(titles(o.achievements[0]!.tasks)).toEqual(["Open"]);
  });

  it("works for a later runner clock", async () => {
    // The day after: Monday's task rolled twice is still "from Mon".
    await task("Monday's", { plan: day(MONDAY) });
    const later = at("2026-03-11T12:00:00Z");
    const d = await later(getDay, {});
    expect(d.sections.spare[0]).toMatchObject({ rolledLabel: "from Mon" });
  });
});

describe("review fixes", () => {
  it("in a week an unfinished task shows on its day and today only", async () => {
    await task("Call bank", { plan: day(MONDAY) });
    await task("Today's", { plan: day(TODAY) });
    const w = await run(getWeek, { start: MONDAY });
    const where = (title: string) =>
      w.days
        .filter((d) => d.sections.spare.some((i) => i.title === title))
        .map((d) => d.day);
    expect(where("Call bank")).toEqual([MONDAY, TODAY]);
    expect(where("Today's")).toEqual([TODAY]);
    const tue = w.days.find((d) => d.day === TODAY)!;
    expect(tue.sections.spare[0]).toMatchObject({
      title: "Call bank",
      rolledLabel: "from Mon",
    });
  });
});
