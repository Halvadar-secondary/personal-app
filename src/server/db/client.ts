import "server-only";
import { attachDatabasePool } from "@vercel/functions";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
import type { Db } from "./types";

let db: Db | undefined;

export function getDb(): Db {
  if (!db) {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
    });
    attachDatabasePool(pool);
    db = drizzle(pool, { schema }) as unknown as Db;
  }
  return db;
}
