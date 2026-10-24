"use server";

import type { z } from "zod";
import {
  createArea,
  deleteArea,
  reorderArea,
  updateArea,
} from "@/server/domain/areas";
import { act } from "./run";

type In<A extends { input: z.ZodType }> = z.input<A["input"]>;

export async function createAreaAction(input: In<typeof createArea>) {
  return act(createArea, input, (a) => ({ id: a.id }));
}

export async function updateAreaAction(input: In<typeof updateArea>) {
  return act(updateArea, input);
}

export async function reorderAreaAction(input: In<typeof reorderArea>) {
  return act(reorderArea, input);
}

export async function deleteAreaAction(input: In<typeof deleteArea>) {
  return act(deleteArea, input);
}
