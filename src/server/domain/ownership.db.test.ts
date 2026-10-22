import { z } from "zod";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  achievements,
  areas,
  categories,
  changeEvents,
  practiceEntries,
  taskCategories,
  taskCompletions,
  tasks,
} from "@/server/db/schema";
import type { Db } from "@/server/db/types";
import { createTestDb } from "@/test/db";
import { createOwner, type Run, runner } from "@/test/factories";
import {
  createAchievement,
  deleteAchievement,
  getAchievement,
  moveAchievement,
  updateAchievement,
} from "./achievements";
import {
  createArea,
  deleteArea,
  getArea,
  reorderArea,
  updateArea,
} from "./areas";
import {
  createCategory,
  deleteCategory,
  setTaskCategories,
  updateCategory,
} from "./categories";
import type { Action } from "./context";
import { captureItem, fileAchievement, fileTask } from "./inbox";
import { addPracticeEntry, listPracticeEntries } from "./practice";
import {
  completeTask,
  createTask,
  createTasks,
  deleteTask,
  moveTask,
  uncompleteTask,
  updateTask,
} from "./tasks";
import { undoBatch } from "./undo";

let db: Db;
let close: () => Promise<void>;
let asA: Run;
/** B's ids, plus A's own achievement and task for "move mine into theirs" cases. */
let b: Record<
  "area" | "ach" | "task" | "done" | "cat" | "batch" | "myAch" | "myTask",
  string
>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  asA = runner(db, await createOwner(db));
  const asB = runner(db, await createOwner(db));
  const area = await asB(createArea, { name: "B area" });
  const ach = await asB(createAchievement, { areaId: area.id, title: "B ach" });
  const [task, done] = await asB(createTasks, {
    achievementId: ach.id,
    tasks: [{ title: "B task" }, { title: "B done" }],
  });
  await asB(completeTask, { taskId: done!.id });
  const cat = await asB(createCategory, { name: "B cat", color: "x" });
  await asB(setTaskCategories, { taskId: task!.id, categoryIds: [cat.id] });
  await asB(addPracticeEntry, { taskId: task!.id, metrics: { bpm: 90 } });
  const [event] = await db.select().from(changeEvents);
  const myAch = await asA(createAchievement, { areaId: null, title: "mine" });
  const myTask = await asA(createTask, { achievementId: null, title: "mine" });
  b = {
    area: area.id,
    ach: ach.id,
    task: task!.id,
    done: done!.id,
    cat: cat.id,
    batch: event!.batchId,
    myAch: myAch.id,
    myTask: myTask.id,
  };
});
afterAll(() => close());

async function everything() {
  const all = await Promise.all(
    [
      areas,
      achievements,
      tasks,
      categories,
      taskCategories,
      taskCompletions,
      practiceEntries,
      changeEvents,
    ].map((t) => db.select().from(t)),
  );
  return JSON.stringify(all);
}

type Case = [string, Action<z.ZodType, unknown>, () => unknown];
/** Typed per action, so each input is checked against its schema. */
const c = <S extends z.ZodType, O>(
  name: string,
  action: Action<S, O>,
  input: () => z.input<S>,
): Case => [name, action as never, input];

const cases: Case[] = [
  c("updateArea", updateArea, () => ({ areaId: b.area, name: "x" })),
  c("reorderArea", reorderArea, () => ({ areaId: b.area })),
  c("deleteArea", deleteArea, () => ({ areaId: b.area })),
  c("getArea", getArea, () => ({ areaId: b.area })),
  c("createAchievement", createAchievement, () => ({
    areaId: b.area,
    title: "x",
  })),
  c("updateAchievement", updateAchievement, () => ({
    achievementId: b.ach,
    title: "x",
  })),
  c("moveAchievement", moveAchievement, () => ({
    achievementId: b.ach,
    status: "done" as const,
  })),
  c("moveAchievement into B's area", moveAchievement, () => ({
    achievementId: b.myAch,
    areaId: b.area,
  })),
  c("deleteAchievement", deleteAchievement, () => ({ achievementId: b.ach })),
  c("getAchievement", getAchievement, () => ({ achievementId: b.ach })),
  c("createTask", createTask, () => ({ achievementId: b.ach, title: "x" })),
  c("createTasks", createTasks, () => ({
    achievementId: b.ach,
    tasks: [{ title: "x" }],
  })),
  c("updateTask", updateTask, () => ({ taskId: b.task, title: "x" })),
  c("moveTask", moveTask, () => ({ taskId: b.task })),
  c("moveTask into B's achievement", moveTask, () => ({
    taskId: b.myTask,
    achievementId: b.ach,
  })),
  c("completeTask", completeTask, () => ({ taskId: b.task })),
  c("uncompleteTask", uncompleteTask, () => ({ taskId: b.done })),
  c("deleteTask", deleteTask, () => ({ taskId: b.task })),
  c("updateCategory", updateCategory, () => ({ categoryId: b.cat, name: "x" })),
  c("deleteCategory", deleteCategory, () => ({ categoryId: b.cat })),
  c("setTaskCategories on B's task", setTaskCategories, () => ({
    taskId: b.task,
    categoryIds: [],
  })),
  c("setTaskCategories with B's category", setTaskCategories, () => ({
    taskId: b.myTask,
    categoryIds: [b.cat],
  })),
  c("captureItem in B's area", captureItem, () => ({
    text: "x",
    context: { areaId: b.area },
  })),
  c("captureItem in B's achievement", captureItem, () => ({
    text: "x",
    context: { achievementId: b.ach },
  })),
  c("captureItem ! in B's achievement", captureItem, () => ({
    text: "!x",
    context: { achievementId: b.ach },
  })),
  c("fileAchievement", fileAchievement, () => ({
    achievementId: b.ach,
    areaId: b.area,
  })),
  c("fileAchievement into B's area", fileAchievement, () => ({
    achievementId: b.myAch,
    areaId: b.area,
  })),
  c("fileTask", fileTask, () => ({ taskId: b.task, achievementId: b.ach })),
  c("fileTask into B's achievement", fileTask, () => ({
    taskId: b.myTask,
    achievementId: b.ach,
  })),
  c("addPracticeEntry", addPracticeEntry, () => ({ taskId: b.task })),
  c("listPracticeEntries", listPracticeEntries, () => ({ taskId: b.task })),
  c("undoBatch", undoBatch, () => ({ batchId: b.batch })),
];

describe("another owner's ids", () => {
  it.each(cases)(
    "%s → not_found, nothing changes",
    async (_, action, input) => {
      const before = await everything();
      await expect(asA(action, input() as never)).rejects.toMatchObject({
        code: "not_found",
      });
      expect(await everything()).toBe(before);
    },
  );
});
