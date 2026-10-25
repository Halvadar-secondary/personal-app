// Weekly clean-up (spec §5.5): hard-deletes rows soft-deleted over 90 days
// ago. Run by purge.yml against production. Prints counts only.
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@/server/db/schema";
import type { Db } from "@/server/db/types";
import { purgeDeleted } from "@/server/domain/purge";
import { requireEnv } from "./lib/env";

async function main() {
  const pool = new Pool({
    connectionString: requireEnv("MIGRATION_DATABASE_URL"),
  });
  try {
    const db = drizzle(pool, { schema }) as unknown as Db;
    const counts = await purgeDeleted(db, new Date());
    console.log(JSON.stringify(counts));
  } finally {
    await pool.end();
  }
}

main().catch(() => {
  // The error text can contain connection details; never print it.
  console.error("purge failed");
  process.exit(1);
});
