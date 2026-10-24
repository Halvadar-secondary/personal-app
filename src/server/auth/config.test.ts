import { describe, expect, it } from "vitest";
import { appOrigin, passwordLoginEnabled, rateLimitEnabled } from "./config";

describe("passwordLoginEnabled", () => {
  it.each([
    [{ APP_ENV: "production", ENABLE_PASSWORD_LOGIN: "true" }, false],
    [{ APP_ENV: "preview", ENABLE_PASSWORD_LOGIN: "true" }, true],
    [{ APP_ENV: "local", ENABLE_PASSWORD_LOGIN: "true" }, true],
    [{ ENABLE_PASSWORD_LOGIN: "true" }, true],
    [{ APP_ENV: "preview" }, false],
    [{ APP_ENV: "preview", ENABLE_PASSWORD_LOGIN: "1" }, false],
    // Vercel sets VERCEL_ENV itself, so a missing or wrong APP_ENV can't switch it on in prod.
    [{ VERCEL_ENV: "production", ENABLE_PASSWORD_LOGIN: "true" }, false],
    [
      {
        APP_ENV: "preview",
        VERCEL_ENV: "production",
        ENABLE_PASSWORD_LOGIN: "true",
      },
      false,
    ],
  ])("passwordLoginEnabled(%j) = %s", (env, r) => {
    expect(passwordLoginEnabled(env)).toBe(r);
  });
});

describe("rateLimitEnabled", () => {
  it.each([
    [{ APP_ENV: "production" }, true],
    [{ APP_ENV: "preview" }, false],
    [{ APP_ENV: "local" }, false],
    [{}, false],
    [{ VERCEL_ENV: "production" }, true],
  ])("rateLimitEnabled(%j) = %s", (env, r) => {
    expect(rateLimitEnabled(env)).toBe(r);
  });
});

describe("appOrigin", () => {
  it.each([
    [{ BETTER_AUTH_URL: "https://goals.example" }, "https://goals.example"],
    // Previews have no BETTER_AUTH_URL; each deployment has its own URL.
    [{ VERCEL_URL: "app-git-x.vercel.app" }, "https://app-git-x.vercel.app"],
    [
      { BETTER_AUTH_URL: "https://goals.example", VERCEL_URL: "p.vercel.app" },
      "https://goals.example",
    ],
    [{}, "http://localhost:3000"],
  ])("appOrigin(%j) = %s", (env, origin) => {
    expect(appOrigin(env)).toBe(origin);
  });
});
