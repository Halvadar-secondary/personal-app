/** Copies every Set-Cookie from an auth API response onto ours. */
export function forwardSetCookies(from: Headers, to: Headers): void {
  for (const cookie of from.getSetCookie()) to.append("set-cookie", cookie);
}
