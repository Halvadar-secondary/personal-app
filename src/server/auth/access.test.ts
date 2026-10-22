import { describe, expect, it } from "vitest";
import { decideAccess } from "./access";

const owner = { user: { id: "1", email: "me@x.com" } };
const intruder = { user: { id: "2", email: "you@x.com" } };

describe("decideAccess", () => {
  it("allows public paths without a session", () => {
    expect(decideAccess("/login", null, "me@x.com")).toBe("allow");
    expect(decideAccess("/api/health", null, "me@x.com")).toBe("allow");
  });
  it("sends anonymous page requests to login", () => {
    expect(decideAccess("/", null, "me@x.com")).toBe("login");
  });
  it("answers anonymous API requests with unauthorized", () => {
    expect(decideAccess("/api/mcp", null, "me@x.com")).toBe("unauthorized");
  });
  it("hides pages from a signed-in non-owner", () => {
    expect(decideAccess("/", intruder, "me@x.com")).toBe("not-found");
  });
  it("rejects a signed-in non-owner on APIs", () => {
    expect(decideAccess("/api/mcp", intruder, "me@x.com")).toBe("unauthorized");
  });
  it("fails closed when OWNER_EMAIL is unset", () => {
    expect(decideAccess("/", owner, undefined)).toBe("not-found");
  });
  it("allows the owner", () => {
    expect(decideAccess("/", owner, "me@x.com")).toBe("allow");
  });
});
