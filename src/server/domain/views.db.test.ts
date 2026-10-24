import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Recurrence } from "@/lib/recurrence";
import { tasks } from "@/server/db/schema";
import type { Db } from "@/server/db/types";
import { createTestDb } from "@/test/db";
import { createOwner, type Run, runner } from "@/test/factories";
import {
  createAchievement,
  deleteAchievement,
  getAchievement,
  moveAchievement,
} from "./achievements";
import { createArea, deleteArea } from "./areas";
import { createCategory, setTaskCategories } from "./categories";
import { updateSettings } from "./settings";
import { completeTask, createTask, deleteTask } from "./tasks";
import {
  getActive,
  getAreaBoard,
  getOverview,
  listFilingTargets,
  listJumpTargets,
} from "./views";

let db: Db;
let close: () => Promise<void>;
let owner: string;
let run: Run;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  owner = await createOwner(db);
  run = runner(db, owner);
});
afterEach(() => close());

const ach = async (
  areaId: string | null,
  title: string,
  status: "backlog" | "active" | "done" = "backlog",
) => (await run(createAchievement, { areaId, title, status })).id;

describe("getOverview", () => {
  it("counts achievements per status, the Inbox and the active total", async () => {
    const a = (await run(createArea, { name: "A" })).id;
    const b = (await run(createArea, { name: "B" })).id;
    await ach(a, "a1", "active");
    await ach(a, "a2", "active");
    await ach(a, "a3", "backlog");
    await ach(a, "a4", "done");
    const gone = await ach(a, "a5", "active");
    await run(deleteAchievement, { achievementId: gone });
    await ach(b, "b1", "active");
    await ach(null, "inbox ach");
    await run(createTask, { achievementId: null, title: "t1" });
    await run(createTask, { achievementId: null, title: "t2" });

    const o = await run(getOverview, {});
    expect(o.areas.map((x) => x.name)).toEqual(["A", "B"]);
    expect(o.areas[0]!.counts).toEqual({ backlog: 1, active: 2, done: 1 });
    expect(o.areas[1]!.counts).toEqual({ backlog: 0, active: 1, done: 0 });
    expect(o.inboxCount).toBe(3);
    expect(o.activeCount).toBe(3);
  });

  it("is empty for a new owner", async () => {
    expect(await run(getOverview, {})).toEqual({
      areas: [],
      inboxCount: 0,
      activeCount: 0,
      dueThisWeek: 0,
      bestStreak: 0,
      today: "2026-03-10",
    });
  });

  it("leaves out deleted areas and another owner's data", async () => {
    const gone = (await run(createArea, { name: "Gone" })).id;
    await run(deleteArea, { areaId: gone });
    const other = runner(db, await createOwner(db));
    await other(createArea, { name: "Theirs" });
    await other(createTask, { achievementId: null, title: "theirs" });
    expect(await run(getOverview, {})).toEqual({
      areas: [],
      inboxCount: 0,
      activeCount: 0,
      dueThisWeek: 0,
      bestStreak: 0,
      today: "2026-03-10",
    });
  });
});

