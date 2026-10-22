import { describe, expect, it } from "vitest";
import { checkOwner, isOwnerEmail, NotOwnerError } from "./owner";

describe("isOwnerEmail", () => {
  it.each([
    ["Me@X.com ", "me@x.com", true],
    ["me@x.com", "you@x.com", false],
    ["me@x.com", undefined, false],
    ["me@x.com", "", false],
    ["", "", false],
    [null, "me@x.com", false],
  ] as const)("isOwnerEmail(%j, %j) = %s", (e, o, r) => {
    expect(isOwnerEmail(e, o)).toBe(r);
  });
});

describe("checkOwner", () => {
  it("rejects no session", () => {
    expect(() => checkOwner(null, "me@x.com")).toThrow(NotOwnerError);
  });
  it("rejects a non-owner user", () => {
    expect(() =>
      checkOwner({ user: { id: "2", email: "you@x.com" } }, "me@x.com"),
    ).toThrow(NotOwnerError);
  });
  it("fails closed with no OWNER_EMAIL", () => {
    expect(() =>
      checkOwner({ user: { id: "1", email: "me@x.com" } }, undefined),
    ).toThrow(NotOwnerError);
  });
  it("accepts the owner", () => {
    expect(
      checkOwner({ user: { id: "1", email: "ME@x.com" } }, "me@x.com"),
    ).toEqual({
      id: "1",
      email: "ME@x.com",
    });
  });
});
