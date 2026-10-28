import { and, asc, eq, gte, isNull, ne, sql } from "drizzle-orm";
import { keyBetween } from "@/lib/ordering";
import {
  achievements,
  areas,
  categories,
  goals,
  tasks,
  trackerMoments,
  trackers,
} from "@/server/db/schema";
import type { Ctx } from "./context";
import { DomainError } from "./errors";
import type { EntityType } from "./history";
import { updateRecorded } from "./rows";

// Undo writes snapshots back row by row. The conflict check only covers rows
// the batch touched, so these keep the invariants that span rows.

type Ref = { entityType: EntityType; entityId: string };
/** A row in the way, named so the message can say which. */
type Named = Ref & { label: string };

const byId = <
  T extends
    | typeof areas
    | typeof achievements
    | typeof tasks
    | typeof goals
    | typeof trackers
    | typeof trackerMoments,
>(
  ctx: Ctx,
  table: T,
  id: string,
) =>
  ctx.db
    .select()
    .from(table as typeof areas)
    .where(and(eq(table.id, id), eq(table.ownerId, ctx.ownerId)))
    .then((r) => r[0] as T["$inferSelect"] | undefined);

/**
 * Refuses (conflict, naming the other rows) when a touched row is now deleted
 * with live children, or live under a deleted parent.
 */
export async function assertParentsAndChildren(
  ctx: Ctx,
  touched: Ref[],
): Promise<void> {
  const changed = new Map<string, Named>();
  const add = (entityType: EntityType, entityId: string, label: string) =>
    changed.set(`${entityType}:${entityId}`, { entityType, entityId, label });

  for (const { entityType, entityId } of touched) {
    if (entityType === "area") {
      const area = await byId(ctx, areas, entityId);
      if (!area?.deletedAt) continue;
      const kids = await ctx.db
        .select({ id: achievements.id, title: achievements.title })
        .from(achievements)
        .where(
          and(
            eq(achievements.ownerId, ctx.ownerId),
            eq(achievements.areaId, entityId),
            isNull(achievements.deletedAt),
          ),
        );
      for (const k of kids) add("achievement", k.id, k.title);
    } else if (entityType === "achievement") {
      const ach = await byId(ctx, achievements, entityId);
      if (!ach) continue;
      if (ach.deletedAt) {
        const kids = await ctx.db
          .select({ id: tasks.id, title: tasks.title })
          .from(tasks)
          .where(
            and(
              eq(tasks.ownerId, ctx.ownerId),
              eq(tasks.achievementId, entityId),
              isNull(tasks.deletedAt),
            ),
          );
        for (const k of kids) add("task", k.id, k.title);
      } else {
        if (ach.areaId) {
          const area = await byId(ctx, areas, ach.areaId);
          if (area?.deletedAt) add("area", area.id, area.name);
        }
        if (ach.goalId) {
          const goal = await byId(ctx, goals, ach.goalId);
          if (goal?.deletedAt) add("goal", goal.id, goal.title);
        }
      }
    } else if (entityType === "goal") {
      const goal = await byId(ctx, goals, entityId);
      if (!goal?.deletedAt) continue;
      const linked = await ctx.db
        .select({ id: achievements.id, title: achievements.title })
        .from(achievements)
        .where(
          and(
            eq(achievements.ownerId, ctx.ownerId),
            eq(achievements.goalId, entityId),
            isNull(achievements.deletedAt),
          ),
        );
      for (const k of linked) add("achievement", k.id, k.title);
    } else if (entityType === "tracker") {
      const tracker = await byId(ctx, trackers, entityId);
      if (!tracker?.deletedAt) continue;
      const kids = await ctx.db
        .select({ id: trackerMoments.id })
        .from(trackerMoments)
        .where(
          and(
            eq(trackerMoments.ownerId, ctx.ownerId),
            eq(trackerMoments.trackerId, entityId),
            isNull(trackerMoments.deletedAt),
          ),
        );
      for (const k of kids) add("tracker_moment", k.id, "a moment");
    } else if (entityType === "tracker_moment") {
      const moment = await byId(ctx, trackerMoments, entityId);
      if (!moment || moment.deletedAt) continue;
      const tracker = await byId(ctx, trackers, moment.trackerId);
      if (tracker?.deletedAt) add("tracker", tracker.id, tracker.name);
    } else if (entityType === "task") {
      const task = await byId(ctx, tasks, entityId);
      if (!task || task.deletedAt || !task.achievementId) continue;
      const ach = await byId(ctx, achievements, task.achievementId);
      if (ach?.deletedAt) add("achievement", ach.id, ach.title);
    }
  }
  if (changed.size) {
    throw new DomainError("conflict", { changed: [...changed.values()] });
  }
}

