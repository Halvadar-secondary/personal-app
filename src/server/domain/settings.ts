import { eq } from "drizzle-orm";
import { z } from "zod";
import { settings } from "@/server/db/schema";
import { defineAction } from "./context";

export type OwnerSettings = { timeZone: string; weekStart: number };

const zTimeZone = z.string().refine(
  (timeZone) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone });
      return true;
    } catch {
      return false;
    }
  },
  { message: "Unknown time zone" },
);

export const getSettings = defineAction(
  z.object({}),
  async (ctx): Promise<OwnerSettings> => ({
    timeZone: ctx.timeZone,
    weekStart: ctx.weekStart,
  }),
);

/**
 * Time zone and week start. Not written to history: these aren't goal
 * data, and undoing a time zone change has no use.
 */
export const updateSettings = defineAction(
  z.object({
    timeZone: zTimeZone.optional(),
    weekStart: z.int().min(0).max(6).optional(),
  }),
  async (ctx, patch): Promise<OwnerSettings> => {
    const [row] = await ctx.db
      .insert(settings)
      .values({
        ownerId: ctx.ownerId,
        timeZone: patch.timeZone ?? ctx.timeZone,
        weekStart: patch.weekStart ?? ctx.weekStart,
      })
      .onConflictDoUpdate({
        target: settings.ownerId,
        set: { ...patch, updatedAt: ctx.now() },
        setWhere: eq(settings.ownerId, ctx.ownerId),
      })
      .returning();
    return { timeZone: row!.timeZone, weekStart: row!.weekStart };
  },
);
