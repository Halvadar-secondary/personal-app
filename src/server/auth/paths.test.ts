import { describe, expect, it } from "vitest";
import { isPublicPath, safeNextPath } from "./paths";

describe("isPublicPath", () => {
  it.each([
    "/login",
    "/api/health",
    "/api/auth/sign-in/social",
    "/api/auth/callback/google",
    // Sentry's tunnel: the browser posts error reports without a session.
    "/monitoring",
    // The version banner's poll: no session lookup, so no database query.
    "/api/version",
    // Phones fetch these for Add to Home Screen, often without cookies.
    "/manifest.webmanifest",
    "/apple-icon.png",
    "/icon.png",
    "/icons/icon-192.png",
  ])("%s is public", (p) => expect(isPublicPath(p)).toBe(true));
  it.each([
    "/",
    "/areas/1",
    "/api/mcpx",
    "/oauth/consent",
    "/.well-knownx",
    "/loginx",
    "/api/healthz",
    "/api/authx",
    "/monitoringx",
    "/iconsx",
  ])("%s is private", (p) => expect(isPublicPath(p)).toBe(false));
});

it("MCP endpoint and well-known metadata are public; consent is not", () => {
  // The MCP route authenticates by bearer token, and AI clients must read
  // the metadata before they have one.
  expect(isPublicPath("/api/mcp")).toBe(true);
  expect(isPublicPath("/.well-known/oauth-protected-resource/api/mcp")).toBe(
    true,
  );
  expect(isPublicPath("/.well-known/oauth-authorization-server")).toBe(true);
  expect(isPublicPath("/oauth/consent")).toBe(false);
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
