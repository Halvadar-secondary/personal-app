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
  { timeoutMs = 5_000 }: { timeoutMs?: number } = {},
): Promise<Health> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // A db that drops packets never errors; give up rather than hang the request.
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
    });
    // Both drivers (node-postgres, PGlite) return `{ rows }`; the shared Db type can't express it.
    const result = (await Promise.race([
      db.execute(
        sql`select count(*)::int as n from drizzle.__drizzle_migrations`,
      ),
      timeout,
    ])) as unknown as { rows: { n: number }[] };
    const n = result.rows[0]?.n ?? null;
    return { ok: true, db: "up", schemaVersion: n, ...env };
  } catch {
    // The error text can contain connection details; never log or return it.
    console.error("health: db check failed");
    return { ok: false, db: "down", schemaVersion: null, ...env };
  } finally {
    clearTimeout(timer);
  }
}
