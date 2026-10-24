import { cimd } from "@better-auth/cimd";
import { fetchClientMetadataResource } from "@better-auth/cimd/node";
import { mcp } from "@better-auth/mcp";
import { passkey } from "@better-auth/passkey";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { jwt } from "better-auth/plugins";
import * as schema from "@/server/db/schema";
import type { Db } from "@/server/db/types";
import { appOrigin, passwordLoginEnabled, rateLimitEnabled } from "./config";
import { isOwnerEmail } from "./owner";

type AuthEnv = Record<string, string | undefined>;

function trustedOrigins(env: AuthEnv): string[] {
  return [
    env.BETTER_AUTH_URL,
    env.VERCEL_URL && `https://${env.VERCEL_URL}`,
    env.VERCEL_BRANCH_URL && `https://${env.VERCEL_BRANCH_URL}`,
  ].filter((o): o is string => Boolean(o));
}

/** The MCP endpoint, as AI clients address it; tokens are bound to it. */
export function mcpResource(env: AuthEnv): string {
  return `${appOrigin(env)}/api/mcp`;
}

export function createAuth(db: Db, env: AuthEnv) {
  // Previews have no BETTER_AUTH_URL: MCP needs a fixed base for issuer and audience.
  const baseURL = appOrigin(env);
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
      // MCP (spec §7): the app is its own OAuth authorization server.
      jwt(),
      mcp({
        loginPage: "/login",
        consentPage: "/oauth/consent",
        resource: mcpResource(env),
        scopes: ["openid", "profile", "offline_access", "mcp:goals"],
        // Short-lived: JWTs can't be revoked, and the MCP route re-checks
        // consent on every call anyway.
        accessTokenExpiresIn: 15 * 60,
        // 2025-era clients still register themselves (spec §7.3); 2026 ones
        // use Client ID Metadata Documents (cimd below).
        allowDynamicClientRegistration: true,
        allowUnauthenticatedClientRegistration: true,
        clientRegistrationDefaultApplicationType: "infer",
      }),
      cimd({ fetchClientMetadataResource, metadataProfile: "mcp-2026-07-28" }),
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
