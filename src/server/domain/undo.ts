import { and, asc, eq, getTableColumns, isNull } from "drizzle-orm";
import { z } from "zod";
import {
  achievements,
  areas,
  categories,
  changeEvents,
  practiceEntries,
  taskCompletions,
  tasks,
} from "@/server/db/schema";
import { readTaskCategories, writeTaskCategories } from "./categories";
import { type Ctx, defineAction } from "./context";
import { DomainError } from "./errors";
import { type EntityType, recordChange } from "./history";
import type { SoftTable } from "./rows";

type Snapshot = Record<string, unknown> | null;

/** How undo reads an entity's current state and puts a snapshot back. */
type Entity = {
  read(ctx: Ctx, id: string): Promise<Snapshot>;
  apply(ctx: Ctx, id: string, snapshot: Snapshot): Promise<void>;
};

type RowTable = SoftTable | typeof taskCompletions;

/** read/apply over a table; null on a soft table soft-deletes, on a hard one deletes. */
function tableEntity(table: RowTable, soft: boolean): Entity {
  const t = table as SoftTable;
  const columns = getTableColumns(t);
  // jsonb snapshots hold timestamps as ISO strings.
  const hydrate = (snapshot: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(snapshot).map(([k, v]) => [
        k,
        columns[k as keyof typeof columns]?.dataType === "date" &&
        typeof v === "string"
          ? new Date(v)
          : v,
      ]),
    );
  const mine = (ctx: Ctx, id: string) =>
    and(eq(t.id, id), eq(t.ownerId, ctx.ownerId));

  return {
    async read(ctx, id) {
      const [row] = await ctx.db.select().from(t).where(mine(ctx, id));
      return (row as Snapshot | undefined) ?? null;
    },
    async apply(ctx, id, snapshot) {
      if (snapshot === null) {
        if (soft) {
          await ctx.db
            .update(t)
            .set({ deletedAt: ctx.now(), updatedAt: ctx.now() })
            .where(mine(ctx, id));
        } else {
          await ctx.db.delete(t).where(mine(ctx, id));
        }
        return;
      }
      const values = {
        ...hydrate(snapshot),
        ownerId: ctx.ownerId,
        ...(soft ? { updatedAt: ctx.now() } : {}),
      };
      await ctx.db
        .insert(t)
        .values(values as never)
        .onConflictDoUpdate({
          target: t.id,
          set: values as never,
          setWhere: eq(t.ownerId, ctx.ownerId),
        });
    },
  };
}

const registry: Record<EntityType, Entity> = {
  area: tableEntity(areas, true),
  achievement: tableEntity(achievements, true),
  task: tableEntity(tasks, true),
  category: tableEntity(categories, true),
  practice_entry: tableEntity(practiceEntries, true),
  task_completion: tableEntity(taskCompletions, false),
  task_categories: {
    read: readTaskCategories,
    async apply(ctx, taskId, snapshot) {
      const ids = (snapshot?.categoryIds as string[] | undefined) ?? [];
      await writeTaskCategories(ctx, taskId, ids);
    },
  },
};

/** Stable comparison form: JSON with sorted keys, without updatedAt. */
function normalise(v: Snapshot): string {
  if (v === null) return "null";
  const plain = JSON.parse(JSON.stringify(v)) as Record<string, unknown>;
  delete plain.updatedAt;
  const sortKeys = (x: unknown): unknown =>
    Array.isArray(x)
      ? x.map(sortKeys)
      : x && typeof x === "object"
        ? Object.fromEntries(
            Object.keys(x)
              .sort()
              .map((k) => [k, sortKeys((x as Record<string, unknown>)[k])]),
          )
        : x;
  return JSON.stringify(sortKeys(plain));
}

/**
 * Undoes one batch (spec §5.5) as a new batch of restore events. Refuses with
 * conflict when any entity it touched has changed since; that same check is
 * what lets an undo itself be undone.
 */
export const undoBatch = defineAction(
  z.object({ batchId: z.uuid() }),
  async (ctx, { batchId }) => {
    const all = await ctx.db
      .select()
      .from(changeEvents)
      .where(
        and(
          eq(changeEvents.ownerId, ctx.ownerId),
          eq(changeEvents.batchId, batchId),
        ),
      )
      .orderBy(asc(changeEvents.seq));
    if (!all.length) throw new DomainError("not_found");
    const events = all.filter((e) => e.undoneAt === null);
    if (!events.length) throw new DomainError("already_undone");

    type Touched = {
      entityType: EntityType;
      entityId: string;
      first: (typeof events)[number];
      last: (typeof events)[number];
    };
    const touched = new Map<string, Touched>();
    for (const e of events) {
      const key = `${e.entityType}:${e.entityId}`;
      const t = touched.get(key);
      if (t) t.last = e;
      else {
        touched.set(key, {
          entityType: e.entityType as EntityType,
          entityId: e.entityId,
          first: e,
          last: e,
        });
      }
    }

    const changed = [];
    for (const t of touched.values()) {
      const current = await registry[t.entityType].read(ctx, t.entityId);
      if (normalise(current) !== normalise(t.last.after as Snapshot)) {
        changed.push({ entityType: t.entityType, entityId: t.entityId });
      }
    }
    if (changed.length) throw new DomainError("conflict", { changed });

    const order = [...touched.values()].sort((a, b) => b.last.seq - a.last.seq);
    for (const t of order) {
      const entity = registry[t.entityType];
      const before = await entity.read(ctx, t.entityId);
      await entity.apply(ctx, t.entityId, t.first.before as Snapshot);
      await recordChange(ctx, {
        entityType: t.entityType,
        entityId: t.entityId,
        op: "restore",
        before,
        after: await entity.read(ctx, t.entityId),
      });
    }

    await ctx.db
      .update(changeEvents)
      .set({ undoneAt: ctx.now(), undoneByBatch: ctx.batchId })
      .where(
        and(
          eq(changeEvents.ownerId, ctx.ownerId),
          eq(changeEvents.batchId, batchId),
          isNull(changeEvents.undoneAt),
        ),
      );
    return { batchId: ctx.batchId, restored: order.length };
  },
);
