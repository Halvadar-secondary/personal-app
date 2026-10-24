import { afterEach, beforeEach, expect, it } from "vitest";
import { z } from "zod";
import type { Recurrence } from "@/lib/recurrence";
import type { Db } from "@/server/db/types";
import { createTestDb } from "@/test/db";
import { createOwner, deps, type Run, runner } from "@/test/factories";
import { createAchievement, deleteAchievement } from "./achievements";
import { createArea } from "./areas";
import { defineAction, runAction } from "./context";
import { areaProgress } from "./progress";
import { completeTask, createTask, deleteTask } from "./tasks";
import { undoBatch } from "./undo";

let db: Db;
let close: () => Promise<void>;
let owner: string;
let run: Run;
let area: string;
let ach: string;

const SAT = new Date("2026-10-24T09:00:00Z");
const daily: Recurrence = { freq: "daily", interval: 1, start: "2026-10-01" };

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  owner = await createOwner(db);
  run = runner(db, owner, { now: SAT });
  area = (await run(createArea, { name: "Guitar" })).id;
  ach = (
    await run(createAchievement, {
      areaId: area,
      title: "Sweep",
      status: "active",
    })
  ).id;
});
afterEach(() => close());

const progressOf = defineAction(
  z.object({ ids: z.array(z.string()) }),
  (ctx, { ids }) => areaProgress(ctx, ids),
);
const progress = async (id = area) =>
  (await run(progressOf, { ids: [id] })).get(id)!;

const done = async (effort: number, achievementId = ach) => {
  const t = await run(createTask, { achievementId, title: "t", effort });
  await run(completeTask, { taskId: t.id });
  return t.id;
};

it("sums XP into a level", async () => {
  await done(5);
  await done(4);
  const p = await progress();
  expect(p.xp).toBe(300);
  expect(p.level).toEqual({ level: 3, into: 0, span: 300 });
});

it("streak counts consecutive local days", async () => {
  const t = await run(createTask, {
    achievementId: ach,
    title: "Scales",
    recurrence: daily,
  });
  for (const day of ["2026-10-22", "2026-10-23", "2026-10-24"]) {
    await runner(db, owner, { now: new Date(`${day}T09:00:00Z`) })(
      completeTask,
      { taskId: t.id },
    );
  }
  expect((await progress()).streak).toBe(3);
});

it("deleting a task removes its XP and undo restores it", async () => {
  const taskId = await done(5);
  expect((await progress()).xp).toBe(200);
  const batchId = crypto.randomUUID();
  await runAction({ ...deps(db, owner, SAT), batchId }, deleteTask, {
    taskId,
  });
  expect((await progress()).xp).toBe(0);
  expect((await progress()).streak).toBe(0);
  await run(undoBatch, { batchId });
  expect((await progress()).xp).toBe(200);
});

it("deleted achievements drop out of XP and trophies", async () => {
  const trophy = (
    await run(createAchievement, {
      areaId: area,
      title: "Won",
      status: "done",
    })
  ).id;
  await done(2, trophy);
  expect(await progress()).toMatchObject({ xp: 25, trophies: 1 });
  await run(deleteAchievement, { achievementId: trophy });
  expect(await progress()).toMatchObject({ xp: 0, trophies: 0 });
});

it("areas without completions are level 1, streak 0", async () => {
  expect(await progress()).toEqual({
    xp: 0,
    level: { level: 1, into: 0, span: 100 },
    streak: 0,
    trophies: 0,
  });
});
