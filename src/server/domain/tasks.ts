import { and, asc, eq, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import { localDate } from "@/lib/dates";
import { keysAfter } from "@/lib/ordering";
import { type Effort, xpForEffort } from "@/lib/xp";
import { achievements, taskCompletions, tasks } from "@/server/db/schema";
import { zDate } from "./achievements";
import { type Ctx, defineAction } from "./context";
import { DomainError, found } from "./errors";
import { recordChange } from "./history";
import { sortKeyFor, zPosition } from "./position";
import {
  findLive,
  insertRecorded,
  softDeleteRecorded,
  updateRecorded,
} from "./rows";

export const zEffort = z.int().min(1).max(5);

const zTitle = z.string().trim().min(1).max(300);
const zNotes = z.string().max(10_000).nullish();

export const zTaskFields = z.object({
  title: zTitle,
  notes: zNotes,
  effort: zEffort.default(2),
  deadline: zDate.nullish(),
});

/** The task's parents: an achievement and its area, or neither (Inbox). */
async function parentsOf(ctx: Ctx, achievementId: string | null) {
  if (!achievementId) return { achievementId: null, areaId: null };
  const ach = await findLive(ctx, achievements, achievementId);
  return { achievementId, areaId: ach.areaId };
}

function siblings(ctx: Ctx, achievementId: string | null, exceptId?: string) {
  return ctx.db
    .select({ id: tasks.id, sortKey: tasks.sortKey })
    .from(tasks)
    .where(
      and(
        eq(tasks.ownerId, ctx.ownerId),
        achievementId
          ? eq(tasks.achievementId, achievementId)
          : isNull(tasks.achievementId),
        isNull(tasks.deletedAt),
        exceptId ? ne(tasks.id, exceptId) : undefined,
      ),
    )
    .orderBy(asc(tasks.sortKey), asc(tasks.id));
}

export const createTask = defineAction(
  zTaskFields.extend({ achievementId: z.uuid().nullable() }),
  async (ctx, { achievementId, ...fields }) => {
    const parents = await parentsOf(ctx, achievementId);
    const sortKey = sortKeyFor(await siblings(ctx, achievementId), {});
    return insertRecorded(ctx, "task", tasks, {
      ...fields,
      ...parents,
      sortKey,
    });
  },
);

/** Many tasks at once ("15 tasks for this"), appended in order, one undo step. */
export const createTasks = defineAction(
  z.object({
    achievementId: z.uuid().nullable(),
    tasks: z.array(zTaskFields).min(1).max(50),
  }),
  async (ctx, input) => {
    const parents = await parentsOf(ctx, input.achievementId);
    const existing = await siblings(ctx, input.achievementId);
    const keys = keysAfter(
      existing.at(-1)?.sortKey ?? null,
      input.tasks.length,
    );
    const made = [];
    for (const [i, fields] of input.tasks.entries()) {
      made.push(
        await insertRecorded(ctx, "task", tasks, {
          ...fields,
          ...parents,
          sortKey: keys[i]!,
        }),
      );
    }
    return made;
  },
);

export const updateTask = defineAction(
  z.object({
    taskId: z.uuid(),
    title: zTitle.optional(),
    notes: zNotes,
    // No default here: an update must not reset effort.
    effort: zEffort.optional(),
    deadline: zDate.nullish(),
  }),
  async (ctx, { taskId, ...patch }) => {
    const before = await findLive(ctx, tasks, taskId);
    return updateRecorded(ctx, "task", tasks, before, patch);
  },
);

/** Reorders within its achievement, or moves to another one (null = Inbox). */
export const moveTask = defineAction(
  zPosition.extend({
    taskId: z.uuid(),
    achievementId: z.uuid().nullable().optional(),
  }),
  async (ctx, { taskId, achievementId, ...pos }) => {
    const before = await findLive(ctx, tasks, taskId);
    const target =
      achievementId === undefined ? before.achievementId : achievementId;
    const parents = await parentsOf(ctx, target);
    const sortKey = sortKeyFor(await siblings(ctx, target, taskId), pos);
    return updateRecorded(ctx, "task", tasks, before, { ...parents, sortKey });
  },
);

/** Completes a one-off task; XP is frozen on the completion row. */
export const completeTask = defineAction(
  z.object({ taskId: z.uuid() }),
  async (ctx, { taskId }) => {
    const before = await findLive(ctx, tasks, taskId);
    if (before.completedAt) throw new DomainError("invalid_state");
    const now = ctx.now();
    const task = await updateRecorded(ctx, "task", tasks, before, {
      completedAt: now,
    });
    const [completion] = await ctx.db
      .insert(taskCompletions)
      .values({
        ownerId: ctx.ownerId,
        taskId,
        completedAt: now,
        occurrenceDate: localDate(now, ctx.timeZone),
        // Unfiled work earns nothing: XP belongs to an area.
        xpAwarded: task.areaId ? xpForEffort(task.effort as Effort) : 0,
      })
      .returning();
    await recordChange(ctx, {
      entityType: "task_completion",
      entityId: completion!.id,
      op: "create",
      before: null,
      after: completion!,
    });
    return { task, completion: completion! };
  },
);

export const uncompleteTask = defineAction(
  z.object({ taskId: z.uuid() }),
  async (ctx, { taskId }) => {
    const before = await findLive(ctx, tasks, taskId);
    if (!before.completedAt) throw new DomainError("invalid_state");
    const task = await updateRecorded(ctx, "task", tasks, before, {
      completedAt: null,
    });
    const completion = found(
      (
        await ctx.db
          .delete(taskCompletions)
          .where(
            and(
              eq(taskCompletions.ownerId, ctx.ownerId),
              eq(taskCompletions.taskId, taskId),
            ),
          )
          .returning()
      )[0],
    );
    await recordChange(ctx, {
      entityType: "task_completion",
      entityId: completion.id,
      op: "delete",
      before: completion,
      after: null,
    });
    return task;
  },
);

export const deleteTask = defineAction(
  z.object({ taskId: z.uuid() }),
  async (ctx, { taskId }) => {
    const before = await findLive(ctx, tasks, taskId);
    await softDeleteRecorded(ctx, "task", tasks, before);
    return { deleted: 1 as const };
  },
);
