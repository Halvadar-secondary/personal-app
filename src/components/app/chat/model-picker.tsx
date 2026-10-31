"use client";

import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Tier } from "./use-chat";

export type Tiers = Record<Tier, { id: string; name: string; label: string }>;

const ORDER: Tier[] = ["quick", "smart", "deep"];

/** The built-in tiers, for when the server can't say which models are newest. */
export const FALLBACK_TIERS: Tiers = {
  quick: { id: "claude-haiku-5-5", name: "Claude Haiku 5.5", label: "Quick" },
  smart: { id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5", label: "Smart" },
  deep: { id: "claude-opus-5-5", name: "Claude Opus 5.5", label: "Deepest" },
};

const FAMILY = /^claude-(haiku|sonnet|opus)-(\d+)(?:-(\d{1,2}))?(?:-|$)/;

/** "Claude Sonnet 5.5" for a model id: the tier's name, else read from the id. */
export function modelName(id: string, tiers: Tiers): string {
  const tier = ORDER.find((t) => tiers[t].id === id);
  if (tier) return tiers[tier].name;
  const m = FAMILY.exec(id);
  if (!m) return id;
  const family = m[1]![0]!.toUpperCase() + m[1]!.slice(1);
  return `Claude ${family} ${m[2]}${m[3] ? `.${m[3]}` : ""}`;
}

/** Quick, Smart, Deepest, each with the model it runs on now. */
export function ModelPicker({
  tiers,
  value,
  onChange,
}: {
  tiers: Tiers;
  value: Tier;
  onChange: (tier: Tier) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Model: ${tiers[value].label}`}
        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
      >
        {tiers[value].label}
        <ChevronDown aria-hidden className="size-3.5 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="z-[60]">
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(v) => onChange(v as Tier)}
        >
          {ORDER.map((t) => (
            <DropdownMenuRadioItem key={t} value={t}>
              <span className="flex flex-col">
                <span>{tiers[t].label}</span>{" "}
                <span className="text-xs text-muted-foreground">
                  {tiers[t].name}
                </span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
