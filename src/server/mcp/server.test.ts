import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { messageFor } from "@/server/messages";
import { DomainError } from "@/server/domain/errors";
import { createLifeGoalsServer } from "./server";

const SPEC_TOOLS = [
  "get_overview",
  "list_achievements",
  "get_achievement",
  "search",
  "create_area",
  "update_area",
  "create_achievement",
  "update_achievement",
  "move_achievement",
  "create_tasks",
  "update_task",
  "move_task",
  "complete_task",
  "uncomplete_task",
  "capture",
  "file_item",
  "list_categories",
  "create_category",
  "set_task_categories",
  "log_practice",
  "list_history",
  "undo_batch",
  "delete_item",
  // Plan your days.
  "get_day",
  "get_week",
  "plan_task",
  "place_task",
  "log_progress",
  "list_goals",
  "get_goal",
  "create_goal",
  "update_goal",
  "link_achievement_to_goal",
  // Trackers.
  "list_trackers",
  "create_tracker",
  "log_moment",
  "get_tracker",
  // Profile.
  "get_profile",
  "update_profile",
];

let client: Client;

async function connect(
  run: Parameters<typeof createLifeGoalsServer>[0],
  onUnexpected?: Parameters<typeof createLifeGoalsServer>[1],
) {
  const [a, b] = InMemoryTransport.createLinkedPair();
  await createLifeGoalsServer(run, onUnexpected).connect(a);
  client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(b);
}

afterEach(() => client?.close());

const text = (r: { content?: unknown }) =>
  JSON.stringify((r.content as { text?: string }[]).map((c) => c.text));

describe("life-goals MCP server", () => {
  it("lists every spec tool with its domain schema", async () => {
    await connect(vi.fn());
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([...SPEC_TOOLS].sort());
    const createTasks = tools.find((t) => t.name === "create_tasks")!;
    expect(createTasks.inputSchema.required).toEqual(
      expect.arrayContaining(["achievementId", "tasks"]),
    );
    expect(createTasks.description).toContain(
      "Creating them in one call makes one undo step.",
    );
  });

  it("turns a domain refusal into a readable tool error", async () => {
    await connect(vi.fn().mockRejectedValue(new DomainError("not_found")));
    const r = await client.callTool({
      name: "complete_task",
      arguments: { taskId: crypto.randomUUID() },
    });
    expect(r.isError).toBe(true);
    expect(text(r)).toContain(messageFor("not_found"));
  });

  it("rejects bad input from a model without throwing", async () => {
    const run = vi.fn();
    await connect(run);
    const r = await client.callTool({
      name: "complete_task",
      arguments: { taskId: "nope" },
    });
    expect(r.isError).toBe(true);
    expect(run).not.toHaveBeenCalled();
  });

  it("hides unexpected errors", async () => {
    await connect(vi.fn().mockRejectedValue(new Error("db down")));
    const r = await client.callTool({ name: "get_overview", arguments: {} });
    expect(r.isError).toBe(true);
    expect(text(r)).toContain("Something went wrong. Try again.");
    expect(text(r)).not.toContain("db down");
  });

  it("reports unexpected errors, not domain refusals", async () => {
    const boom = new Error("db down");
    const report = vi.fn();
    await connect(
      vi
        .fn()
        .mockRejectedValueOnce(boom)
        .mockRejectedValueOnce(new DomainError("not_found")),
      report,
    );
    await client.callTool({ name: "get_overview", arguments: {} });
    await client.callTool({
      name: "complete_task",
      arguments: { taskId: crypto.randomUUID() },
    });
    expect(report).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith(boom, "get_overview");
  });

  it("answers with a one-line summary and the JSON", async () => {
    await connect(
      vi.fn().mockResolvedValue({ areas: [{}, {}, {}], inboxCount: 2 }),
    );
    const r = await client.callTool({ name: "get_overview", arguments: {} });
    expect(r.isError).toBeFalsy();
    const [summary, json] = r.content as { text: string }[];
    expect(summary!.text).toBe("3 areas, 2 in Inbox");
    expect(JSON.parse(json!.text)).toMatchObject({ inboxCount: 2 });
  });
});
