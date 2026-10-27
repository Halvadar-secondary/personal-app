import { desc, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { achievements, changeEvents, goals } from "@/server/db/schema";
import type { Db } from "@/server/db/types";
import { createTestDb } from "@/test/db";
import { createOwner, type Run, runner } from "@/test/factories";
import { createAchievement, deleteAchievement } from "./achievements";
import { createArea } from "./areas";
import { exportData } from "./export";
import {
  createGoal,
  deleteGoal,
  getGoal,
  getReview,
  linkAchievement,
  listGoals,
  listLinkableAchievements,
  moveGoal,
  updateGoal,
} from "./goals";
import { planTask } from "./plan";
import { purgeDeleted } from "./purge";
import { completeTask, createTask } from "./tasks";
import { undoBatch } from "./undo";

// FIXED_NOW: Tuesday 2026-03-10, UTC; weeks start on Monday.
let db: Db;
let close: () => Promise<void>;
let owner: string;
let run: Run;
let music: string;
let guitar: string;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  owner = await createOwner(db);
  run = runner(db, owner);
  music = (await run(createArea, { name: "Music", emoji: "🎵" })).id;
  guitar = (await run(createArea, { name: "Guitar" })).id;
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

const ach = async (areaId: string, title: string, status = "active") =>
  (
    await run(createAchievement, {
      areaId,
      title,
      status: status as "active",
    })
  ).id;

describe("goals", () => {
  it("creates, orders, updates and finishes goals", async () => {
    const song = await run(createGoal, {
      title: "Write a song",
      deadline: "2026-06-01",
    });
    const date = await run(createGoal, { title: "Ask her out" });
    await run(moveGoal, { goalId: date.id, beforeId: song.id });
    let list = await run(listGoals, {});
    expect(list.goals.map((g) => g.title)).toEqual([
      "Ask her out",
      "Write a song",
    ]);
    expect(list.goals[1]!.daysLeft).toBe(83);
    const done = await run(updateGoal, { goalId: date.id, status: "done" });
    expect(done.completedAt).not.toBeNull();
    list = await run(listGoals, {});
    // Active first, then done.
    expect(list.goals.map((g) => g.title)).toEqual([
      "Write a song",
      "Ask her out",
    ]);
    const back = await run(updateGoal, { goalId: date.id, status: "active" });
    expect(back.completedAt).toBeNull();
  });

  it("links achievements from two areas and counts their progress", async () => {
    const song = (await run(createGoal, { title: "Write a song" })).id;
    const lyrics = await ach(music, "Lyrics");
    const arps = await ach(guitar, "Arpeggios", "done");
    await run(linkAchievement, { achievementId: lyrics, goalId: song });
    await run(linkAchievement, { achievementId: arps, goalId: song });
    const t1 = await run(createTask, { achievementId: lyrics, title: "Verse" });
    await run(createTask, { achievementId: lyrics, title: "Chorus" });
    await run(completeTask, { taskId: t1.id });
    await run(createTask, {
      achievementId: lyrics,
      title: "Daily",
      recurrence: { freq: "daily", interval: 1, start: "2026-03-01" },
    });
    const g = await run(getGoal, { goalId: song });
    expect(g.goal).toMatchObject({
      achievementCount: 2,
      achievementsDone: 1,
      taskCount: 2,
      tasksDone: 1,
      daysLeft: null,
    });
    expect(g.achievements.map((a) => [a.title, a.area?.name])).toEqual([
      ["Lyrics", "Music"],
      ["Arpeggios", "Guitar"],
    ]);
    const linkable = await run(listLinkableAchievements, { goalId: song });
    expect(linkable).toEqual([]);
    const other = (await run(createGoal, { title: "Other" })).id;
    const forOther = await run(listLinkableAchievements, { goalId: other });
    expect(forOther.map((a) => [a.title, a.goalTitle])).toEqual([
      ["Lyrics", "Write a song"],
      ["Arpeggios", "Write a song"],
    ]);
  });

  it("refuses a link to a deleted goal", async () => {
    const song = (await run(createGoal, { title: "Write a song" })).id;
    await run(deleteGoal, { goalId: song });
    const lyrics = await ach(music, "Lyrics");
    await expect(
      run(linkAchievement, { achievementId: lyrics, goalId: song }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("unlinks achievements when a goal is deleted, and undo relinks them", async () => {
    const song = (await run(createGoal, { title: "Write a song" })).id;
    const lyrics = await ach(music, "Lyrics");
    await run(linkAchievement, { achievementId: lyrics, goalId: song });
    await run(deleteGoal, { goalId: song });
    let [row] = await db
      .select()
      .from(achievements)
      .where(eq(achievements.id, lyrics));
    expect(row!.goalId).toBeNull();
    await run(undoBatch, { batchId: await lastBatch() });
    [row] = await db
      .select()
      .from(achievements)
      .where(eq(achievements.id, lyrics));
    expect(row!.goalId).toBe(song);
    expect((await run(listGoals, {})).goals).toHaveLength(1);
  });

  it("refuses to undo a link once its goal is deleted", async () => {
    const song = (await run(createGoal, { title: "Write a song" })).id;
    const lyrics = await ach(music, "Lyrics");
    await run(linkAchievement, { achievementId: lyrics, goalId: song });
    await run(linkAchievement, { achievementId: lyrics, goalId: null });
    const unlink = await lastBatch();
    await run(deleteGoal, { goalId: song });
    await expect(run(undoBatch, { batchId: unlink })).rejects.toMatchObject({
      code: "conflict",
    });
  });

  it("exports goals and purges old deleted ones", async () => {
    const song = (await run(createGoal, { title: "Write a song" })).id;
    expect((await run(exportData, {})).goals).toHaveLength(1);
    await run(deleteGoal, { goalId: song });
    const later = new Date("2026-07-01T00:00:00Z");
    const counts = await purgeDeleted(db, later);
    expect(counts.goals).toBe(1);
    expect(await db.$count(goals)).toBe(0);
  });

  it("keeps a deleted goal that a deleted achievement still names", async () => {
    const song = (await run(createGoal, { title: "Write a song" })).id;
    const lyrics = await ach(music, "Lyrics");
    await run(linkAchievement, { achievementId: lyrics, goalId: song });
    await run(deleteAchievement, { achievementId: lyrics });
    await run(deleteGoal, { goalId: song });
    // The achievement is purged first, then the goal, in one run.
    const counts = await purgeDeleted(db, new Date("2026-07-01T00:00:00Z"));
    expect(counts).toMatchObject({ achievements: 1, goals: 1 });
  });
});

describe("review", () => {
  it("plans the coming week on the week's last day, else this week", async () => {
    const sunday = runner(db, owner, { now: new Date("2026-03-15T12:00:00Z") });
    expect((await sunday(getReview, {})).start).toBe("2026-03-16");
    expect((await run(getReview, {})).start).toBe("2026-03-09");
  });

  it("lists each goal's open one-off tasks, and achievements with no goal", async () => {
    const song = (await run(createGoal, { title: "Write a song" })).id;
    const lyrics = await ach(music, "Lyrics");
    const loose = await ach(guitar, "Unlinked");
    await run(linkAchievement, { achievementId: lyrics, goalId: song });
    await run(createTask, { achievementId: lyrics, title: "Verse" });
    const done = await run(createTask, { achievementId: lyrics, title: "Old" });
    await run(completeTask, { taskId: done.id });
    await run(createTask, { achievementId: loose, title: "Scales" });
    const r = await run(getReview, {});
    expect(r.goals).toHaveLength(1);
    expect(r.goals[0]!.tasks.map((t) => t.title)).toEqual(["Verse"]);
    expect(r.unlinked.map((u) => u.achievement.title)).toEqual(["Unlinked"]);
    expect(r.unlinked[0]!.tasks.map((t) => t.title)).toEqual(["Scales"]);
    expect(r.week.start).toBe("2026-03-09");
  });

  it("counts last week's done and rolled-over tasks", async () => {
    const t = async (title: string, date: string) => {
      const x = await run(createTask, { achievementId: null, title });
      await run(planTask, { taskId: x.id, plan: { type: "day", date } });
      return x.id;
    };
    const a = await t("Done", "2026-03-04");
    await t("Missed", "2026-03-05");
    await t("This week", "2026-03-10");
    const lastWeek = runner(db, owner, {
      now: new Date("2026-03-04T12:00:00Z"),
    });
    await lastWeek(completeTask, { taskId: a });
    const r = await run(getReview, {});
    expect(r.lastWeek).toEqual({ done: 1, rolled: 1 });
  });
});
