import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";
import type { Db } from "./types";
import {
  achievements,
  areas,
  categories,
  taskCompletions,
  tasks,
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
});
