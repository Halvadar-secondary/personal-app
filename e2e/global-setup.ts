import type { FullConfig } from "@playwright/test";

// Refuse to run against production, or against an app that isn't healthy.
export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use.baseURL;
  const headers = config.projects[0]?.use.extraHTTPHeaders;
  const res = await fetch(`${baseURL}/api/health`, { headers });
  const health = (await res.json()) as { ok?: boolean; environment?: string };
  if (health.environment === "production") {
    throw new Error("E2E must never run against production");
  }
  if (health.ok !== true) {
    throw new Error(`Target is unhealthy: ${JSON.stringify(health)}`);
  }
}
