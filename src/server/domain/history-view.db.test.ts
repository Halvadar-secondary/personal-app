import { afterEach, beforeEach, expect, it } from "vitest";
import type { Db } from "@/server/db/types";
import { createTestDb } from "@/test/db";
import { createOwner, type Run, runner } from "@/test/factories";
import { createAchievement } from "./achievements";
import { createArea } from "./areas";
import { listHistory } from "./history-view";
import { completeTask, createTask, createTasks, deleteTask } from "./tasks";
import { undoBatch } from "./undo";

let db: Db;
let close: () => Promise<void>;
let run: Run;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  run = runner(db, await createOwner(db));
});
afterEach(() => close());

async function guitarWithTasks() {
  const area = await run(createArea, { name: "Guitar" });
  const ach = await run(createAchievement, { areaId: area.id, title: "Sweep" });
  await run(createTasks, {
    achievementId: ach.id,
    tasks: [{ title: "a" }, { title: "b" }, { title: "c" }],
  });
  return ach.id;
}

it("lists batches newest first with who, when and summary", async () => {
  await guitarWithTasks();
  const { batches, nextBefore } = await run(listHistory, {});
  expect(batches.map((b) => b.summary)).toEqual([
    "Added 3 tasks",
    "Added “Sweep”",
    "Created area “Guitar”",
  ]);
  expect(batches[0]).toMatchObject({
    who: "You",
    when: "just now",
    undone: false,
  });
  expect(nextBefore).toBeNull();
});

it("marks undone batches and summarises the undo", async () => {
  await guitarWithTasks();
  const [tasksBatch] = (await run(listHistory, {})).batches;
  await run(undoBatch, { batchId: tasksBatch!.batchId });
  const { batches } = await run(listHistory, {});
  expect(batches[0]).toMatchObject({
    summary: "Undid: Added 3 tasks",
    undone: false,
  });
  expect(batches[1]).toMatchObject({
    batchId: tasksBatch!.batchId,
    undone: true,
  });
});

it("an undone undo reads as a redo, and the original can be undone again", async () => {
  await guitarWithTasks();
  const [tasksBatch] = (await run(listHistory, {})).batches;
  await run(undoBatch, { batchId: tasksBatch!.batchId });
  const [undo] = (await run(listHistory, {})).batches;
  await run(undoBatch, { batchId: undo!.batchId });
  const { batches } = await run(listHistory, {});
  expect(batches.slice(0, 3).map((b) => [b.summary, b.undone])).toEqual([
    ["Redid: Added 3 tasks", false],
    ["Undid: Added 3 tasks", true],
    ["Added 3 tasks", false],
  ]);
});

it("names a completion's task even after the task was deleted", async () => {
  const ach = await guitarWithTasks();
  const t = await run(createTask, { achievementId: ach, title: "Scales" });
  await run(completeTask, { taskId: t.id });
  await run(deleteTask, { taskId: t.id });
  const { batches } = await run(listHistory, {});
  expect(batches.map((b) => b.summary).slice(0, 2)).toEqual([
    "Deleted task “Scales”",
    "Completed “Scales”",
  ]);
});

it("pages with before", async () => {
  await guitarWithTasks();
  const first = await run(listHistory, { limit: 2 });
  expect(first.batches).toHaveLength(2);
  expect(first.nextBefore).toEqual(expect.any(Number));
  const second = await run(listHistory, {
    limit: 2,
    before: first.nextBefore!,
  });
  expect(second.batches.map((b) => b.summary)).toEqual([
    "Created area “Guitar”",
  ]);
  expect(second.nextBefore).toBeNull();
});

it("shows only the owner's history", async () => {
  await guitarWithTasks();
  const other = runner(db, await createOwner(db));
  expect((await other(listHistory, {})).batches).toEqual([]);
});
