import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { areas, changeEvents } from "@/server/db/schema";
import type { Db } from "@/server/db/types";
import { createTestDb } from "@/test/db";
import { createOwner, deps } from "@/test/factories";
import { callAction, defineAction, runAction } from "./context";
import { DomainError } from "./errors";
import { recordChange } from "./history";

let db: Db;
let close: () => Promise<void>;
let owner: string;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  owner = await createOwner(db);
});
afterEach(() => close());

const insertArea = defineAction(
  z.object({ name: z.string().min(1), fail: z.boolean().optional() }),
  async (ctx, input) => {
    const [row] = await ctx.db
      .insert(areas)
      .values({ ownerId: ctx.ownerId, name: input.name, sortKey: "a0" })
      .returning();
    await recordChange(ctx, {
      entityType: "area",
      entityId: row!.id,
      op: "create",
      before: null,
      after: row!,
    });
    if (input.fail) throw new DomainError("invalid_state");
    return { row: row!, batchId: ctx.batchId };
  },
);

const whoAmI = defineAction(z.object({}), async (ctx) => ({
  now: ctx.now(),
  timeZone: ctx.timeZone,
}));

describe("runAction", () => {
  it("rejects invalid input with invalid_input and touches nothing", async () => {
    const err = await runAction(deps(db, owner), insertArea, {
      name: "",
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DomainError);
    expect((err as DomainError).code).toBe("invalid_input");
    expect(await db.$count(areas)).toBe(0);
  });

  it("commits data and its events together, sharing one batch id", async () => {
    const twice = defineAction(z.object({}), async (ctx) => {
      const a = await callAction(ctx, insertArea, { name: "A" });
      const b = await callAction(ctx, insertArea, { name: "B" });
      return [a, b];
    });
    await runAction(deps(db, owner), twice, {});
    const events = await db.select().from(changeEvents);
    expect(events).toHaveLength(2);
    expect(new Set(events.map((e) => e.batchId)).size).toBe(1);
    expect(events.every((e) => e.actor === "ui" && e.ownerId === owner)).toBe(
      true,
    );
    expect(await db.$count(areas)).toBe(2);
  });

  it("rolls back data and events when the action throws", async () => {
    await expect(
      runAction(deps(db, owner), insertArea, { name: "A", fail: true }),
    ).rejects.toMatchObject({ code: "invalid_state" });
    expect(await db.$count(areas)).toBe(0);
    expect(await db.$count(changeEvents)).toBe(0);
  });

  it("injects the clock and the owner's time zone", async () => {
    const nz = await createOwner(db, { timeZone: "Pacific/Auckland" });
    const at = new Date("2026-03-10T11:30:00Z");
    const r = await runAction(deps(db, nz, at), whoAmI, {});
    expect(r).toEqual({ now: at, timeZone: "Pacific/Auckland" });
  });

  it("defaults the time zone to UTC without a settings row", async () => {
    const r = await runAction(deps(db, owner), whoAmI, {});
    expect(r.timeZone).toBe("UTC");
  });

  it("callAction runs a nested action in the same batch", async () => {
    const outer = defineAction(z.object({}), async (ctx) => {
      const inner = await callAction(ctx, insertArea, { name: "inner" });
      return { outer: ctx.batchId, inner: inner.batchId };
    });
    const r = await runAction(deps(db, owner), outer, {});
    expect(r.inner).toBe(r.outer);
  });

  it("uses a caller-supplied batch id for every event", async () => {
    const batchId = crypto.randomUUID();
    await runAction({ ...deps(db, owner), batchId }, insertArea, { name: "X" });
    const events = await db.select().from(changeEvents);
    expect(events.map((e) => e.batchId)).toEqual([batchId]);
  });

  it("callAction validates its input", async () => {
    const outer = defineAction(z.object({}), (ctx) =>
      callAction(ctx, insertArea, { name: "" }),
    );
    await expect(runAction(deps(db, owner), outer, {})).rejects.toMatchObject({
      code: "invalid_input",
    });
  });
});
