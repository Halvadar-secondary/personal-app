"use client";

import { X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

// Chrome fires a full date per typed year digit (0002, 0020, 0202, 2027).
const PLAUSIBLE = /^(19|2\d)\d{2}-\d{2}-\d{2}$/;

/**
 * A date input that saves when you leave it (or press Enter), not on every
 * keystroke, and only a plausible date; plus a clear button.
 */
export function DateField({
  label,
  value,
  onSave,
  className,
}: {
  label: string;
  value: string | null;
  onSave: (value: string | null) => void;
  className?: string;
}) {
  const [draft, setDraft] = useState(value ?? "");
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    // The saved value changed under us (refresh, undo): show it.
    setSeen(value);
    setDraft(value ?? "");
  }

  const commit = () => {
    const next = draft || null;
    if (next === value) return;
    if (next !== null && !PLAUSIBLE.test(next)) {
      setDraft(value ?? "");
      return;
    }
    onSave(next);
  };

  return (
    <span className="flex items-center">
      <input
        type="date"
        aria-label={label}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
        }}
        className={cn("bg-transparent", className)}
      />
      {value && (
        <button
          type="button"
          aria-label={`Clear ${label}`}
          onClick={() => {
            setDraft("");
            onSave(null);
          }}
          className="text-faint hover:text-foreground"
        >
          <X className="size-3" />
        </button>
      )}
    </span>
  );
}
