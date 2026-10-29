"use server";

import type { z } from "zod";
import {
  createTracker,
  deleteMoment,
  deleteTracker,
  listMoments,
  logMoment,
  moveTracker,
  updateTracker,
} from "@/server/domain/trackers";
import { act, read } from "./run";

type In<A extends { input: z.ZodType }> = z.input<A["input"]>;

export async function createTrackerAction(input: In<typeof createTracker>) {
  return act(createTracker, input, (t) => ({ id: t.id }));
}

export async function updateTrackerAction(input: In<typeof updateTracker>) {
  return act(updateTracker, input);
}

export async function moveTrackerAction(input: In<typeof moveTracker>) {
  return act(moveTracker, input);
}

export async function deleteTrackerAction(input: In<typeof deleteTracker>) {
  return act(deleteTracker, input);
}

export async function logMomentAction(input: In<typeof logMoment>) {
  return act(logMoment, input, (m) => ({ id: m.id }));
}

export async function deleteMomentAction(input: In<typeof deleteMoment>) {
  return act(deleteMoment, input);
}

/** "Show more" on a tracker. A read: no refresh. */
export async function momentsAction(input: In<typeof listMoments>) {
  return read(listMoments, input);
}
