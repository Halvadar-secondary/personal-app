import { desc } from "drizzle-orm";
import { afterEach, beforeEach, expect, it } from "vitest";
import { changeEvents } from "@/server/db/schema";
import type { Db } from "@/server/db/types";
import { createTestDb } from "@/test/db";
import { createOwner, type Run, runner } from "@/test/factories";
import { DomainError } from "./errors";
import { listHistory } from "./history-view";
import { getProfile, updateProfile } from "./profile";
import { undoBatch } from "./undo";

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

async function lastBatch() {
  const [e] = await db
    .select()
    .from(changeEvents)
    .orderBy(desc(changeEvents.seq))
    .limit(1);
  return e!.batchId;
}

it("returns all four sections, empty, for a new owner", async () => {
  const p = await run(getProfile, {});
  expect(p.sections).toEqual([
    { section: "about", label: "About me", text: "" },
    { section: "focus", label: "Current focus", text: "" },
    { section: "planning", label: "How I plan", text: "" },
    { section: "style", label: "How to talk to me", text: "" },
  ]);
  expect(p.updatedAt).toBeNull();
});

it("trims and saves a section", async () => {
  const r = await run(updateProfile, {
    section: "focus",
    text: "  Barre chords  ",
  });
  expect(r).toEqual({
    section: "focus",
    label: "Current focus",
    text: "Barre chords",
  });
  const p = await run(getProfile, {});
  expect(p.sections.find((s) => s.section === "focus")?.text).toBe(
    "Barre chords",
  );
  expect(p.updatedAt).toBeInstanceOf(Date);
});

it("refuses more than 1,000 characters", async () => {
  await expect(
    run(updateProfile, { section: "about", text: "x".repeat(1001) }),
  ).rejects.toMatchObject({ code: "invalid_input" });
  await expect(
    run(updateProfile, { section: "about", text: "x".repeat(1001) }),
  ).rejects.toBeInstanceOf(DomainError);
});

it("writes no change event when the text is the same", async () => {
  await run(updateProfile, { section: "about", text: "Hi" });
  const batch = await lastBatch();
  await run(updateProfile, { section: "about", text: "Hi" });
  expect(await lastBatch()).toBe(batch);
});

it("undoes updates back to the earlier text, then to empty", async () => {
  await run(updateProfile, { section: "style", text: "first" });
  const first = await lastBatch();
  await run(updateProfile, { section: "style", text: "second" });
  const second = await lastBatch();
  const style = async () =>
    (await run(getProfile, {})).sections.find((s) => s.section === "style")!
      .text;

  await run(undoBatch, { batchId: second });
  expect(await style()).toBe("first");
  await run(undoBatch, { batchId: first });
  expect(await style()).toBe("");
});

it("shows a chat edit in History", async () => {
  const chat = runner(db, owner, { actor: "chat" });
  await chat(updateProfile, { section: "focus", text: "Barre chords" });
  const { batches } = await run(listHistory, {});
  expect(batches[0]).toMatchObject({
    who: "Claude in chat",
    summary: "Updated your profile: Current focus",
  });
});

it("keeps one owner's profile from another", async () => {
  await run(updateProfile, { section: "about", text: "Mine" });
  const other = runner(db, await createOwner(db));
  const p = await other(getProfile, {});
  expect(p.sections.every((s) => s.text === "")).toBe(true);
  expect(p.updatedAt).toBeNull();
});

it("saves again after the first save was undone", async () => {
  await run(updateProfile, { section: "about", text: "one" });
  await run(undoBatch, { batchId: await lastBatch() });
  await run(updateProfile, { section: "about", text: "two" });
  const p = await run(getProfile, {});
  expect(p.sections.find((s) => s.section === "about")?.text).toBe("two");
});
