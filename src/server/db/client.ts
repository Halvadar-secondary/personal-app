import "server-only";
import { attachDatabasePool } from "@vercel/functions";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
import type { Db } from "./types";

let db: Db | undefined;

export function createPool(connectionString: string | undefined): Pool {
  const pool = new Pool({
    connectionString,
    max: 5,
    // pg waits forever by default; an unreachable db must fail fast, not hang every request.
    connectionTimeoutMillis: 5_000,
    query_timeout: 10_000,
  });
  // The pool handles errors on idle connections only. One that drops while a
  // request holds it (Neon ends a transaction a frozen function left open)
  // emits "error" with no listener, which Node throws, taking down every
  // request on the instance. The query in flight still fails on its own.
  pool.on("connect", (client) => {
    client.on("error", (err) =>
      console.error("database connection error", err),
    );
  });
  return pool;
}

export function getDb(): Db {
  if (!db) {
    const pool = createPool(process.env.DATABASE_URL);
    attachDatabasePool(pool);
    db = drizzle(pool, { schema }) as unknown as Db;
  }
  return db;
}
