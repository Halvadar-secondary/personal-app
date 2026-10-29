"use server";

import type { z } from "zod";
import {
  deletePushSubscription,
  savePushSubscription,
  sendTestReminder,
  updateReminder,
} from "@/server/domain/reminders";
import { act } from "./run";

type In<A extends { input: z.ZodType }> = z.input<A["input"]>;

export async function updateReminderAction(input: In<typeof updateReminder>) {
  return act(updateReminder, input);
}

export async function savePushSubscriptionAction(
  input: In<typeof savePushSubscription>,
) {
  return act(savePushSubscription, input);
}

export async function deletePushSubscriptionAction(
  input: In<typeof deletePushSubscription>,
) {
  return act(deletePushSubscription, input);
}

export async function sendTestReminderAction(
  input: In<typeof sendTestReminder>,
) {
  return act(sendTestReminder, input, (o) => o);
}
