import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { achievements, tasks } from "@/server/db/schema";
import { createAchievement, moveAchievement } from "./achievements";
import { callAction, defineAction } from "./context";
import { DomainError } from "./errors";
import { findLive } from "./rows";
import { createTask, moveTask } from "./tasks";

/**
 * Quick capture (spec §5.6). A leading "!" makes an achievement; in an area
 * it is always an achievement, since a task can't sit directly in an area.
 */
export const captureItem = defineAction(
  z.object({
    text: z.string().max(300),
    context: z
      .object({
        areaId: z.uuid().optional(),
        achievementId: z.uuid().optional(),
      })
      .refine((c) => !(c.areaId && c.achievementId), "pick one context")
      .optional(),
  }),
  async (ctx, { text, context }) => {
    const trimmed = text.trim();
    const bang = trimmed.startsWith("!");
    const title = (bang ? trimmed.slice(1) : trimmed).trim();
    if (!title) throw new DomainError("invalid_input", { text });

    const achievement = async (areaId: string | null) => ({
      kind: "achievement" as const,
      id: (await callAction(ctx, createAchievement, { areaId, title })).id,
    });
    const task = async (achievementId: string | null) => ({
      kind: "task" as const,
      id: (await callAction(ctx, createTask, { achievementId, title })).id,
    });

    if (context?.areaId) return achievement(context.areaId);
    if (context?.achievementId) {
      if (!bang) return task(context.achievementId);
      const parent = await findLive(ctx, achievements, context.achievementId);
      return achievement(parent.areaId);
    }
    return bang ? achievement(null) : task(null);
  },
);

/** Files an achievement into an area's backlog (its tasks follow). */
export const fileAchievement = defineAction(
  z.object({ achievementId: z.uuid(), areaId: z.uuid() }),
  (ctx, { achievementId, areaId }) =>
    callAction(ctx, moveAchievement, {
      achievementId,
      areaId,
      status: "backlog",
    }),
);

export const fileTask = defineAction(
  z.object({ taskId: z.uuid(), achievementId: z.uuid() }),
  (ctx, input) => callAction(ctx, moveTask, input),
);

/** Unfiled achievements and tasks, newest first. */
export const listInbox = defineAction(z.object({}), async (ctx) => ({
  achievements: await ctx.db
    .select()
    .from(achievements)
    .where(
      and(
        eq(achievements.ownerId, ctx.ownerId),
        isNull(achievements.areaId),
        isNull(achievements.deletedAt),
      ),
    )
    .orderBy(desc(achievements.createdAt), desc(achievements.sortKey)),
  tasks: await ctx.db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.ownerId, ctx.ownerId),
        isNull(tasks.achievementId),
        isNull(tasks.deletedAt),
      ),
    )
    .orderBy(desc(tasks.createdAt), desc(tasks.sortKey)),
}));
