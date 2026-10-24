import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { tasks } from "@/server/db/schema";
import type { Db } from "@/server/db/types";
import { createTestDb } from "@/test/db";
import { createOwner, type Run, runner } from "@/test/factories";
import {
  createAchievement,
  deleteAchievement,
  moveAchievement,
} from "./achievements";
import { createArea, deleteArea } from "./areas";
import { createCategory, setTaskCategories } from "./categories";
import { completeTask, createTask, deleteTask } from "./tasks";
import { getAreaBoard, getOverview, listFilingTargets } from "./views";

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
