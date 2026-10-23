"use server";

import type { z } from "zod";
import {
  completeTask,
  createTask,
  deleteTask,
  moveTask,
  uncompleteTask,
  updateTask,
} from "@/server/domain/tasks";
import { act } from "./run";

type In<A extends { input: z.ZodType }> = z.input<A["input"]>;

export async function createTaskAction(input: In<typeof createTask>) {
  return act(createTask, input, (t) => ({ id: t.id }));
}

export async function updateTaskAction(input: In<typeof updateTask>) {
  return act(updateTask, input);
}

export async function moveTaskAction(input: In<typeof moveTask>) {
  return act(moveTask, input);
}

export async function completeTaskAction(input: In<typeof completeTask>) {
  return act(completeTask, input);
}

export async function uncompleteTaskAction(input: In<typeof uncompleteTask>) {
  return act(uncompleteTask, input);
}

export async function deleteTaskAction(input: In<typeof deleteTask>) {
  return act(deleteTask, input);
}
