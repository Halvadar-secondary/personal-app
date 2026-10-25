import { expect, it } from "vitest";
import { forwardSessionCache, forwardSetCookies } from "./forward-cookies";

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

it("forwards only the session cache, never a refreshed session token", () => {
  // A token refresh racing a sign-out would land after the sign-out's
  // clearing cookie and sign this device back in.
  const from = new Headers();
  from.append("set-cookie", "better-auth.session_token=t; Path=/; HttpOnly");
  from.append("set-cookie", "better-auth.session_data=d; Path=/; HttpOnly");
  from.append(
    "set-cookie",
    "__Secure-better-auth.session_data=s; Path=/; Secure",
  );
  const to = new Headers();
  forwardSessionCache(from, to);
  expect(to.getSetCookie()).toEqual([
    "better-auth.session_data=d; Path=/; HttpOnly",
    "__Secure-better-auth.session_data=s; Path=/; Secure",
  ]);
});
