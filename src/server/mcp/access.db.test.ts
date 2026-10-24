import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";
import type { Db } from "@/server/db/types";
import { oauthClientsSeen } from "@/server/db/schema";
import { authorizeMcp } from "./access";

const OWNER = "me@x.com";
const now = new Date("2026-10-24T12:00:00Z");

let db: Db;
let q: (sql: string) => Promise<unknown>;
let close: () => Promise<void>;

beforeEach(async () => {
  const t = await createTestDb();
  db = t.db;
  close = t.close;
  q = (sql) => t.client.query(sql);
  await q(
    `insert into "user" (id, name, email) values ('u1', 'Owner', 'me@x.com'), ('u2', 'Other', 'other@x.com')`,
  );
});
afterEach(() => close());

async function client(clientId: string, name: string | null) {
  await q(
    `insert into oauth_client (id, client_id, name, redirect_uris)
     values ('${clientId}-row', '${clientId}', ${name === null ? "null" : `'${name}'`}, '{}')`,
  );
}

async function consent(userId: string, clientId: string) {
  await q(
    `insert into oauth_consent (id, client_id, user_id, scopes, created_at, updated_at)
     values ('${userId}-${clientId}', '${clientId}', '${userId}', '{mcp:goals}', now(), now())`,
  );
}

describe("authorizeMcp", () => {
  it("lets the owner's consented client in, as mcp:<name>", async () => {
    await client("c1", "Claude");
    await consent("u1", "c1");
    const caller = await authorizeMcp(db, { sub: "u1", azp: "c1" }, OWNER, now);
    expect(caller).toEqual({
      ownerId: "u1",
      clientId: "c1",
      clientName: "Claude",
      actor: "mcp:Claude",
    });
    const seen = await db.select().from(oauthClientsSeen);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      ownerId: "u1",
      clientId: "c1",
      clientName: "Claude",
    });
    expect(seen[0]!.lastUsedAt.toISOString()).toBe(now.toISOString());
  });

  it("refuses a token for someone who isn't the owner", async () => {
    await client("c1", "Claude");
    await consent("u2", "c1");
    expect(
      await authorizeMcp(db, { sub: "u2", azp: "c1" }, OWNER, now),
    ).toEqual({ status: 403, error: "not_owner" });
    expect(
      await authorizeMcp(db, { sub: "nobody", azp: "c1" }, OWNER, now),
    ).toEqual({ status: 403, error: "not_owner" });
  });

  it("refuses a client whose consent was revoked, though its token is unexpired", async () => {
    await client("c1", "Claude");
    await consent("u1", "c1");
    await q(`delete from oauth_consent`);
    expect(
      await authorizeMcp(db, { sub: "u1", azp: "c1" }, OWNER, now),
    ).toEqual({ status: 401, error: "revoked" });
    expect(await db.select().from(oauthClientsSeen)).toHaveLength(0);
  });

  it("names a nameless client by its client id host, else 'AI app'", async () => {
    await client("https://claude.ai/oauth/mcp.json", null);
    await consent("u1", "https://claude.ai/oauth/mcp.json");
    await client("opaque-id", null);
    await consent("u1", "opaque-id");
    const byHost = await authorizeMcp(
      db,
      { sub: "u1", client_id: "https://claude.ai/oauth/mcp.json" },
      OWNER,
      now,
    );
    expect(byHost).toMatchObject({
      clientName: "claude.ai",
      actor: "mcp:claude.ai",
    });
    const fallback = await authorizeMcp(
      db,
      { sub: "u1", azp: "opaque-id" },
      OWNER,
      now,
    );
    expect(fallback).toMatchObject({
      clientName: "AI app",
      actor: "mcp:AI app",
    });
  });

  it("updates last-used on each request", async () => {
    await client("c1", "Claude");
    await consent("u1", "c1");
    await authorizeMcp(db, { sub: "u1", azp: "c1" }, OWNER, now);
    const later = new Date(now.getTime() + 60_000);
    await authorizeMcp(db, { sub: "u1", azp: "c1" }, OWNER, later);
    const [row] = await db.select().from(oauthClientsSeen);
    expect(row!.firstSeenAt.toISOString()).toBe(now.toISOString());
    expect(row!.lastUsedAt.toISOString()).toBe(later.toISOString());
  });
});
