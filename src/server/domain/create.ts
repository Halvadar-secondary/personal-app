import { z } from "zod";
import { localDate } from "@/lib/dates";
import { createAchievement } from "./achievements";
import { listCategories, setTaskCategories } from "./categories";
import { callAction, defineAction } from "./context";
import { createTask } from "./tasks";
import { listFilingTargets } from "./views";

/**
 * The create dialog's save: a task with its categories, or an achievement.
 * One action, so one batch, so one Undo takes the whole thing back.
 */
export const createItem = defineAction(
  z.discriminatedUnion("kind", [
    createTask.input.extend({
      kind: z.literal("task"),
      categoryIds: setTaskCategories.input.shape.categoryIds.default([]),
    }),
    createAchievement.input.extend({ kind: z.literal("achievement") }),
  ]),
  async (ctx, input) => {
    if (input.kind === "achievement") {
      const { kind, ...fields } = input;
      return {
        kind,
        id: (await callAction(ctx, createAchievement, fields)).id,
      };
    }
    const { kind, categoryIds, ...fields } = input;
    const { id } = await callAction(ctx, createTask, fields);
    if (categoryIds.length) {
      await callAction(ctx, setTaskCategories, { taskId: id, categoryIds });
    }
    return { kind, id };
  },
);

/** What the dialog offers: where things can go, categories, the owner's date. */
export const getCreateOptions = defineAction(
  z.object({ areaId: z.uuid().optional() }),
  async (ctx, { areaId }) => ({
    targets: await callAction(ctx, listFilingTargets, {}),
    categories: await callAction(ctx, listCategories, { areaId }),
    today: localDate(ctx.now(), ctx.timeZone),
  }),
);
