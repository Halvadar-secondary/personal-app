import { desc } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { changeEvents, practiceEntries, tasks } from "@/server/db/schema";
import type { Db } from "@/server/db/types";
import { createTestDb } from "@/test/db";
import { createOwner, type Run, runner } from "@/test/factories";
import { createAchievement, getAchievement } from "./achievements";
import { createArea } from "./areas";
import { getDay, planTask } from "./plan";
import { createTask } from "./tasks";
import { logProgress } from "./targets";
import { undoBatch } from "./undo";

let db: Db;
let close: () => Promise<void>;
let owner: string;
let run: Run;
let ach: string;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  owner = await createOwner(db);
  run = runner(db, owner);
  const area = (await run(createArea, { name: "Reading" })).id;
  ach = (await run(createAchievement, { areaId: area, title: "Books" })).id;
});
afterEach(() => close());

const target = async (amount: number, unit: string) =>
  (
    await run(createTask, {
      achievementId: ach,
      title: `${amount} ${unit}`,
      target: { amount, unit },
    })
  ).id;

describe("logProgress", () => {
  it("adds up pages", async () => {
    const id = await target(400, "pages");
    await run(logProgress, { taskId: id, amount: 20 });
    const r = await run(logProgress, { taskId: id, amount: 14, note: "ch 3" });
    expect(r).toEqual({ progress: 34, completed: false });
    const entries = await db.select().from(practiceEntries);
    expect(entries.find((e) => e.note === "ch 3")).toMatchObject({
      amount: 14,
      source: "manual",
    });
  });

  it("takes hours in minutes and stores a duration", async () => {
    const id = await target(10, "hours");
    const r = await run(logProgress, { taskId: id, amount: 90 });
    expect(r.progress).toBe(1.5);
    const [entry] = await db.select().from(practiceEntries);
    expect(entry).toMatchObject({ durationSeconds: 5400, amount: null });
  });

  it("completes the task at the target, and one undo reverts both", async () => {
    const id = await target(3, "times");
    await run(logProgress, { taskId: id, amount: 2 });
    const r = await run(logProgress, { taskId: id, amount: 1 });
    expect(r).toEqual({ progress: 3, completed: true });
    let [row] = await db.select().from(tasks);
    expect(row!.completedAt).not.toBeNull();
    const [e] = await db
      .select()
      .from(changeEvents)
      .orderBy(desc(changeEvents.seq))
      .limit(1);
    await run(undoBatch, { batchId: e!.batchId });
    [row] = await db.select().from(tasks);
    expect(row!.completedAt).toBeNull();
    expect(await db.$count(practiceEntries)).toBe(2);
  });

  it("refuses a task without a target, or one already done", async () => {
    const plain = (
      await run(createTask, { achievementId: ach, title: "No target" })
    ).id;
    await expect(
      run(logProgress, { taskId: plain, amount: 1 }),
    ).rejects.toMatchObject({ code: "invalid_state" });
    const id = await target(1, "lessons");
    await run(logProgress, { taskId: id, amount: 1 });
    await expect(
      run(logProgress, { taskId: id, amount: 1 }),
    ).rejects.toMatchObject({ code: "invalid_state" });
  });

  it("shows progress on the day and on the achievement", async () => {
    const id = await target(100, "times");
    await run(planTask, {
      taskId: id,
      plan: { type: "day", date: "2026-03-10" },
    });
    await run(logProgress, { taskId: id, amount: 5 });
    const d = await run(getDay, {});
    expect(d.sections.spare[0]!.target).toEqual({
      amount: 100,
      unit: "times",
      progress: 5,
    });
    const a = await run(getAchievement, { achievementId: ach });
    expect(a.tasks[0]!.progress).toBe(5);
  });
});
