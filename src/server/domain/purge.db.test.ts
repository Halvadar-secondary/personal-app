import { eq, inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  achievements,
  areas,
  categories,
  changeEvents,
  practiceEntries,
  taskCategories,
  taskCompletions,
  tasks,
} from "@/server/db/schema";
import type { Db } from "@/server/db/types";
import { createTestDb } from "@/test/db";
import { createOwner, FIXED_NOW, type Run, runner } from "@/test/factories";
import {
  createAchievement,
  deleteAchievement,
  moveAchievement,
} from "./achievements";
import { createArea, deleteArea } from "./areas";
import {
  createCategory,
  deleteCategory,
  setTaskCategories,
} from "./categories";
import { DomainError } from "./errors";
import { addPracticeEntry } from "./practice";
import { purgeDeleted } from "./purge";
import { completeTask, createTask } from "./tasks";
import { undoBatch } from "./undo";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date(FIXED_NOW.getTime() + 200 * DAY);
const daysAgo = (d: number) => new Date(NOW.getTime() - d * DAY);

let db: Db;
let close: () => Promise<void>;
let run: Run;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  run = runner(db, await createOwner(db));
});
afterEach(() => close());

/** Moves every soft-deleted row's deleted_at to `when`. */
async function backdate(when: Date) {
  for (const t of [areas, achievements, tasks, categories, practiceEntries]) {
    const table = t as typeof areas;
    await db
      .update(table)
      .set({ deletedAt: when })
      .where(inArray(table.deletedAt, [FIXED_NOW]));
  }
}

async function lastBatch(): Promise<string> {
  const events = await db.select().from(changeEvents);
  return events.sort((a, b) => a.seq - b.seq).at(-1)!.batchId;
}

async function areaWithEverything() {
  const area = await run(createArea, { name: "Guitar" });
  const ach = await run(createAchievement, {
    areaId: area.id,
    title: "Learn scales",
  });
  const task = await run(createTask, {
    achievementId: ach.id,
    title: "C major",
  });
  const cat = await run(createCategory, { name: "Practice", color: "blue" });
  await run(setTaskCategories, { taskId: task.id, categoryIds: [cat.id] });
  await run(completeTask, { taskId: task.id });
  await run(addPracticeEntry, { taskId: task.id, durationSeconds: 60 });
  return { area, ach, task, cat };
}

/** The ids left in a goals table. */
async function ids(
  t: typeof areas | typeof achievements | typeof tasks | typeof categories,
) {
  const table = t as typeof areas;
  return (await db.select({ id: table.id }).from(table)).map((r) => r.id);
}

describe("purgeDeleted", () => {
  it("purges an area deleted 91 days ago, with its achievements, tasks, their completions, categories links and events", async () => {
    const { area, ach, task, cat } = await areaWithEverything();
    await run(deleteArea, { areaId: area.id });
    await backdate(daysAgo(91));

    await purgeDeleted(db, NOW);

    expect(await ids(areas)).toEqual([]);
    expect(await ids(achievements)).toEqual([]);
    expect(await ids(tasks)).toEqual([]);
    expect(await db.select().from(taskCompletions)).toEqual([]);
    expect(await db.select().from(practiceEntries)).toEqual([]);
    expect(await db.select().from(taskCategories)).toEqual([]);
    // The category itself was never deleted.
    expect(await ids(categories)).toEqual([cat.id]);
    const left = await db.select().from(changeEvents);
    expect(left.map((e) => e.entityId)).not.toContain(area.id);
    expect(left.map((e) => e.entityId)).not.toContain(ach.id);
    expect(left.map((e) => e.entityId)).not.toContain(task.id);
    expect(left.every((e) => e.entityType === "category")).toBe(true);
  });

  it("keeps rows deleted 89 days ago, and live rows", async () => {
    const { area } = await areaWithEverything();
    const kept = await run(createArea, { name: "Running" });
    await run(deleteArea, { areaId: area.id });
    await backdate(daysAgo(89));

    const counts = await purgeDeleted(db, NOW);

    expect((await ids(areas)).sort()).toEqual([area.id, kept.id].sort());
    expect(await ids(tasks)).toHaveLength(1);
    expect(counts).toEqual({
      tasks: 0,
      achievements: 0,
      areas: 0,
      categories: 0,
      goals: 0,
      practiceEntries: 0,
      completions: 0,
      events: 0,
    });
  });

  it("keeps a deleted parent a live row still points at", async () => {
    const area = await run(createArea, { name: "Guitar" });
    const ach = await run(createAchievement, {
      areaId: area.id,
      title: "Learn scales",
    });
    const task = await run(createTask, {
      achievementId: ach.id,
      title: "C major",
    });
    const gone = await run(createAchievement, {
      areaId: area.id,
      title: "Old",
    });
    await run(deleteAchievement, { achievementId: gone.id });
    // Inconsistent on purpose: an old deleted achievement with a live task.
    await db
      .update(achievements)
      .set({ deletedAt: daysAgo(120) })
      .where(eq(achievements.id, ach.id));
    await backdate(daysAgo(120));

    const counts = await purgeDeleted(db, NOW);

    expect(await ids(achievements)).toEqual([ach.id]);
    expect(await ids(tasks)).toEqual([task.id]);
    expect(counts.achievements).toBe(1);
  });

  it("purges a category and its links; category events naming it are dropped", async () => {
    const area = await run(createArea, { name: "Guitar" });
    const ach = await run(createAchievement, {
      areaId: area.id,
      title: "Learn scales",
    });
    const task = await run(createTask, {
      achievementId: ach.id,
      title: "C major",
    });
    const cat = await run(createCategory, { name: "Practice", color: "blue" });
    await run(setTaskCategories, { taskId: task.id, categoryIds: [cat.id] });
    const linkBatch = await lastBatch();
    await run(deleteCategory, { categoryId: cat.id });
    await backdate(daysAgo(91));

    const counts = await purgeDeleted(db, NOW);

    expect(counts.categories).toBe(1);
    expect(await db.select().from(categories)).toEqual([]);
    expect(await db.select().from(taskCategories)).toEqual([]);
    const left = await db.select().from(changeEvents);
    expect(left.map((e) => e.batchId)).not.toContain(linkBatch);
    expect(left.map((e) => e.entityId)).not.toContain(cat.id);
    expect(await ids(tasks)).toEqual([task.id]);
  });

  it("undo of a move from a purged area refuses", async () => {
    const a = await run(createArea, { name: "Old area" });
    const b = await run(createArea, { name: "New area" });
    const ach = await run(createAchievement, {
      areaId: a.id,
      title: "Learn scales",
    });
    await run(moveAchievement, { achievementId: ach.id, areaId: b.id });
    const moveBatch = await lastBatch();
    await run(deleteArea, { areaId: a.id });
    await backdate(daysAgo(91));
    await purgeDeleted(db, NOW);

    await expect(run(undoBatch, { batchId: moveBatch })).rejects.toThrow(
      DomainError,
    );
    const [still] = await db
      .select()
      .from(achievements)
      .where(eq(achievements.id, ach.id));
    expect(still!.areaId).toBe(b.id);
  });

  it("returns the counts", async () => {
    const { area } = await areaWithEverything();
    await run(deleteArea, { areaId: area.id });
    await backdate(daysAgo(91));

    const counts = await purgeDeleted(db, NOW);

    expect(counts).toMatchObject({
      tasks: 1,
      achievements: 1,
      areas: 1,
      categories: 0,
      practiceEntries: 1,
      completions: 1,
    });
    expect(counts.events).toBeGreaterThanOrEqual(6);
  });
});
