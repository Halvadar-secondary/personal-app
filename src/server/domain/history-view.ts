import { and, asc, desc, eq, inArray, lt, max, min, sql } from "drizzle-orm";
import { z } from "zod";
import { timeAgo } from "@/lib/dates";
import { changeEvents, tasks } from "@/server/db/schema";
import { defineAction } from "./context";
import {
  actorLabel,
  type SummaryEvent,
  summarizeBatch,
} from "./history-summary";

export type HistoryBatch = {
  batchId: string;
  actor: string;
  /** "You", "Claude via MCP", … */
  who: string;
  /** "5 min ago", "Yesterday", … in the owner's zone. */
  when: string;
  summary: string;
  undone: boolean;
};

type EventRow = SummaryEvent & { batchId: string };

/** History, newest batch first, one page at a time (spec §5.5). */
export const listHistory = defineAction(
  z.object({
    /** Only batches whose last event came before this seq. */
    before: z.int().positive().optional(),
    limit: z.int().min(1).max(100).default(30),
  }),
  async (ctx, { before, limit }) => {
    const mine = eq(changeEvents.ownerId, ctx.ownerId);
    const lastSeq = max(changeEvents.seq);
    const page = await ctx.db
      .select({
        batchId: changeEvents.batchId,
        seq: lastSeq,
        at: max(changeEvents.createdAt),
        actor: min(changeEvents.actor),
        undone: sql<boolean>`bool_and(${changeEvents.undoneAt} is not null)`,
      })
      .from(changeEvents)
      .where(mine)
      .groupBy(changeEvents.batchId)
      .having(before ? lt(lastSeq, before) : undefined)
      .orderBy(desc(lastSeq))
      .limit(limit + 1);
    const shown = page.slice(0, limit);
    if (shown.length === 0) return { batches: [], nextBefore: null };

    const eventsOf = (
      column: typeof changeEvents.batchId | typeof changeEvents.undoneByBatch,
      ids: string[],
    ) =>
      ctx.db
        .select({
          batchId: changeEvents.batchId,
          undoneByBatch: changeEvents.undoneByBatch,
          entityType: changeEvents.entityType,
          entityId: changeEvents.entityId,
          op: changeEvents.op,
          before: changeEvents.before,
          after: changeEvents.after,
        })
        .from(changeEvents)
        .where(and(mine, inArray(column, ids)))
        .orderBy(asc(changeEvents.seq));
    const ids = shown.map((b) => b.batchId);
    const events = await eventsOf(changeEvents.batchId, ids);
    // The batches the undo batches on this page undid, to say what they undid.
    const undid = await eventsOf(changeEvents.undoneByBatch, ids);

    const all = [...events, ...undid] as (EventRow & {
      undoneByBatch: string | null;
    })[];
    const taskIds = new Set<string>();
    for (const e of all) {
      const id = (e.after ?? e.before)?.taskId;
      if (typeof id === "string") taskIds.add(id);
      if (e.entityType === "task_categories") taskIds.add(e.entityId!);
    }
    // Deleted tasks keep their rows (soft delete), so they keep their names.
    const titleRows = taskIds.size
      ? await ctx.db
          .select({ id: tasks.id, title: tasks.title })
          .from(tasks)
          .where(
            and(
              eq(tasks.ownerId, ctx.ownerId),
              inArray(tasks.id, [...taskIds]),
            ),
          )
      : [];
    const titles = new Map(titleRows.map((t) => [t.id, t.title]));

    const byBatch = Map.groupBy(events, (e) => e.batchId);
    const undidBy = Map.groupBy(undid, (e) => e.undoneByBatch!);
    const now = ctx.now();
    const batches: HistoryBatch[] = shown.map((b) => {
      let summary = summarizeBatch(
        byBatch.get(b.batchId) as EventRow[],
        titles,
      );
      const original = undidBy.get(b.batchId);
      if (summary === "Undid a change" && original) {
        summary = `Undid: ${summarizeBatch(original as EventRow[], titles)}`;
      }
      return {
        batchId: b.batchId,
        actor: b.actor!,
        who: actorLabel(b.actor!),
        when: timeAgo(new Date(b.at!), now, ctx.timeZone),
        summary,
        undone: b.undone,
      };
    });
    return {
      batches,
      nextBefore: page.length > limit ? Number(shown.at(-1)!.seq) : null,
    };
  },
);
