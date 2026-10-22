export type Verdict = { ok: true } | { ok: false; reason: string };

export function evaluateHealth(
  status: number,
  body: unknown,
  expect: { environment: string; buildId?: string; minSchema?: number },
): Verdict {
  if (status !== 200) return { ok: false, reason: `health returned ${status}` };
  if (typeof body !== "object" || body === null) {
    return { ok: false, reason: "health body is not JSON" };
  }
  const h = body as Record<string, unknown>;
  if (h.ok !== true || h.db !== "up")
    return { ok: false, reason: "health reports not ok" };
  if (h.environment !== expect.environment) {
    return {
      ok: false,
      reason: `environment is ${String(h.environment)}, expected ${expect.environment}`,
    };
  }
  if (expect.buildId && h.buildId !== expect.buildId) {
    return {
      ok: false,
      reason: `build is ${String(h.buildId)}, expected ${expect.buildId}`,
    };
  }
  if (
    expect.minSchema !== undefined &&
    !(
      typeof h.schemaVersion === "number" && h.schemaVersion >= expect.minSchema
    )
  ) {
    return {
      ok: false,
      reason: `schema is ${String(h.schemaVersion)}, expected at least ${expect.minSchema}`,
    };
  }
  return { ok: true };
}

/** Request headers for smoke probes; the bypass gets through Vercel deployment protection. */
export function smokeHeaders(
  bypass: string | undefined,
): Record<string, string> {
  return bypass
    ? { "cache-control": "no-cache", "x-vercel-protection-bypass": bypass }
    : { "cache-control": "no-cache" };
}

/** Password sign-in must be switched off: Better Auth answers 400 EMAIL_PASSWORD_DISABLED. */
export function evaluatePasswordProbe(status: number, body: unknown): Verdict {
  if (status === 404) return { ok: true };
  const code = (body as { code?: unknown } | null)?.code;
  if (status === 400 && code === "EMAIL_PASSWORD_DISABLED") return { ok: true };
  return {
    ok: false,
    reason: `password sign-in looks enabled (status ${status}, code ${String(code)})`,
  };
}
