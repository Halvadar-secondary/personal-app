import { describe, expect, it } from "vitest";
import { passwordLoginEnabled } from "./config";

describe("passwordLoginEnabled", () => {
  it.each([
    [{ APP_ENV: "production", ENABLE_PASSWORD_LOGIN: "true" }, false],
    [{ APP_ENV: "preview", ENABLE_PASSWORD_LOGIN: "true" }, true],
    [{ APP_ENV: "local", ENABLE_PASSWORD_LOGIN: "true" }, true],
    [{ ENABLE_PASSWORD_LOGIN: "true" }, true],
    [{ APP_ENV: "preview" }, false],
    [{ APP_ENV: "preview", ENABLE_PASSWORD_LOGIN: "1" }, false],
  ])("passwordLoginEnabled(%j) = %s", (env, r) => {
    expect(passwordLoginEnabled(env)).toBe(r);
  });
});
