import { afterEach, beforeEach, describe, expect, it } from "vitest";
import journal from "../../drizzle/meta/_journal.json";
import type { Db } from "@/server/db/types";
import { createTestDb } from "@/test/db";
import { checkRestore, type DbSummary, describeDatabase } from "./backup-check";

const SCHEMA = journal.entries.length;

let db: Db;
let q: (sql: string) => Promise<unknown>;
let close: () => Promise<void>;

beforeEach(async () => {
  const t = await createTestDb();
  db = t.db;
  close = t.close;
  q = (sql) => t.client.query(sql);
});
afterEach(() => close());

const healthy: DbSummary = {
  schemaVersion: SCHEMA,
  owners: 1,
  rows: {
    areas: 2,
    achievements: 3,
    tasks: 5,
    task_completions: 1,
    practice_entries: 0,
    change_events: 9,
  },
};

describe("describeDatabase", () => {
  it("describes a migrated database", async () => {
    await q(
      `insert into "user" (id, name, email) values ('u1', 'O', 'o@x.com')`,
    );
    await q(
      `insert into areas (id, owner_id, name, sort_key) values ('00000000-0000-4000-8000-000000000001', 'u1', 'Guitar', 'a0')`,
    );
    await q(
      `insert into tasks (owner_id, title, sort_key, deleted_at) values ('u1', 'Gone', 'a0', now())`,
    );

    expect(await describeDatabase(db)).toEqual({
      schemaVersion: SCHEMA,
      owners: 1,
      rows: {
        areas: 1,
        achievements: 0,
        tasks: 1,
        task_completions: 0,
        practice_entries: 0,
        change_events: 0,
      },
    });
  });
});

describe("checkRestore", () => {
  it("checkRestore accepts a healthy summary", () => {
    expect(checkRestore(healthy, SCHEMA)).toEqual([]);
  });

  it("checkRestore names every problem", () => {
    expect(
      checkRestore(
        {
          schemaVersion: 3,
          owners: 0,
          rows: { ...healthy.rows, areas: 0 },
        },
        6,
      ),
    ).toEqual([
      "schema version 3, expected 6",
      "expected exactly one user, found 0",
      "no areas",
    ]);
  });
});
