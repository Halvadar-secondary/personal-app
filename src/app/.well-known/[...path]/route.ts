import { connection } from "next/server";
import { getAuth } from "@/server/auth/instance";

/**
 * OAuth discovery at the origin root (RFC 8414 / 9728). Better Auth's MCP
 * plugin answers protected-resource metadata at the root path itself; the
 * other documents live under its /api/auth base path.
 */
export async function GET(req: Request) {
  await connection();
  const url = new URL(req.url);
  if (!url.pathname.startsWith("/.well-known/oauth-protected-resource")) {
    url.pathname = `/api/auth${url.pathname}`;
  }
  return getAuth().handler(new Request(url, req));
}
