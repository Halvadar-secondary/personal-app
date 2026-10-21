// Post-deploy check: pnpm smoke <url> --env <environment> [--build <sha>] [--expect-no-password]
import { parseArgs } from "node:util";
import {
  evaluateHealth,
  evaluatePasswordProbe,
  type Verdict,
} from "./lib/smoke";

const ATTEMPTS = 5;
const DELAY_MS = 10_000;
const TIMEOUT_MS = 10_000;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    env: { type: "string" },
    build: { type: "string" },
    "expect-no-password": { type: "boolean", default: false },
  },
});

const baseUrl = positionals[0]?.replace(/\/$/, "");
if (!baseUrl || !values.env) {
  console.error(
    "usage: smoke <url> --env <environment> [--build <sha>] [--expect-no-password]",
  );
  process.exit(2);
}

async function checkHealth(): Promise<Verdict> {
  try {
    const res = await fetch(`${baseUrl}/api/health`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "cache-control": "no-cache" },
    });
    const body: unknown = await res.json().catch(() => null);
    return evaluateHealth(res.status, body, {
      environment: values.env!,
      buildId: values.build,
    });
  } catch (e) {
    return {
      ok: false,
      reason: `health request failed: ${(e as Error).message}`,
    };
  }
}

async function checkPassword(): Promise<Verdict> {
  const res = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
    method: "POST",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { "content-type": "application/json", origin: baseUrl! },
    body: JSON.stringify({
      email: "smoke@invalid.test",
      password: "not-a-real-password",
    }),
  });
  const body: unknown = await res.json().catch(() => null);
  return evaluatePasswordProbe(res.status, body);
}

async function main() {
  let health: Verdict = { ok: false, reason: "not checked" };
  for (let i = 1; i <= ATTEMPTS; i++) {
    health = await checkHealth();
    if (health.ok) break;
    console.log(`attempt ${i}/${ATTEMPTS}: ${health.reason}`);
    if (i < ATTEMPTS) await new Promise((r) => setTimeout(r, DELAY_MS));
  }
  if (!health.ok) {
    console.error(`smoke failed: ${health.reason}`);
    process.exit(1);
  }
  if (values["expect-no-password"]) {
    const pw = await checkPassword();
    if (!pw.ok) {
      console.error(`smoke failed: ${pw.reason}`);
      process.exit(1);
    }
  }
  console.log("smoke ok");
}

void main();
