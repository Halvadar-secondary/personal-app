import { and, count, eq, inArray, isNull, sum } from "drizzle-orm";
import { localDate } from "@/lib/dates";
import { type LevelProgress, levelOf } from "@/lib/levels";
import { currentStreak } from "@/lib/streaks";
import { achievements, taskCompletions, tasks } from "@/server/db/schema";
import type { Ctx } from "./context";

/** Everything game-like about an area, derived from completions (spec §5.2–5.3). */
export type AreaProgress = {
  xp: number;
  level: LevelProgress;
  streak: number;
  trophies: number;
};

/** Progress for each of `areaIds`, counting live tasks and achievements only. */
export async function areaProgress(
  ctx: Ctx,
  areaIds: string[],
): Promise<Map<string, AreaProgress>> {
  if (areaIds.length === 0) return new Map();
  const liveTasks = and(
    eq(tasks.ownerId, ctx.ownerId),
    inArray(tasks.areaId, areaIds),
    isNull(tasks.deletedAt),
  );
  const xpRows = await ctx.db
    .select({ areaId: tasks.areaId, xp: sum(taskCompletions.xpAwarded) })
    .from(taskCompletions)
    .innerJoin(tasks, eq(tasks.id, taskCompletions.taskId))
    .where(liveTasks)
    .groupBy(tasks.areaId);
  const dayRows = await ctx.db
    .selectDistinct({
      areaId: tasks.areaId,
      day: taskCompletions.occurrenceDate,
    })
    .from(taskCompletions)
    .innerJoin(tasks, eq(tasks.id, taskCompletions.taskId))
    .where(liveTasks);
  const trophyRows = await ctx.db
    .select({ areaId: achievements.areaId, n: count() })
    .from(achievements)
    .where(
      and(
        eq(achievements.ownerId, ctx.ownerId),
        inArray(achievements.areaId, areaIds),
        eq(achievements.status, "done"),
        isNull(achievements.deletedAt),
      ),
    )
    .groupBy(achievements.areaId);

  const today = localDate(ctx.now(), ctx.timeZone);
  const xp = new Map(xpRows.map((r) => [r.areaId!, Number(r.xp ?? 0)]));
  const trophies = new Map(trophyRows.map((r) => [r.areaId!, r.n]));
  const days = new Map<string, string[]>(areaIds.map((id) => [id, []]));
  for (const r of dayRows) days.get(r.areaId!)?.push(r.day);
  return new Map(
    areaIds.map((id) => {
      const total = xp.get(id) ?? 0;
      return [
        id,
        {
          xp: total,
          level: levelOf(total),
          streak: currentStreak(days.get(id)!, today),
          trophies: trophies.get(id) ?? 0,
        },
      ];
    }),
  );
}
