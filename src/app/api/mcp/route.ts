import { requireMcpAuth } from "@better-auth/mcp";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { connection } from "next/server";
import { mcpResource } from "@/server/auth/auth";
import { getAuth } from "@/server/auth/instance";
import { getDb } from "@/server/db/client";
import { runAction } from "@/server/domain/context";
import { getOverview } from "@/server/domain/views";

// Spike: one tool behind Better Auth's token check (spec §7).
export async function POST(req: Request) {
  await connection();
  const auth = getAuth();
  return requireMcpAuth(
    auth,
    (request, claims) => {
      const ownerId = String(claims.sub);
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
              { db: getDb(), ownerId, actor: "mcp:spike" },
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
    { resource: mcpResource(process.env), requiredScopes: ["mcp:goals"] },
  )(req);
}
