// Restore drill check: does a restored database look whole? Prints counts only.
// Usage: pnpm restore:check "<database url>"
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import journal from "../drizzle/meta/_journal.json";
import { checkRestore, describeDatabase } from "@/server/backup-check";
import * as schema from "@/server/db/schema";
import type { Db } from "@/server/db/types";

async function main() {
  const url = process.argv[2];
  if (!url) {
    console.error('usage: pnpm restore:check "<database url>"');
    process.exit(2);
  }
  const pool = new Pool({ connectionString: url });
  try {
    const db = drizzle(pool, { schema }) as unknown as Db;
    const summary = await describeDatabase(db);
    console.log(JSON.stringify(summary, null, 2));
    const problems = checkRestore(summary, journal.entries.length);
    for (const p of problems) console.error(`problem: ${p}`);
    if (problems.length) process.exitCode = 1;
    else console.log("restore looks whole");
  } finally {
    await pool.end();
  }
}

main().catch(() => {
  // The error text can contain connection details; never print it.
  console.error("restore check failed to connect or query");
  process.exit(1);
});
