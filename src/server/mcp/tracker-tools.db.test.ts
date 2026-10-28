import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/server/db/types";
import { runAction } from "@/server/domain/context";
import { createTestDb } from "@/test/db";
import { FIXED_NOW } from "@/test/factories";
import { createLifeGoalsServer } from "./server";

let db: Db;
let close: () => Promise<void>;
let client: Client;

const deps = () => ({
  db,
  ownerId: "u1",
  actor: "mcp:Claude" as const,
  now: () => FIXED_NOW,
});

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

/** Calls a tool and returns its summary and JSON output. */
async function call(name: string, args: Record<string, unknown>) {
  const r = await client.callTool({ name, arguments: args });
  expect(r.isError, JSON.stringify(r.content)).toBeFalsy();
  const content = r.content as { text: string }[];
  return { summary: content[0]!.text, out: JSON.parse(content[1]!.text) };
}

describe("tracker tools", () => {
  it("creates a tracker, logs a moment and lists trackers through MCP", async () => {
    const t = await call("create_tracker", { name: "Anger", emoji: "😠" });
    const m = await call("log_moment", {
      trackerId: t.out.id,
      intensity: 3,
      note: "traffic",
    });
    expect(m.summary).toBe("Logged a moment of “Anger”");
    const list = await call("list_trackers", {});
    expect(list.out.trackers[0]).toMatchObject({ name: "Anger", thisWeek: 1 });
    const got = await call("get_tracker", { trackerId: t.out.id });
    expect(got.out[0]).toMatchObject({ note: "traffic", intensity: 3 });
    await call("delete_item", { kind: "tracker", id: t.out.id });
  });
});
