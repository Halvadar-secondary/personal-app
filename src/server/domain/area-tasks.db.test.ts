import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { changeEvents, tasks } from "@/server/db/schema";
import type { Db } from "@/server/db/types";
import { createTestDb } from "@/test/db";
import { createOwner, type Run, runner } from "@/test/factories";
import { createAchievement } from "./achievements";
import { createArea, deleteArea } from "./areas";
import { createItem } from "./create";
import { fileTask, listInbox } from "./inbox";
import { getDay, planTask } from "./plan";
import {
  completeTask,
  createTask,
  createTasks,
  deleteTask,
  moveTask,
} from "./tasks";
import { undoBatch } from "./undo";
import { getAreaBoard, getOverview } from "./views";

// A task can sit straight in an area ("Learn Wonderwall" in Music) without
// working toward an achievement.

let db: Db;
let close: () => Promise<void>;
let owner: string;
let run: Run;
let music: string;
let scales: string;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  owner = await createOwner(db);
  run = runner(db, owner);
  music = (await run(createArea, { name: "Music" })).id;
  scales = (await run(createAchievement, { areaId: music, title: "Scales" }))
    .id;
});
afterEach(() => close());

const areaTask = (title: string, areaId = music) =>
  run(createTask, { achievementId: null, areaId, title });

const boardTitles = async () =>
  (await run(getAreaBoard, { areaId: music })).tasks.map((t) => t.title);

describe("tasks in an area", () => {
  it("creates one in the area with no achievement", async () => {
    const t = await areaTask("Learn Wonderwall");
    expect(t).toMatchObject({ achievementId: null, areaId: music });
  });

  it("the create dialog's save makes one too", async () => {
    const { id } = await run(createItem, {
      kind: "task",
      achievementId: null,
      areaId: music,
      title: "Learn Wonderwall",
    });
    const [row] = await db.select().from(tasks).where(eq(tasks.id, id));
    expect(row).toMatchObject({ achievementId: null, areaId: music });
  });

  it("refuses both an achievement and an area", async () => {
    await expect(
      run(createTask, { achievementId: scales, areaId: music, title: "x" }),
    ).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("refuses an area that's gone", async () => {
    const gone = (await run(createArea, { name: "Old" })).id;
    await run(deleteArea, { areaId: gone });
    await expect(areaTask("x", gone)).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("several at once land in the area, in order", async () => {
    await run(createTasks, {
      achievementId: null,
      areaId: music,
      tasks: [{ title: "Intro" }, { title: "Verse" }],
    });
    expect(await boardTitles()).toEqual(["Intro", "Verse"]);
  });

  it("shows on the area's page, apart from its achievements' tasks", async () => {
    await run(createTask, { achievementId: scales, title: "C major" });
    await areaTask("Learn Wonderwall");
    await areaTask("Learn Blackbird");
    expect(await boardTitles()).toEqual([
      "Learn Wonderwall",
      "Learn Blackbird",
    ]);
  });

  it("isn't in the Inbox or its count", async () => {
    await areaTask("Learn Wonderwall");
    await run(createTask, { achievementId: null, title: "Loose" });
    const inbox = await run(listInbox, {});
    expect(inbox.tasks.map((t) => t.title)).toEqual(["Loose"]);
    expect((await run(getOverview, {})).inboxCount).toBe(1);
  });

  it("reorders among the area's tasks and stays in the area", async () => {
    await areaTask("A");
    const b = await areaTask("B");
    await run(moveTask, { taskId: b.id, beforeId: null, afterId: null });
    const [row] = await db.select().from(tasks).where(eq(tasks.id, b.id));
    expect(row).toMatchObject({ achievementId: null, areaId: music });
    await run(moveTask, {
      taskId: b.id,
      beforeId: (await db.select().from(tasks).where(eq(tasks.title, "A")))[0]!
        .id,
    });
    expect(await boardTitles()).toEqual(["B", "A"]);
  });

  it("moves between the Inbox, an area and an achievement", async () => {
    const t = await run(createTask, { achievementId: null, title: "Song" });
    await run(moveTask, { taskId: t.id, areaId: music });
    let [row] = await db.select().from(tasks).where(eq(tasks.id, t.id));
    expect(row).toMatchObject({ achievementId: null, areaId: music });

    await run(moveTask, { taskId: t.id, achievementId: scales });
    [row] = await db.select().from(tasks).where(eq(tasks.id, t.id));
    expect(row).toMatchObject({ achievementId: scales, areaId: music });

    await run(moveTask, { taskId: t.id, achievementId: null, areaId: null });
    [row] = await db.select().from(tasks).where(eq(tasks.id, t.id));
    expect(row).toMatchObject({ achievementId: null, areaId: null });
  });

  it("files from the Inbox into an area", async () => {
    const t = await run(createTask, { achievementId: null, title: "Song" });
    await run(fileTask, { taskId: t.id, areaId: music });
    const [row] = await db.select().from(tasks).where(eq(tasks.id, t.id));
    expect(row).toMatchObject({ achievementId: null, areaId: music });
  });

  it("earns the area XP when ticked off", async () => {
    const t = await areaTask("Learn Wonderwall");
    await run(completeTask, { taskId: t.id });
    const board = await run(getAreaBoard, { areaId: music });
    expect(board.progress.xp).toBeGreaterThan(0);
  });

  it("goes with its area when the area is deleted, and comes back on undo", async () => {
    await areaTask("Learn Wonderwall");
    const r = await run(deleteArea, { areaId: music });
    expect(r.deleted).toBe(3); // the area, Scales, the task
    const [row] = await db.select().from(tasks);
    expect(row!.deletedAt).not.toBeNull();

    const [event] = await db
      .select()
      .from(changeEvents)
      .where(
        and(eq(changeEvents.entityType, "area"), eq(changeEvents.op, "delete")),
      );
    await run(undoBatch, { batchId: event!.batchId });
    expect(await boardTitles()).toEqual(["Learn Wonderwall"]);
  });

  it("undo won't bring one back into an area that's since been deleted", async () => {
    const t = await areaTask("Learn Wonderwall");
    await run(deleteTask, { taskId: t.id });
    const [deleted] = await db
      .select()
      .from(changeEvents)
      .where(eq(changeEvents.op, "delete"));
    await run(deleteArea, { areaId: music });
    await expect(
      run(undoBatch, { batchId: deleted!.batchId }),
    ).rejects.toMatchObject({ code: "conflict" });
  });

  it("planned on a day, it shows with its area", async () => {
    const t = await areaTask("Learn Wonderwall");
    await run(planTask, {
      taskId: t.id,
      plan: { type: "day", date: "2026-03-10" },
    });
    const d = await run(getDay, { day: "2026-03-10" });
    const item = [...d.sections.work, ...d.sections.spare].find(
      (i) => i.title === "Learn Wonderwall",
    );
    expect(item).toMatchObject({
      achievement: null,
      area: { id: music, name: "Music" },
    });
  });
});
