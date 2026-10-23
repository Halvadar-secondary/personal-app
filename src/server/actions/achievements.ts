"use server";

import type { z } from "zod";
import {
  createAchievement,
  deleteAchievement,
  moveAchievement,
  updateAchievement,
} from "@/server/domain/achievements";
import { act } from "./run";

type In<A extends { input: z.ZodType }> = z.input<A["input"]>;

export async function createAchievementAction(
  input: In<typeof createAchievement>,
) {
  return act(createAchievement, input, (a) => ({ id: a.id }));
}

export async function updateAchievementAction(
  input: In<typeof updateAchievement>,
) {
  return act(updateAchievement, input);
}

export async function moveAchievementAction(input: In<typeof moveAchievement>) {
  return act(moveAchievement, input);
}

export async function deleteAchievementAction(
  input: In<typeof deleteAchievement>,
) {
  return act(deleteAchievement, input);
}
