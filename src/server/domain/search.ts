import { and, asc, eq, ilike, isNull, or } from "drizzle-orm";
import { z } from "zod";
import {
  type AchievementStatus,
  achievements,
  areas,
  tasks,
} from "@/server/db/schema";
import { defineAction } from "./context";
import type { NavArea } from "./views";

const LIMIT = 20;

export type SearchResults = {
  areas: NavArea[];
  achievements: {
    id: string;
    title: string;
    status: AchievementStatus;
    area: NavArea | null;
  }[];
  tasks: {
    id: string;
    title: string;
    achievementId: string | null;
    achievementTitle: string | null;
    area: NavArea | null;
  }[];
};

/** Titles and notes across areas, achievements, tasks and the Inbox. */
export const search = defineAction(
  z.object({ q: z.string().trim().min(1).max(100) }),
  async (ctx, { q }): Promise<SearchResults> => {
    // What the owner typed is matched literally: % _ and \ aren't wildcards.
    const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const areaCols = { id: areas.id, name: areas.name, emoji: areas.emoji };

    const areaRows = await ctx.db
      .select(areaCols)
      .from(areas)
      .where(
        and(
          eq(areas.ownerId, ctx.ownerId),
          isNull(areas.deletedAt),
          or(ilike(areas.name, pattern), ilike(areas.description, pattern)),
        ),
      )
      .orderBy(asc(areas.name))
      .limit(LIMIT);

    const achRows = await ctx.db
      .select({
        id: achievements.id,
        title: achievements.title,
        status: achievements.status,
        area: areaCols,
      })
      .from(achievements)
      .leftJoin(areas, eq(areas.id, achievements.areaId))
      .where(
        and(
          eq(achievements.ownerId, ctx.ownerId),
          isNull(achievements.deletedAt),
          or(
            ilike(achievements.title, pattern),
            ilike(achievements.notes, pattern),
          ),
        ),
      )
      .orderBy(asc(achievements.title))
      .limit(LIMIT);

    const taskRows = await ctx.db
      .select({
        id: tasks.id,
        title: tasks.title,
        achievementId: tasks.achievementId,
        achievementTitle: achievements.title,
        area: areaCols,
      })
      .from(tasks)
      .leftJoin(achievements, eq(achievements.id, tasks.achievementId))
      .leftJoin(areas, eq(areas.id, tasks.areaId))
      .where(
        and(
          eq(tasks.ownerId, ctx.ownerId),
          isNull(tasks.deletedAt),
          or(ilike(tasks.title, pattern), ilike(tasks.notes, pattern)),
        ),
      )
      .orderBy(asc(tasks.title))
      .limit(LIMIT);

    return {
      areas: areaRows,
      // Left joins: an Inbox row's area comes back null.
      achievements: achRows,
      tasks: taskRows,
    };
  },
);
