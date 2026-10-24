import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";
import { oauthClientsSeen, oauthRefreshToken } from "@/server/db/schema";
import type { Db } from "@/server/db/types";
import { authorizeMcp } from "./access";
import { listConnectedApps, revokeApp } from "./connected";

const OWNER = "me@x.com";
const now = new Date("2026-10-24T12:00:00Z");
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);

let db: Db;
let q: (sql: string) => Promise<unknown>;
let close: () => Promise<void>;

beforeEach(async () => {
  const t = await createTestDb();
  db = t.db;
  close = t.close;
  q = (sql) => t.client.query(sql);
  await q(
    `insert into "user" (id, name, email) values ('u1', 'Owner', 'me@x.com')`,
  );
});
afterEach(() => close());

async function connectApp(clientId: string, name: string, usedAt: Date) {
  await q(
    `insert into oauth_client (id, client_id, name, redirect_uris) values ('${clientId}-row', '${clientId}', '${name}', '{}')`,
  );
  await q(
    `insert into oauth_consent (id, client_id, user_id, scopes, created_at, updated_at)
     values ('${clientId}-consent', '${clientId}', 'u1', '{mcp:goals}', now(), now())`,
  );
  await q(
    `insert into oauth_refresh_token (id, token, client_id, user_id, scopes, expires_at, created_at)
     values ('${clientId}-rt', '${clientId}-token', '${clientId}', 'u1', '{mcp:goals}', now() + interval '30 days', now())`,
  );
  await authorizeMcp(db, { sub: "u1", azp: clientId }, OWNER, usedAt);
}

describe("connected AI apps", () => {
  it("lists apps with live consent, newest first", async () => {
    await connectApp("c1", "Claude", minutesAgo(30));
    await connectApp("c2", "Cursor", minutesAgo(5));
    await connectApp("c3", "Gone", minutesAgo(1));
    await q(`delete from oauth_consent where client_id = 'c3'`);

    expect(await listConnectedApps(db, "u1", now, "UTC")).toEqual([
      { clientId: "c2", name: "Cursor", lastUsed: "5 min ago" },
      { clientId: "c1", name: "Claude", lastUsed: "30 min ago" },
    ]);
  });

  it("revoking removes consent, refresh tokens and the row; the gate then refuses", async () => {
    await connectApp("c1", "Claude", minutesAgo(5));
    await connectApp("c2", "Cursor", minutesAgo(5));

    await revokeApp(db, "u1", "c1");

    expect(await listConnectedApps(db, "u1", now, "UTC")).toEqual([
      { clientId: "c2", name: "Cursor", lastUsed: "5 min ago" },
    ]);
    const tokens = await db.select().from(oauthRefreshToken);
    expect(tokens.map((t) => t.clientId)).toEqual(["c2"]);
    const seen = await db.select().from(oauthClientsSeen);
    expect(seen.map((s) => s.clientId)).toEqual(["c2"]);
    expect(
      await authorizeMcp(db, { sub: "u1", azp: "c1" }, OWNER, now),
    ).toEqual({ status: 401, error: "revoked" });
  });
});
