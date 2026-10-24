import { and, eq } from "drizzle-orm";
import { isOwnerEmail } from "@/server/auth/owner";
import {
  oauthClient,
  oauthClientsSeen,
  oauthConsent,
  user,
} from "@/server/db/schema";
import type { Db } from "@/server/db/types";

export type McpCaller = {
  ownerId: string;
  clientId: string;
  clientName: string;
  actor: `mcp:${string}`;
};

export type McpRefusal = { status: 401 | 403; error: string };

/** Registered name, else the client id's host (CIMD ids are URLs), else "AI app". */
function nameFor(
  clientId: string,
  registered: string | null | undefined,
): string {
  if (registered?.trim()) return registered.trim();
  try {
    return new URL(clientId).host || "AI app";
  } catch {
    return "AI app";
  }
}

/**
 * The gate after the JWT check: owner only, live consent (revoking is
 * immediate though JWTs can't be revoked), then record last use (spec §7.3).
 */
export async function authorizeMcp(
  db: Db,
  claims: { sub?: unknown; azp?: unknown; client_id?: unknown },
  ownerEmail: string | undefined,
  now: Date,
): Promise<McpCaller | McpRefusal> {
  const sub = typeof claims.sub === "string" ? claims.sub : "";
  const rawClient = claims.client_id ?? claims.azp;
  const clientId = typeof rawClient === "string" ? rawClient : "";

  const [owner] = sub
    ? await db.select({ email: user.email }).from(user).where(eq(user.id, sub))
    : [];
  if (!owner || !isOwnerEmail(owner.email, ownerEmail))
    return { status: 403, error: "not_owner" };

  const [consent] = clientId
    ? await db
        .select({ name: oauthClient.name })
        .from(oauthConsent)
        .leftJoin(oauthClient, eq(oauthClient.clientId, oauthConsent.clientId))
        .where(
          and(
            eq(oauthConsent.userId, sub),
            eq(oauthConsent.clientId, clientId),
          ),
        )
        .limit(1)
    : [];
  if (!consent) return { status: 401, error: "revoked" };

  const clientName = nameFor(clientId, consent.name);
  await db
    .insert(oauthClientsSeen)
    .values({
      ownerId: sub,
      clientId,
      clientName,
      firstSeenAt: now,
      lastUsedAt: now,
    })
    .onConflictDoUpdate({
      target: [oauthClientsSeen.ownerId, oauthClientsSeen.clientId],
      set: { clientName, lastUsedAt: now },
    });
  return { ownerId: sub, clientId, clientName, actor: `mcp:${clientName}` };
}
