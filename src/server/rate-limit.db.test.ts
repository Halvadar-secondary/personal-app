import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";
import type { Db } from "@/server/db/types";
import { hitRateLimit } from "./rate-limit";

const t0 = new Date("2026-10-24T12:00:00Z");
const at = (ms: number) => new Date(t0.getTime() + ms);

let db: Db;
let close: () => Promise<void>;

beforeEach(async () => {
  const t = await createTestDb();
  db = t.db;
  close = t.close;
});
afterEach(() => close());

describe("hitRateLimit", () => {
  it("allows up to the limit in a window, then refuses with the seconds left", async () => {
    for (let i = 0; i < 3; i++) {
      expect(await hitRateLimit(db, "k", 3, 60_000, at(i * 1000))).toEqual({
        ok: true,
      });
    }
    expect(await hitRateLimit(db, "k", 3, 60_000, at(15_500))).toEqual({
      ok: false,
      retryAfterSeconds: 45,
    });
  });

  it("a new window starts fresh", async () => {
    for (let i = 0; i < 4; i++) await hitRateLimit(db, "k", 3, 60_000, at(i));
    expect(await hitRateLimit(db, "k", 3, 60_000, at(60_000))).toEqual({
      ok: true,
    });
    expect(await hitRateLimit(db, "k", 3, 60_000, at(61_000))).toEqual({
      ok: true,
    });
  });

  it("keys don't share a count", async () => {
    for (let i = 0; i < 3; i++) await hitRateLimit(db, "a", 3, 60_000, at(i));
    expect(await hitRateLimit(db, "b", 3, 60_000, at(10))).toEqual({
      ok: true,
    });
    expect((await hitRateLimit(db, "a", 3, 60_000, at(10))).ok).toBe(false);
  });
});
