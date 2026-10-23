import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { changeEvents, tasks } from "@/server/db/schema";
import type { Db } from "@/server/db/types";
import { createTestDb } from "@/test/db";
import { createOwner, FIXED_NOW, type Run, runner } from "@/test/factories";
import {
  createAchievement,
  deleteAchievement,
  getAchievement,
  listAchievements,
  moveAchievement,
  updateAchievement,
} from "./achievements";
import { createArea, deleteArea } from "./areas";

let db: Db;
let close: () => Promise<void>;
let owner: string;
let run: Run;
let guitar: string;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  owner = await createOwner(db);
  run = runner(db, owner);
  guitar = (await run(createArea, { name: "Guitar" })).id;
});
afterEach(() => close());

const titles = async (areaId: string | null, status?: "active") =>
  (await run(listAchievements, { areaId, status })).map((a) => a.title);

async function addTasks(
  achievementId: string,
  areaId: string | null,
  n: number,
) {
  await db.insert(tasks).values(
    Array.from({ length: n }, (_, i) => ({
      ownerId: owner,
      achievementId,
      areaId,
      title: `t${i}`,
      sortKey: `a${i}`,
    })),
  );
}

describe("achievements", () => {
  it("creates in backlog by default, appended within (area, status)", async () => {
    const a = await run(createAchievement, { areaId: guitar, title: "Sweep" });
    await run(createAchievement, { areaId: guitar, title: "Modes" });
    await run(createAchievement, {
      areaId: guitar,
      title: "Legato",
      status: "active",
    });
    expect(a.status).toBe("backlog");
    expect(await titles(guitar)).toEqual(["Sweep", "Modes", "Legato"]);
    expect(await titles(guitar, "active")).toEqual(["Legato"]);
  });

  it("creates in the Inbox with areaId null", async () => {
    const a = await run(createAchievement, { areaId: null, title: "Dorian" });
    expect(a.areaId).toBeNull();
    expect(await titles(null)).toEqual(["Dorian"]);
  });

  it("rejects a deleted or foreign area as parent", async () => {
    const other = await createOwner(db);
    const foreign = (await runner(db, other)(createArea, { name: "X" })).id;
    const gone = (await run(createArea, { name: "Gone" })).id;
    await run(deleteArea, { areaId: gone });
    for (const areaId of [foreign, gone]) {
      await expect(
        run(createAchievement, { areaId, title: "x" }),
      ).rejects.toMatchObject({ code: "not_found" });
    }
  });

  it("moves Backlog → Active between two cards", async () => {
    const mk = (title: string, status?: "active") =>
      run(createAchievement, { areaId: guitar, title, status });
    const sweep = await mk("Sweep");
    const a1 = await mk("A1", "active");
    const a2 = await mk("A2", "active");
    const moved = await run(moveAchievement, {
      achievementId: sweep.id,
      status: "active",
      afterId: a1.id,
      beforeId: a2.id,
    });
    expect(moved.status).toBe("active");
    expect(await titles(guitar, "active")).toEqual(["A1", "Sweep", "A2"]);
  });

  it("entering done stamps completedAt; leaving clears it", async () => {
    const a = await run(createAchievement, { areaId: guitar, title: "Sweep" });
    const done = await run(moveAchievement, {
      achievementId: a.id,
      status: "done",
    });
    expect(done.completedAt).toEqual(FIXED_NOW);
    const back = await run(moveAchievement, {
      achievementId: a.id,
      status: "active",
    });
    expect(back.completedAt).toBeNull();
  });

  it("moving to another area moves its tasks' areaId in the same batch", async () => {
    const singing = (await run(createArea, { name: "Singing" })).id;
    const a = await run(createAchievement, { areaId: guitar, title: "Breath" });
    await addTasks(a.id, guitar, 2);
    const moved = await run(moveAchievement, {
      achievementId: a.id,
      areaId: singing,
    });
    expect(moved.areaId).toBe(singing);
    const rows = await db.select().from(tasks);
    expect(rows.map((t) => t.areaId)).toEqual([singing, singing]);
    const events = await db
      .select()
      .from(changeEvents)
      .where(eq(changeEvents.op, "update"));
    expect(events.map((e) => e.entityType).sort()).toEqual([
      "achievement",
      "task",
      "task",
    ]);
    expect(new Set(events.map((e) => e.batchId)).size).toBe(1);
  });

  it("moving to the Inbox (areaId null) clears its tasks' areaId", async () => {
    const a = await run(createAchievement, { areaId: guitar, title: "Sweep" });
    await addTasks(a.id, guitar, 2);
    await run(moveAchievement, { achievementId: a.id, areaId: null });
    const rows = await db.select().from(tasks);
    expect(rows.every((t) => t.areaId === null)).toBe(true);
    expect(await titles(null)).toEqual(["Sweep"]);
  });

  it("updates title, notes and deadline", async () => {
    const a = await run(createAchievement, { areaId: guitar, title: "Sweep" });
    const u = await run(updateAchievement, {
      achievementId: a.id,
      title: "Sweep pick",
      notes: "slow first",
      deadline: "2026-12-31",
    });
    expect(u).toMatchObject({
      title: "Sweep pick",
      notes: "slow first",
      deadline: "2026-12-31",
    });
  });

  it("rejects deadline that is not YYYY-MM-DD", async () => {
    for (const deadline of ["2026-13-01", "tomorrow"]) {
      await expect(
        run(createAchievement, { areaId: guitar, title: "x", deadline }),
      ).rejects.toMatchObject({ code: "invalid_input" });
    }
  });

  it("delete cascades to tasks and hides from listAchievements", async () => {
    const a = await run(createAchievement, { areaId: guitar, title: "Sweep" });
    await addTasks(a.id, guitar, 2);
    expect(await run(deleteAchievement, { achievementId: a.id })).toEqual({
      deleted: 3,
    });
    expect(await titles(guitar)).toEqual([]);
    const rows = await db.select().from(tasks);
    expect(rows.every((t) => t.deletedAt !== null)).toBe(true);
    await expect(
      run(getAchievement, { achievementId: a.id }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("gets an achievement with its live tasks in order", async () => {
    const a = await run(createAchievement, { areaId: guitar, title: "Sweep" });
    await addTasks(a.id, guitar, 3);
    const r = await run(getAchievement, { achievementId: a.id });
    expect(r.achievement.id).toBe(a.id);
    expect(r.tasks.map((t) => t.title)).toEqual(["t0", "t1", "t2"]);
    expect(r.tasks[0]!.categoryIds).toEqual([]);
  });
});
