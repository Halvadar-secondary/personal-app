// The evening reminder (spec "Plan your days" §9): run every 15 minutes by
// remind.yml against production. Prints counts only.
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@/server/db/schema";
import type { Db } from "@/server/db/types";
import { sendReminders } from "@/server/domain/reminders";
import { webPushSender } from "@/server/push/send";
import { requireEnv } from "./lib/env";

async function main() {
  const send = webPushSender();
  if (!send) throw new Error("VAPID keys are not set");
  const pool = new Pool({
    connectionString: requireEnv("MIGRATION_DATABASE_URL"),
  });
  try {
    const db = drizzle(pool, { schema }) as unknown as Db;
    console.log(JSON.stringify(await sendReminders(db, new Date(), send)));
  } finally {
    await pool.end();
  }
}

main().catch(() => {
  // The error text can contain connection details; never print it.
  console.error("remind failed");
  process.exit(1);
});
