import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { changeEvents } from "@/server/db/schema";
import type { Db } from "@/server/db/types";
import { createArea, getArea } from "@/server/domain/areas";
import { defineAction } from "@/server/domain/context";
import type { DomainErrorCode } from "@/server/domain/errors";
import { createTestDb } from "@/test/db";
import { createOwner } from "@/test/factories";
import { z } from "zod";
import { makeAct, makeRead, messageFor } from "./run";

let db: Db;
let close: () => Promise<void>;
let ownerId: string;
const refresh = vi.fn();
let act: ReturnType<typeof makeAct>;
let read: ReturnType<typeof makeRead>;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  ownerId = await createOwner(db);
  refresh.mockClear();
  const env = { owner: async () => ({ id: ownerId }), db: () => db, refresh };
  act = makeAct(env);
  read = makeRead(env);
});
afterEach(() => close());

describe("act", () => {
  it("runs as the owner with actor ui and refreshes once", async () => {
    const r = await act(createArea, { name: "Guitar" }, (a) => ({ id: a.id }));
    expect(r).toMatchObject({ ok: true, data: { id: expect.any(String) } });
    expect(refresh).toHaveBeenCalledTimes(1);
    const [e] = await db.select().from(changeEvents);
    expect(e).toMatchObject({
      actor: "ui",
      ownerId,
      batchId: r.ok ? r.batchId : "",
    });
  });

  it("returns no data without a pick", async () => {
    const r = await act(createArea, { name: "Guitar" });
    expect(r).toEqual({
      ok: true,
      data: undefined,
      batchId: expect.any(String),
    });
  });

  it("returns a domain error as a message and does not refresh", async () => {
    const r = await act(getArea, { areaId: crypto.randomUUID() });
    expect(r).toEqual({
      ok: false,
      code: "not_found",
      message: messageFor("not_found"),
    });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("checks the owner before validating input or touching the db", async () => {
    const strict = makeAct({
      owner: () => Promise.reject(new Error("NOPE")),
      db: () => {
        throw new Error("db");
      },
      refresh,
    });
    await expect(strict(createArea, { name: "" })).rejects.toThrow("NOPE");
  });

  it("rethrows unexpected errors", async () => {
    const boom = defineAction(z.object({}), async () => {
      throw new Error("boom");
    });
    await expect(act(boom, {})).rejects.toThrow("boom");
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("read", () => {
  it("returns the action's output", async () => {
    const { id } = await act(createArea, { name: "Guitar" }, (a) => a).then(
      (r) => (r.ok ? r.data : { id: "" }),
    );
    expect((await read(getArea, { areaId: id })).name).toBe("Guitar");
  });

  it("maps not_found to notFound()", async () => {
    await expect(
      read(getArea, { areaId: crypto.randomUUID() }),
    ).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/);
  });

  it("rethrows other domain errors", async () => {
    await expect(read(getArea, { areaId: "nope" })).rejects.toMatchObject({
      code: "invalid_input",
    });
  });
});

it("has a message for every domain error code", () => {
  const codes: DomainErrorCode[] = [
    "invalid_input",
    "not_found",
    "invalid_state",
    "conflict",
    "already_undone",
  ];
  expect(codes.map(messageFor)).toEqual([
    "That doesn't look right. Check what you entered.",
    "That item no longer exists. Refresh to see the latest.",
    "That's already been done.",
    "Something changed since. Refresh and try again.",
    "That was already undone.",
  ]);
});