describe("getAreaBoard", () => {
  it("gives one-off task progress and distinct live categories", async () => {
    const area = (await run(createArea, { name: "Guitar" })).id;
    const id = await ach(area, "Sweep", "active");
    const task = async (title: string) =>
      (await run(createTask, { achievementId: id, title })).id;
    const t1 = await task("t1");
    const t2 = await task("t2");
    const t3 = await task("t3");
    const t4 = await task("t4");
    await run(completeTask, { taskId: t1 });
    await db
      .update(tasks)
      .set({ recurrence: { freq: "daily", interval: 1, start: "2026-03-01" } })
      .where(eq(tasks.id, t4));
    const cat = async (name: string) =>
      (await run(createCategory, { name, color: "#6d4aff" })).id;
    const c1 = await cat("Technique");
    const c2 = await cat("Theory");
    const c3 = await cat("Gear");
    await run(setTaskCategories, { taskId: t1, categoryIds: [c1, c2] });
    await run(setTaskCategories, { taskId: t2, categoryIds: [c1] });
    await run(setTaskCategories, { taskId: t3, categoryIds: [c3] });
    await run(deleteTask, { taskId: t3 });

    const board = await run(getAreaBoard, { areaId: area });
    expect(board.area.id).toBe(area);
    const [card] = board.achievements;
    expect(card).toMatchObject({ id, taskCount: 2, doneCount: 1 });
    expect([...card!.categoryIds].sort()).toEqual([c1, c2].sort());
  });

  it("orders cards by status then position and skips deleted ones", async () => {
    const area = (await run(createArea, { name: "Guitar" })).id;
    const x = await ach(area, "x", "done");
    const y = await ach(area, "y", "active");
    const z = await ach(area, "z", "active");
    const w = await ach(area, "w", "backlog");
    const gone = await ach(area, "gone", "backlog");
    await run(deleteAchievement, { achievementId: gone });
    await run(moveAchievement, { achievementId: z, beforeId: y });
    const board = await run(getAreaBoard, { areaId: area });
    expect(board.achievements.map((a) => a.id)).toEqual([w, z, y, x]);
    expect(board.achievements[0]).toMatchObject({
      taskCount: 0,
      doneCount: 0,
      categoryIds: [],
    });
  });

  it("is not_found for another owner's or a deleted area", async () => {
    const other = runner(db, await createOwner(db));
    const theirs = (await other(createArea, { name: "Theirs" })).id;
    await expect(run(getAreaBoard, { areaId: theirs })).rejects.toMatchObject({
      code: "not_found",
    });
    const gone = (await run(createArea, { name: "Gone" })).id;
    await run(deleteArea, { areaId: gone });
    await expect(run(getAreaBoard, { areaId: gone })).rejects.toMatchObject({
      code: "not_found",
    });
  });
});

describe("listFilingTargets", () => {
  it("lists live areas with their non-done achievements", async () => {
    const a = (await run(createArea, { name: "A" })).id;
    const b = (await run(createArea, { name: "B", emoji: "🎸" })).id;
    const gone = (await run(createArea, { name: "Gone" })).id;
    await run(deleteArea, { areaId: gone });
    const backlog = await ach(a, "backlog one", "backlog");
    const active = await ach(a, "active one", "active");
    await ach(a, "done one", "done");
    const del = await ach(a, "deleted", "active");
    await run(deleteAchievement, { achievementId: del });
    await ach(null, "inbox");

    expect(await run(listFilingTargets, {})).toEqual([
      {
        id: a,
        name: "A",
        emoji: null,
        achievements: [
          { id: backlog, title: "backlog one", status: "backlog" },
          { id: active, title: "active one", status: "active" },
        ],
      },
      { id: b, name: "B", emoji: "🎸", achievements: [] },
    ]);
  });
});

