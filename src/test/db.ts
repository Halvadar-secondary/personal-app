import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/server/db/schema";
import type { Db } from "@/server/db/types";

/** A fresh in-memory Postgres with every committed migration applied. */
export async function createTestDb(): Promise<{
  db: Db;
  client: PGlite;
  close(): Promise<void>;
}> {
  const client = new PGlite();
  const pg = drizzle(client, { schema });
  await migrate(pg, { migrationsFolder: "drizzle" });
  return { db: pg as unknown as Db, client, close: () => client.close() };
}
