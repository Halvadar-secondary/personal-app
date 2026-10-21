import { passkey } from "@better-auth/passkey";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import * as schema from "@/server/db/schema";
import type { Db } from "@/server/db/types";
import { passwordLoginEnabled, rateLimitEnabled } from "./config";
import { isOwnerEmail } from "./owner";

type AuthEnv = Record<string, string | undefined>;

function trustedOrigins(env: AuthEnv): string[] {
  return [
    env.BETTER_AUTH_URL,
    env.VERCEL_URL && `https://${env.VERCEL_URL}`,
    env.VERCEL_BRANCH_URL && `https://${env.VERCEL_BRANCH_URL}`,
  ].filter((o): o is string => Boolean(o));
}

export function createAuth(db: Db, env: AuthEnv) {
  const baseURL = env.BETTER_AUTH_URL;
  return betterAuth({
    baseURL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: trustedOrigins(env),
    rateLimit: { enabled: rateLimitEnabled(env) },
    database: drizzleAdapter(db, { provider: "pg", schema }),
    emailAndPassword: {
      enabled: passwordLoginEnabled(env),
      disableSignUp: true,
    },
    socialProviders: env.GOOGLE_CLIENT_ID
      ? {
          google: {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET ?? "",
          },
        }
      : {},
    plugins: [
      passkey({
        rpName: "Life Goals",
        rpID: baseURL ? new URL(baseURL).hostname : undefined,
        origin: baseURL ? new URL(baseURL).origin : undefined,
      }),
      nextCookies(),
    ],
    databaseHooks: {
      user: {
        create: {
          // Layer 1 of the owner lock: nobody else can ever get a user row.
          before: async (user) => {
            if (
              !user.emailVerified ||
              !isOwnerEmail(user.email, env.OWNER_EMAIL)
            ) {
              throw new APIError("FORBIDDEN", {
                message: "Sign-ups are closed",
              });
            }
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