describe("M3 progress read models", () => {
  const SAT = new Date("2026-10-24T09:00:00Z"); // week Mon 19 – Sun 25
  const daily: Recurrence = { freq: "daily", interval: 1, start: "2026-10-01" };
  let at: Run;
  beforeEach(() => {
    at = runner(db, owner, { now: SAT });
  });
  const task = async (
    achievementId: string,
    title: string,
    over: { deadline?: string; recurrence?: Recurrence; effort?: number } = {},
  ) => (await at(createTask, { achievementId, title, ...over })).id;

  it("overview carries progress, up next, due this week and best streak", async () => {
    const a = (await at(createArea, { name: "A" })).id;
    const b = (await at(createArea, { name: "B" })).id;
    const a1 = await ach(a, "a1", "active");
    const b1 = await ach(b, "b1", "active");
    const scales = await task(a1, "Scales", { recurrence: daily });
    for (const day of ["2026-10-22", "2026-10-23", "2026-10-24"]) {
      await runner(db, owner, { now: new Date(`${day}T09:00:00Z`) })(
        completeTask,
        { taskId: scales },
      );
    }
    await task(a1, "No date");
    await task(a1, "Sunday", { deadline: "2026-10-25" });
    await task(a1, "Next Monday", { deadline: "2026-10-26" });
    await task(a1, "Overdue", { deadline: "2026-10-20" });
    const bTask = await task(b1, "B task", { effort: 3 });
    await at(completeTask, { taskId: bTask });
    await at(createAchievement, {
      areaId: b,
      title: "Due ach",
      status: "backlog",
      deadline: "2026-10-24",
    });
    await at(createAchievement, {
      areaId: b,
      title: "Done ach",
      status: "done",
      deadline: "2026-10-21",
    });

    const o = await at(getOverview, {});
    const [ao, bo] = o.areas;
    expect(ao!.progress.streak).toBe(3);
    expect(ao!.progress.xp).toBe(75);
    expect(bo!.progress).toMatchObject({ xp: 50, streak: 1, trophies: 1 });
    expect(o.bestStreak).toBe(3);
    // Sunday + Overdue tasks, and the backlog achievement due Saturday.
    expect(o.dueThisWeek).toBe(3);
    // Scales is done today, so the earliest deadline wins.
    expect(ao!.upNext).toMatchObject({ title: "Overdue", achievementId: a1 });
    expect(bo!.upNext).toBeNull();
  });

  it("up next is null when nothing is active", async () => {
    const a = (await at(createArea, { name: "A" })).id;
    await task(await ach(a, "later"), "Not yet");
    expect((await at(getOverview, {})).areas[0]!.upNext).toBeNull();
  });

  it("week start moves the end of 'this week'", async () => {
    const a = (await at(createArea, { name: "A" })).id;
    await task(await ach(a, "a1", "active"), "Sunday", {
      deadline: "2026-10-25",
    });
    await at(updateSettings, { weekStart: 0 }); // week Sun 18 – Sat 24
    expect((await at(getOverview, {})).dueThisWeek).toBe(0);
  });

  it("getActive lists today's practice, due soon and active groups", async () => {
    const a = (await at(createArea, { name: "A", emoji: "🎸" })).id;
    const a1 = await ach(a, "a1", "active");
    const later = await ach(a, "later");
    const scales = await task(a1, "Scales", { recurrence: daily });
    await task(a1, "Ended", {
      recurrence: { ...daily, end: { type: "until", date: "2026-10-23" } },
    });
    await task(later, "Backlog practice", { recurrence: daily });
    await task(a1, "Soon", { deadline: "2026-10-30" });
    await task(a1, "Too far", { deadline: "2026-11-02" });
    await task(a1, "Late", { deadline: "2026-10-01" });
    await at(completeTask, { taskId: scales });

    const r = await at(getActive, {});
    expect(r.today).toBe("2026-10-24");
    expect(r.practice.map((p) => [p.title, p.doneToday])).toEqual([
      ["Scales", true],
    ]);
    expect(r.practice[0]!.area).toEqual({ id: a, name: "A", emoji: "🎸" });
    expect(r.dueSoon.map((d) => d.title)).toEqual(["Late", "Soon"]);
    expect(r.groups).toHaveLength(1);
    expect(r.groups[0]!.achievements).toEqual([
      {
        id: a1,
        title: "a1",
        deadline: null,
        taskCount: 3,
        doneCount: 0,
        upNext: expect.objectContaining({ title: "Late" }),
      },
    ]);
  });

  it("getAchievement gives recentDone within the strip window and today", async () => {
    const a = (await at(createArea, { name: "A" })).id;
    const a1 = await ach(a, "a1", "active");
    const scales = await task(a1, "Scales", { recurrence: daily });
    // The strip starts Mon Sep 28 for Sat Oct 24 with a Monday week.
    for (const day of ["2026-10-01", "2026-10-24"]) {
      await runner(db, owner, { now: new Date(`${day}T09:00:00Z`) })(
        completeTask,
        { taskId: scales },
      );
    }
    const r = await at(getAchievement, { achievementId: a1 });
    expect(r.today).toBe("2026-10-24");
    expect(r.weekStart).toBe(1);
    expect(r.tasks[0]!.recentDone).toEqual(["2026-10-01", "2026-10-24"]);
    expect(r.tasks[0]!.hasCompletions).toBe(true);
    await task(a1, "Fresh", { recurrence: daily });
    const fresh = (await at(getAchievement, { achievementId: a1 })).tasks[1]!;
    expect(fresh).toMatchObject({ recentDone: [], hasCompletions: false });
  });
});

it("listJumpTargets lists live achievements with their area", async () => {
  const a = (await run(createArea, { name: "A", emoji: "🎸" })).id;
  const b = (await run(createArea, { name: "B" })).id;
  await ach(b, "b-backlog");
  await ach(a, "a-done", "done");
  await ach(a, "a-active", "active");
  await ach(null, "inbox");
  const gone = await ach(a, "gone");
  await run(deleteAchievement, { achievementId: gone });
  const r = await run(listJumpTargets, {});
  expect(r.map((t) => t.title)).toEqual(["a-active", "a-done", "b-backlog"]);
  expect(r[0]).toMatchObject({
    status: "active",
    area: { id: a, name: "A", emoji: "🎸" },
  });
});
