import { EventEmitter } from "node:events";
import { afterEach, expect, it, vi } from "vitest";
import { createPool } from "./client";

afterEach(() => vi.restoreAllMocks());

// The database can drop a connection while a request holds it, for example
// Neon ending a transaction a frozen serverless function left open. pg then
// emits "error" on that connection, and the pool listens only while it's
// idle. With no listener Node throws, and the whole instance goes down.
it("a connection that drops while in use is logged, not thrown", async () => {
  const pool = createPool("postgres://u:p@127.0.0.1:1/db");
  const client = new EventEmitter();
  pool.emit("connect", client);
  const log = vi.spyOn(console, "error").mockImplementation(() => {});

  const dropped = new Error("Connection terminated unexpectedly");
  expect(() => client.emit("error", dropped)).not.toThrow();
  expect(log).toHaveBeenCalledWith("database connection error", dropped);
  await pool.end();
});
