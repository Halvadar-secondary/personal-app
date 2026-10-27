import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pushSubscriptions } from "@/server/db/schema";
import type { Db } from "@/server/db/types";
import type { PushMessage, PushSender } from "@/server/push/send";
import { createTestDb } from "@/test/db";
import { createOwner, type Run, runner } from "@/test/factories";
import { markDayPlanned, planTask } from "./plan";
import {
  deletePushSubscription,
  getReminder,
  savePushSubscription,
  sendReminders,
  sendTestReminder,
  updateReminder,
} from "./reminders";
import { createTask } from "./tasks";

const push = vi.hoisted(() => ({ sender: null as PushSender | null }));
vi.mock("@/server/push/send", () => ({ webPushSender: () => push.sender }));

let db: Db;
let close: () => Promise<void>;
let owner: string;
let run: Run;
let sent: { endpoint: string; msg: PushMessage }[];
let gone: Set<string>;

const fake: PushSender = async (sub, msg) => {
  if (gone.has(sub.endpoint)) return "gone";
  sent.push({ endpoint: sub.endpoint, msg });
  return "ok";
};

// Tuesday 2026-03-10 in UTC; the reminder is at 21:00 by default.
const at = (time: string) => new Date(`2026-03-10T${time}:00Z`);

const device = (n: number) => ({
  endpoint: `https://push.example/${n}`,
  p256dh: `key-${n}`,
  auth: `auth-${n}`,
});

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  owner = await createOwner(db);
  run = runner(db, owner);
  sent = [];
  gone = new Set();
  push.sender = fake;
  await run(updateReminder, { enabled: true });
  await run(savePushSubscription, device(1));
});
afterEach(() => close());

describe("reminder settings", () => {
  it("defaults to off at 21:00, and counts devices", async () => {
    const other = await createOwner(db);
    expect(await runner(db, other)(getReminder, {})).toEqual({
      enabled: false,
      time: "21:00",
      devices: 0,
    });
    await run(updateReminder, { time: "20:30" });
    await run(savePushSubscription, device(2));
    // The same device again only refreshes its keys.
    await run(savePushSubscription, { ...device(2), auth: "new" });
    expect(await run(getReminder, {})).toEqual({
      enabled: true,
      time: "20:30",
      devices: 2,
    });
    await run(deletePushSubscription, { endpoint: device(2).endpoint });
    expect((await run(getReminder, {})).devices).toBe(1);
  });

  it("refuses a time that isn't HH:MM", async () => {
    await expect(run(updateReminder, { time: "9pm" })).rejects.toMatchObject({
      code: "invalid_input",
    });
  });
});

describe("sendReminders", () => {
  it("sends once at or after the reminder time when tomorrow isn't planned", async () => {
    expect(await sendReminders(db, at("20:59"), fake)).toEqual({
      owners: 0,
      sent: 0,
      removed: 0,
    });
    expect(await sendReminders(db, at("21:05"), fake)).toEqual({
      owners: 1,
      sent: 1,
      removed: 0,
    });
    expect(sent[0]!.msg).toEqual({
      title: "Plan tomorrow",
      body: "Tomorrow isn't planned yet.",
      url: "/plan",
    });
    expect((await sendReminders(db, at("21:20"), fake)).sent).toBe(0);
    expect(sent).toHaveLength(1);
  });

  it("skips an evening when tomorrow is planned by Done or a planned task", async () => {
    await run(markDayPlanned, { day: "2026-03-11" });
    expect((await sendReminders(db, at("21:05"), fake)).owners).toBe(0);
    const next = runner(db, owner, { now: new Date("2026-03-11T12:00:00Z") });
    const t = await next(createTask, { achievementId: null, title: "Gym bag" });
    await next(planTask, {
      taskId: t.id,
      plan: { type: "day", date: "2026-03-12" },
    });
    expect(
      (await sendReminders(db, new Date("2026-03-11T21:05:00Z"), fake)).owners,
    ).toBe(0);
  });

  it("uses the owner's time zone", async () => {
    const nz = await createOwner(db, { timeZone: "Pacific/Auckland" });
    const nzRun = runner(db, nz);
    await nzRun(updateReminder, { enabled: true });
    await nzRun(savePushSubscription, device(9));
    // 08:05 UTC is 21:05 in Auckland (UTC+13 in March).
    const r = await sendReminders(db, at("08:05"), fake);
    expect(r).toEqual({ owners: 1, sent: 1, removed: 0 });
    expect(sent[0]!.endpoint).toBe(device(9).endpoint);
  });

  it("removes subscriptions the push service reports gone", async () => {
    await run(savePushSubscription, device(2));
    gone.add(device(1).endpoint);
    const r = await sendReminders(db, at("21:05"), fake);
    expect(r).toEqual({ owners: 1, sent: 1, removed: 1 });
    const left = await db.select().from(pushSubscriptions);
    expect(left.map((s) => s.endpoint)).toEqual([device(2).endpoint]);
  });

  it("skips owners with the reminder off", async () => {
    await run(updateReminder, { enabled: false });
    expect((await sendReminders(db, at("21:05"), fake)).owners).toBe(0);
  });
});

describe("sendTestReminder", () => {
  it("sends a test to every device", async () => {
    await run(sendTestReminder, {});
    expect(sent).toEqual([
      {
        endpoint: device(1).endpoint,
        msg: {
          title: "Test reminder",
          body: "Reminders work on this device.",
          url: "/plan",
        },
      },
    ]);
  });

  it("refuses without a configured sender or any device", async () => {
    push.sender = null;
    await expect(run(sendTestReminder, {})).rejects.toMatchObject({
      code: "invalid_state",
    });
    push.sender = fake;
    await run(deletePushSubscription, { endpoint: device(1).endpoint });
    await expect(run(sendTestReminder, {})).rejects.toMatchObject({
      code: "invalid_state",
    });
  });
});
