"use server";

import { listJumpTargets } from "@/server/domain/views";
import { read } from "./run";

/** The palette's achievements, fetched when it opens. A read: no refresh. */
export async function jumpTargetsAction() {
  return read(listJumpTargets, {});
}
