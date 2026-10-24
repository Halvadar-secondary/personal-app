import { and, desc, eq } from "drizzle-orm";
import { timeAgo } from "@/lib/dates";
import {
  oauthAccessToken,
  oauthClientsSeen,
  oauthConsent,
  oauthRefreshToken,
} from "@/server/db/schema";
import type { Db } from "@/server/db/types";

export type ConnectedApp = { clientId: string; name: string; lastUsed: string };

/** Apps that have called /api/mcp and are still approved, most recent first. */
export async function listConnectedApps(
  db: Db,
  ownerId: string,
  now: Date,
  timeZone: string,
): Promise<ConnectedApp[]> {
  const rows = await db
    .selectDistinct({
      clientId: oauthClientsSeen.clientId,
      name: oauthClientsSeen.clientName,
      lastUsedAt: oauthClientsSeen.lastUsedAt,
    })
    .from(oauthClientsSeen)
    .innerJoin(
      oauthConsent,
      and(
        eq(oauthConsent.clientId, oauthClientsSeen.clientId),
        eq(oauthConsent.userId, oauthClientsSeen.ownerId),
      ),
    )
    .where(eq(oauthClientsSeen.ownerId, ownerId))
    .orderBy(desc(oauthClientsSeen.lastUsedAt));
  return rows.map((r) => ({
    clientId: r.clientId,
    name: r.name,
    lastUsed: timeAgo(r.lastUsedAt, now, timeZone),
  }));
}

/**
 * Cuts an app off: without consent the access gate refuses its still-valid
 * JWT on the next call, and without refresh tokens it can't get another.
 */
export async function revokeApp(
  db: Db,
  ownerId: string,
  clientId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .delete(oauthConsent)
      .where(
        and(
          eq(oauthConsent.userId, ownerId),
          eq(oauthConsent.clientId, clientId),
        ),
      );
    await tx
      .delete(oauthRefreshToken)
      .where(
        and(
          eq(oauthRefreshToken.userId, ownerId),
          eq(oauthRefreshToken.clientId, clientId),
        ),
      );
    await tx
      .delete(oauthAccessToken)
      .where(
        and(
          eq(oauthAccessToken.userId, ownerId),
          eq(oauthAccessToken.clientId, clientId),
        ),
      );
    await tx
      .delete(oauthClientsSeen)
      .where(
        and(
          eq(oauthClientsSeen.ownerId, ownerId),
          eq(oauthClientsSeen.clientId, clientId),
        ),
      );
  });
}
