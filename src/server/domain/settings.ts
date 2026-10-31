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

const zModelOverride = z
  .string()
  .regex(/^claude-[a-z0-9-]+$/)
  .nullable()
  .optional();

export type ChatModelOverrides = {
  quick: string | null;
  smart: string | null;
  deep: string | null;
};

export const getChatModelOverrides = defineAction(
  z.object({}),
  async (ctx): Promise<ChatModelOverrides> => {
    const [row] = await ctx.db
      .select()
      .from(settings)
      .where(eq(settings.ownerId, ctx.ownerId));
    return {
      quick: row?.chatModelQuick ?? null,
      smart: row?.chatModelSmart ?? null,
      deep: row?.chatModelDeep ?? null,
    };
  },
);

export const getSettings = defineAction(
  z.object({}),
  async (ctx): Promise<OwnerSettings> => ({
    timeZone: ctx.timeZone,
    weekStart: ctx.weekStart,
  }),
);

/**
 * Time zone, week start and chat model overrides. Not written to history: these aren't goal
 * data, and undoing a time zone change has no use.
 */
export const updateSettings = defineAction(
  z.object({
    timeZone: zTimeZone.optional(),
    weekStart: z.int().min(0).max(6).optional(),
    chatModelQuick: zModelOverride,
    chatModelSmart: zModelOverride,
    chatModelDeep: zModelOverride,
  }),
  async (ctx, patch): Promise<OwnerSettings> => {
    const [row] = await ctx.db
      .insert(settings)
      .values({
        ownerId: ctx.ownerId,
        timeZone: patch.timeZone ?? ctx.timeZone,
        weekStart: patch.weekStart ?? ctx.weekStart,
        chatModelQuick: patch.chatModelQuick,
        chatModelSmart: patch.chatModelSmart,
        chatModelDeep: patch.chatModelDeep,
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
