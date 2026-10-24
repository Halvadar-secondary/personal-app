import { requireMcpAuth } from "@better-auth/mcp";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { connection } from "next/server";
import { mcpResource } from "@/server/auth/auth";
import { getAuth } from "@/server/auth/instance";
import { getDb } from "@/server/db/client";
import { runAction } from "@/server/domain/context";
import { getOverview } from "@/server/domain/views";
import { authorizeMcp } from "@/server/mcp/access";

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
      const handler = createMcpHandler(() => {
        const server = new McpServer({ name: "life-goals", version: "1.0.0" });
        server.registerTool(
          "get_overview",
          {
            description: "Areas with level, XP, streak, counts and up next.",
            inputSchema: getOverview.input,
          },
          async () => {
            const o = await runAction(
              { db, ownerId: caller.ownerId, actor: caller.actor },
              getOverview,
              {},
            );
            return { content: [{ type: "text", text: JSON.stringify(o) }] };
          },
        );
        return server;
      });
      return handler.fetch(request);
    },
    { resource, requiredScopes: ["mcp:goals"] },
  )(req);
}
