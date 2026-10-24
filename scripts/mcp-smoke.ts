// Post-deploy MCP check: pnpm tsx scripts/mcp-smoke.ts <url>
// Unauthenticated on purpose: production has no password login, so no
// scripted token. The full OAuth flow runs in e2e/mcp.spec.ts on every PR.
// VERCEL_AUTOMATION_BYPASS_SECRET, when set, gets the probes past deployment protection.
import { smokeHeaders } from "./lib/smoke";

const TIMEOUT_MS = 10_000;

const origin = process.argv[2]?.replace(/\/$/, "");
if (!origin) {
  console.error("usage: mcp-smoke <url>");
  process.exit(2);
}
const headers = smokeHeaders(process.env.VERCEL_AUTOMATION_BYPASS_SECRET);
const problems: string[] = [];
const check = (ok: boolean, what: string) => {
  if (!ok) problems.push(what);
};

async function getJson(url: string): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  check(res.ok, `${url} answered ${res.status}`);
  return ((await res.json().catch(() => null)) ?? {}) as Record<
    string,
    unknown
  >;
}

async function main() {
  const res = await fetch(`${origin}/api/mcp`, {
    method: "POST",
    headers: {
      ...headers,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  check(res.status === 401, `POST /api/mcp answered ${res.status}, not 401`);
  const challenge = res.headers.get("www-authenticate") ?? "";
  const metadataUrl = /resource_metadata="([^"]+)"/.exec(challenge)?.[1] ?? "";
  check(
    metadataUrl.startsWith(`${origin}/.well-known/oauth-protected-resource`),
    `WWW-Authenticate doesn't point at this origin's metadata: "${challenge}"`,
  );

  if (metadataUrl) {
    const resource = await getJson(metadataUrl);
    check(
      resource.resource === `${origin}/api/mcp`,
      `protected resource is ${String(resource.resource)}`,
    );
    const servers = (resource.authorization_servers ?? []) as string[];
    check(
      servers.some((s) => s.startsWith(origin!)),
      `authorization servers ${JSON.stringify(servers)} don't name ${origin}`,
    );
  }

  const as = await getJson(`${origin}/.well-known/oauth-authorization-server`);
  check(
    String(as.issuer ?? "").startsWith(origin!),
    `issuer is ${String(as.issuer)}`,
  );
  check(
    String(as.authorization_endpoint ?? "").startsWith(origin!),
    `authorization endpoint is ${String(as.authorization_endpoint)}`,
  );

  if (problems.length) {
    for (const p of problems) console.error(`MCP smoke: ${p}`);
    process.exit(1);
  }
  console.log("MCP smoke ok");
}

void main();
