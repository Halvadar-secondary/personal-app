import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  achievements,
  areas,
  changeEvents,
  taskCompletions,
  tasks,
} from "@/server/db/schema";
import type { Db } from "@/server/db/types";
import { createTestDb } from "@/test/db";
import { createOwner, type Run, runner } from "@/test/factories";
import {
  createAchievement,
  deleteAchievement,
  moveAchievement,
} from "./achievements";
import {
  createArea,
  deleteArea,
  getArea,
  listAreas,
  updateArea,
  reorderArea,
} from "./areas";
import {
  createCategory,
  deleteCategory,
  setTaskCategories,
} from "./categories";
import {
  completeTask,
  createTask,
  createTasks,
  deleteTask,
  uncompleteTask,
} from "./tasks";
import { undoBatch } from "./undo";

let db: Db;
let close: () => Promise<void>;
let run: Run;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  run = runner(db, await createOwner(db));
});
afterEach(() => close());

/** The batch id of the most recent action. */
async function lastBatch(): Promise<string> {
  const events = await db.select().from(changeEvents);
  return events.sort((a, b) => a.seq - b.seq).at(-1)!.batchId;
}

const undoLast = async () => run(undoBatch, { batchId: await lastBatch() });

describe("undoBatch", () => {
  it("undoes an area update", async () => {
    const area = await run(createArea, { name: "Guitar" });
    await run(updateArea, { areaId: area.id, name: "Bass" });
    const updateBatch = await lastBatch();
    const r = await run(undoBatch, { batchId: updateBatch });
    expect(r.restored).toBe(1);
    expect(r.batchId).not.toBe(updateBatch);
    expect((await run(getArea, { areaId: area.id })).name).toBe("Guitar");
    const restores = (await db.select().from(changeEvents)).filter(
      (e) => e.op === "restore",
    );
    expect(restores).toHaveLength(1);
    expect(restores[0]).toMatchObject({
      batchId: r.batchId,
      entityId: area.id,
    });
    const undone = (await db.select().from(changeEvents)).filter(
      (e) => e.batchId === updateBatch,
    );
    expect(undone[0]).toMatchObject({ undoneByBatch: r.batchId });
    expect(undone[0]!.undoneAt).not.toBeNull();
  });

  it("undoes a create (row soft-deleted) and a delete cascade (all rows back)", async () => {
    const area = await run(createArea, { name: "Guitar" });
    const ach = await run(createAchievement, {
      areaId: area.id,
      title: "Sweep",
    });
    await run(createTasks, {
      achievementId: ach.id,
      tasks: [{ title: "a" }, { title: "b" }],
    });
    await run(deleteArea, { areaId: area.id });
    expect((await undoLast()).restored).toBe(4);
    expect((await run(listAreas, {})).map((a) => a.name)).toEqual(["Guitar"]);
    const live = (await db.select().from(tasks)).filter((t) => !t.deletedAt);
    expect(live).toHaveLength(2);
    const [a] = await db.select().from(achievements);
    expect(a!.deletedAt).toBeNull();

    const created = await run(createArea, { name: "Singing" });
    await undoLast();
    await expect(run(getArea, { areaId: created.id })).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("undoes createTasks ×15 as one step", async () => {
    await run(createTasks, {
      achievementId: null,
      tasks: Array.from({ length: 15 }, (_, i) => ({ title: `t${i}` })),
    });
    expect((await undoLast()).restored).toBe(15);
    const rows = await db.select().from(tasks);
    expect(rows.every((t) => t.deletedAt !== null)).toBe(true);
  });

  it("undoes a cross-area achievement move, restoring the tasks' areaId", async () => {
    const guitar = (await run(createArea, { name: "Guitar" })).id;
    const singing = (await run(createArea, { name: "Singing" })).id;
    const ach = await run(createAchievement, {
      areaId: guitar,
      title: "Breath",
    });
    await run(createTasks, {
      achievementId: ach.id,
      tasks: [{ title: "a" }, { title: "b" }],
    });
    await run(moveAchievement, { achievementId: ach.id, areaId: singing });
    expect((await undoLast()).restored).toBe(3);
    const [a] = await db.select().from(achievements);
    expect(a!.areaId).toBe(guitar);
    const rows = await db.select().from(tasks);
    expect(rows.map((t) => t.areaId)).toEqual([guitar, guitar]);
  });

  it("undoes complete (completion row gone) and uncomplete (row back with the same xp)", async () => {
    const area = await run(createArea, { name: "Guitar" });
    const ach = await run(createAchievement, { areaId: area.id, title: "S" });
    const t = await run(createTask, {
      achievementId: ach.id,
      title: "x",
      effort: 3,
    });
    await run(completeTask, { taskId: t.id });
    await undoLast();
    expect(await db.$count(taskCompletions)).toBe(0);
    const [open] = await db.select().from(tasks);
    expect(open!.completedAt).toBeNull();

    const { completion } = await run(completeTask, { taskId: t.id });
    await run(uncompleteTask, { taskId: t.id });
    await undoLast();
    const [back] = await db.select().from(taskCompletions);
    expect(back).toMatchObject({ id: completion.id, xpAwarded: 50 });
    const [done] = await db.select().from(tasks);
    expect(done!.completedAt).not.toBeNull();
  });

  it("undoes setTaskCategories", async () => {
    const a = await run(createCategory, { name: "A", color: "x" });
    const b = await run(createCategory, { name: "B", color: "x" });
    const t = await run(createTask, { achievementId: null, title: "x" });
    await run(setTaskCategories, { taskId: t.id, categoryIds: [a.id] });
    await run(setTaskCategories, { taskId: t.id, categoryIds: [b.id] });
    await undoLast();
    const set = await run(setTaskCategories, {
      taskId: t.id,
      categoryIds: [a.id],
    });
    expect(set.categoryIds).toEqual([a.id]);
    const events = (await db.select().from(changeEvents))
      .filter((e) => e.entityType === "task_categories")
      .sort((x, y) => x.seq - y.seq);
    // set A, set B, restore → A, set A (no-op change)
    expect(events.map((e) => e.after)).toEqual([
      { categoryIds: [a.id] },
      { categoryIds: [b.id] },
      { categoryIds: [a.id] },
      { categoryIds: [a.id] },
    ]);
  });

  it("refuses when a later batch changed an entity, naming it", async () => {
    const area = await run(createArea, { name: "Guitar" });
    await run(updateArea, { areaId: area.id, name: "A" });
    const batchA = await lastBatch();
    await run(updateArea, { areaId: area.id, name: "B" });
    const err = await run(undoBatch, { batchId: batchA }).catch((e) => e);
    expect(err).toMatchObject({
      code: "conflict",
      details: {
        changed: [{ entityType: "area", entityId: area.id, label: "B" }],
      },
    });
  });

  it("undoing an untick after a same-day re-tick is a conflict, not a crash", async () => {
    const area = await run(createArea, { name: "Guitar" });
    const ach = await run(createAchievement, {
      areaId: area.id,
      title: "Sweep",
    });
    const task = await run(createTask, {
      achievementId: ach.id,
      title: "Scales",
      recurrence: { freq: "daily", interval: 1, start: "2026-03-01" },
    });
    await run(completeTask, { taskId: task.id });
    await run(uncompleteTask, { taskId: task.id });
    const untick = await lastBatch();
    await run(completeTask, { taskId: task.id });
    await expect(run(undoBatch, { batchId: untick })).rejects.toMatchObject({
      code: "conflict",
    });
    const rows = await db
      .select()
      .from(taskCompletions)
      .where(eq(taskCompletions.taskId, task.id));
    expect(rows).toHaveLength(1);
  });

  it("allows it once the later batch is undone", async () => {
    const area = await run(createArea, { name: "Guitar" });
    await run(updateArea, { areaId: area.id, name: "A" });
    const batchA = await lastBatch();
    await run(updateArea, { areaId: area.id, name: "B" });
    await undoLast();
    await run(undoBatch, { batchId: batchA });
    expect((await run(getArea, { areaId: area.id })).name).toBe("Guitar");
  });

  it("undo of the undo re-applies the change", async () => {
    const area = await run(createArea, { name: "Guitar" });
    await run(updateArea, { areaId: area.id, name: "A" });
    const u = await undoLast();
    await run(undoBatch, { batchId: u.batchId });
    expect((await run(getArea, { areaId: area.id })).name).toBe("A");
  });

  it("undoing the same batch twice is already_undone; unknown batch is not_found", async () => {
    await run(createArea, { name: "Guitar" });
    const batch = await lastBatch();
    await run(undoBatch, { batchId: batch });
    await expect(run(undoBatch, { batchId: batch })).rejects.toMatchObject({
      code: "already_undone",
    });
    await expect(
      run(undoBatch, { batchId: crypto.randomUUID() }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("a failing undo leaves no partial restore", async () => {
    const guitar = await run(createArea, { name: "Guitar" });
    const singing = await run(createArea, { name: "Singing" });
    const both = await run(createTasks, {
      achievementId: null,
      tasks: [{ title: "one" }, { title: "two" }],
    });
    const batch = await lastBatch();
    await run(updateArea, { areaId: guitar.id, name: "G" });
    await run(updateArea, { areaId: singing.id, name: "S" });
    // Change only the second task in a later batch.
    await db
      .update(tasks)
      .set({ title: "changed" })
      .where(eq(tasks.id, both[1]!.id));
    const before = await db.$count(changeEvents);
    await expect(run(undoBatch, { batchId: batch })).rejects.toMatchObject({
      code: "conflict",
      details: { changed: [{ entityType: "task", entityId: both[1]!.id }] },
    });
    expect(await db.$count(changeEvents)).toBe(before);
    const rows = await db.select().from(tasks);
    expect(rows.every((t) => t.deletedAt === null)).toBe(true);
    expect(await db.$count(areas)).toBe(2);
  });

  // Final-review regressions: undo must keep cross-entity invariants.

  it("undoing a move resyncs tasks added after it", async () => {
    const p = (await run(createArea, { name: "P" })).id;
    const q = (await run(createArea, { name: "Q" })).id;
    const x = await run(createAchievement, { areaId: p, title: "X" });
    await run(moveAchievement, { achievementId: x.id, areaId: q });
    const move = await lastBatch();
    const t2 = await run(createTask, { achievementId: x.id, title: "later" });
    expect(t2.areaId).toBe(q);
    await run(undoBatch, { batchId: move });
    const [row] = await db.select().from(tasks).where(eq(tasks.id, t2.id));
    expect(row!.areaId).toBe(p);
  });

  it("undoing a task delete takes the achievement's current area", async () => {
    const p = (await run(createArea, { name: "P" })).id;
    const q = (await run(createArea, { name: "Q" })).id;
    const x = await run(createAchievement, { areaId: p, title: "X" });
    const t = await run(createTask, { achievementId: x.id, title: "t" });
    await run(deleteTask, { taskId: t.id });
    const del = await lastBatch();
    await run(moveAchievement, { achievementId: x.id, areaId: q });
    await run(undoBatch, { batchId: del });
    const [row] = await db.select().from(tasks).where(eq(tasks.id, t.id));
    expect(row).toMatchObject({ deletedAt: null, areaId: q });
  });

  it("refuses to undo a create while the row has live children, naming them", async () => {
    const p = await run(createArea, { name: "P" });
    const create = await lastBatch();
    const x = await run(createAchievement, { areaId: p.id, title: "X" });
    await expect(run(undoBatch, { batchId: create })).rejects.toMatchObject({
      code: "conflict",
      details: { changed: [{ entityType: "achievement", entityId: x.id }] },
    });
    expect((await run(getArea, { areaId: p.id })).name).toBe("P");
  });

  it("refuses to revive a row whose parent was deleted since, naming it", async () => {
    const x = await run(createAchievement, { areaId: null, title: "X" });
    const [a, b] = await run(createTasks, {
      achievementId: x.id,
      tasks: [{ title: "a" }, { title: "b" }],
    });
    await run(deleteTask, { taskId: a!.id });
    const del = await lastBatch();
    await run(deleteAchievement, { achievementId: x.id });
    expect(b).toBeDefined();
    await expect(run(undoBatch, { batchId: del })).rejects.toMatchObject({
      code: "conflict",
      details: { changed: [{ entityType: "achievement", entityId: x.id }] },
    });
  });

  it("undo rekeys a restored row whose sort key was taken since", async () => {
    const made = [];
    for (const name of ["A", "B", "C", "D"]) {
      made.push(await run(createArea, { name }));
    }
    await run(deleteArea, { areaId: made[1]!.id });
    const del = await lastBatch();
    await run(reorderArea, { areaId: made[3]!.id, afterId: made[0]!.id });
    await run(undoBatch, { batchId: del });
    const keys = (await run(listAreas, {})).map((x) => x.sortKey);
    expect(new Set(keys).size).toBe(4);
    await run(reorderArea, { areaId: made[2]!.id, afterId: made[1]!.id });
    expect(await db.$count(areas)).toBe(4);
  });

  it("undoing a category delete whose name was taken since is a conflict", async () => {
    const c1 = await run(createCategory, { name: "Theory", color: "x" });
    await run(deleteCategory, { categoryId: c1.id });
    const del = await lastBatch();
    const c2 = await run(createCategory, { name: "theory", color: "y" });
    await expect(run(undoBatch, { batchId: del })).rejects.toMatchObject({
      code: "conflict",
      details: { changed: [{ entityType: "category", entityId: c2.id }] },
    });
  });
});
