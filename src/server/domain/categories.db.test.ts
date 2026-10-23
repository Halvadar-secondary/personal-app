import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { changeEvents } from "@/server/db/schema";
import type { Db } from "@/server/db/types";
import { createTestDb } from "@/test/db";
import { createOwner, type Run, runner } from "@/test/factories";
import { createAchievement, getAchievement } from "./achievements";
import { createArea } from "./areas";
import {
  createCategory,
  deleteCategory,
  listCategories,
  setTaskCategories,
  updateCategory,
} from "./categories";
import { createTasks } from "./tasks";

let db: Db;
let close: () => Promise<void>;
let run: Run;
let guitar: string;
let sweep: string;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  run = runner(db, await createOwner(db));
  guitar = (await run(createArea, { name: "Guitar" })).id;
  sweep = (await run(createAchievement, { areaId: guitar, title: "Sweep" })).id;
});
afterEach(() => close());

const cat = (name: string) => run(createCategory, { name, color: "blue" });
const threeTasks = () =>
  run(createTasks, {
    achievementId: sweep,
    tasks: [{ title: "a" }, { title: "b" }, { title: "c" }],
  });

describe("categories", () => {
  it("creates and rejects a case-insensitive duplicate with conflict", async () => {
    const theory = await cat("Theory");
    expect(theory).toMatchObject({ name: "Theory", color: "blue" });
    await expect(cat(" theory ")).rejects.toMatchObject({ code: "conflict" });
    const tech = await cat("Technique");
    await expect(
      run(updateCategory, { categoryId: tech.id, name: "THEORY" }),
    ).rejects.toMatchObject({ code: "conflict" });
    const renamed = await run(updateCategory, {
      categoryId: tech.id,
      name: "technique",
      color: "red",
    });
    expect(renamed).toMatchObject({ name: "technique", color: "red" });
  });

  it("sets, replaces and clears a task's categories with one event each", async () => {
    const [a, b, c] = await Promise.all(["A", "B", "C"].map(cat));
    const [task] = await threeTasks();
    const set = (ids: string[]) =>
      run(setTaskCategories, { taskId: task!.id, categoryIds: ids });
    await set([b!.id, a!.id]);
    await set([b!.id, c!.id]);
    expect(await set([])).toEqual({ categoryIds: [] });
    const events = await db
      .select()
      .from(changeEvents)
      .where(eq(changeEvents.entityType, "task_categories"));
    expect(events.map((e) => [e.before, e.after])).toEqual([
      [{ categoryIds: [] }, { categoryIds: [a!.id, b!.id].sort() }],
      [
        { categoryIds: [a!.id, b!.id].sort() },
        { categoryIds: [b!.id, c!.id].sort() },
      ],
      [{ categoryIds: [b!.id, c!.id].sort() }, { categoryIds: [] }],
    ]);
    expect(events.every((e) => e.entityId === task!.id)).toBe(true);
  });

  it("rejects a deleted category on a task", async () => {
    const a = await cat("A");
    const [task] = await threeTasks();
    expect(await run(deleteCategory, { categoryId: a.id })).toEqual({
      deleted: 1,
    });
    await expect(
      run(setTaskCategories, { taskId: task!.id, categoryIds: [a.id] }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("rejects duplicate ids in one set", async () => {
    const a = await cat("A");
    const [task] = await threeTasks();
    await expect(
      run(setTaskCategories, { taskId: task!.id, categoryIds: [a.id, a.id] }),
    ).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("lists categories used in this area first", async () => {
    const technique = await cat("Technique");
    const theory = await cat("Theory");
    await cat("Exposure");
    const [t1, t2, t3] = await threeTasks();
    await run(setTaskCategories, {
      taskId: t1!.id,
      categoryIds: [technique.id, theory.id],
    });
    await run(setTaskCategories, {
      taskId: t2!.id,
      categoryIds: [technique.id],
    });
    await run(setTaskCategories, { taskId: t3!.id, categoryIds: [] });
    const inArea = await run(listCategories, { areaId: guitar });
    expect(inArea.map((c) => [c.name, c.usedInArea])).toEqual([
      ["Technique", 2],
      ["Theory", 1],
      ["Exposure", 0],
    ]);
    const all = await run(listCategories, {});
    expect(all.map((c) => [c.name, c.usedInArea])).toEqual([
      ["Exposure", 0],
      ["Technique", 0],
      ["Theory", 0],
    ]);
  });

  it("getAchievement shows categoryIds and hides deleted categories", async () => {
    const a = await cat("A");
    const b = await cat("B");
    const [task] = await threeTasks();
    await run(setTaskCategories, {
      taskId: task!.id,
      categoryIds: [a.id, b.id],
    });
    await run(deleteCategory, { categoryId: b.id });
    const r = await run(getAchievement, { achievementId: sweep });
    expect(r.tasks[0]!.categoryIds).toEqual([a.id]);
    expect(r.tasks[1]!.categoryIds).toEqual([]);
  });
});
