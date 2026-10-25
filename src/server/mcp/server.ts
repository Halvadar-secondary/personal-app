import { McpServer } from "@modelcontextprotocol/server";
import type { z } from "zod";
import { messageFor } from "@/server/messages";
import type { Action } from "@/server/domain/context";
import { DomainError } from "@/server/domain/errors";
import { TOOLS } from "./tools";

export type RunAction = <S extends z.ZodType, O>(
  action: Action<S, O>,
  input: z.input<S>,
) => Promise<O>;

const failed = (text: string) => ({
  isError: true,
  content: [{ type: "text" as const, text }],
});

/**
 * The MCP server: every tool in TOOLS, run through the caller's `run`.
 * `onUnexpected` hears about errors the model is only told "went wrong".
 */
export function createLifeGoalsServer(
  run: RunAction,
  onUnexpected?: (error: unknown, tool: string) => void,
): McpServer {
  const server = new McpServer({ name: "life-goals", version: "1.0.0" });
  for (const tool of TOOLS) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.action.input,
        annotations: { destructiveHint: tool.destructive ?? false },
      },
      async (input: unknown) => {
        try {
          const output = await run(tool.action, input);
          return {
            content: [
              { type: "text" as const, text: tool.summary(output, input) },
              { type: "text" as const, text: JSON.stringify(output) },
            ],
          };
        } catch (e) {
          if (e instanceof DomainError)
            return failed(messageFor(e.code, e.details));
          // Nothing unexpected leaks to the model.
          console.error("mcp tool failed", tool.name, e);
          onUnexpected?.(e, tool.name);
          return failed("Something went wrong. Try again.");
        }
      },
    );
  }
  return server;
}
