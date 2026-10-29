import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { practiceEntries, tasks } from "@/server/db/schema";
import { defineAction } from "./context";
import { findLive, insertRecorded } from "./rows";

/** Logs a practice session against a task: the hook future tools write through. */
export const addPracticeEntry = defineAction(
  z.object({
    taskId: z.uuid(),
    startedAt: z.iso.datetime({ offset: true }).optional(),
    durationSeconds: z.int().min(0).optional(),
    // Progress toward the task's target, in its unit.
    amount: z.number().positive().max(100_000).optional(),
    metrics: z
      .record(z.string().max(40), z.union([z.number(), z.string().max(200)]))
      .optional(),
    note: z.string().max(2000).optional(),
  }),
  async (ctx, { taskId, startedAt, ...rest }) => {
    await findLive(ctx, tasks, taskId);
    return insertRecorded(ctx, "practice_entry", practiceEntries, {
      ...rest,
      taskId,
      startedAt: startedAt ? new Date(startedAt) : ctx.now(),
      source: ctx.actor === "ui" ? "manual" : ctx.actor,
    });
  },
);

export const listPracticeEntries = defineAction(
  z.object({ taskId: z.uuid() }),
  async (ctx, { taskId }) => {
    await findLive(ctx, tasks, taskId);
    return ctx.db
      .select()
      .from(practiceEntries)
      .where(
        and(
          eq(practiceEntries.ownerId, ctx.ownerId),
          eq(practiceEntries.taskId, taskId),
          isNull(practiceEntries.deletedAt),
        ),
      )
      .orderBy(desc(practiceEntries.startedAt));
  },
);
