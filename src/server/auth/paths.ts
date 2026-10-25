// /api/mcp authenticates by bearer token in its own route, and AI clients
// read /.well-known/* before they have one. /monitoring is Sentry's tunnel.
// Phones fetch the manifest and icons for Add to Home Screen without cookies.
const PUBLIC_EXACT = new Set([
  "/login",
  "/api/health",
  "/api/mcp",
  "/monitoring",
  "/manifest.webmanifest",
  "/apple-icon.png",
  "/icon.png",
]);
const PUBLIC_PREFIXES = ["/api/auth/", "/.well-known/", "/icons/"];

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
