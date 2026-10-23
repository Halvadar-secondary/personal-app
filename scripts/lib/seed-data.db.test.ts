import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  achievements,
  areas,
  categories,
  changeEvents,
  practiceEntries,
  taskCompletions,
} from "@/server/db/schema";
import type { Db } from "@/server/db/types";
import { listInbox } from "@/server/domain/inbox";
import { createTestDb } from "@/test/db";
import { createOwner, runner } from "@/test/factories";
import { seedSampleData } from "./seed-data";

let db: Db;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
});
afterEach(() => close());

describe("seedSampleData", () => {
  it("creates the sample goals in one batch", async () => {
    const run = runner(db, await createOwner(db), { actor: "seed" });
    const r = await run(seedSampleData, {});
    expect(r).toEqual({ areas: 5 });
    expect(await db.$count(areas)).toBe(5);
    expect(await db.$count(categories)).toBe(4);
    const events = await db.select().from(changeEvents);
    expect(new Set(events.map((e) => e.batchId)).size).toBe(1);
    expect(events.every((e) => e.actor === "seed")).toBe(true);

    const all = await db.select().from(achievements);
    const done = all.find((a) => a.title === "Pinch harmonics on demand");
    expect(done).toMatchObject({ status: "done" });
    expect(done!.completedAt).not.toBeNull();
    expect(all.some((a) => a.deadline !== null)).toBe(true);
    expect(await db.$count(taskCompletions)).toBeGreaterThan(0);

    const [entry] = await db.select().from(practiceEntries);
    expect(entry!.metrics).toEqual({ bpm: 95 });

    const inbox = await run(listInbox, {});
    expect(inbox.tasks.length + inbox.achievements.length).toBe(2);
  });
});
