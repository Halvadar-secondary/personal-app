import { sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";

export type Environment = "local" | "preview" | "production";

export type Health = {
  ok: boolean;
  db: "up" | "down";
  schemaVersion: number | null;
  buildId: string;
  environment: Environment;
};

export async function checkHealth(
  db: Db,
  env: { buildId: string; environment: Environment },
): Promise<Health> {
  try {
    // Both drivers (node-postgres, PGlite) return `{ rows }`; the shared Db type can't express it.
    const result = (await db.execute(
      sql`select count(*)::int as n from drizzle.__drizzle_migrations`,
    )) as unknown as { rows: { n: number }[] };
    const n = result.rows[0]?.n ?? null;
    return { ok: true, db: "up", schemaVersion: n, ...env };
  } catch {
    // The error text can contain connection details; never log or return it.
    console.error("health: db check failed");
    return { ok: false, db: "down", schemaVersion: null, ...env };
  }
}
