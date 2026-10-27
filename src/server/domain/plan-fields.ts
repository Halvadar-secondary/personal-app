import { and, desc, eq, isNotNull, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { weekStartOf } from "@/lib/dates";
import { keyBetween } from "@/lib/ordering";
import type { Section } from "@/lib/plan";
import { tasks } from "@/server/db/schema";
import type { Ctx } from "./context";

// Plan and target inputs, shared by task creation and the planning actions
// (kept apart from both so neither imports the other).

const zDay = z.iso.date();

export const zSection = z.enum(["work", "spare"]);

/** When to do a task: on a day (in a section), in a week, or not planned. */
export const zPlan = z
  .discriminatedUnion("type", [
    z.object({
      type: z.literal("day"),
      date: zDay,
      section: zSection.optional(),
    }),
    z.object({ type: z.literal("week"), date: zDay }),
  ])
  .nullable();
export type Plan = z.output<typeof zPlan>;

/** An amount to reach, in times, hours, pages, lessons or the owner's word. */
export const zTarget = z
  .object({
    amount: z.number().positive().max(1_000_000),
    unit: z.string().trim().min(1).max(20),
  })
  .nullable();
export type Target = z.output<typeof zTarget>;

export function targetColumns(target: Target) {
  return {
    targetAmount: target?.amount ?? null,
    targetUnit: target?.unit ?? null,
  };
}

/** A key after everything already in the day's section. */
export async function appendKey(
  ctx: Ctx,
  day: string,
  section: Section,
  exceptId?: string,
): Promise<string> {
  const rows = await ctx.db
    .select({ id: tasks.id, key: tasks.planSortKey })
    .from(tasks)
    .where(
      and(
        eq(tasks.ownerId, ctx.ownerId),
        isNull(tasks.deletedAt),
        eq(tasks.planSection, section),
        isNotNull(tasks.planSortKey),
        // That day's one-offs, and every repeating task's standing place.
        or(eq(tasks.plannedOn, day), isNotNull(tasks.recurrence)),
      ),
    )
    .orderBy(desc(tasks.planSortKey));
  const last = rows.find((r) => r.id !== exceptId)?.key ?? null;
  return keyBetween(last, null);
}

/** The plan columns for `plan`; a day plan goes last in its section. */
export async function planColumns(
  ctx: Ctx,
  plan: Plan,
  current: { section: Section | null } = { section: null },
  exceptId?: string,
) {
  if (!plan) {
    return {
      plannedOn: null,
      plannedWeek: null,
      planSection: null,
      planSortKey: null,
    };
  }
  if (plan.type === "week") {
    return {
      plannedOn: null,
      plannedWeek: weekStartOf(plan.date, ctx.weekStart),
      planSection: null,
      planSortKey: null,
    };
  }
  const section = plan.section ?? current.section ?? "spare";
  return {
    plannedOn: plan.date,
    plannedWeek: null,
    planSection: section,
    planSortKey: await appendKey(ctx, plan.date, section, exceptId),
  };
}
