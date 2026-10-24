"use server";

import type { z } from "zod";
import { updateSettings } from "@/server/domain/settings";
import { act } from "./run";

export async function updateSettingsAction(
  input: z.input<typeof updateSettings.input>,
) {
  return act(updateSettings, input);
}
