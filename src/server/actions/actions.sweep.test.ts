import { expect, it, vi } from "vitest";

// Every exported Server Action is a public POST endpoint: each one must
// refuse a non-owner before it parses input or reaches the database.
vi.mock("@/server/auth/require-owner", () => ({
  requireOwner: vi.fn(() => Promise.reject(new Error("NOT_OWNER"))),
}));
vi.mock("@/server/db/client", () => ({
  getDb: () => {
    throw new Error("DB_TOUCHED");
  },
}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));

const loaders = import.meta.glob<Record<string, unknown>>("./*.ts");
const files = Object.keys(loaders).filter(
  (f) => !/\/run\.ts$|\.test\.ts$/.test(f),
);
const actions = (
  await Promise.all(files.map(async (f) => [f, await loaders[f]!()] as const))
).flatMap(([file, mod]) =>
  Object.entries(mod).map(([name, fn]) => [`${file} ${name}`, fn] as const),
);

it("found every action", () => {
  expect(files).toHaveLength(8);
  expect(actions.length).toBeGreaterThanOrEqual(22);
  for (const [, fn] of actions) expect(typeof fn).toBe("function");
});

it.each(actions)("%s rejects a non-owner before the db", async (_n, fn) => {
  await expect((fn as (i: unknown) => Promise<unknown>)({})).rejects.toThrow(
    "NOT_OWNER",
  );
});
