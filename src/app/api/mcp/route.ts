import { requireMcpAuth } from "@better-auth/mcp";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { connection } from "next/server";
import { mcpResource } from "@/server/auth/auth";
import { getAuth } from "@/server/auth/instance";
import { getDb } from "@/server/db/client";
import { runAction } from "@/server/domain/context";
import { authorizeMcp } from "@/server/mcp/access";
import { createLifeGoalsServer } from "@/server/mcp/server";
import { hitRateLimit } from "@/server/rate-limit";

function refuse(status: 401 | 403, error: string, resource: string): Response {
  const headers = new Headers({ "content-type": "application/json" });
  if (status === 401) {
    const url = new URL(resource);
    headers.set(
      "www-authenticate",
      `Bearer error="invalid_token", resource_metadata="${url.origin}/.well-known/oauth-protected-resource${url.pathname}"`,
    );
  }
  return new Response(JSON.stringify({ error }), { status, headers });
}

// Token check (Better Auth), then owner + live consent (spec §7.3).
export async function POST(req: Request) {
  await connection();
  const resource = mcpResource(process.env);
  return requireMcpAuth(
    getAuth(),
    async (request, claims) => {
      const db = getDb();
      const caller = await authorizeMcp(
        db,
        claims,
        process.env.OWNER_EMAIL,
        new Date(),
      );
      if ("status" in caller)
        return refuse(caller.status, caller.error, resource);
      // Spec §6.2: 120 requests a minute per owner + client.
      const limited = await hitRateLimit(
        db,
        `mcp:${caller.ownerId}:${caller.clientId}`,
        120,
        60_000,
        new Date(),
      );
      if (!limited.ok) {
        return Response.json(
          { error: "rate_limited" },
          {
            status: 429,
            headers: { "retry-after": String(limited.retryAfterSeconds) },
          },
        );
      }
      const deps = { db, ownerId: caller.ownerId, actor: caller.actor };
      const handler = createMcpHandler(() =>
        createLifeGoalsServer((action, input) =>
          runAction(deps, action, input),
        ),
      );
      return handler.fetch(request);
    },
    { resource, requiredScopes: ["mcp:goals"] },
  )(req);
}
