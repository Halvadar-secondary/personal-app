import { describe, expect, it } from "vitest";
import { securityHeaders } from "./security-headers";

const h = Object.fromEntries(securityHeaders().map((x) => [x.key, x.value]));

describe("securityHeaders", () => {
  it("sets CSP with frame-ancestors none", () => {
    expect(h["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    expect(h["Content-Security-Policy"]).toContain(
      "form-action 'self' https://accounts.google.com",
    );
  });
  it("sets HSTS, referrer and nosniff", () => {
    expect(h["Strict-Transport-Security"]).toBe(
      "max-age=63072000; includeSubDomains; preload",
    );
    expect(h["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
  });
});
