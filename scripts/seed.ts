// Fills the E2E owner's account with sample goals. Never touches a real account.
import { and, eq, isNull, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { normalizeEmail } from "@/server/auth/owner";
import * as schema from "@/server/db/schema";
import type { Db } from "@/server/db/types";
import { runAction } from "@/server/domain/context";
import { requireEnv } from "./lib/env";
import { seedSampleData } from "./lib/seed-data";
import { assertSeedable } from "./lib/seed-guard";

async function main() {
  const email = normalizeEmail(requireEnv("E2E_OWNER_EMAIL"));
  assertSeedable(email, {
    APP_ENV: process.env.APP_ENV,
    VERCEL_ENV: process.env.VERCEL_ENV,
  });

  const pool = new Pool({
    connectionString: requireEnv("MIGRATION_DATABASE_URL"),
  });
  const db = drizzle(pool, { schema }) as unknown as Db;
  try {
    const [owner] = await db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.email, email));
    if (!owner) {
      console.error(`no user ${email}: run pnpm e2e:users first`);
      process.exitCode = 1;
      return;
    }
    const [{ n } = { n: 0 }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.areas)
      .where(
        and(eq(schema.areas.ownerId, owner.id), isNull(schema.areas.deletedAt)),
      );
    if (n > 0) {
      console.log("already seeded");
      return;
    }
    const r = await runAction(
      { db, ownerId: owner.id, actor: "seed" },
      seedSampleData,
      {},
    );
    console.log(`seeded ${r.areas} areas`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
