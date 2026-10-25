import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it } from "vitest";
import {
  achievements,
  changeEvents,
  taskCategories,
  tasks,
} from "@/server/db/schema";
import type { Db } from "@/server/db/types";
import { createTestDb } from "@/test/db";
import { createOwner, deps, type Run, runner } from "@/test/factories";
import { createAchievement } from "./achievements";
import { createArea } from "./areas";
import { createCategory } from "./categories";
import { runAction } from "./context";
import { createItem, getCreateOptions } from "./create";
import { DomainError } from "./errors";
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
  sweep = (
    await run(createAchievement, {
      areaId: guitar,
      title: "Sweep",
      status: "active",
    })
  ).id;
});
afterEach(() => close());

const taskRow = async (id: string) =>
  (await db.select().from(tasks).where(eq(tasks.id, id)))[0]!;

it("a task lands in its achievement with every field", async () => {
  const recurrence = { freq: "daily" as const, start: "2026-03-10" };
  const made = await run(createItem, {
    kind: "task",
    achievementId: sweep,
    title: "Sweeps",
    notes: "slow",
    effort: 3,
    deadline: "2026-11-01",
    recurrence,
  });
  expect(made.kind).toBe("task");
  const t = await taskRow(made.id);
  expect(t).toMatchObject({
    achievementId: sweep,
    areaId: guitar,
    title: "Sweeps",
    notes: "slow",
    effort: 3,
    deadline: "2026-11-01",
    recurrence: { ...recurrence, interval: 1 },
  });
});

it("a task with categories is one batch, and undo removes it whole", async () => {
  const cat = (
    await run(createCategory, { name: "Technique", color: "#f59e0b" })
  ).id;
  const batchId = crypto.randomUUID();
  const made = await runAction({ ...deps(db, owner), batchId }, createItem, {
    kind: "task",
    achievementId: sweep,
    title: "Sweeps",
    categoryIds: [cat],
  });
  const links = await db
    .select()
    .from(taskCategories)
    .where(eq(taskCategories.taskId, made.id));
  expect(links.map((l) => l.categoryId)).toEqual([cat]);
  const events = (await db.select().from(changeEvents)).filter(
    (e) => e.entityId === made.id,
  );
  expect(events.map((e) => e.entityType).sort()).toEqual([
    "task",
    "task_categories",
  ]);
  expect(new Set(events.map((e) => e.batchId))).toEqual(new Set([batchId]));

  await run(undoBatch, { batchId });
  expect((await taskRow(made.id)).deletedAt).not.toBeNull();
  expect(
    await db
      .select()
      .from(taskCategories)
      .where(eq(taskCategories.taskId, made.id)),
  ).toHaveLength(0);
});

it("a task with no achievement goes to the Inbox", async () => {
  const made = await run(createItem, {
    kind: "task",
    achievementId: null,
    title: "Buy strings",
  });
  expect(await taskRow(made.id)).toMatchObject({
    achievementId: null,
    areaId: null,
    effort: 2,
  });
});

it("an achievement takes its area, status and deadline", async () => {
  const made = await run(createItem, {
    kind: "achievement",
    areaId: guitar,
    title: "Arpeggios",
    status: "active",
    deadline: "2026-12-01",
  });
  expect(made.kind).toBe("achievement");
  const [a] = await db
    .select()
    .from(achievements)
    .where(eq(achievements.id, made.id));
  expect(a).toMatchObject({
    areaId: guitar,
    title: "Arpeggios",
    status: "active",
    deadline: "2026-12-01",
  });
});

it("an achievement with no area goes to the Inbox", async () => {
  const made = await run(createItem, {
    kind: "achievement",
    areaId: null,
    title: "Someday",
  });
  const [a] = await db
    .select()
    .from(achievements)
    .where(eq(achievements.id, made.id));
  expect(a).toMatchObject({ areaId: null, status: "backlog" });
});

it("a blank title is refused", async () => {
  await expect(
    run(createItem, { kind: "task", achievementId: null, title: "  " }),
  ).rejects.toThrow(DomainError);
});

it("getCreateOptions lists areas with unfinished achievements, categories and today", async () => {
  await run(createAchievement, {
    areaId: guitar,
    title: "Finished",
    status: "done",
  });
  await run(createCategory, { name: "Technique", color: "#f59e0b" });
  const o = await run(getCreateOptions, { areaId: guitar });
  expect(o.targets.map((a) => a.name)).toEqual(["Guitar"]);
  expect(o.targets[0]!.achievements.map((a) => a.title)).toEqual(["Sweep"]);
  expect(o.categories.map((c) => c.name)).toEqual(["Technique"]);
  expect(o.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});
