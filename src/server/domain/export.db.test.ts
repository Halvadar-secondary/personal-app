import { afterEach, beforeEach, expect, it } from "vitest";
import type { Db } from "@/server/db/types";
import { createTestDb } from "@/test/db";
import { createOwner, type Run, runner } from "@/test/factories";
import { createAchievement } from "./achievements";
import { createArea } from "./areas";
import { createCategory, setTaskCategories } from "./categories";
import { exportData } from "./export";
import { updateProfile } from "./profile";
import { completeTask, createTask, deleteTask } from "./tasks";

let db: Db;
let close: () => Promise<void>;
let run: Run;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  run = runner(db, await createOwner(db, { timeZone: "Asia/Tbilisi" }));
});
afterEach(() => close());

async function someData() {
  const area = await run(createArea, { name: "Guitar" });
  const ach = await run(createAchievement, { areaId: area.id, title: "Sweep" });
  const task = await run(createTask, { achievementId: ach.id, title: "a" });
  const cat = await run(createCategory, { name: "Theory", color: "#6d4aff" });
  await run(setTaskCategories, { taskId: task.id, categoryIds: [cat.id] });
  await run(completeTask, { taskId: task.id });
  const gone = await run(createTask, { achievementId: ach.id, title: "gone" });
  await run(deleteTask, { taskId: gone.id });
}

it("exports every table's rows for the owner, deleted ones included", async () => {
  await someData();
  const r = await run(exportData, {});
  expect(r).toMatchObject({
    version: 1,
    exportedAt: expect.any(String),
    settings: { timeZone: "Asia/Tbilisi", weekStart: 1 },
  });
  expect(r.areas).toHaveLength(1);
  expect(r.achievements).toHaveLength(1);
  expect(r.tasks).toHaveLength(2);
  expect(r.categories).toHaveLength(1);
  expect(r.taskCategories).toHaveLength(1);
  expect(r.taskCompletions).toHaveLength(1);
  expect(r.practiceEntries).toEqual([]);
  expect(r.profileSections).toEqual([]);
  expect(r.tasks.find((t) => t.title === "gone")?.deletedAt).not.toBeNull();
});

it("never includes another owner's rows", async () => {
  await someData();
  const other = runner(db, await createOwner(db));
  const r = await other(exportData, {});
  expect([
    r.areas,
    r.achievements,
    r.tasks,
    r.categories,
    r.taskCategories,
    r.taskCompletions,
  ]).toEqual([[], [], [], [], [], []]);
});

it("has no change history", async () => {
  await someData();
  expect(await run(exportData, {})).not.toHaveProperty("changeEvents");
});

it("exports the profile sections", async () => {
  await run(updateProfile, { section: "focus", text: "Barre chords" });
  const r = await run(exportData, {});
  expect(r.profileSections).toHaveLength(1);
  expect(r.profileSections[0]).toMatchObject({
    section: "focus",
    text: "Barre chords",
  });
});
