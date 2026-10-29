import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";
import type { Db } from "./types";
import {
  achievements,
  areas,
  categories,
  goals,
  taskCompletions,
  tasks,
  trackerMoments,
  trackers,
} from "./schema";

let db: Db;
let close: () => Promise<void>;

beforeEach(async () => {
  const t = await createTestDb();
  db = t.db;
  close = t.close;
  await t.client.query(
    `insert into "user" (id, name, email) values ('u1', 'Owner', 'me@x.com')`,
  );
});
afterEach(() => close());

async function chain() {
  const [area] = await db
    .insert(areas)
    .values({ ownerId: "u1", name: "Guitar", sortKey: "a0" })
    .returning();
  const [ach] = await db
    .insert(achievements)
    .values({ ownerId: "u1", areaId: area!.id, title: "Sweep", sortKey: "a0" })
    .returning();
  const [task] = await db
    .insert(tasks)
    .values({
      ownerId: "u1",
      achievementId: ach!.id,
      areaId: area!.id,
      title: "3 strings",
      sortKey: "a0",
    })
    .returning();
  return { area: area!, ach: ach!, task: task! };
}

describe("goals schema", () => {
  it("creates an area → achievement → task chain", async () => {
    const { ach, task } = await chain();
    const [back] = await db.select().from(tasks);
    expect(back!.id).toBe(task.id);
    expect(back!.achievementId).toBe(ach.id);
    expect(back!.effort).toBe(2);
    expect(ach.status).toBe("backlog");
  });

  it("rejects a task in an area without an achievement", async () => {
    const { area } = await chain();
    await expect(
      db
        .insert(tasks)
        .values({ ownerId: "u1", areaId: area.id, title: "x", sortKey: "a1" }),
    ).rejects.toThrow();
  });

  it("rejects effort outside 1–5", async () => {
    for (const effort of [0, 6]) {
      await expect(
        db
          .insert(tasks)
          .values({ ownerId: "u1", title: "x", effort, sortKey: "a0" }),
      ).rejects.toThrow();
    }
  });

  it("rejects a duplicate category name per owner, case-insensitively", async () => {
    await db
      .insert(categories)
      .values({ ownerId: "u1", name: "Theory", color: "blue" });
    await expect(
      db
        .insert(categories)
        .values({ ownerId: "u1", name: "theory", color: "red" }),
    ).rejects.toThrow();
  });

  it("allows reusing a deleted category's name", async () => {
    await db.insert(categories).values({
      ownerId: "u1",
      name: "Theory",
      color: "blue",
      deletedAt: new Date(),
    });
    await db
      .insert(categories)
      .values({ ownerId: "u1", name: "theory", color: "red" });
    expect(await db.$count(categories)).toBe(2);
  });

  it("allows one completion per task per day", async () => {
    const { task } = await chain();
    const row = {
      ownerId: "u1",
      taskId: task.id,
      completedAt: new Date(),
      occurrenceDate: "2026-03-10",
      xpAwarded: 25,
    };
    await db.insert(taskCompletions).values(row);
    await expect(db.insert(taskCompletions).values(row)).rejects.toThrow();
  });

  const loose = { ownerId: "u1", title: "Groceries", sortKey: "a0" };
  const daily = {
    freq: "daily" as const,
    interval: 1,
    start: "2026-03-01",
  };

  it("refuses a task planned on a day and in a week", async () => {
    await expect(
      db.insert(tasks).values({
        ...loose,
        plannedOn: "2026-03-10",
        plannedWeek: "2026-03-09",
      }),
    ).rejects.toThrow();
    await db.insert(tasks).values({ ...loose, plannedOn: "2026-03-10" });
    expect(await db.$count(tasks)).toBe(1);
  });

  it("refuses a plan or a target on a repeating task", async () => {
    await expect(
      db
        .insert(tasks)
        .values({ ...loose, recurrence: daily, plannedOn: "2026-03-10" }),
    ).rejects.toThrow();
    await expect(
      db.insert(tasks).values({
        ...loose,
        recurrence: daily,
        targetAmount: 10,
        targetUnit: "hours",
      }),
    ).rejects.toThrow();
  });

  it("refuses a target amount without a unit, or zero", async () => {
    await expect(
      db.insert(tasks).values({ ...loose, targetAmount: 10 }),
    ).rejects.toThrow();
    await expect(
      db
        .insert(tasks)
        .values({ ...loose, targetAmount: 0, targetUnit: "pages" }),
    ).rejects.toThrow();
  });

  it("links an achievement to a goal", async () => {
    const [goal] = await db
      .insert(goals)
      .values({ ownerId: "u1", title: "Write a song", sortKey: "a0" })
      .returning();
    const { ach } = await chain();
    await db
      .update(achievements)
      .set({ goalId: goal!.id })
      .where(eq(achievements.id, ach.id));
    const [back] = await db.select().from(achievements);
    expect(back!.goalId).toBe(goal!.id);
    expect(goal!.status).toBe("active");
  });
});

describe("trackers schema", () => {
  it("records a tracker and a moment", async () => {
    const [t] = await db
      .insert(trackers)
      .values({ ownerId: "u1", name: "Anger", sortKey: "a0" })
      .returning();
    expect(t!.direction).toBe("less");
    await db.insert(trackerMoments).values({
      ownerId: "u1",
      trackerId: t!.id,
      at: new Date(),
      intensity: 3,
      note: "traffic",
    });
    expect(await db.$count(trackerMoments)).toBe(1);
  });

  it("refuses an intensity outside 1–5", async () => {
    const [t] = await db
      .insert(trackers)
      .values({ ownerId: "u1", name: "Anger", sortKey: "a0" })
      .returning();
    await expect(
      db.insert(trackerMoments).values({
        ownerId: "u1",
        trackerId: t!.id,
        at: new Date(),
        intensity: 6,
      }),
    ).rejects.toThrow();
  });
});
