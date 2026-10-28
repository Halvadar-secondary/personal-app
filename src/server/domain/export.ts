import { eq } from "drizzle-orm";
import { z } from "zod";
import {
  achievements,
  areas,
  categories,
  goals,
  practiceEntries,
  taskCategories,
  taskCompletions,
  tasks,
  trackerMoments,
  trackers,
} from "@/server/db/schema";
import { defineAction } from "./context";

/**
 * Everything the owner has, as plain rows. Soft-deleted rows are included
 * (with deletedAt): they're still the owner's until purged. The change
 * history isn't: it's derived from these rows and large.
 */
export const exportData = defineAction(z.object({}), async (ctx) => {
  return {
    version: 1 as const,
    exportedAt: ctx.now().toISOString(),
    settings: { timeZone: ctx.timeZone, weekStart: ctx.weekStart },
    areas: await ctx.db
      .select()
      .from(areas)
      .where(eq(areas.ownerId, ctx.ownerId)),
    achievements: await ctx.db
      .select()
      .from(achievements)
      .where(eq(achievements.ownerId, ctx.ownerId)),
    tasks: await ctx.db
      .select()
      .from(tasks)
      .where(eq(tasks.ownerId, ctx.ownerId)),
    categories: await ctx.db
      .select()
      .from(categories)
      .where(eq(categories.ownerId, ctx.ownerId)),
    taskCategories: await ctx.db
      .select()
      .from(taskCategories)
      .where(eq(taskCategories.ownerId, ctx.ownerId)),
    taskCompletions: await ctx.db
      .select()
      .from(taskCompletions)
      .where(eq(taskCompletions.ownerId, ctx.ownerId)),
    goals: await ctx.db
      .select()
      .from(goals)
      .where(eq(goals.ownerId, ctx.ownerId)),
    trackers: await ctx.db
      .select()
      .from(trackers)
      .where(eq(trackers.ownerId, ctx.ownerId)),
    trackerMoments: await ctx.db
      .select()
      .from(trackerMoments)
      .where(eq(trackerMoments.ownerId, ctx.ownerId)),
    practiceEntries: await ctx.db
      .select()
      .from(practiceEntries)
      .where(eq(practiceEntries.ownerId, ctx.ownerId)),
  };
});
