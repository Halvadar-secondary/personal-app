// Provisions the E2E owner and intruder on a non-production database. Idempotent.
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { createAuth } from "@/server/auth/auth";
import { normalizeEmail } from "@/server/auth/owner";
import { createUserWithPassword } from "@/server/auth/users";
import * as schema from "@/server/db/schema";
import type { Db } from "@/server/db/types";
import { requireEnv } from "./lib/env";

async function main() {
  if (process.env.APP_ENV === "production") {
    console.error("refusing to run in production");
    process.exit(1);
  }
  const ownerEmail = normalizeEmail(requireEnv("E2E_OWNER_EMAIL"));
  const ownerPassword = requireEnv("E2E_OWNER_PASSWORD");
  const intruderEmail = normalizeEmail(requireEnv("E2E_INTRUDER_EMAIL"));
  const intruderPassword = requireEnv("E2E_INTRUDER_PASSWORD");

  const pool = new Pool({
    connectionString: requireEnv("MIGRATION_DATABASE_URL"),
  });
  const db = drizzle(pool, { schema }) as unknown as Db;
  try {
    // The owner goes through Better Auth, so the creation hook runs.
    const auth = createAuth(db, {
      ...process.env,
      OWNER_EMAIL: ownerEmail,
      BETTER_AUTH_SECRET:
        process.env.BETTER_AUTH_SECRET ?? "script-only-secret-not-for-sessions",
    });
    let ownerId = await findUserId(db, ownerEmail);
    if (ownerId) {
      await setPassword(db, ownerId, ownerPassword);
    } else {
      ownerId = (await createUserWithPassword(auth, ownerEmail, ownerPassword))
        .id;
    }
    await db.execute(
      sql`insert into settings (owner_id) values (${ownerId}) on conflict (owner_id) do nothing`,
    );

    // The intruder is inserted directly, bypassing the hook, to simulate a non-owner row
    // existing (e.g. after OWNER_EMAIL changes) so E2E can prove the second lock holds.
    let intruderId = await findUserId(db, intruderEmail);
    if (!intruderId) {
      intruderId = randomUUID();
      await db.execute(
        sql`insert into "user" (id, name, email, email_verified) values (${intruderId}, 'Intruder', ${intruderEmail}, true)`,
      );
    }
    await setPassword(db, intruderId, intruderPassword);

    console.log(
      `owner ${ownerEmail} (${ownerId}) and intruder ${intruderEmail} ready`,
    );
  } finally {
    await pool.end();
  }
}

async function findUserId(db: Db, email: string): Promise<string | null> {
  const r = (await db.execute(
    sql`select id from "user" where email = ${email}`,
  )) as unknown as {
    rows: { id: string }[];
  };
  return r.rows[0]?.id ?? null;
}

async function setPassword(
  db: Db,
  userId: string,
  password: string,
): Promise<void> {
  const hash = await hashPassword(password);
  const r = (await db.execute(
    sql`update account set password = ${hash}, updated_at = now() where user_id = ${userId} and provider_id = 'credential'`,
  )) as unknown as { rowCount: number };
  if (r.rowCount === 0) {
    await db.execute(
      sql`insert into account (id, account_id, provider_id, user_id, password, created_at, updated_at)
          values (${randomUUID()}, ${userId}, 'credential', ${userId}, ${hash}, now(), now())`,
    );
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
