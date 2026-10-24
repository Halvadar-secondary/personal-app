"use server";

import type { z } from "zod";
import { captureItem, fileAchievement, fileTask } from "@/server/domain/inbox";
import { act } from "./run";

type In<A extends { input: z.ZodType }> = z.input<A["input"]>;

export async function captureAction(input: In<typeof captureItem>) {
  return act(captureItem, input, ({ kind, id }) => ({ kind, id }));
}

export async function fileAchievementAction(input: In<typeof fileAchievement>) {
  return act(fileAchievement, input);
}

export async function fileTaskAction(input: In<typeof fileTask>) {
  return act(fileTask, input);
}
