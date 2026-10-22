import type { FullConfig } from "@playwright/test";

// Refuse to run against production, or against an app that isn't healthy.
export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use.baseURL;
  // Only the bypass header: asking Vercel to set the bypass cookie answers with
  // a redirect that fetch (which keeps no cookies) follows forever.
  const bypass =
    config.projects[0]?.use.extraHTTPHeaders?.["x-vercel-protection-bypass"];
  const headers: Record<string, string> = bypass
    ? { "x-vercel-protection-bypass": bypass }
    : {};
  const res = await fetch(`${baseURL}/api/health`, { headers });
  const health = (await res.json()) as { ok?: boolean; environment?: string };
  if (health.environment === "production") {
    throw new Error("E2E must never run against production");
  }
  if (health.ok !== true) {
    throw new Error(`Target is unhealthy: ${JSON.stringify(health)}`);
  }
}
