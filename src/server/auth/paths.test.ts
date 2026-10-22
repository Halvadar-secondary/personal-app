import { describe, expect, it } from "vitest";
import { isPublicPath, safeNextPath } from "./paths";

describe("isPublicPath", () => {
  it.each([
    "/login",
    "/api/health",
    "/api/auth/sign-in/social",
    "/api/auth/callback/google",
  ])("%s is public", (p) => expect(isPublicPath(p)).toBe(true));
  it.each([
    "/",
    "/areas/1",
    "/api/mcp",
    "/loginx",
    "/api/healthz",
    "/api/authx",
  ])("%s is private", (p) => expect(isPublicPath(p)).toBe(false));
});

describe("safeNextPath", () => {
  it.each([
    ["/areas/1", "/areas/1"],
    [null, "/"],
    ["https://evil.com", "/"],
    ["//evil.com", "/"],
    ["/\\evil.com", "/"],
    ["/ok\n", "/"],
  ])("safeNextPath(%j) -> %s", (i, o) => expect(safeNextPath(i)).toBe(o));
});
