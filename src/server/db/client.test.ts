import { EventEmitter } from "node:events";
import { afterEach, expect, it, vi } from "vitest";
import { createPool, guardClient } from "./client";

afterEach(() => vi.restoreAllMocks());

// The database can drop a connection while a request holds it, for example
// Neon ending a transaction a frozen serverless function left open. pg then
// emits "error" on that connection, and the pool listens only while it's
// idle. With no listener Node throws, and the whole instance goes down.
it("a connection that drops while in use is logged, not thrown", async () => {
  const pool = createPool("postgres://u:p@127.0.0.1:1/db");
  const client = Object.assign(new EventEmitter(), {
    query: vi.fn(),
    release: vi.fn(),
  });
  pool.emit("connect", client);
  const log = vi.spyOn(console, "error").mockImplementation(() => {});

  const dropped = new Error("Connection terminated unexpectedly");
  expect(() => client.emit("error", dropped)).not.toThrow();
  expect(log).toHaveBeenCalledWith("database connection error", dropped);
  await pool.end();
});

/** A stand-in for a pg client: events, a query that can fail, release. */
function fakeClient() {
  const release = vi.fn();
  const query = vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({
    rows: [],
  }));
  const client = Object.assign(new EventEmitter(), { query, release });
  return { client, release, query };
}

it("a healthy connection goes back to the pool for reuse", async () => {
  const { client, release } = fakeClient();
  guardClient(client);
  await client.query("select 1");
  (client.release as () => void)();
  expect(release).toHaveBeenCalledWith(undefined);
});

// Drizzle's transaction releases without the error, so a broken connection
// would be handed to the next request, which then hangs on it.
it("a connection that errored is thrown away, not reused", () => {
  const { client, release } = fakeClient();
  guardClient(client);
  vi.spyOn(console, "error").mockImplementation(() => {});
  const dropped = new Error("Connection terminated unexpectedly");
  client.emit("error", dropped);
  (client.release as () => void)();
  expect(release).toHaveBeenCalledWith(dropped);
});

it("a connection whose query timed out is thrown away, not reused", async () => {
  const { client, release, query } = fakeClient();
  const timedOut = new Error("Query read timeout");
  query.mockRejectedValueOnce(timedOut);
  guardClient(client);
  await expect(client.query("select pg_sleep(60)")).rejects.toBe(timedOut);
  (client.release as () => void)();
  expect(release).toHaveBeenCalledWith(timedOut);
});

it("an ordinary query error keeps the connection", async () => {
  const { client, release, query } = fakeClient();
  query.mockRejectedValueOnce(
    Object.assign(new Error("duplicate key"), { code: "23505" }),
  );
  guardClient(client);
  await expect(client.query("insert …")).rejects.toThrow("duplicate key");
  (client.release as () => void)();
  expect(release).toHaveBeenCalledWith(undefined);
});

// Vercel pauses an instance once no request is running. A request that's cut
// short (the visitor moved on) can leave its transaction mid-way; paused, the
// connection sits "idle in transaction" until Neon kills it five minutes later,
// and meanwhile it's one of the pool's five. Each checkout keeps the instance
// running until the connection is back.
const vercel = vi.hoisted(() => ({ waitUntil: vi.fn() }));
vi.mock("@vercel/functions", async (orig) => ({
  ...(await orig<typeof import("@vercel/functions")>()),
  waitUntil: vercel.waitUntil,
}));

it("the instance stays running while a connection is checked out", async () => {
  const pool = createPool("postgres://u:p@127.0.0.1:1/db");
  const { client } = fakeClient();
  vercel.waitUntil.mockClear();
  pool.emit("acquire", client);
  expect(vercel.waitUntil).toHaveBeenCalledTimes(1);
  const held = vercel.waitUntil.mock.calls[0]?.[0] as Promise<void>;
  let done = false;
  held.then(() => (done = true));
  await Promise.resolve();
  expect(done).toBe(false);
  pool.emit("release", undefined, client);
  await held;
  expect(done).toBe(true);
  await pool.end();
});

// A page load prefetches about ten pages at once. With five connections and a
// five-second wait, that burst failed requests with "timeout exceeded when
// trying to connect" (pg's message for waiting on a free connection).
it("a burst of ten requests each gets a connection without failing", () => {
  const pool = createPool("postgres://u:p@127.0.0.1:1/db");
  expect(pool.options.max).toBeGreaterThanOrEqual(10);
  expect(pool.options.connectionTimeoutMillis).toBeGreaterThanOrEqual(15_000);
  return pool.end();
});
