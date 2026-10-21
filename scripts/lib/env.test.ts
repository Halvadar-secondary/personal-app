import { afterEach, describe, expect, it } from "vitest";
import { requireEnv } from "./env";

afterEach(() => {
  delete process.env.TEST_REQUIRE_ENV;
});

describe("requireEnv", () => {
  it("returns the value", () => {
    process.env.TEST_REQUIRE_ENV = "v";
    expect(requireEnv("TEST_REQUIRE_ENV")).toBe("v");
  });
  it("throws for unset", () => {
    expect(() => requireEnv("TEST_REQUIRE_ENV")).toThrow(
      "Missing env: TEST_REQUIRE_ENV",
    );
  });
  it("throws for empty", () => {
    process.env.TEST_REQUIRE_ENV = "";
    expect(() => requireEnv("TEST_REQUIRE_ENV")).toThrow(
      "Missing env: TEST_REQUIRE_ENV",
    );
  });
});
