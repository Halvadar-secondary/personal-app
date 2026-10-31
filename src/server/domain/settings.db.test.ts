import { afterEach, beforeEach, expect, it } from "vitest";
import { z } from "zod";
import type { Db } from "@/server/db/types";
import { createTestDb } from "@/test/db";
import { createOwner, deps, type Run, runner } from "@/test/factories";
import { defineAction, runAction } from "./context";
import { getChatModelOverrides, getSettings, updateSettings } from "./settings";

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

const weekStartOfCtx = defineAction(z.object({}), async (ctx) => ctx.weekStart);

it("defaults to UTC and Monday", async () => {
  expect(await run(getSettings, {})).toEqual({ timeZone: "UTC", weekStart: 1 });
});

it("updates and reads back", async () => {
  await run(updateSettings, { timeZone: "Asia/Tbilisi", weekStart: 0 });
  expect(await run(getSettings, {})).toEqual({
    timeZone: "Asia/Tbilisi",
    weekStart: 0,
  });
  expect(await runAction(deps(db, owner), weekStartOfCtx, {})).toBe(0);
  await run(updateSettings, { weekStart: 1 });
  expect(await run(getSettings, {})).toEqual({
    timeZone: "Asia/Tbilisi",
    weekStart: 1,
  });
});

it("rejects an unknown time zone or week start", async () => {
  await expect(run(updateSettings, { timeZone: "Mars/Base" })).rejects.toThrow(
    "invalid_input",
  );
  await expect(run(updateSettings, { weekStart: 7 })).rejects.toThrow(
    "invalid_input",
  );
});

it("stores chat model overrides, validates them, and clears with null", async () => {
  expect(await run(getChatModelOverrides, {})).toEqual({
    quick: null,
    smart: null,
    deep: null,
  });
  await run(updateSettings, { chatModelSmart: "claude-opus-5" });
  expect(await run(getChatModelOverrides, {})).toEqual({
    quick: null,
    smart: "claude-opus-5",
    deep: null,
  });
  await run(updateSettings, { chatModelSmart: null, chatModelDeep: "claude-opus-6" });
  expect(await run(getChatModelOverrides, {})).toEqual({
    quick: null,
    smart: null,
    deep: "claude-opus-6",
  });
  await expect(
    run(updateSettings, { chatModelQuick: "gpt-4" }),
  ).rejects.toThrow("invalid_input");
  await expect(
    run(updateSettings, { chatModelQuick: "claude-Bad" }),
  ).rejects.toThrow("invalid_input");
});
