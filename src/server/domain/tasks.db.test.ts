import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Recurrence } from "@/lib/recurrence";
import { changeEvents, taskCompletions, tasks } from "@/server/db/schema";
import type { Db } from "@/server/db/types";
import { createTestDb } from "@/test/db";
import {
  createOwner,
  deps,
  FIXED_NOW,
  type Run,
  runner,
} from "@/test/factories";
import { createAchievement, getAchievement } from "./achievements";
import { createArea } from "./areas";
import { runAction } from "./context";
import {
  completeTask,
  createTask,
  createTasks,
  deleteTask,
  moveTask,
  uncompleteTask,
  updateTask,
} from "./tasks";
import { undoBatch } from "./undo";

let db: Db;
let close: () => Promise<void>;
let owner: string;
let run: Run;
let guitar: string;
let sweep: string;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  owner = await createOwner(db);
  run = runner(db, owner);
  guitar = (await run(createArea, { name: "Guitar" })).id;
  sweep = (await run(createAchievement, { areaId: guitar, title: "Sweep" })).id;
});
afterEach(() => close());

const titlesOf = async (achievementId: string) =>
  (await run(getAchievement, { achievementId })).tasks.map((t) => t.title);

describe("tasks", () => {
  it("creates under an achievement with its areaId and default effort 2", async () => {
    const t = await run(createTask, {
      achievementId: sweep,
      title: "3 strings",
    });
    expect(t).toMatchObject({
      achievementId: sweep,
      areaId: guitar,
      effort: 2,
    });
  });

  it("creates an Inbox task with both parents null", async () => {
    const t = await run(createTask, {
      achievementId: null,
      title: "Buy a capo",
    });
    expect(t).toMatchObject({ achievementId: null, areaId: null });
  });

  it("rejects a missing achievement as parent", async () => {
    await expect(
      run(createTask, {
        achievementId: "00000000-0000-4000-8000-000000000000",
        title: "x",
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("createTasks makes 15 ordered tasks in one batch", async () => {
    await run(createTask, { achievementId: sweep, title: "first" });
    const titles = Array.from({ length: 15 }, (_, i) => `step ${i + 1}`);
    const made = await run(createTasks, {
      achievementId: sweep,
      tasks: titles.map((title) => ({ title })),
    });
    expect(made).toHaveLength(15);
    expect(await titlesOf(sweep)).toEqual(["first", ...titles]);
    const events = await db.select().from(changeEvents);
    const batches = new Set(events.slice(-15).map((e) => e.batchId));
    expect(events).toHaveLength(2 + 1 + 15);
    expect(batches.size).toBe(1);
  });

  it("createTasks with an invalid item creates nothing", async () => {
    await expect(
      run(createTasks, {
        achievementId: sweep,
        tasks: [{ title: "a" }, { title: "b" }, { title: "c", effort: 9 }],
      }),
    ).rejects.toMatchObject({ code: "invalid_input" });
    expect(await db.$count(tasks)).toBe(0);
  });

  it("reorders within an achievement and moves to another achievement", async () => {
    const singing = (await run(createArea, { name: "Singing" })).id;
    const breath = (
      await run(createAchievement, { areaId: singing, title: "Breath" })
    ).id;
    const [a, , c] = await run(createTasks, {
      achievementId: sweep,
      tasks: [{ title: "a" }, { title: "b" }, { title: "c" }],
    });
    await run(moveTask, { taskId: c!.id, beforeId: a!.id });
    expect(await titlesOf(sweep)).toEqual(["c", "a", "b"]);
    const moved = await run(moveTask, { taskId: a!.id, achievementId: breath });
    expect(moved).toMatchObject({ achievementId: breath, areaId: singing });
    expect(await titlesOf(sweep)).toEqual(["c", "b"]);
    const inbox = await run(moveTask, { taskId: c!.id, achievementId: null });
    expect(inbox).toMatchObject({ achievementId: null, areaId: null });
  });

  it("updates fields without resetting effort", async () => {
    const t = await run(createTask, {
      achievementId: sweep,
      title: "x",
      effort: 4,
    });
    const u = await run(updateTask, { taskId: t.id, title: "y", notes: "n" });
    expect(u).toMatchObject({ title: "y", notes: "n", effort: 4 });
  });

  it("completes: completedAt, completion row, xp frozen from effort", async () => {
    const t = await run(createTask, {
      achievementId: sweep,
      title: "x",
      effort: 4,
    });
    const r = await run(completeTask, { taskId: t.id });
    expect(r.task.completedAt).toEqual(FIXED_NOW);
    expect(r.completion).toMatchObject({
      taskId: t.id,
      xpAwarded: 100,
      occurrenceDate: "2026-03-10",
    });
    await run(updateTask, { taskId: t.id, effort: 1 });
    const [row] = await db.select().from(taskCompletions);
    expect(row!.xpAwarded).toBe(100);
    const events = await db.select().from(changeEvents);
    const last = events.filter((e) => e.batchId === events.at(-2)!.batchId);
    expect(last.map((e) => e.entityType).sort()).toEqual([
      "task",
      "task_completion",
    ]);
  });

  it("an Inbox task completes with 0 xp", async () => {
    const t = await run(createTask, {
      achievementId: null,
      title: "x",
      effort: 5,
    });
    const r = await run(completeTask, { taskId: t.id });
    expect(r.completion.xpAwarded).toBe(0);
  });

  it("occurrenceDate uses the owner's time zone", async () => {
    const nz = await createOwner(db, { timeZone: "Pacific/Auckland" });
    const runNz = runner(db, nz, { now: new Date("2026-03-10T11:30:00Z") });
    const t = await runNz(createTask, { achievementId: null, title: "x" });
    const r = await runNz(completeTask, { taskId: t.id });
    expect(r.completion.occurrenceDate).toBe("2026-03-11");
  });

  it("completing twice is invalid_state; uncompleting an open task is invalid_state", async () => {
    const t = await run(createTask, { achievementId: sweep, title: "x" });
    await expect(run(uncompleteTask, { taskId: t.id })).rejects.toMatchObject({
      code: "invalid_state",
    });
    await run(completeTask, { taskId: t.id });
    await expect(run(completeTask, { taskId: t.id })).rejects.toMatchObject({
      code: "invalid_state",
    });
  });

  it("uncomplete removes the completion row and its xp", async () => {
    const t = await run(createTask, { achievementId: sweep, title: "x" });
    await run(completeTask, { taskId: t.id });
    const u = await run(uncompleteTask, { taskId: t.id });
    expect(u.completedAt).toBeNull();
    expect(await db.$count(taskCompletions)).toBe(0);
    await run(completeTask, { taskId: t.id });
    expect(await db.$count(taskCompletions)).toBe(1);
  });

  it("update of a deleted task is not_found", async () => {
    const t = await run(createTask, { achievementId: sweep, title: "x" });
    expect(await run(deleteTask, { taskId: t.id })).toEqual({ deleted: 1 });
    await expect(
      run(updateTask, { taskId: t.id, title: "y" }),
    ).rejects.toMatchObject({ code: "not_found" });
    expect(await titlesOf(sweep)).toEqual([]);
  });
});

describe("repeating tasks", () => {
  const SAT = new Date("2026-10-24T09:00:00Z");
  const SUN = new Date("2026-10-25T09:00:00Z");
  const daily: Recurrence = { freq: "daily", interval: 1, start: "2026-10-01" };
  const at = (now: Date) => runner(db, owner, { now });
  const repeating = (recurrence: Recurrence, effort = 2) =>
    run(createTask, {
      achievementId: sweep,
      title: "Scales",
      effort,
      recurrence,
    });
  const completionsOf = (taskId: string) =>
    db
      .select()
      .from(taskCompletions)
      .where(eq(taskCompletions.taskId, taskId))
      .orderBy(taskCompletions.occurrenceDate);

  it("creates with a recurrence and rejects a bad one", async () => {
    const t = await repeating(daily);
    expect(t.recurrence).toEqual(daily);
    await expect(
      repeating({ ...daily, end: { type: "until", date: "2026-09-30" } }),
    ).rejects.toThrow("invalid_input");
    await expect(
      repeating({
        freq: "weekly",
        interval: 1,
        byWeekday: [7],
        start: "2026-10-01",
      }),
    ).rejects.toThrow("invalid_input");
    await expect(repeating({ ...daily, byWeekday: [1] })).rejects.toThrow(
      "invalid_input",
    );
  });

  it("completing a due repeating task records today's occurrence and XP", async () => {
    const t = await repeating(daily, 5);
    const { task, completion } = await at(SAT)(completeTask, { taskId: t.id });
    expect(completion).toMatchObject({
      occurrenceDate: "2026-10-24",
      xpAwarded: 200,
    });
    expect(task.completedAt).toBeNull();
  });

  it("counts the owner's local day", async () => {
    const nz = await createOwner(db, { timeZone: "Pacific/Auckland" });
    const runNz = runner(db, nz, { now: new Date("2026-10-24T11:30:00Z") });
    const area = await runNz(createArea, { name: "Flute" });
    const ach = await runNz(createAchievement, {
      areaId: area.id,
      title: "Cuts",
    });
    const t = await runNz(createTask, {
      achievementId: ach.id,
      title: "Cuts on G",
      recurrence: daily,
    });
    const { completion } = await runNz(completeTask, { taskId: t.id });
    expect(completion.occurrenceDate).toBe("2026-10-25");
  });

  it("a second completion the same day is refused and awards nothing more", async () => {
    const t = await repeating(daily);
    await at(SAT)(completeTask, { taskId: t.id });
    await expect(at(SAT)(completeTask, { taskId: t.id })).rejects.toThrow(
      "invalid_state",
    );
    expect(await completionsOf(t.id)).toHaveLength(1);
  });

  it("refuses when not due today or ended", async () => {
    const monday = await repeating({
      freq: "weekly",
      interval: 1,
      byWeekday: [1],
      start: "2026-10-01",
    });
    await expect(at(SAT)(completeTask, { taskId: monday.id })).rejects.toThrow(
      "invalid_state",
    );
    const ended = await repeating({
      ...daily,
      end: { type: "until", date: "2026-10-23" },
    });
    await expect(at(SAT)(completeTask, { taskId: ended.id })).rejects.toThrow(
      "invalid_state",
    );
  });

  it("completes again the next day", async () => {
    const t = await repeating(daily);
    await at(SAT)(completeTask, { taskId: t.id });
    await at(SUN)(completeTask, { taskId: t.id });
    expect((await completionsOf(t.id)).map((c) => c.occurrenceDate)).toEqual([
      "2026-10-24",
      "2026-10-25",
    ]);
  });

  it("uncomplete removes only today's row", async () => {
    const t = await repeating(daily);
    await at(SAT)(completeTask, { taskId: t.id });
    await at(SUN)(completeTask, { taskId: t.id });
    await at(SUN)(uncompleteTask, { taskId: t.id });
    expect((await completionsOf(t.id)).map((c) => c.occurrenceDate)).toEqual([
      "2026-10-24",
    ]);
    await expect(at(SUN)(uncompleteTask, { taskId: t.id })).rejects.toThrow(
      "invalid_state",
    );
  });

  it("undo of a repeating completion removes it", async () => {
    const t = await repeating(daily);
    const batchId = crypto.randomUUID();
    await runAction({ ...deps(db, owner, SAT), batchId }, completeTask, {
      taskId: t.id,
    });
    await at(SAT)(undoBatch, { batchId });
    expect(await completionsOf(t.id)).toHaveLength(0);
  });

  it("switching kind is refused once completed", async () => {
    const r = await repeating(daily);
    await at(SAT)(completeTask, { taskId: r.id });
    await expect(
      run(updateTask, { taskId: r.id, recurrence: null }),
    ).rejects.toThrow("invalid_state");
    const weekly: Recurrence = {
      freq: "weekly",
      interval: 1,
      start: "2026-10-01",
    };
    const changed = await run(updateTask, { taskId: r.id, recurrence: weekly });
    expect(changed.recurrence).toEqual(weekly);

    const oneOff = await run(createTask, {
      achievementId: sweep,
      title: "Once",
    });
    await run(completeTask, { taskId: oneOff.id });
    await expect(
      run(updateTask, { taskId: oneOff.id, recurrence: daily }),
    ).rejects.toThrow("invalid_state");

    const fresh = await repeating(daily);
    const cleared = await run(updateTask, {
      taskId: fresh.id,
      recurrence: null,
    });
    expect(cleared.recurrence).toBeNull();
  });
});
