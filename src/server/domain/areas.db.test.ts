import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { achievements, areas, changeEvents, tasks } from "@/server/db/schema";
import type { Db } from "@/server/db/types";
import { createTestDb } from "@/test/db";
import { createOwner, type Run, runner } from "@/test/factories";
import {
  createArea,
  deleteArea,
  getArea,
  listAreas,
  reorderArea,
  updateArea,
} from "./areas";

let db: Db;
let close: () => Promise<void>;
let owner: string;
let run: Run;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  owner = await createOwner(db);
  run = runner(db, owner);
});
afterEach(() => close());

const names = async () => (await run(listAreas, {})).map((a) => a.name);

describe("areas", () => {
  it("creates areas in append order and lists them sorted", async () => {
    await run(createArea, { name: "Guitar", emoji: "🎸" });
    await run(createArea, { name: "Singing" });
    expect(await names()).toEqual(["Guitar", "Singing"]);
  });

  it("records a create event with before null and after the row", async () => {
    const area = await run(createArea, { name: "Guitar" });
    const [e] = await db.select().from(changeEvents);
    expect(e).toMatchObject({
      entityType: "area",
      entityId: area.id,
      op: "create",
      before: null,
    });
    expect(e!.after).toMatchObject({ id: area.id, name: "Guitar" });
  });

  it("updates fields and records before/after", async () => {
    const area = await run(createArea, { name: "Guitar" });
    const updated = await run(updateArea, {
      areaId: area.id,
      name: "Electric guitar",
      description: "Shred",
    });
    expect(updated).toMatchObject({
      name: "Electric guitar",
      description: "Shred",
    });
    const [e] = await db
      .select()
      .from(changeEvents)
      .where(eq(changeEvents.op, "update"));
    expect(e!.before).toMatchObject({ name: "Guitar" });
    expect(e!.after).toMatchObject({ name: "Electric guitar" });
  });

  it("reorders with afterId / beforeId", async () => {
    const a = await run(createArea, { name: "A" });
    await run(createArea, { name: "B" });
    const c = await run(createArea, { name: "C" });
    await run(reorderArea, { areaId: c.id, afterId: a.id });
    expect(await names()).toEqual(["A", "C", "B"]);
    await run(reorderArea, { areaId: a.id });
    expect(await names()).toEqual(["C", "B", "A"]);
    await run(reorderArea, { areaId: a.id, beforeId: c.id });
    expect(await names()).toEqual(["A", "C", "B"]);
  });

  it("rejects a position neighbour that is soft-deleted", async () => {
    await run(createArea, { name: "A" });
    const b = await run(createArea, { name: "B" });
    const c = await run(createArea, { name: "C" });
    await run(deleteArea, { areaId: b.id });
    await expect(
      run(reorderArea, { areaId: c.id, afterId: b.id }),
    ).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("delete hides the area and cascades to achievements and tasks in one batch", async () => {
    const area = await run(createArea, { name: "Guitar" });
    const achs = await db
      .insert(achievements)
      .values(
        ["Sweep", "Modes"].map((title, i) => ({
          ownerId: owner,
          areaId: area.id,
          title,
          sortKey: `a${i}`,
        })),
      )
      .returning();
    await db.insert(tasks).values(
      [0, 1, 2].map((i) => ({
        ownerId: owner,
        areaId: area.id,
        achievementId: achs[i % 2]!.id,
        title: `t${i}`,
        sortKey: `a${i}`,
      })),
    );
    const r = await run(deleteArea, { areaId: area.id });
    expect(r).toEqual({ deleted: 6 });
    const events = await db
      .select()
      .from(changeEvents)
      .where(eq(changeEvents.op, "delete"));
    expect(events).toHaveLength(6);
    expect(new Set(events.map((e) => e.batchId)).size).toBe(1);
    expect(await names()).toEqual([]);
    const live = await db.select().from(tasks);
    expect(live.every((t) => t.deletedAt !== null)).toBe(true);
  });

  it("update or get a deleted area is not_found", async () => {
    const area = await run(createArea, { name: "Guitar" });
    await run(deleteArea, { areaId: area.id });
    await expect(
      run(updateArea, { areaId: area.id, name: "X" }),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(run(getArea, { areaId: area.id })).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(run(deleteArea, { areaId: area.id })).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("gets an area by id", async () => {
    const area = await run(createArea, { name: "Guitar" });
    expect(await run(getArea, { areaId: area.id })).toMatchObject({
      name: "Guitar",
    });
  });

  it("rejects a blank name", async () => {
    await expect(run(createArea, { name: "   " })).rejects.toMatchObject({
      code: "invalid_input",
    });
    expect(await db.$count(areas)).toBe(0);
  });
});
