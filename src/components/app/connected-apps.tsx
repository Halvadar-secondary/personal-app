"use client";

import { Button } from "@/components/ui/button";
import { revokeAppAction } from "@/server/actions/connected";
import type { ConnectedApp } from "@/server/mcp/connected";
import { perform } from "./use-mutate";

/** Settings → Connected AI apps: each approved app, with Revoke. */
export function ConnectedApps({
  apps,
  mcpUrl,
}: {
  apps: ConnectedApp[];
  mcpUrl: string;
}) {
  if (apps.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No AI apps connected. Add this app&apos;s MCP URL in your AI app:{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-xs break-all">
          {mcpUrl}
        </code>
      </p>
    );
  }
  return (
    <ul className="flex flex-col divide-y rounded-md border">
      {apps.map((app) => (
        <li
          key={app.clientId}
          className="flex items-center justify-between gap-3 px-3 py-2"
        >
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium">{app.name}</span>
            <span className="text-xs text-muted-foreground">
              Last used {app.lastUsed}
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              perform(() => revokeAppAction({ clientId: app.clientId }), {
                success: `Revoked ${app.name}`,
              })
            }
          >
            Revoke
          </Button>
        </li>
      ))}
    </ul>
  );
}
