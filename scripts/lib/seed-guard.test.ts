import { describe, expect, it } from "vitest";
import { assertSeedable } from "./seed-guard";

describe("assertSeedable", () => {
  it("allows the e2e owner outside production", () => {
    expect(() =>
      assertSeedable("owner@e2e.test", { APP_ENV: "local" }),
    ).not.toThrow();
  });

  it("refuses a real account", () => {
    expect(() => assertSeedable("levan@gmail.com", {})).toThrow(/e2e\.test/);
    expect(() => assertSeedable("owner@e2e.test.evil.com", {})).toThrow();
  });

  it("refuses production by either env var", () => {
    expect(() =>
      assertSeedable("owner@e2e.test", { APP_ENV: "production" }),
    ).toThrow(/production/);
    expect(() =>
      assertSeedable("owner@e2e.test", { VERCEL_ENV: "production" }),
    ).toThrow(/production/);
  });

  it("refuses a missing email", () => {
    expect(() => assertSeedable(undefined, {})).toThrow();
  });
});
