import { connection } from "next/server";
import { getDb } from "@/server/db/client";
import { checkHealth, type Environment } from "@/server/health";

const ENVIRONMENTS: Environment[] = ["local", "preview", "production"];

export async function GET() {
  // Request-time only: never prerender a health check.
  await connection();
  const appEnv = process.env.APP_ENV as Environment | undefined;
  const health = await checkHealth(getDb(), {
    buildId: process.env.APP_BUILD_ID ?? "dev",
    environment: appEnv && ENVIRONMENTS.includes(appEnv) ? appEnv : "local",
  });
  return Response.json(health, {
    status: health.ok ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
