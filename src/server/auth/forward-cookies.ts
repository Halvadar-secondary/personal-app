/** Copies every Set-Cookie from an auth API response onto ours. */
export function forwardSetCookies(from: Headers, to: Headers): void {
  for (const cookie of from.getSetCookie()) to.append("set-cookie", cookie);
}

/**
 * Forwards only the signed session copy. A refreshed session token is left
 * for the next request: one racing a sign-out could land after the sign-out
 * cleared it and sign this device back in.
 */
export function forwardSessionCache(from: Headers, to: Headers): void {
  const cache = new Headers();
  for (const cookie of from.getSetCookie()) {
    const name = cookie.slice(0, cookie.indexOf("="));
    if (name.endsWith(".session_data")) cache.append("set-cookie", cookie);
  }
  forwardSetCookies(cache, to);
}
