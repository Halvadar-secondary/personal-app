import { z } from "zod";
import { tasks } from "@/server/db/schema";
import { callAction, defineAction } from "./context";
import { DomainError } from "./errors";
import { addPracticeEntry } from "./practice";
import { findLive } from "./rows";
import { targetProgress } from "./target-progress";
import { completeTask } from "./tasks";

/**
 * Logs progress toward a task's target (minutes for an hours target), and
 * completes the task once it is reached: one batch, so one undo.
 */
export const logProgress = defineAction(
  z.object({
    taskId: z.uuid(),
    amount: z.number().positive().max(100_000),
    note: z.string().max(2000).optional(),
  }),
  async (ctx, { taskId, amount, note }) => {
    const task = await findLive(ctx, tasks, taskId);
    if (task.targetAmount === null || task.completedAt) {
      throw new DomainError("invalid_state");
    }
    await callAction(ctx, addPracticeEntry, {
      taskId,
      note,
      ...(task.targetUnit === "hours"
        ? { durationSeconds: Math.round(amount * 60) }
        : { amount }),
    });
    const progress = (await targetProgress(ctx, [taskId])).get(taskId)!;
    const completed = progress >= task.targetAmount;
    if (completed) await callAction(ctx, completeTask, { taskId });
    return { progress, completed };
  },
);
