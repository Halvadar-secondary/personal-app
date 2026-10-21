import { describe, expect, it } from "vitest";
import type { Db } from "@/server/db/types";
import { checkHealth } from "@/server/health";
import { createTestDb } from "@/test/db";

describe("checkHealth", () => {
  it("reports up with schema version", async () => {
    const { db, close } = await createTestDb();
    const h = await checkHealth(db, { buildId: "abc", environment: "preview" });
    expect(h).toEqual({
      ok: true,
      db: "up",
      schemaVersion: 2,
      buildId: "abc",
      environment: "preview",
    });
    await close();
  });

  it("reports down without leaking details when the db fails", async () => {
    const broken = {
      execute: () =>
        Promise.reject(new Error("password=hunter2 host=db.secret")),
    } as unknown as Db;
    const h = await checkHealth(broken, {
      buildId: "abc",
      environment: "production",
    });
    expect(h).toEqual({
      ok: false,
      db: "down",
      schemaVersion: null,
      buildId: "abc",
      environment: "production",
    });
    expect(JSON.stringify(h)).not.toContain("hunter2");
  });
});
