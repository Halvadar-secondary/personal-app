import { describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";

describe("migrations", () => {
  it("applies migrations and creates settings with defaults", async () => {
    const { client, close } = await createTestDb();
    await client.query(`insert into settings (owner_id) values ('u1')`);
    const r = await client.query(
      `select time_zone, week_start from settings where owner_id='u1'`,
    );
    expect(r.rows[0]).toEqual({ time_zone: "UTC", week_start: 1 });
    await close();
  });
});
