const PUBLIC_EXACT = new Set(["/login", "/api/health"]);
const PUBLIC_PREFIXES = ["/api/auth/"];

export function isPublicPath(pathname: string): boolean {
  return (
    PUBLIC_EXACT.has(pathname) ||
    PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))
  );
}

/** Only same-origin relative paths survive; anything else falls back to "/". */
export function safeNextPath(next: string | null): string {
  if (!next || !next.startsWith("/")) return "/";
  if (next[1] === "/" || next[1] === "\\") return "/";
  if (/[\u0000-\u001f\u007f]/.test(next)) return "/";
  return next;
}
