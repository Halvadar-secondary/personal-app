import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { achievements } from "@/server/db/schema";
import type { Db } from "@/server/db/types";
import { createAchievement } from "@/server/domain/achievements";
import { createArea } from "@/server/domain/areas";
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

/** Calls a tool and returns its JSON output (the second text block). */
async function call(name: string, args: Record<string, unknown>) {
  const r = await client.callTool({ name, arguments: args });
  expect(r.isError, JSON.stringify(r.content)).toBeFalsy();
  const content = r.content as { text: string }[];
  return { summary: content[0]!.text, out: JSON.parse(content[1]!.text) };
}

describe("planning and goal tools", () => {
  it("plans a task and reads the day through MCP", async () => {
    const made = await call("create_tasks", {
      achievementId: null,
      tasks: [
        {
          title: "Buy groceries",
          plan: { type: "day", date: "2026-03-10", section: "spare" },
        },
        { title: "Dentist" },
      ],
    });
    const dentist = made.out[1].id;
    await call("plan_task", {
      taskId: dentist,
      plan: { type: "day", date: "2026-03-10", section: "work" },
    });
    const day = await call("get_day", {});
    expect(day.out.sections.spare[0].title).toBe("Buy groceries");
    expect(day.out.sections.work[0].title).toBe("Dentist");
    const week = await call("get_week", {});
    expect(week.out.days).toHaveLength(7);
  });

  it("creates a goal, links an achievement and logs progress through MCP", async () => {
    const area = await runAction(deps(), createArea, { name: "Music" });
    const ach = await runAction(deps(), createAchievement, {
      areaId: area.id,
      title: "Lyrics",
    });
    const goal = await call("create_goal", {
      title: "Write a song",
      deadline: "2026-06-01",
    });
    await call("link_achievement_to_goal", {
      achievementId: ach.id,
      goalId: goal.out.id,
    });
    const [row] = await db.select().from(achievements);
    expect(row!.goalId).toBe(goal.out.id);
    const got = await call("get_goal", { goalId: goal.out.id });
    expect(got.out.achievements).toHaveLength(1);
    expect((await call("list_goals", {})).out.goals).toHaveLength(1);
    await call("update_goal", { goalId: goal.out.id, title: "A full song" });

    const t = await call("create_tasks", {
      achievementId: ach.id,
      tasks: [
        { title: "Write 10 verses", target: { amount: 10, unit: "times" } },
      ],
    });
    const logged = await call("log_progress", {
      taskId: t.out[0].id,
      amount: 3,
    });
    expect(logged.out).toEqual({ progress: 3, completed: false });
    await call("delete_item", { kind: "goal", id: goal.out.id });
  });
});
