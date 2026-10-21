import "server-only";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getAuth } from "./instance";
import { checkOwner, NotOwnerError } from "./owner";

/** Owner check for pages and server actions (the proxy checks first). */
export async function requireOwner(): Promise<{ id: string; email: string }> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  try {
    return checkOwner(session, process.env.OWNER_EMAIL);
  } catch (e) {
    if (e instanceof NotOwnerError) notFound();
    throw e;
  }
}

/** Owner check for API routes: the owner, or a 401 response to return as-is. */
export async function requireOwnerApi(
  req: Request,
): Promise<Response | { id: string; email: string }> {
  const session = await getAuth().api.getSession({ headers: req.headers });
  try {
    return checkOwner(session, process.env.OWNER_EMAIL);
  } catch {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
}
