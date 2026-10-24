import { sql } from "drizzle-orm";
import { rateLimits } from "@/server/db/schema";
import type { Db } from "@/server/db/types";

/**
 * Counts one request against `key` in a fixed window, in a single upsert so
 * concurrent requests can't both slip under the limit.
 */
export async function hitRateLimit(
  db: Db,
  key: string,
  limit: number,
  windowMs: number,
  now: Date,
): Promise<{ ok: true } | { ok: false; retryAfterSeconds: number }> {
  const at = now.toISOString();
  const expired = sql`${rateLimits.windowStart} <= ${at}::timestamptz - make_interval(secs => ${windowMs / 1000})`;
  const [row] = await db
    .insert(rateLimits)
    .values({ key, windowStart: now, count: 1 })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        windowStart: sql`case when ${expired} then ${at}::timestamptz else ${rateLimits.windowStart} end`,
        count: sql`case when ${expired} then 1 else ${rateLimits.count} + 1 end`,
      },
    })
    .returning({
      windowStart: rateLimits.windowStart,
      count: rateLimits.count,
    });
  if (row!.count <= limit) return { ok: true };
  const left = row!.windowStart.getTime() + windowMs - now.getTime();
  return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil(left / 1000)) };
}
