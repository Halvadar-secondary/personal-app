import "server-only";
import { getDb } from "@/server/db/client";
import { type Auth, createAuth } from "./auth";

let auth: Auth | undefined;

/** The app's Better Auth instance, created on first use so builds don't need runtime secrets. */
export function getAuth(): Auth {
  auth ??= createAuth(getDb(), process.env);
  return auth;
}
