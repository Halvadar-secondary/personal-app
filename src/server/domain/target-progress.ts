import { and, eq, inArray, isNull } from "drizzle-orm";
import { progressOf } from "@/lib/plan";
import { practiceEntries, tasks } from "@/server/db/schema";
import type { Ctx } from "./context";

/** Progress toward each target task's amount, from its practice entries. */
export async function targetProgress(
  ctx: Ctx,
  taskIds: string[],
): Promise<Map<string, number>> {
  if (taskIds.length === 0) return new Map();
  const rows = await ctx.db
    .select({
      taskId: practiceEntries.taskId,
      unit: tasks.targetUnit,
      amount: practiceEntries.amount,
      durationSeconds: practiceEntries.durationSeconds,
    })
    .from(practiceEntries)
    .innerJoin(tasks, eq(tasks.id, practiceEntries.taskId))
    .where(
      and(
        eq(practiceEntries.ownerId, ctx.ownerId),
        inArray(practiceEntries.taskId, taskIds),
        isNull(practiceEntries.deletedAt),
      ),
    );
  const out = new Map<string, number>(taskIds.map((id) => [id, 0]));
  const byTask = new Map<string, typeof rows>();
  for (const r of rows) {
    byTask.set(r.taskId, [...(byTask.get(r.taskId) ?? []), r]);
  }
  for (const [id, entries] of byTask) {
    out.set(id, progressOf(entries[0]!.unit ?? "", entries));
  }
  return out;
}
