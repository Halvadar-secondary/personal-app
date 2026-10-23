import { eq as eqId } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { achievements, tasks } from "@/server/db/schema";
import type { Db } from "@/server/db/types";
import { createTestDb } from "@/test/db";
import { createOwner, type Run, runner } from "@/test/factories";
import { createAchievement } from "./achievements";
import { createArea } from "./areas";
import { captureItem, fileAchievement, fileTask, listInbox } from "./inbox";
import { createTask, deleteTask } from "./tasks";

let db: Db;
let close: () => Promise<void>;
let owner: string;
let run: Run;
let ids: Record<"guitar" | "sweep", string>;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  owner = await createOwner(db);
  run = runner(db, owner);
  const guitar = (await run(createArea, { name: "Guitar" })).id;
  const sweep = (
    await run(createAchievement, {
      areaId: guitar,
      title: "Sweep",
      status: "active",
    })
  ).id;
  ids = { guitar, sweep };
});
afterEach(() => close());

/** Where a captured item landed: "inbox", "<area>/<status>" or "<achievement>". */
async function placeOf(kind: "task" | "achievement", id: string) {
  const name = (v: string | null) =>
    Object.entries(ids).find(([, x]) => x === v)?.[0];
  if (kind === "task") {
    const [t] = await db.select().from(tasks).where(eqId(tasks.id, id));
    return t!.achievementId ? name(t!.achievementId) : "inbox";
  }
  const [a] = await db
    .select()
    .from(achievements)
    .where(eqId(achievements.id, id));
  return a!.areaId ? `${name(a!.areaId)}/${a!.status}` : "inbox";
}

describe("inbox", () => {
  it.each([
    ["Buy a capo", undefined, "task", "inbox"],
    ["! Learn Dorian", undefined, "achievement", "inbox"],
    ["Sweep 3 strings", { areaId: "guitar" }, "achievement", "guitar/backlog"],
    ["Sweep 3 strings", { achievementId: "sweep" }, "task", "sweep"],
    ["!Arpeggios", { achievementId: "sweep" }, "achievement", "guitar/backlog"],
  ] as const)(
    "capture %j with %j makes a %s in %s",
    async (text, context, kind, place) => {
      const resolved = context && {
        ...("areaId" in context ? { areaId: ids[context.areaId] } : {}),
        ...("achievementId" in context
          ? { achievementId: ids[context.achievementId] }
          : {}),
      };
      const r = await run(captureItem, { text, context: resolved });
      expect(r.kind).toBe(kind);
      expect(await placeOf(r.kind, r.id)).toBe(place);
    },
  );

  it("strips the ! and whitespace from the title", async () => {
    const r = await run(captureItem, { text: "  !  Learn Dorian " });
    const [a] = await db
      .select()
      .from(achievements)
      .where(eqId(achievements.id, r.id));
    expect(a!.title).toBe("Learn Dorian");
  });

  it("rejects whitespace-only and a bare '!'", async () => {
    for (const text of ["   ", " ! "]) {
      await expect(run(captureItem, { text })).rejects.toMatchObject({
        code: "invalid_input",
      });
    }
  });

  it("rejects both an area and an achievement as context", async () => {
    await expect(
      run(captureItem, {
        text: "x",
        context: { areaId: ids.guitar, achievementId: ids.sweep },
      }),
    ).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("files an Inbox achievement into an area's backlog and its tasks follow", async () => {
    const a = await run(createAchievement, { areaId: null, title: "Dorian" });
    const t = await run(createTask, { achievementId: a.id, title: "listen" });
    const filed = await run(fileAchievement, {
      achievementId: a.id,
      areaId: ids.guitar,
    });
    expect(filed).toMatchObject({ areaId: ids.guitar, status: "backlog" });
    const [row] = await db.select().from(tasks).where(eqId(tasks.id, t.id));
    expect(row!.areaId).toBe(ids.guitar);
  });

  it("files an Inbox task into an achievement and gains its areaId", async () => {
    const t = await run(createTask, { achievementId: null, title: "capo" });
    const filed = await run(fileTask, {
      taskId: t.id,
      achievementId: ids.sweep,
    });
    expect(filed).toMatchObject({
      achievementId: ids.sweep,
      areaId: ids.guitar,
    });
  });

  it("listInbox shows only unfiled, undeleted items, newest first", async () => {
    const at = (iso: string) =>
      runner(db, owner, { now: new Date(`2026-03-10T${iso}Z`) });
    await at("09:00:00")(createTask, { achievementId: null, title: "old" });
    const gone = await at("10:00:00")(createTask, {
      achievementId: null,
      title: "gone",
    });
    await at("11:00:00")(createTask, { achievementId: null, title: "new" });
    await at("11:00:00")(createTask, {
      achievementId: ids.sweep,
      title: "filed",
    });
    await at("12:00:00")(createAchievement, { areaId: null, title: "A1" });
    await at("13:00:00")(createAchievement, { areaId: null, title: "A2" });
    await run(deleteTask, { taskId: gone.id });
    const inbox = await run(listInbox, {});
    expect(inbox.tasks.map((t) => t.title)).toEqual(["new", "old"]);
    expect(inbox.achievements.map((a) => a.title)).toEqual(["A2", "A1"]);
  });
});
