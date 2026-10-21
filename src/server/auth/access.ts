import { isOwnerEmail } from "./owner";
import { isPublicPath } from "./paths";

export type Access = "allow" | "login" | "not-found" | "unauthorized";

/** The proxy's per-request decision; it runs before rendering, so status codes are real. */
export function decideAccess(
  pathname: string,
  session: { user: { email: string } } | null,
  ownerEmail: string | undefined,
): Access {
  if (isPublicPath(pathname)) return "allow";
  const isApi = pathname.startsWith("/api/");
  if (!session) return isApi ? "unauthorized" : "login";
  if (!isOwnerEmail(session.user.email, ownerEmail))
    return isApi ? "unauthorized" : "not-found";
  return "allow";
}
