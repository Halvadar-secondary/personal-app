import type { Auth } from "./auth";
import { normalizeEmail } from "./owner";

/**
 * Creates a user with a password credential through Better Auth's internal adapter, so the
 * owner-lock creation hook still runs. For provisioning scripts only — never call from routes.
 */
export async function createUserWithPassword(
  auth: Auth,
  email: string,
  password: string,
): Promise<{ id: string; email: string }> {
  const ctx = await auth.$context;
  const user = await ctx.internalAdapter.createUser(
    {
      email: normalizeEmail(email),
      name: email,
      emailVerified: true,
    },
    { method: "admin" },
  );
  await ctx.internalAdapter.linkAccount({
    userId: user.id,
    providerId: "credential",
    accountId: user.id,
    password: await ctx.password.hash(password),
  });
  return { id: user.id, email: user.email };
}
