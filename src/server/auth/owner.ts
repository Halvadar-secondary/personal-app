export function normalizeEmail(e: string | null | undefined): string {
  return (e ?? "").trim().toLowerCase();
}

/** True only when both are non-empty and equal after normalisation (fails closed). */
export function isOwnerEmail(
  email: string | null | undefined,
  ownerEmail: string | undefined,
): boolean {
  const a = normalizeEmail(email);
  const b = normalizeEmail(ownerEmail);
  return a !== "" && b !== "" && a === b;
}

export class NotOwnerError extends Error {
  constructor() {
    super("Not the owner");
    this.name = "NotOwnerError";
  }
}

export function checkOwner(
  session: { user: { id: string; email: string } } | null,
  ownerEmail: string | undefined,
): { id: string; email: string } {
  if (!session || !isOwnerEmail(session.user.email, ownerEmail))
    throw new NotOwnerError();
  return { id: session.user.id, email: session.user.email };
}
