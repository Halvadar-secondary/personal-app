import { describe, expect, it } from "vitest";
import { evaluateHealth, evaluatePasswordProbe, smokeHeaders } from "./smoke";

const good = {
  ok: true,
  db: "up",
  schemaVersion: 2,
  buildId: "abc",
  environment: "production",
};

describe("evaluateHealth", () => {
  it("accepts a healthy matching response", () => {
    expect(
      evaluateHealth(200, good, { environment: "production", buildId: "abc" }),
    ).toEqual({
      ok: true,
    });
  });
  it("rejects 503", () => {
    expect(
      evaluateHealth(
        503,
        { ...good, ok: false, db: "down" },
        { environment: "production" },
      ).ok,
    ).toBe(false);
  });
  it("rejects wrong environment", () => {
    expect(
      evaluateHealth(
        200,
        { ...good, environment: "preview" },
        { environment: "production" },
      ).ok,
    ).toBe(false);
  });
  it("rejects stale build", () => {
    expect(
      evaluateHealth(200, good, { environment: "production", buildId: "def" })
        .ok,
    ).toBe(false);
  });
  it("rejects a schema older than the deployed migrations", () => {
    expect(
      evaluateHealth(200, good, { environment: "production", minSchema: 3 }).ok,
    ).toBe(false);
  });
  it("accepts a schema at or above the deployed migrations", () => {
    expect(
      evaluateHealth(200, good, { environment: "production", minSchema: 2 }).ok,
    ).toBe(true);
  });
  it("rejects a missing schema version when one is expected", () => {
    expect(
      evaluateHealth(
        200,
        { ...good, schemaVersion: null },
        { environment: "production", minSchema: 1 },
      ).ok,
    ).toBe(false);
  });
  it("rejects non-JSON / malformed body", () => {
    expect(
      evaluateHealth(200, "<html>", { environment: "production" }).ok,
    ).toBe(false);
  });
});

describe("smokeHeaders", () => {
  it("sends no bypass without a secret", () => {
    expect(smokeHeaders(undefined)).toEqual({ "cache-control": "no-cache" });
  });
  it("sends only the bypass header, never the cookie request fetch would loop on", () => {
    expect(smokeHeaders("s3cret")).toEqual({
      "cache-control": "no-cache",
      "x-vercel-protection-bypass": "s3cret",
    });
  });
});

describe("evaluatePasswordProbe", () => {
  const disabled = { code: "EMAIL_PASSWORD_DISABLED" };
  it("accepts the disabled error", () => {
    expect(evaluatePasswordProbe(400, disabled).ok).toBe(true);
  });
  it("accepts a missing endpoint", () => {
    expect(evaluatePasswordProbe(404, null).ok).toBe(true);
  });
  it("rejects invalid-credentials (means password sign-in is ON)", () => {
    expect(
      evaluatePasswordProbe(401, { code: "INVALID_EMAIL_OR_PASSWORD" }).ok,
    ).toBe(false);
  });
  it("rejects success", () => {
    expect(evaluatePasswordProbe(200, {}).ok).toBe(false);
  });
  it("rejects other 400s and 5xx", () => {
    expect(evaluatePasswordProbe(400, { code: "OTHER" }).ok).toBe(false);
    expect(evaluatePasswordProbe(500, null).ok).toBe(false);
  });
});
