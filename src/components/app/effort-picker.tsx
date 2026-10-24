"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EFFORT_LABELS, type Effort } from "@/lib/xp";

const LEVELS = [1, 2, 3, 4, 5] as const;

/** An effort chip; opens the five levels with their labels. */
export function EffortPicker({
  value,
  onChange,
}: {
  value: Effort;
  onChange: (effort: Effort) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Effort: ${EFFORT_LABELS[value]}`}
        className="rounded-full bg-badge px-2 text-[11px] font-semibold text-badge-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {EFFORT_LABELS[value]}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuRadioGroup
          value={String(value)}
          onValueChange={(v) => onChange(Number(v) as Effort)}
        >
          {LEVELS.map((level) => (
            <DropdownMenuRadioItem key={level} value={String(level)}>
              <span aria-hidden className="w-3 text-muted-foreground">
                {level}
              </span>
              {EFFORT_LABELS[level]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
