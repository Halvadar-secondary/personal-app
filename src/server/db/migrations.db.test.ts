import { describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";

describe("migrations", () => {
  it("applies migrations and creates settings with defaults", async () => {
    const { client, close } = await createTestDb();
    await client.query(
      `insert into "user" (id, name, email) values ('u1', 'Owner', 'me@x.com')`,
    );
    await client.query(`insert into settings (owner_id) values ('u1')`);
    const r = await client.query(
      `select time_zone, week_start from settings where owner_id='u1'`,
    );
    expect(r.rows[0]).toEqual({ time_zone: "UTC", week_start: 1 });
    await close();
  });

  it("sort keys order by byte, whatever the database's collation", async () => {
    // Fractional keys rely on "Zz" < "a0"; a language collation sorts them
    // the other way and a card moved to the top shows up at the bottom.
    const { client, close } = await createTestDb();
    const r = await client.query<{
      table_name: string;
      collation_name: string;
    }>(
      `select table_name, collation_name from information_schema.columns
       where column_name = 'sort_key' order by table_name`,
    );
    expect(r.rows).toEqual([
      { table_name: "achievements", collation_name: "C" },
      { table_name: "areas", collation_name: "C" },
      { table_name: "tasks", collation_name: "C" },
    ]);
    await close();
  });
});
