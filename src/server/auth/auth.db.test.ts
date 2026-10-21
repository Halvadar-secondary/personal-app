import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";
import { createAuth } from "./auth";
import { createUserWithPassword } from "./users";

const env = {
  OWNER_EMAIL: "me@x.com",
  APP_ENV: "local",
  ENABLE_PASSWORD_LOGIN: "true",
  BETTER_AUTH_SECRET: "x".repeat(32),
  BETTER_AUTH_URL: "http://localhost:3000",
};

describe("owner lock at account creation", () => {
  it("lets the owner's email get an account", async () => {
    const { db, close } = await createTestDb();
    const auth = createAuth(db, env);
    await expect(
      createUserWithPassword(auth, "Me@X.com", "pw-123456789"),
    ).resolves.toMatchObject({ email: "me@x.com" });
    await close();
  });

  it("refuses any other email at creation (hook)", async () => {
    const { db, close } = await createTestDb();
    const auth = createAuth(db, env);
    await expect(
      createUserWithPassword(auth, "stranger@y.com", "pw-123456789"),
    ).rejects.toThrow(/Sign-ups are closed/);
    const r = (await db.execute(
      sql`select count(*)::int as n from "user"`,
    )) as unknown as {
      rows: { n: number }[];
    };
    expect(r.rows[0]).toEqual({ n: 0 });
    await close();
  });

  it("refuses public password sign-up even for the owner email", async () => {
    const { db, close } = await createTestDb();
    const auth = createAuth(db, env);
    await expect(
      auth.api.signUpEmail({
        body: { email: "me@x.com", password: "pw-123456789", name: "Me" },
      }),
    ).rejects.toThrow();
    await close();
  });
});
