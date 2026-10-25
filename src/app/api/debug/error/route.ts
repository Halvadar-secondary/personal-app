import { connection } from "next/server";
import { requireOwnerApi } from "@/server/auth/require-owner";

/** Owner-only: throws on purpose, to prove Sentry capture and source maps in production. */
export async function GET(req: Request) {
  // Dynamic first: the build sees auth env as placeholders, so auth must not run while prerendering.
  await connection();
  const owner = await requireOwnerApi(req);
  if (owner instanceof Response) return owner;
  throw new Error("Sentry test error");
}
