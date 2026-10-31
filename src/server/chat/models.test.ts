import { beforeEach, expect, it, vi } from "vitest";
import {
  fallbackFor,
  pickNewest,
  resetModelCache,
  resolveTiers,
  tierOf,
} from "./models";

const m = (id: string, created_at = "2026-01-01T00:00:00Z") => ({
  id,
  display_name: id,
  created_at,
});

beforeEach(() => resetModelCache());

const NOW = new Date("2026-10-31T12:00:00Z");

it("picks the newest version in a family", () => {
  const list = [m("claude-sonnet-5-5"), m("claude-sonnet-6"), m("claude-sonnet-5")];
  expect(pickNewest(list, "sonnet")?.id).toBe("claude-sonnet-6");
});

it("ignores dated ids", () => {
  const list = [m("claude-haiku-4-5-20251001"), m("claude-haiku-5-5")];
  expect(pickNewest(list, "haiku")?.id).toBe("claude-haiku-5-5");
  expect(pickNewest([m("claude-haiku-4-5-20251001")], "haiku")).toBeNull();
});

it("breaks version ties by created_at", () => {
  const a = { ...m("claude-opus-5"), created_at: "2026-01-01T00:00:00Z" };
  const b = { ...m("claude-opus-5-0"), created_at: "2026-02-01T00:00:00Z" };
  expect(pickNewest([a, b], "opus")?.id).toBe("claude-opus-5-0");
});

it("falls back when list throws", async () => {
  const list = vi.fn().mockRejectedValue(new Error("down"));
  const t = await resolveTiers({ list, overrides: {}, now: NOW });
  expect(t.quick).toEqual({ id: "claude-haiku-5-5", name: "Claude Haiku 5.5" });
  expect(t.smart).toEqual({ id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5" });
  expect(t.deep).toEqual({ id: "claude-opus-5-5", name: "Claude Opus 5.5" });
});

it("uses the fallback for a family missing from the list", async () => {
  const list = async () => [m("claude-haiku-5-5"), m("claude-sonnet-6")];
  const t = await resolveTiers({ list, overrides: {}, now: NOW });
  expect(t.deep.id).toBe("claude-opus-5-5");
  expect(t.smart.id).toBe("claude-sonnet-6");
});

it("lets an override win", async () => {
  const list = async () => [m("claude-sonnet-6")];
  const t = await resolveTiers({
    list,
    overrides: { smart: "claude-opus-5" },
    now: NOW,
  });
  expect(t.smart.id).toBe("claude-opus-5");
});

it("caches the list for 24 hours", async () => {
  const list = vi.fn().mockResolvedValue([m("claude-sonnet-6")]);
  await resolveTiers({ list, overrides: {}, now: NOW });
  await resolveTiers({ list, overrides: {}, now: new Date(+NOW + 23 * 3600e3) });
  expect(list).toHaveBeenCalledTimes(1);
  await resolveTiers({ list, overrides: {}, now: new Date(+NOW + 25 * 3600e3) });
  expect(list).toHaveBeenCalledTimes(2);
});

it("caches a failure for 10 minutes", async () => {
  const list = vi.fn().mockRejectedValue(new Error("down"));
  await resolveTiers({ list, overrides: {}, now: NOW });
  await resolveTiers({ list, overrides: {}, now: new Date(+NOW + 5 * 60e3) });
  expect(list).toHaveBeenCalledTimes(1);
  await resolveTiers({ list, overrides: {}, now: new Date(+NOW + 11 * 60e3) });
  expect(list).toHaveBeenCalledTimes(2);
});

it("maps fallbacks and families", () => {
  expect(fallbackFor("quick")).toBe("claude-haiku-5-5");
  expect(tierOf("claude-opus-6")).toBe("deep");
  expect(tierOf("claude-sonnet-5-5")).toBe("smart");
  expect(tierOf("gpt-4")).toBeNull();
});
