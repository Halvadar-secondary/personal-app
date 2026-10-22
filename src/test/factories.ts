import { settings, user } from "@/server/db/schema";
import type { Db } from "@/server/db/types";
import type { ActionDeps } from "@/server/domain/context";

/** Inserts a verified user (and a settings row when a time zone is given); returns its id. */
export async function createOwner(
  db: Db,
  opts: { email?: string; timeZone?: string } = {},
): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(user).values({
    id,
    name: "Owner",
    email: opts.email ?? `${id}@test.local`,
    emailVerified: true,
  });
  if (opts.timeZone) {
    await db.insert(settings).values({ ownerId: id, timeZone: opts.timeZone });
  }
  return id;
}

export const FIXED_NOW = new Date("2026-03-10T12:00:00Z");

/** runAction deps for the owner in the UI, with a fixed clock. */
export function deps(db: Db, ownerId: string, now = FIXED_NOW): ActionDeps {
  return { db, ownerId, actor: "ui", now: () => now };
}
