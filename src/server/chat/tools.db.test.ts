import { afterEach, beforeEach, expect, it } from "vitest";
import type { Db } from "@/server/db/types";
import { createAchievement } from "@/server/domain/achievements";
import { createArea } from "@/server/domain/areas";
import { listHistory } from "@/server/domain/history-view";
import { TOOLS } from "@/server/mcp/tools";
import { createTestDb } from "@/test/db";
import { createOwner, type Run, runner } from "@/test/factories";
import {
  chatToolDefs,
  describeDestructive,
  isDestructive,
  runChatTool,
} from "./tools";

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

const call = (name: string, input: unknown) =>
  runChatTool({ db, ownerId: owner }, { id: "tu_1", name, input });
const resultText = (r: Awaited<ReturnType<typeof call>>) =>
  JSON.stringify(r.result.content);

it("defines every MCP tool plus the two conversation tools", () => {
  const defs = chatToolDefs();
  expect(defs).toHaveLength(TOOLS.length + 2);
  for (const d of defs) expect(d.input_schema.type).toBe("object");
  expect(defs.map((d) => d.name)).toContain("search_conversations");
  expect(defs.at(-1)!.cache_control).toEqual({ type: "ephemeral" });
  expect(isDestructive("delete_item")).toBe(true);
  expect(isDestructive("get_overview")).toBe(false);
});

it("runs a write as Claude in chat with a batch id", async () => {
  const r = await call("create_area", { name: "Guitar" });
  expect(r.summary).toBe("Added area “Guitar”");
  expect(r.batchId).not.toBeNull();
  expect(r.result.tool_use_id).toBe("tu_1");
  const h = await run(listHistory, {});
  expect(h.batches[0]).toMatchObject({
    who: "Claude in chat",
    batchId: r.batchId,
  });
});

it("has no batch id for reads", async () => {
  expect((await call("get_overview", {})).batchId).toBeNull();
});

it("turns domain errors into error results", async () => {
  const r = await call("update_task", {
    taskId: "00000000-0000-4000-8000-000000000000",
    title: "x",
  });
  expect(r.result.is_error).toBe(true);
  expect(resultText(r)).not.toContain("Something went wrong");
  const bad = await call("update_profile", {
    section: "about",
    text: "x".repeat(1001),
  });
  expect(bad.result.is_error).toBe(true);
});

it("rejects unknown tools", async () => {
  expect((await call("nope", {})).result.is_error).toBe(true);
});

it("describes destructive calls", async () => {
  const area = await run(createArea, { name: "Guitar" });
  const ach = await run(createAchievement, {
    areaId: area.id,
    title: "Learn barre chords",
  });
  const deps = { db, ownerId: owner };
  expect(
    await describeDestructive(deps, "delete_item", {
      kind: "achievement",
      id: ach.id,
    }),
  ).toBe("Delete achievement “Learn barre chords”?");
  const r = await call("create_area", { name: "Piano" });
  expect(
    await describeDestructive(deps, "undo_batch", { batchId: r.batchId }),
  ).toBe("Undo “Created area “Piano””?");
});
