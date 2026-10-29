import { and, eq, inArray, lt, notExists, or, sql } from "drizzle-orm";
import {
  achievements,
  areas,
  categories,
  changeEvents,
  goals,
  practiceEntries,
  taskCategories,
  taskCompletions,
  tasks,
  trackerMoments,
  trackers,
} from "@/server/db/schema";
import type { Db } from "@/server/db/types";

export type PurgeCounts = {
  tasks: number;
  achievements: number;
  areas: number;
  categories: number;
  goals: number;
  trackers: number;
  trackerMoments: number;
  practiceEntries: number;
  completions: number;
  events: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The weekly clean-up (spec §5.5): hard-deletes rows soft-deleted more than
 * `retentionDays` ago, and the history that names them, across all owners.
 * A deleted parent a remaining row still points at waits for a later run.
 * Not an action: it writes no history of its own.
 */
export async function purgeDeleted(
  db: Db,
  now: Date,
  retentionDays = 90,
): Promise<PurgeCounts> {
  const cutoff = new Date(now.getTime() - retentionDays * DAY_MS);
  return db.transaction(async (tx) => {
    const idsOf = (rows: { id: string }[]) => rows.map((r) => r.id);

    // 1. Tasks, with the rows that hang off them.
    const taskIds = idsOf(
      await tx
        .select({ id: tasks.id })
        .from(tasks)
        .where(lt(tasks.deletedAt, cutoff)),
    );
    let completionIds: string[] = [];
    let taskPracticeIds: string[] = [];
    if (taskIds.length) {
      await tx
        .delete(taskCategories)
        .where(inArray(taskCategories.taskId, taskIds));
      completionIds = idsOf(
        await tx
          .delete(taskCompletions)
          .where(inArray(taskCompletions.taskId, taskIds))
          .returning({ id: taskCompletions.id }),
      );
      taskPracticeIds = idsOf(
        await tx
          .delete(practiceEntries)
          .where(inArray(practiceEntries.taskId, taskIds))
          .returning({ id: practiceEntries.id }),
      );
      await tx.delete(tasks).where(inArray(tasks.id, taskIds));
    }

    // 2. Practice entries deleted on their own, from live tasks.
    const practiceIds = idsOf(
      await tx
        .delete(practiceEntries)
        .where(lt(practiceEntries.deletedAt, cutoff))
        .returning({ id: practiceEntries.id }),
    );

    // 3. Categories, and the links tasks kept to them.
    const categoryIds = idsOf(
      await tx
        .select({ id: categories.id })
        .from(categories)
        .where(lt(categories.deletedAt, cutoff)),
    );
    if (categoryIds.length) {
      await tx
        .delete(taskCategories)
        .where(inArray(taskCategories.categoryId, categoryIds));
      await tx.delete(categories).where(inArray(categories.id, categoryIds));
    }

    // 4–5. Parents, only once nothing points at them.
    const achievementIds = idsOf(
      await tx
        .delete(achievements)
        .where(
          and(
            lt(achievements.deletedAt, cutoff),
            notExists(
              tx
                .select({ id: tasks.id })
                .from(tasks)
                .where(eq(tasks.achievementId, achievements.id)),
            ),
          ),
        )
        .returning({ id: achievements.id }),
    );
    const areaIds = idsOf(
      await tx
        .delete(areas)
        .where(
          and(
            lt(areas.deletedAt, cutoff),
            notExists(
              tx
                .select({ id: achievements.id })
                .from(achievements)
                .where(eq(achievements.areaId, areas.id)),
            ),
            notExists(
              tx
                .select({ id: tasks.id })
                .from(tasks)
                .where(eq(tasks.areaId, areas.id)),
            ),
          ),
        )
        .returning({ id: areas.id }),
    );

    const goalIds = idsOf(
      await tx
        .delete(goals)
        .where(
          and(
            lt(goals.deletedAt, cutoff),
            notExists(
              tx
                .select({ id: achievements.id })
                .from(achievements)
                .where(eq(achievements.goalId, goals.id)),
            ),
          ),
        )
        .returning({ id: goals.id }),
    );

    // Trackers: their moments first (with them, or deleted on their own).
    const trackerIds = idsOf(
      await tx
        .select({ id: trackers.id })
        .from(trackers)
        .where(lt(trackers.deletedAt, cutoff)),
    );
    const momentIds = idsOf(
      await tx
        .delete(trackerMoments)
        .where(
          or(
            lt(trackerMoments.deletedAt, cutoff),
            trackerIds.length
              ? inArray(trackerMoments.trackerId, trackerIds)
              : sql`false`,
          ),
        )
        .returning({ id: trackerMoments.id }),
    );
    if (trackerIds.length) {
      await tx.delete(trackers).where(inArray(trackers.id, trackerIds));
    }

    // 6. History naming a purged row; undo could never put it back.
    const purged = [
      ...taskIds,
      ...completionIds,
      ...taskPracticeIds,
      ...practiceIds,
      ...categoryIds,
      ...achievementIds,
      ...areaIds,
      ...goalIds,
      ...trackerIds,
      ...momentIds,
    ];
    const conditions = [];
    if (purged.length) conditions.push(inArray(changeEvents.entityId, purged));
    if (categoryIds.length) {
      const list = sql`array[${sql.join(
        categoryIds.map((id) => sql`${id}`),
        sql`, `,
      )}]::text[]`;
      conditions.push(
        and(
          eq(changeEvents.entityType, "task_categories"),
          or(
            sql`jsonb_exists_any(${changeEvents.before}->'categoryIds', ${list})`,
            sql`jsonb_exists_any(${changeEvents.after}->'categoryIds', ${list})`,
          ),
        ),
      );
    }
    const events = conditions.length
      ? (
          await tx
            .delete(changeEvents)
            .where(or(...conditions))
            .returning({ id: changeEvents.id })
        ).length
      : 0;

    return {
      tasks: taskIds.length,
      achievements: achievementIds.length,
      areas: areaIds.length,
      categories: categoryIds.length,
      goals: goalIds.length,
      trackers: trackerIds.length,
      trackerMoments: momentIds.length,
      practiceEntries: taskPracticeIds.length + practiceIds.length,
      completions: completionIds.length,
      events,
    };
  });
}
