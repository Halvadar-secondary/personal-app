import "server-only";
import { EventEmitter } from "node:events";
import { attachDatabasePool, waitUntil } from "@vercel/functions";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolClient } from "pg";
import * as schema from "./schema";
import type { Db } from "./types";

let db: Db | undefined;

type Guardable = EventEmitter & {
  query: (...args: never[]) => unknown;
  release: (err?: Error | boolean) => void;
};

const broken = Symbol("broken connection");
const guarded = Symbol("guarded");
type State = { [broken]?: Error; [guarded]?: true };

/** Errors after which a connection can't be trusted with another request. */
function breaksConnection(err: unknown): boolean {
  return (
    err instanceof Error &&
    /Query read timeout|Connection terminated|not queryable/i.test(err.message)
  );
}

/**
 * Remembers when a checked-out connection breaks, and makes its release
 * discard it instead of handing it to the next request. Drizzle's transaction
 * releases without passing the error, so without this a connection whose
 * query timed out (the database still busy with it, the transaction still
 * open) goes back into the pool, and every request that borrows it hangs.
 */
export function guardClient(client: Guardable): void {
  const c = client as Guardable & State;
  if (!c[guarded]) {
    c[guarded] = true;
    // The pool listens for errors only while a connection is idle. One that
    // drops while in use (Neon ending a transaction a frozen function left
    // open) would emit "error" with no listener, which Node throws, taking
    // down every request on the instance.
    c.on("error", (err: Error) => {
      c[broken] ??= err;
      console.error("database connection error", err);
    });
    const query = c.query.bind(c) as (...args: unknown[]) => unknown;
    c.query = ((...args: unknown[]) => {
      const r = query(...args);
      if (r instanceof Promise)
        r.catch((err: unknown) => {
          if (breaksConnection(err)) c[broken] ??= err as Error;
        });
      return r;
    }) as Guardable["query"];
  }
  // The pool sets a fresh release on every checkout, so wrap it each time.
  const release = c.release;
  c.release = (err?: Error | boolean) => release(err || c[broken]);
}

export function createPool(connectionString: string | undefined): Pool {
  const pool = new Pool({
    connectionString,
    max: 5,
    // pg waits forever by default; an unreachable db must fail fast, not hang every request.
    connectionTimeoutMillis: 5_000,
    query_timeout: 10_000,
  });
  // Vercel pauses an instance once no request is running, and a request cut
  // short (the visitor moved on) can leave a transaction mid-way. Paused, it
  // sits "idle in transaction" until Neon kills it five minutes later, holding
  // one of the five connections all along. Keep running until it's back.
  const out = new WeakMap<object, () => void>();
  pool.on("acquire", (client) => {
    waitUntil(new Promise<void>((done) => out.set(client, done)));
  });
  pool.on("release", (_err, client) => {
    out.get(client)?.();
    out.delete(client);
  });
  // A connection that errors before it's ever handed out is still covered.
  pool.on("connect", (client) => guardClient(client as unknown as Guardable));
  // Transactions take a connection with connect(); guard each checkout.
  const connect = pool.connect.bind(pool) as () => Promise<PoolClient>;
  pool.connect = (async (...args: unknown[]) => {
    if (args.length) return (connect as (...a: unknown[]) => unknown)(...args);
    const client = await connect();
    guardClient(client as unknown as Guardable);
    return client;
  }) as Pool["connect"];
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
