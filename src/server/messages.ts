import type { DomainErrorCode } from "@/server/domain/errors";

// What every adapter (UI and MCP) says for a domain refusal.

const MESSAGES: Record<DomainErrorCode, string> = {
  invalid_input: "That doesn't look right. Check what you entered.",
  not_found: "That item no longer exists. Refresh to see the latest.",
  invalid_state: "This page was out of date. It's been refreshed.",
  conflict: "Something changed since. Refresh and try again.",
  already_undone: "That was already undone.",
};

/** What changed since, by name, when a conflict says so. */
function changedLabels(details: unknown): string[] {
  const changed = (details as { changed?: { label?: unknown }[] } | undefined)
    ?.changed;
  return (changed ?? [])
    .map((c) => c.label)
    .filter((l): l is string => typeof l === "string");
}

/** Refusals that say why, beyond their code. */
const REASONS: Record<string, string> = {
  push: "Couldn't reach your devices. Turn the reminder off and on again here.",
  no_devices: "No device gets reminders yet. Turn the reminder on here first.",
};

export function messageFor(code: DomainErrorCode, details?: unknown): string {
  const reason = (details as { reason?: unknown } | undefined)?.reason;
  if (typeof reason === "string" && REASONS[reason]) return REASONS[reason];
  const labels = code === "conflict" ? changedLabels(details) : [];
  if (labels.length === 0) {
    // Named rows we couldn't label still mean "undo the newer change first":
    // telling the owner to retry would loop.
    const blocked = (details as { changed?: unknown[] } | undefined)?.changed;
    return code === "conflict" && blocked?.length
      ? "Something newer depends on this. Undo the later change first."
      : MESSAGES[code];
  }
  const shown = labels
    .slice(0, 3)
    .map((l) => `“${l}”`)
    .join(", ");
  const more = labels.length > 3 ? ` and ${labels.length - 3} more` : "";
  return `Changed since: ${shown}${more}. Undo the later change first.`;
}