/** Sets every live task's areaId to its achievement's, for the touched rows. */
export async function resyncTaskAreas(ctx: Ctx, touched: Ref[]): Promise<void> {
  const achievementIds = new Set<string>();
  for (const { entityType, entityId } of touched) {
    if (entityType === "achievement") achievementIds.add(entityId);
    if (entityType === "task") {
      const task = await byId(ctx, tasks, entityId);
      if (task && !task.deletedAt && task.achievementId) {
        achievementIds.add(task.achievementId);
      }
    }
  }
  for (const id of achievementIds) {
    const ach = await byId(ctx, achievements, id);
    if (!ach || ach.deletedAt) continue;
    const drifted = await ctx.db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.ownerId, ctx.ownerId),
          eq(tasks.achievementId, id),
          isNull(tasks.deletedAt),
          ach.areaId
            ? sql`${tasks.areaId} is distinct from ${ach.areaId}`
            : sql`${tasks.areaId} is not null`,
        ),
      );
    for (const t of drifted) {
      await updateRecorded(ctx, "task", tasks, t, { areaId: ach.areaId });
    }
  }
}

type Sortable =
  | typeof areas
  | typeof achievements
  | typeof tasks
  | typeof goals
  | typeof trackers;

/** The live siblings a row is ordered among. */
function siblingScope(table: Sortable, row: Record<string, unknown>) {
  if (table === achievements) {
    return and(
      row.areaId
        ? eq(achievements.areaId, row.areaId as string)
        : isNull(achievements.areaId),
      eq(achievements.status, row.status as "backlog"),
    );
  }
  if (table === tasks) {
    return row.achievementId
      ? eq(tasks.achievementId, row.achievementId as string)
      : isNull(tasks.achievementId);
  }
  return undefined;
}

/** Gives a restored live row a fresh sort key when a sibling took its old one. */
export async function rekeyIfTaken(
  ctx: Ctx,
  table: Sortable,
  id: string,
): Promise<void> {
  const row = await byId(ctx, table, id);
  if (!row || row.deletedAt) return;
  const t = table as typeof areas;
  const later = await ctx.db
    .select({ sortKey: t.sortKey })
    .from(t)
    .where(
      and(
        eq(t.ownerId, ctx.ownerId),
        isNull(t.deletedAt),
        ne(t.id, id),
        gte(t.sortKey, row.sortKey),
        siblingScope(table, row),
      ),
    )
    .orderBy(asc(t.sortKey));
  if (later[0]?.sortKey !== row.sortKey) return;
  const next = later.find((s) => s.sortKey > row.sortKey);
  await ctx.db
    .update(t)
    .set({ sortKey: keyBetween(row.sortKey, next?.sortKey ?? null) })
    .where(and(eq(t.id, id), eq(t.ownerId, ctx.ownerId)));
}

/** A category can't come back under a name a live category now holds. */
export async function assertCategoryNameFree(
  ctx: Ctx,
  id: string,
  snapshot: Record<string, unknown> | null,
): Promise<void> {
  if (!snapshot || snapshot.deletedAt) return;
  const [clash] = await ctx.db
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .where(
      and(
        eq(categories.ownerId, ctx.ownerId),
        sql`lower(${categories.name}) = lower(${snapshot.name as string})`,
        isNull(categories.deletedAt),
        ne(categories.id, id),
      ),
    );
  if (clash) {
    throw new DomainError("conflict", {
      changed: [
        { entityType: "category", entityId: clash.id, label: clash.name },
      ],
    });
  }
}
