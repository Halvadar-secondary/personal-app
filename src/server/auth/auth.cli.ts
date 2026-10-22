// Entry point for `auth generate` (schema generation) only; never imported by the app.
import { drizzle } from "drizzle-orm/node-postgres";
import type { Db } from "@/server/db/types";
import { createAuth } from "./auth";

export const auth = createAuth(drizzle.mock() as unknown as Db, {
  BETTER_AUTH_URL: "http://localhost:3000",
  ENABLE_PASSWORD_LOGIN: "true",
});
