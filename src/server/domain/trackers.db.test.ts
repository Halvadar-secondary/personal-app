import { desc } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { changeEvents, trackerMoments, trackers } from "@/server/db/schema";
import type { Db } from "@/server/db/types";
import { createTestDb } from "@/test/db";
import { createOwner, type Run, runner } from "@/test/factories";
import { exportData } from "./export";
import { purgeDeleted } from "./purge";
import {
  createTracker,
  deleteMoment,
  deleteTracker,
  getPatterns,
  listMoments,
  listTrackers,
  logMoment,
  moveTracker,
  updateTracker,
} from "./trackers";
import { undoBatch } from "./undo";

// FIXED_NOW is Tuesday 2026-03-10T12:00Z; weeks start on Monday.
let db: Db;
let close: () => Promise<void>;
let owner: string;
let run: Run;
let anger: string;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  owner = await createOwner(db);
  run = runner(db, owner);
  anger = (await run(createTracker, { name: "Anger", emoji: "😠" })).id;
});
afterEach(() => close());

async function lastBatch() {
  const [e] = await db
    .select()
    .from(changeEvents)
    .orderBy(desc(changeEvents.seq))
    .limit(1);
  return e!.batchId;
}

const log = (at: string, extra: { note?: string; intensity?: number } = {}) =>
  run(logMoment, { trackerId: anger, at, ...extra });

describe("trackers", () => {
  it("creates, orders, renames, archives and unarchives", async () => {
    const kind = await run(createTracker, {
      name: "Kindness",
      direction: "more",
    });
    await run(moveTracker, { trackerId: kind.id, beforeId: anger });
    let list = await run(listTrackers, {});
    expect(list.trackers.map((t) => t.name)).toEqual(["Kindness", "Anger"]);
    await run(updateTracker, { trackerId: anger, name: "Temper" });
    await run(updateTracker, { trackerId: kind.id, archived: true });
    list = await run(listTrackers, {});
    // Active first, then archived.
    expect(list.trackers.map((t) => [t.name, t.archivedAt !== null])).toEqual([
      ["Temper", false],
      ["Kindness", true],
    ]);
    await run(updateTracker, { trackerId: kind.id, archived: false });
    expect(
      (await run(listTrackers, {})).trackers.every((t) => !t.archivedAt),
    ).toBe(true);
  });

  it("refuses to log to an archived tracker, or in the future", async () => {
    await expect(log("2026-03-10T13:00:00Z")).rejects.toMatchObject({
      code: "invalid_input",
    });
    await run(updateTracker, { trackerId: anger, archived: true });
    await expect(log("2026-03-10T11:00:00Z")).rejects.toMatchObject({
      code: "invalid_state",
    });
  });

  it("logs a moment now by default, with intensity and note", async () => {
    const m = await run(logMoment, {
      trackerId: anger,
      intensity: 4,
      note: "traffic",
    });
    expect(m).toMatchObject({ intensity: 4, note: "traffic" });
    expect(m.at.toISOString()).toBe("2026-03-10T12:00:00.000Z");
  });

  it("counts this week so far, last week to the same moment, and 8 weeks", async () => {
    await log("2026-03-09T09:00:00Z", { intensity: 2 }); // this Monday
    await log("2026-03-10T10:00:00Z", { intensity: 4 }); // today
    await log("2026-03-02T09:00:00Z"); // last Monday
    await log("2026-03-04T09:00:00Z"); // last Wednesday: after the cutoff
    await log("2026-01-12T09:00:00Z"); // 8 weeks back
    const [t] = (await run(listTrackers, {})).trackers;
    expect(t).toMatchObject({ thisWeek: 2, lastWeek: 1, avgIntensity: 3 });
    expect(t!.weeks).toHaveLength(8);
    expect(t!.weeks.at(-1)).toEqual({ start: "2026-03-09", count: 2 });
    expect(t!.weeks.at(-2)).toEqual({ start: "2026-03-02", count: 2 });
    expect(t!.weeks[0]).toEqual({ start: "2026-01-19", count: 0 });
  });

  it("counts an Auckland owner's moment on their own day", async () => {
    const nz = await createOwner(db, { timeZone: "Pacific/Auckland" });
    const nzRun = runner(db, nz, { now: new Date("2026-03-11T12:00:00Z") });
    const t = await nzRun(createTracker, { name: "Anger" });
    // 2026-03-10T11:30Z is Wednesday 00:30 in Auckland.
    await nzRun(logMoment, { trackerId: t.id, at: "2026-03-10T11:30:00Z" });
    const [row] = (await nzRun(listTrackers, {})).trackers;
    expect(row!.weeks.at(-1)).toEqual({ start: "2026-03-09", count: 1 });
  });

  it("lists moments newest first, a page at a time", async () => {
    for (const d of ["01", "02", "03"]) await log(`2026-03-${d}T09:00:00Z`);
    const page = await run(listMoments, { trackerId: anger, limit: 2 });
    expect(page.map((m) => m.at.toISOString().slice(0, 10))).toEqual([
      "2026-03-03",
      "2026-03-02",
    ]);
    const next = await run(listMoments, {
      trackerId: anger,
      before: page[1]!.at.toISOString(),
    });
    expect(next.map((m) => m.at.toISOString().slice(0, 10))).toEqual([
      "2026-03-01",
    ]);
  });

  it("deletes a tracker with its moments; undo brings back only that batch's", async () => {
    const early = await log("2026-03-01T09:00:00Z");
    await log("2026-03-02T09:00:00Z");
    await run(deleteMoment, { momentId: early.id });
    await run(deleteTracker, { trackerId: anger });
    expect((await run(listTrackers, {})).trackers).toEqual([]);
    await run(undoBatch, { batchId: await lastBatch() });
    const back = await run(listMoments, { trackerId: anger });
    expect(back.map((m) => m.at.toISOString().slice(0, 10))).toEqual([
      "2026-03-02",
    ]);
  });

  it("refuses to undo a moment's deletion after its tracker is gone", async () => {
    const m = await log("2026-03-02T09:00:00Z");
    await run(deleteMoment, { momentId: m.id });
    const deleted = await lastBatch();
    await run(deleteTracker, { trackerId: anger });
    await expect(run(undoBatch, { batchId: deleted })).rejects.toMatchObject({
      code: "conflict",
    });
  });

  it("refuses to log to a deleted tracker", async () => {
    await run(deleteTracker, { trackerId: anger });
    await expect(log("2026-03-10T09:00:00Z")).rejects.toMatchObject({
      code: "not_found",
    });
  });
});

