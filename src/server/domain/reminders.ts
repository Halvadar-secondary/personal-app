import { and, count, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { addDays, localDate } from "@/lib/dates";
import {
  dayPlans,
  pushSubscriptions,
  settings,
  tasks,
} from "@/server/db/schema";
import type { Db } from "@/server/db/types";
import {
  type PushMessage,
  type PushSender,
  webPushSender,
} from "@/server/push/send";
import { type Ctx, defineAction } from "./context";
import { DomainError } from "./errors";

// The evening reminder (spec "Plan your days" §9). Its settings and the
// devices are bookkeeping, not goal data: no history, no undo.

export const REMINDER: PushMessage = {
  title: "Plan tomorrow",
  body: "Tomorrow isn't planned yet.",
  url: "/plan",
};

const TEST: PushMessage = {
  title: "Test reminder",
  body: "Reminders work on this device.",
  url: "/plan",
};

async function settingsRow(ctx: Ctx) {
  const [row] = await ctx.db
    .select()
    .from(settings)
    .where(eq(settings.ownerId, ctx.ownerId));
  return row;
}

function devicesOf(db: Db | Ctx["db"], ownerId: string) {
  return db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.ownerId, ownerId));
}

export const getReminder = defineAction(z.object({}), async (ctx) => {
  const row = await settingsRow(ctx);
  const [n] = await ctx.db
    .select({ n: count() })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.ownerId, ctx.ownerId));
  return {
    enabled: row?.reminderEnabled ?? false,
    time: row?.reminderTime ?? "21:00",
    devices: n!.n,
  };
});

export const updateReminder = defineAction(
  z.object({
    enabled: z.boolean().optional(),
    time: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .optional(),
  }),
  async (ctx, { enabled, time }) => {
    const patch = {
      ...(enabled === undefined ? {} : { reminderEnabled: enabled }),
      ...(time === undefined ? {} : { reminderTime: time }),
    };
    await ctx.db
      .insert(settings)
      .values({
        ownerId: ctx.ownerId,
        timeZone: ctx.timeZone,
        weekStart: ctx.weekStart,
        ...patch,
      })
      .onConflictDoUpdate({
        target: settings.ownerId,
        set: { ...patch, updatedAt: ctx.now() },
        setWhere: eq(settings.ownerId, ctx.ownerId),
      });
    return { enabled, time };
  },
);

/** This device gets reminders; a known endpoint just refreshes its keys. */
export const savePushSubscription = defineAction(
  z.object({
    // Push services are https; anything else would have the server post
    // wherever the browser said.
    endpoint: z.url({ protocol: /^https$/ }).max(2000),
    p256dh: z.string().min(1).max(200),
    auth: z.string().min(1).max(100),
  }),
  async (ctx, sub) => {
    await ctx.db
      .insert(pushSubscriptions)
      .values({ ...sub, ownerId: ctx.ownerId, createdAt: ctx.now() })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: sub,
        // Another owner's device stays theirs.
        setWhere: eq(pushSubscriptions.ownerId, ctx.ownerId),
      });
    return { saved: true as const };
  },
);

export const deletePushSubscription = defineAction(
  z.object({ endpoint: z.string().max(2000) }),
  async (ctx, { endpoint }) => {
    await ctx.db
      .delete(pushSubscriptions)
      .where(
        and(
          eq(pushSubscriptions.ownerId, ctx.ownerId),
          eq(pushSubscriptions.endpoint, endpoint),
        ),
      );
    return { deleted: true as const };
  },
);

/** "Send a test" from Settings, to every device of the owner. */
export const sendTestReminder = defineAction(z.object({}), async (ctx) => {
  const send = webPushSender();
  const devices = await devicesOf(ctx.db, ctx.ownerId);
  if (!send) throw new DomainError("invalid_state", { reason: "push" });
  if (devices.length === 0) {
    throw new DomainError("invalid_state", { reason: "no_devices" });
  }
  let sent = 0;
  for (const d of devices) {
    const r = await deliver(send, d, TEST);
    if (r === "ok") sent++;
    else if (r === "gone") await removeDevice(ctx.db, d.id);
  }
  // Nothing got through: say so, rather than a generic save error.
  if (sent === 0) throw new DomainError("invalid_state", { reason: "push" });
  return { sent };
});

function removeDevice(db: Db | Ctx["db"], id: string) {
  return db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, id));
}

/** "HH:MM" of `instant` in `timeZone`. */
function localTime(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(instant);
}

async function planned(db: Db, ownerId: string, day: string) {
  const [mark] = await db
    .select({ day: dayPlans.day })
    .from(dayPlans)
    .where(and(eq(dayPlans.ownerId, ownerId), eq(dayPlans.day, day)));
  if (mark) return true;
  const [task] = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(
      and(
        eq(tasks.ownerId, ownerId),
        isNull(tasks.deletedAt),
        eq(tasks.plannedOn, day),
      ),
    )
    .limit(1);
  return task !== undefined;
}

/** Owners whose evening it is, who haven't planned tomorrow or been reminded. */
export async function dueReminders(
  db: Db,
  now: Date,
): Promise<{ ownerId: string; today: string; tomorrow: string }[]> {
  const rows = await db
    .select()
    .from(settings)
    .where(eq(settings.reminderEnabled, true));
  const due = [];
  for (const s of rows) {
    const today = localDate(now, s.timeZone);
    if (s.lastReminderOn === today) continue;
    if (localTime(now, s.timeZone) < s.reminderTime) continue;
    const tomorrow = addDays(today, 1);
    if (await planned(db, s.ownerId, tomorrow)) continue;
    due.push({ ownerId: s.ownerId, today, tomorrow });
  }
  return due;
}

/**
 * The scheduled job's work, across owners: one reminder per evening to each
 * device, forgetting devices that are gone. Not an action: no history.
 */
export async function sendReminders(
  db: Db,
  now: Date,
  send: PushSender,
): Promise<{ owners: number; sent: number; removed: number; failed: number }> {
  const due = await dueReminders(db, now);
  let owners = 0;
  let sent = 0;
  let removed = 0;
  let failed = 0;
  for (const { ownerId, today } of due) {
    // Claim the evening before sending: a crash or a failing device can
    // cost one reminder, never repeat it every 15 minutes.
    const claimed = await db
      .update(settings)
      .set({ lastReminderOn: today })
      .where(
        and(
          eq(settings.ownerId, ownerId),
          sql`${settings.lastReminderOn} is distinct from ${today}`,
        ),
      )
      .returning({ ownerId: settings.ownerId });
    if (claimed.length === 0) continue;
    owners++;
    for (const d of await devicesOf(db, ownerId)) {
      const r = await deliver(send, d, REMINDER);
      if (r === "ok") sent++;
      else if (r === "gone") {
        await removeDevice(db, d.id);
        removed++;
      } else failed++;
    }
  }
  return { owners, sent, removed, failed };
}

/** One device's delivery; any error other than "gone" counts as a failure. */
async function deliver(
  send: PushSender,
  d: { endpoint: string; p256dh: string; auth: string },
  msg: PushMessage,
): Promise<"ok" | "gone" | "failed"> {
  try {
    return await send(d, msg);
  } catch {
    return "failed";
  }
}
