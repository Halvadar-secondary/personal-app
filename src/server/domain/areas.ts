import { and, asc, eq, inArray, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import { achievements, areas, tasks } from "@/server/db/schema";
import { type Ctx, defineAction } from "./context";
import { sortKeyFor, zPosition } from "./position";
import {
  findLive,
  insertRecorded,
  softDeleteRecorded,
  updateRecorded,
} from "./rows";

const zName = z.string().trim().min(1).max(80);
const zCover = z.object({
  type: z.enum(["gradient", "color", "image"]),
  value: z.string().min(1).max(500),
});
const zAreaFields = {
  emoji: z.string().max(16).nullish(),
  cover: zCover.nullish(),
  description: z.string().max(2000).nullish(),
};

function siblings(ctx: Ctx, exceptId?: string) {
  return ctx.db
    .select({ id: areas.id, sortKey: areas.sortKey })
    .from(areas)
    .where(
      and(
        eq(areas.ownerId, ctx.ownerId),
        isNull(areas.deletedAt),
        exceptId ? ne(areas.id, exceptId) : undefined,
      ),
    )
    .orderBy(asc(areas.sortKey));
}

export const createArea = defineAction(
  z.object({ name: zName, ...zAreaFields }),
  async (ctx, input) =>
    insertRecorded(ctx, "area", areas, {
      ...input,
      sortKey: sortKeyFor(await siblings(ctx), {}),
    }),
);

export const updateArea = defineAction(
  z.object({ areaId: z.uuid(), name: zName.optional(), ...zAreaFields }),
  async (ctx, { areaId, ...patch }) => {
    const before = await findLive(ctx, areas, areaId);
    return updateRecorded(ctx, "area", areas, before, patch);
  },
);

export const reorderArea = defineAction(
  zPosition.extend({ areaId: z.uuid() }),
  async (ctx, { areaId, ...pos }) => {
    const before = await findLive(ctx, areas, areaId);
    const sortKey = sortKeyFor(await siblings(ctx, areaId), pos);
    return updateRecorded(ctx, "area", areas, before, { sortKey });
  },
);

/** Soft-deletes the area, its achievements and their tasks, in one batch. */
export const deleteArea = defineAction(
  z.object({ areaId: z.uuid() }),
  async (ctx, { areaId }) => {
    const area = await findLive(ctx, areas, areaId);
    const achs = await ctx.db
      .select()
      .from(achievements)
      .where(
        and(
          eq(achievements.ownerId, ctx.ownerId),
          eq(achievements.areaId, areaId),
          isNull(achievements.deletedAt),
        ),
      );
    const taskRows = achs.length
      ? await ctx.db
          .select()
          .from(tasks)
          .where(
            and(
              eq(tasks.ownerId, ctx.ownerId),
              inArray(
                tasks.achievementId,
                achs.map((a) => a.id),
              ),
              isNull(tasks.deletedAt),
            ),
          )
      : [];
    for (const t of taskRows) await softDeleteRecorded(ctx, "task", tasks, t);
    for (const a of achs) {
      await softDeleteRecorded(ctx, "achievement", achievements, a);
    }
    await softDeleteRecorded(ctx, "area", areas, area);
    return { deleted: 1 + achs.length + taskRows.length };
  },
);

export const listAreas = defineAction(z.object({}), (ctx) =>
  ctx.db
    .select()
    .from(areas)
    .where(and(eq(areas.ownerId, ctx.ownerId), isNull(areas.deletedAt)))
    .orderBy(asc(areas.sortKey)),
);

export const getArea = defineAction(z.object({ areaId: z.uuid() }), (ctx, i) =>
  findLive(ctx, areas, i.areaId),
);