describe("patterns", () => {
  it("counts the week before the one planned, against the week before it, with notes", async () => {
    await log("2026-03-03T09:00:00Z", { note: "tired", intensity: 3 });
    await log("2026-03-05T09:00:00Z");
    await log("2026-02-24T09:00:00Z");
    await log("2026-03-10T09:00:00Z", { note: "this week" });
    const p = await run(getPatterns, { start: "2026-03-09" });
    expect(p).toMatchObject({ from: "2026-03-02", to: "2026-03-08" });
    expect(p.trackers).toHaveLength(1);
    expect(p.trackers[0]).toMatchObject({
      name: "Anger",
      count: 2,
      previous: 1,
    });
    expect(p.trackers[0]!.notes.map((n) => n.note)).toEqual(["tired"]);
  });
});

describe("data", () => {
  it("exports trackers and moments, and purges old deleted ones", async () => {
    await log("2026-03-02T09:00:00Z");
    const e = await run(exportData, {});
    expect(e.trackers).toHaveLength(1);
    expect(e.trackerMoments).toHaveLength(1);
    await run(deleteTracker, { trackerId: anger });
    const counts = await purgeDeleted(db, new Date("2026-07-01T00:00:00Z"));
    expect(counts).toMatchObject({ trackers: 1, trackerMoments: 1 });
    expect(await db.$count(trackers)).toBe(0);
    expect(await db.$count(trackerMoments)).toBe(0);
  });
});
