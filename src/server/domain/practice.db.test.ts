import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { changeEvents } from "@/server/db/schema";
import type { Db } from "@/server/db/types";
import { createTestDb } from "@/test/db";
import { createOwner, FIXED_NOW, type Run, runner } from "@/test/factories";
import { addPracticeEntry, listPracticeEntries } from "./practice";
import { createTask, deleteTask } from "./tasks";

let db: Db;
let close: () => Promise<void>;
let owner: string;
let run: Run;
let task: string;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  owner = await createOwner(db);
  run = runner(db, owner);
  task = (await run(createTask, { achievementId: null, title: "Sweeps" })).id;
});
afterEach(() => close());

describe("practice log", () => {
  it("logs practice with metrics and source manual; mcp actor is kept", async () => {
    const e = await run(addPracticeEntry, {
      taskId: task,
      durationSeconds: 600,
      metrics: { bpm: 95, key: "A minor" },
      note: "clean at 95",
    });
    expect(e).toMatchObject({
      taskId: task,
      startedAt: FIXED_NOW,
      durationSeconds: 600,
      metrics: { bpm: 95, key: "A minor" },
      source: "manual",
    });
    const mcp = runner(db, owner, { actor: "mcp:claude" });
    const m = await mcp(addPracticeEntry, { taskId: task });
    expect(m.source).toBe("mcp:claude");
  });

  it("lists practice entries newest first and records events", async () => {
    for (const startedAt of [
      "2026-03-01T10:00:00Z",
      "2026-03-03T10:00:00Z",
      "2026-03-02T10:00:00Z",
    ]) {
      await run(addPracticeEntry, { taskId: task, startedAt });
    }
    const list = await run(listPracticeEntries, { taskId: task });
    expect(list.map((e) => e.startedAt.toISOString().slice(0, 10))).toEqual([
      "2026-03-03",
      "2026-03-02",
      "2026-03-01",
    ]);
    const events = await db.select().from(changeEvents);
    expect(
      events.filter((e) => e.entityType === "practice_entry"),
    ).toHaveLength(3);
  });

  it("rejects negative durations and a deleted task", async () => {
    await expect(
      run(addPracticeEntry, { taskId: task, durationSeconds: -1 }),
    ).rejects.toMatchObject({ code: "invalid_input" });
    await run(deleteTask, { taskId: task });
    await expect(run(addPracticeEntry, { taskId: task })).rejects.toMatchObject(
      { code: "not_found" },
    );
    await expect(
      run(listPracticeEntries, { taskId: task }),
    ).rejects.toMatchObject({ code: "not_found" });
  });
});
