"use server";

import type { z } from "zod";
import { undoBatch } from "@/server/domain/undo";
import { act } from "./run";

export async function undoAction(input: z.input<typeof undoBatch.input>) {
  return act(undoBatch, input);
}
