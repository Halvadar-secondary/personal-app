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
