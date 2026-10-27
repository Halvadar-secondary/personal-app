"use server";

import type { z } from "zod";
import {
  createGoal,
  deleteGoal,
  linkAchievement,
  listLinkableAchievements,
  moveGoal,
  updateGoal,
} from "@/server/domain/goals";
import { act, read } from "./run";

type In<A extends { input: z.ZodType }> = z.input<A["input"]>;

export async function createGoalAction(input: In<typeof createGoal>) {
  return act(createGoal, input, (g) => ({ id: g.id }));
}

export async function updateGoalAction(input: In<typeof updateGoal>) {
  return act(updateGoal, input);
}

export async function moveGoalAction(input: In<typeof moveGoal>) {
  return act(moveGoal, input);
}

export async function deleteGoalAction(input: In<typeof deleteGoal>) {
  return act(deleteGoal, input);
}

export async function linkAchievementAction(input: In<typeof linkAchievement>) {
  return act(linkAchievement, input);
}

/** For the link picker, fetched when it opens. A read: no refresh. */
export async function linkableAchievementsAction(
  input: In<typeof listLinkableAchievements>,
) {
  return read(listLinkableAchievements, input);
}
