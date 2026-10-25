import { expect, it } from "vitest";
import { forwardSetCookies } from "./forward-cookies";

it("copies every set-cookie across", () => {
  const from = new Headers();
  from.append("set-cookie", "a=1; Path=/");
  from.append("set-cookie", "b=2; Path=/; HttpOnly");
  const to = new Headers({ "x-keep": "yes" });
  forwardSetCookies(from, to);
  expect(to.getSetCookie()).toEqual(["a=1; Path=/", "b=2; Path=/; HttpOnly"]);
  expect(to.get("x-keep")).toBe("yes");
});

it("leaves the response alone when there are none", () => {
  const to = new Headers({ "x-keep": "yes" });
  forwardSetCookies(new Headers(), to);
  expect(to.getSetCookie()).toEqual([]);
  expect([...to.keys()]).toEqual(["x-keep"]);
});
