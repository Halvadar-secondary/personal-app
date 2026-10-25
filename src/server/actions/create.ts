"use server";

import type { z } from "zod";
import { createItem, getCreateOptions } from "@/server/domain/create";
import { act, read } from "./run";

type In<A extends { input: z.ZodType }> = z.input<A["input"]>;

export async function createItemAction(input: In<typeof createItem>) {
  return act(createItem, input, (o) => o);
}

/** The dialog's options, fetched when it opens. A read: no refresh. */
export async function createOptionsAction(input: In<typeof getCreateOptions>) {
  return read(getCreateOptions, input);
}
