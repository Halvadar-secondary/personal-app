"use server";

import type { z } from "zod";
import {
  getPlanOptions,
  markDayPlanned,
  placeTask,
  planTask,
} from "@/server/domain/plan";
import { logProgress } from "@/server/domain/targets";
import { act, read } from "./run";

type In<A extends { input: z.ZodType }> = z.input<A["input"]>;

export async function planTaskAction(input: In<typeof planTask>) {
  return act(planTask, input);
}

export async function placeTaskAction(input: In<typeof placeTask>) {
  return act(placeTask, input);
}

export async function markDayPlannedAction(input: In<typeof markDayPlanned>) {
  return act(markDayPlanned, input);
}

export async function logProgressAction(input: In<typeof logProgress>) {
  return act(logProgress, input, (o) => o);
}

/** The planner's pick list. A read: no refresh. */
export async function planOptionsAction(input: In<typeof getPlanOptions>) {
  return read(getPlanOptions, input);
}
