type DeployEnv = { APP_ENV?: string; VERCEL_ENV?: string };

/** Production if either we say so or Vercel does: VERCEL_ENV is set by the platform, not by hand. */
function isProduction(env: DeployEnv): boolean {
  return env.APP_ENV === "production" || env.VERCEL_ENV === "production";
}

/** Email+password sign-in: never in production, and only when explicitly enabled. */
export function passwordLoginEnabled(
  env: DeployEnv & { ENABLE_PASSWORD_LOGIN?: string },
): boolean {
  return !isProduction(env) && env.ENABLE_PASSWORD_LOGIN === "true";
}

/** Auth rate limiting: on in production; off in local/preview, where E2E signs in repeatedly. */
export function rateLimitEnabled(env: DeployEnv): boolean {
  return isProduction(env);
}

/**
 * The app's public origin: BETTER_AUTH_URL where set (production, local),
 * else this deployment's own URL (Vercel previews), else local dev.
 */
export function appOrigin(env: {
  BETTER_AUTH_URL?: string;
  VERCEL_URL?: string;
}): string {
  if (env.BETTER_AUTH_URL) return env.BETTER_AUTH_URL;
  if (env.VERCEL_URL) return `https://${env.VERCEL_URL}`;
  return "http://localhost:3000";
}
