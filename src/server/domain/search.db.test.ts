import { afterEach, beforeEach, expect, it } from "vitest";
import type { Db } from "@/server/db/types";
import { createTestDb } from "@/test/db";
import { createOwner, type Run, runner } from "@/test/factories";
import { createAchievement } from "./achievements";
import { createArea } from "./areas";
import { search } from "./search";
import { createTask, deleteTask } from "./tasks";

let db: Db;
let close: () => Promise<void>;
let run: Run;
let ach: string;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  run = runner(db, await createOwner(db));
  const area = await run(createArea, { name: "Guitar", emoji: "🎸" });
  ach = (
    await run(createAchievement, {
      areaId: area.id,
      title: "Sweep picking",
      notes: "metronome at 120",
    })
  ).id;
  await run(createTask, { achievementId: ach, title: "Practise arpeggios" });
  await run(createTask, { achievementId: null, title: "Buy guitar strings" });
});
afterEach(() => close());

const titles = (r: Awaited<ReturnType<typeof find>>) => [
  ...r.areas.map((a) => a.name),
  ...r.achievements.map((a) => a.title),
  ...r.tasks.map((t) => t.title),
];
const find = (q: string) => run(search, { q });

it("finds titles and notes across kinds, case-insensitively", async () => {
  const r = await find("GUITAR");
  expect(titles(r)).toEqual(["Guitar", "Buy guitar strings"]);
  expect(r.tasks[0]).toMatchObject({ achievementId: null, area: null });
  expect(titles(await find("metronome"))).toEqual(["Sweep picking"]);
  const arps = await find("arpegg");
  expect(arps.tasks[0]).toMatchObject({
    achievementId: ach,
    achievementTitle: "Sweep picking",
    area: { name: "Guitar", emoji: "🎸" },
  });
});

it("treats % _ and \\ literally", async () => {
  for (const title of [
    "100% clean",
    "snake_case",
    "back\\slash",
    "1000 clean",
  ]) {
    await run(createTask, { achievementId: ach, title });
  }
  expect(titles(await find("%"))).toEqual(["100% clean"]);
  expect(titles(await find("_"))).toEqual(["snake_case"]);
  expect(titles(await find("\\"))).toEqual(["back\\slash"]);
});

it("leaves out deleted rows and other owners' rows", async () => {
  const t = await run(createTask, { achievementId: ach, title: "Gone tune" });
  await run(deleteTask, { taskId: t.id });
  expect(titles(await find("tune"))).toEqual([]);
  const other = runner(db, await createOwner(db));
  expect(titles(await other(search, { q: "guitar" }))).toEqual([]);
});

it("rejects an empty or too long query", async () => {
  await expect(find("   ")).rejects.toThrow("invalid_input");
  await expect(find("x".repeat(101))).rejects.toThrow("invalid_input");
});
