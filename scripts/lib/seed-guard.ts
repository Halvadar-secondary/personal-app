/** The seed only ever writes to the E2E test owner, and never in production. */
export function assertSeedable(
  ownerEmail: string | undefined,
  env: { APP_ENV?: string; VERCEL_ENV?: string },
): void {
  if (env.APP_ENV === "production" || env.VERCEL_ENV === "production") {
    throw new Error("refusing to seed in production");
  }
  if (!ownerEmail?.endsWith("@e2e.test")) {
    throw new Error(
      `refusing to seed ${ownerEmail ?? "(no email)"}: only @e2e.test owners`,
    );
  }
}
