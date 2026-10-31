import { describe, expect, it } from "vitest";
import {
  actorLabel,
  type SummaryEvent,
  summarizeBatch,
} from "./history-summary";

const ev = (
  entityType: string,
  op: SummaryEvent["op"],
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): SummaryEvent => ({ entityType, op, before, after });
const none = new Map<string, string>();
const titles = new Map([["t1", "Scales"]]);

describe("summarizeBatch", () => {
  it("names the profile section that changed", () => {
    expect(
      summarizeBatch(
        [ev("profile_section", "create", null, { section: "focus" })],
        none,
      ),
    ).toBe("Updated your profile: Current focus");
    expect(
      summarizeBatch(
        [
          ev(
            "profile_section",
            "update",
            { section: "style", text: "a" },
            { section: "style", text: "b" },
          ),
        ],
        none,
      ),
    ).toBe("Updated your profile: How to talk to me");
  });

  it("names created things", () => {
    expect(
      summarizeBatch([ev("area", "create", null, { name: "Guitar" })], none),
    ).toBe("Created area “Guitar”");
    const tasks = Array.from({ length: 15 }, (_, i) =>
      ev("task", "create", null, { title: `t${i}` }),
    );
    expect(summarizeBatch(tasks, none)).toBe("Added 15 tasks");
    expect(
      summarizeBatch([ev("task", "create", null, { title: "Scales" })], none),
    ).toBe("Added task “Scales”");
    expect(
      summarizeBatch(
        [ev("achievement", "create", null, { title: "Sweep" })],
        none,
      ),
    ).toBe("Added “Sweep”");
    expect(
      summarizeBatch(
        [
          ev("achievement", "create", null, { title: "A" }),
          ev("achievement", "create", null, { title: "B" }),
        ],
        none,
      ),
    ).toBe("Added 2 achievements");
    expect(
      summarizeBatch(
        [ev("category", "create", null, { name: "Theory" })],
        none,
      ),
    ).toBe("Created category “Theory”");
    expect(
      summarizeBatch(
        [ev("practice_entry", "create", null, { taskId: "t1" })],
        titles,
      ),
    ).toBe("Logged practice on “Scales”");
  });

  it("describes updates by what changed", () => {
    const sweep = { title: "Sweep", status: "backlog", sortKey: "a" };
    expect(
      summarizeBatch(
        [ev("achievement", "update", sweep, { ...sweep, status: "active" })],
        none,
      ),
    ).toBe("Moved “Sweep” to Active");
    expect(
      summarizeBatch(
        [
          ev(
            "achievement",
            "update",
            { title: "Learn a jig", areaId: null },
            { title: "Learn a jig", areaId: "x" },
          ),
        ],
        none,
      ),
    ).toBe("Filed “Learn a jig”");
    expect(
      summarizeBatch(
        [
          ev(
            "task",
            "update",
            { title: "Capo", achievementId: null },
            { title: "Capo", achievementId: "x" },
          ),
        ],
        none,
      ),
    ).toBe("Filed task “Capo”");
    expect(
      summarizeBatch(
        [ev("achievement", "update", sweep, { ...sweep, sortKey: "b" })],
        none,
      ),
    ).toBe("Reordered “Sweep”");
    expect(
      summarizeBatch(
        [
          ev("achievement", "update", sweep, {
            ...sweep,
            notes: "x",
            updatedAt: "later",
          }),
        ],
        none,
      ),
    ).toBe("Edited “Sweep”");
  });

  it("names the biggest thing deleted", () => {
    const cascade = [
      ev("task", "delete", { title: "a" }, { title: "a" }),
      ev("task", "delete", { title: "b" }, { title: "b" }),
      ev("task", "delete", { title: "c" }, { title: "c" }),
      ev("achievement", "delete", { title: "Sweep" }, { title: "Sweep" }),
      ev("area", "delete", { name: "Guitar" }, { name: "Guitar" }),
    ];
    expect(summarizeBatch(cascade, none)).toBe("Deleted area “Guitar”");
    expect(summarizeBatch(cascade.slice(0, 4), none)).toBe("Deleted “Sweep”");
    expect(summarizeBatch(cascade.slice(0, 2), none)).toBe("Deleted 2 tasks");
    expect(summarizeBatch(cascade.slice(0, 1), none)).toBe("Deleted task “a”");
  });

  it("completions and categories name their task", () => {
    const done = { taskId: "t1", occurrenceDate: "2026-10-24" };
    expect(
      summarizeBatch(
        [
          ev("task", "update", { title: "Scales" }, { title: "Scales" }),
          ev("task_completion", "create", null, done),
        ],
        titles,
      ),
    ).toBe("Completed “Scales”");
    expect(
      summarizeBatch(
        [ev("task_completion", "delete", { taskId: "gone" }, null)],
        titles,
      ),
    ).toBe("Uncompleted “a task”");
    expect(
      summarizeBatch(
        [
          {
            ...ev(
              "task_categories",
              "update",
              { categoryIds: [] },
              {
                categoryIds: ["c"],
              },
            ),
            entityId: "t1",
          },
        ],
        titles,
      ),
    ).toBe("Changed categories on “Scales”");
  });

  it("undo batches and anything else", () => {
    expect(
      summarizeBatch(
        [ev("area", "restore", { name: "A" }, { name: "B" })],
        none,
      ),
    ).toBe("Undid a change");
    expect(
      summarizeBatch(
        [
          ev("thing", "update", { a: 1 }, { a: 2 }),
          ev("thing", "update", { a: 1 }, { a: 2 }),
        ],
        none,
      ),
    ).toBe("Changed 2 items");
  });
});

it("labels actors", () => {
  expect(actorLabel("ui")).toBe("You");
  expect(actorLabel("seed")).toBe("Sample data");
  expect(actorLabel("chat")).toBe("Claude in chat");
  expect(actorLabel("mcp:Claude")).toBe("Claude via MCP");
  expect(actorLabel("robot")).toBe("robot");
});
