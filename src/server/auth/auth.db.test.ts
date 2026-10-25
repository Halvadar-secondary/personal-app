import { sql } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "@/test/db";
import { createAuth, SESSION_CACHE_SECONDS } from "./auth";
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

describe("session cookie cache", () => {
  /** Signs the owner in; returns the browser's cookies as a request header. */
  async function signedIn() {
    const { db, close } = await createTestDb();
    const auth = createAuth(db, env);
    await createUserWithPassword(auth, "me@x.com", "pw-123456789");
    const { headers } = await auth.api.signInEmail({
      body: { email: "me@x.com", password: "pw-123456789" },
      returnHeaders: true,
    });
    const cookie = headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    const deleteSessions = () => db.execute(sql`delete from "session"`);
    return { auth, close, deleteSessions, cookies: new Headers({ cookie }) };
  }

  afterEach(() => vi.useRealTimers());

  it("answers from the cookie without the session row", async () => {
    const { auth, close, deleteSessions, cookies } = await signedIn();
    await deleteSessions();
    const session = await auth.api.getSession({ headers: cookies });
    expect(session?.user.email).toBe("me@x.com");
    await close();
  });

  it("goes back to the database after 5 minutes", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { auth, close, deleteSessions, cookies } = await signedIn();
    await deleteSessions();
    vi.setSystemTime(Date.now() + SESSION_CACHE_SECONDS * 1000 + 1000);
    expect(await auth.api.getSession({ headers: cookies })).toBeNull();
    await close();
  });

  it("signing out clears the cache cookie", async () => {
    const { auth, close, cookies } = await signedIn();
    expect(cookies.get("cookie")).toContain("better-auth.session_data=");
    const { headers } = await auth.api.signOut({
      headers: cookies,
      returnHeaders: true,
    });
    const cleared = headers
      .getSetCookie()
      .find((c) => c.startsWith("better-auth.session_data="));
    expect(cleared).toMatch(/Max-Age=0/i);
    await close();
  });
});
