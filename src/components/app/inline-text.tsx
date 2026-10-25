"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Text that turns into an input when clicked. Enter or blur saves (when
 * changed and not blank); Escape cancels.
 */
export function InlineText({
  value,
  onSave,
  label,
  maxLength,
  className,
}: {
  value: string;
  onSave: (value: string) => void;
  label: string;
  maxLength: number;
  className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  if (draft === null) {
    return (
      <button
        type="button"
        // Starts with the visible text, so voice control can say what it sees.
        aria-label={`${value}, Edit ${label}`}
        onClick={() => setDraft(value)}
        className={cn(
          "min-w-0 cursor-text rounded-sm text-left break-words outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
      >
        {value}
      </button>
    );
  }

  const save = () => {
    const next = draft.trim();
    setDraft(null);
    if (next && next !== value) onSave(next);
  };
  return (
    <input
      aria-label={label}
      autoFocus
      value={draft}
      maxLength={maxLength}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          save();
        } else if (e.key === "Escape") {
          setDraft(null);
        }
      }}
      className={cn(
        "w-full min-w-0 rounded-sm bg-transparent outline-none ring-2 ring-ring/50",
        className,
      )}
    />
  );
}
