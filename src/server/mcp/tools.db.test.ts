import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { and, eq, isNull } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";
import { achievements, categories, tasks } from "@/server/db/schema";
import type { Db } from "@/server/db/types";
import { createAchievement } from "@/server/domain/achievements";
import { createArea } from "@/server/domain/areas";
import { createCategory } from "@/server/domain/categories";
import { runAction } from "@/server/domain/context";
import { listHistory } from "@/server/domain/history-view";
import { captureItem } from "@/server/domain/inbox";
import { createLifeGoalsServer } from "./server";

let db: Db;
let close: () => Promise<void>;
let client: Client;

const deps = () => ({ db, ownerId: "u1", actor: "mcp:Claude" as const });

beforeEach(async () => {
  const t = await createTestDb();
  db = t.db;
  close = t.close;
  await t.client.query(
    `insert into "user" (id, name, email) values ('u1', 'Owner', 'me@x.com')`,
  );
  const [a, b] = InMemoryTransport.createLinkedPair();
  await createLifeGoalsServer((action, input) =>
    runAction(deps(), action, input),
  ).connect(a);
  client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(b);
});
afterEach(async () => {
  await client.close();
  await close();
});

async function call(name: string, args: Record<string, unknown>) {
  const r = await client.callTool({ name, arguments: args });
  expect(r.isError, JSON.stringify(r.content)).toBeFalsy();
  return r;
}

const liveTasks = () => db.select().from(tasks).where(isNull(tasks.deletedAt));

describe("MCP tools over the domain", () => {
  it("create_tasks with 15 items is one batch, one undo", async () => {
    const area = await runAction(deps(), createArea, { name: "Guitar" });
    const ach = await runAction(deps(), createAchievement, {
      areaId: area.id,
      title: "Sweep picking",
    });
    const before = await runAction(deps(), listHistory, {});

    await call("create_tasks", {
      achievementId: ach.id,
      tasks: Array.from({ length: 15 }, (_, i) => ({ title: `Step ${i + 1}` })),
    });
    expect(await liveTasks()).toHaveLength(15);

    const { batches } = await runAction(deps(), listHistory, {});
    expect(batches).toHaveLength(before.batches.length + 1);
    expect(batches[0]).toMatchObject({
      who: "Claude via MCP",
      summary: "Added 15 tasks",
    });

    await call("undo_batch", { batchId: batches[0]!.batchId });
    expect(await liveTasks()).toHaveLength(0);
  });

  it("file_item and delete_item route to the right action", async () => {
    const area = await runAction(deps(), createArea, { name: "Guitar" });
    const ach = await runAction(deps(), createAchievement, {
      areaId: area.id,
      title: "Sweep picking",
    });
    const loose = await runAction(deps(), captureItem, {
      text: "!Learn modes",
    });
    const looseTask = await runAction(deps(), captureItem, {
      text: "Metronome",
    });

    await call("file_item", {
      kind: "achievement",
      id: loose.id,
      areaId: area.id,
    });
    const [filed] = await db
      .select()
      .from(achievements)
      .where(eq(achievements.id, loose.id));
    expect(filed!.areaId).toBe(area.id);

    await call("file_item", {
      kind: "task",
      id: looseTask.id,
      achievementId: ach.id,
    });
    const [filedTask] = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, looseTask.id));
    expect(filedTask!.achievementId).toBe(ach.id);

    await call("delete_item", { kind: "task", id: looseTask.id });
    expect(await liveTasks()).toHaveLength(0);

    const cat = await runAction(deps(), createCategory, {
      name: "Technique",
      color: "blue",
    });
    await call("delete_item", { kind: "category", id: cat.id });
    expect(
      await db
        .select()
        .from(categories)
        .where(and(eq(categories.id, cat.id), isNull(categories.deletedAt))),
    ).toHaveLength(0);

    await call("delete_item", { kind: "achievement", id: ach.id });
    await call("delete_item", { kind: "area", id: area.id });
    const r = await client.callTool({
      name: "delete_item",
      arguments: { kind: "area", id: area.id },
    });
    expect(r.isError).toBe(true);
  });
});
