import { sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";

const TABLES = [
  "areas",
  "achievements",
  "tasks",
  "task_completions",
  "practice_entries",
  "change_events",
] as const;

export type DbSummary = {
  schemaVersion: number;
  owners: number;
  rows: Record<(typeof TABLES)[number], number>;
};

async function count(db: Db, query: ReturnType<typeof sql>): Promise<number> {
  // Both drivers (node-postgres, PGlite) return `{ rows }`.
  const result = (await db.execute(query)) as unknown as {
    rows: { n: number }[];
  };
  return result.rows[0]?.n ?? 0;
}

/** Row counts of a database, soft-deleted rows included: what a restore should hold. */
export async function describeDatabase(db: Db): Promise<DbSummary> {
  const rows = {} as DbSummary["rows"];
  for (const t of TABLES) {
    rows[t] = await count(
      db,
      sql`select count(*)::int as n from ${sql.identifier(t)}`,
    );
  }
  return {
    schemaVersion: await count(
      db,
      sql`select count(*)::int as n from drizzle.__drizzle_migrations`,
    ),
    owners: await count(db, sql`select count(*)::int as n from "user"`),
    rows,
  };
}

/** What's wrong with a restored database; empty means it looks whole. */
export function checkRestore(
  summary: DbSummary,
  expectedSchemaVersion: number,
): string[] {
  const problems: string[] = [];
  if (summary.schemaVersion !== expectedSchemaVersion)
    problems.push(
      `schema version ${summary.schemaVersion}, expected ${expectedSchemaVersion}`,
    );
  if (summary.owners !== 1)
    problems.push(`expected exactly one user, found ${summary.owners}`);
  if (summary.rows.areas === 0) problems.push("no areas");
  return problems;
}
