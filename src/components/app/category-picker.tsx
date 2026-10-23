"use client";

import { Tag } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { ChipCategory } from "./achievement-card";

export type PickerCategory = ChipCategory & { usedInArea: number };

/** New categories take the next of these, by how many exist. */
export const CATEGORY_COLORS = [
  "#6d4aff",
  "#e5484d",
  "#f59e0b",
  "#10b981",
  "#0ea5e9",
  "#ec4899",
  "#8b5cf6",
  "#64748b",
];

type Props = {
  categories: PickerCategory[];
  value: string[];
  onChange: (ids: string[]) => void;
  /** Creates the category; resolves to its id, or null when it failed. */
  onCreate: (name: string) => Promise<string | null>;
};

/** Pick a task's categories; "Used here" first, then "All". */
export function CategoryPicker({
  categories,
  value,
  onChange,
  onCreate,
}: Props) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = categories.filter((c) => c.name.toLowerCase().includes(q));
  const byName = (a: PickerCategory, b: PickerCategory) =>
    a.name.localeCompare(b.name);
  const used = shown.filter((c) => c.usedInArea > 0).sort(byName);
  const rest = shown.filter((c) => c.usedInArea === 0).sort(byName);
  const exists = categories.some((c) => c.name.toLowerCase() === q);

  const toggle = (id: string, on: boolean) =>
    onChange(on ? [...value, id] : value.filter((v) => v !== id));

  return (
    <Popover onOpenChange={() => setQuery("")}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-xs" aria-label="Categories">
          <Tag />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60 gap-2 p-2">
        <Input
          aria-label="Find or create"
          placeholder="Find or create…"
          value={query}
          maxLength={40}
          onChange={(e) => setQuery(e.target.value)}
        />
        {[["Used here", used] as const, ["All", rest] as const].map(
          ([label, list]) =>
            list.length > 0 && (
              <div
                key={label}
                role="group"
                aria-label={label}
                className="flex flex-col"
              >
                <p className="px-1 py-1 text-[11px] font-semibold text-faint uppercase">
                  {label}
                </p>
                {list.map((c) => (
                  <label
                    key={c.id}
                    className="flex items-center gap-2 rounded-md px-1 py-1 text-sm hover:bg-muted"
                  >
                    <Checkbox
                      aria-label={c.name}
                      checked={value.includes(c.id)}
                      onCheckedChange={(on) => toggle(c.id, on === true)}
                    />
                    <span
                      aria-hidden
                      className="size-2 rounded-full"
                      style={{ background: c.color }}
                    />
                    {c.name}
                  </label>
                ))}
              </div>
            ),
        )}
        {q && !exists && (
          <Button
            variant="ghost"
            className="justify-start"
            onClick={async () => {
              const name = query.trim();
              const id = await onCreate(name);
              if (id) {
                onChange([...value, id]);
                setQuery("");
              }
            }}
          >
            Create “{query.trim()}”
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
