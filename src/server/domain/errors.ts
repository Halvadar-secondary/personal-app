export type DomainErrorCode =
  | "invalid_input"
  | "not_found"
  | "invalid_state"
  | "conflict"
  | "already_undone";

/** An expected failure that adapters turn into a user-facing message. */
export class DomainError extends Error {
  constructor(
    readonly code: DomainErrorCode,
    readonly details?: unknown,
  ) {
    super(code);
    this.name = "DomainError";
  }
}

/** Throws not_found when a lookup came back empty (missing, deleted or another owner's). */
export function found<T>(row: T | undefined): T {
  if (row === undefined) throw new DomainError("not_found");
  return row;
}
