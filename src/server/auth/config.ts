/** Email+password sign-in: never in production, and only when explicitly enabled. */
export function passwordLoginEnabled(env: {
  APP_ENV?: string;
  ENABLE_PASSWORD_LOGIN?: string;
}): boolean {
  return env.APP_ENV !== "production" && env.ENABLE_PASSWORD_LOGIN === "true";
}
