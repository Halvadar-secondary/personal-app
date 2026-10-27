import { z } from "zod";
import { deleteAchievement } from "./achievements";
import { deleteArea } from "./areas";
import { deleteCategory } from "./categories";
import { type Ctx, callAction, defineAction } from "./context";
import { deleteGoal } from "./goals";
import { fileAchievement, fileTask } from "./inbox";
import { deleteTask } from "./tasks";

// Thin actions for the MCP tools that cover several UI actions (spec §7.2).
// Each runs in the caller's batch, so one tool call is one undo step.

/** Files an Inbox achievement into an area, or an Inbox task into an achievement. */
export const fileItem = defineAction(
  z
    .object({
      kind: z.enum(["achievement", "task"]),
      id: z.uuid(),
      areaId: z.uuid().optional(),
      achievementId: z.uuid().optional(),
    })
    .refine(
      (i) => (i.kind === "achievement" ? !!i.areaId : !!i.achievementId),
      "an achievement needs areaId; a task needs achievementId",
    ),
  async (ctx, i): Promise<{ id: string; title: string }> =>
    i.kind === "achievement"
      ? callAction(ctx, fileAchievement, {
          achievementId: i.id,
          areaId: i.areaId!,
        })
      : callAction(ctx, fileTask, {
          taskId: i.id,
          achievementId: i.achievementId!,
        }),
);

const DELETERS = {
  area: (ctx: Ctx, id: string) => callAction(ctx, deleteArea, { areaId: id }),
  achievement: (ctx: Ctx, id: string) =>
    callAction(ctx, deleteAchievement, { achievementId: id }),
  task: (ctx: Ctx, id: string) => callAction(ctx, deleteTask, { taskId: id }),
  category: (ctx: Ctx, id: string) =>
    callAction(ctx, deleteCategory, { categoryId: id }),
  goal: (ctx: Ctx, id: string) => callAction(ctx, deleteGoal, { goalId: id }),
};

/** Soft-deletes one area, achievement, task, category or goal. */
export const deleteItem = defineAction(
  z.object({
    kind: z.enum(["area", "achievement", "task", "category", "goal"]),
    id: z.uuid(),
  }),
  (ctx, { kind, id }) => DELETERS[kind](ctx, id),
);
