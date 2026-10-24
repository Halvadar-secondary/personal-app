"use server";

import type { z } from "zod";
import { createCategory, setTaskCategories } from "@/server/domain/categories";
import { act } from "./run";

type In<A extends { input: z.ZodType }> = z.input<A["input"]>;

export async function createCategoryAction(input: In<typeof createCategory>) {
  return act(createCategory, input, (c) => ({ id: c.id }));
}

export async function setTaskCategoriesAction(
  input: In<typeof setTaskCategories>,
) {
  return act(setTaskCategories, input);
}
