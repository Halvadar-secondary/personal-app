"use client";

import { useState } from "react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { FilingArea } from "@/server/domain/views";
import type { Destination, Kind } from "./create-rules";

const areaName = (a: { name: string; emoji: string | null }) =>
  a.emoji ? `${a.emoji} ${a.name}` : a.name;

/** "Inbox", "🎸 Guitar" or "🎸 Guitar › Sweep". */
export function crumbsOf(dest: Destination): string[] {
  if (!dest.area && !dest.achievement) return ["Inbox"];
  return [
    ...(dest.area ? [areaName(dest.area)] : []),
    ...(dest.achievement ? [dest.achievement.title] : []),
  ];
}

/**
 * The dialog's breadcrumb: where the new item goes, and a searchable list
 * to send it elsewhere (areas for an achievement, achievements for a task).
 */
export function DestinationPicker({
  kind,
  value,
  targets,
  onChange,
}: {
  kind: Kind;
  value: Destination;
  /** Null until the dialog's options arrive. */
  targets: FilingArea[] | null;
  onChange: (dest: Destination) => void;
}) {
  const [open, setOpen] = useState(false);
  const crumbs = crumbsOf(value);
  const pick = (dest: Destination) => {
    onChange(dest);
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={!targets}
        aria-label={`Destination: ${crumbs.join(" › ")}`}
        className="flex min-w-0 items-center gap-1 rounded-md text-xs text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {crumbs.map((c, i) => (
          <span key={i} className="flex min-w-0 items-center gap-1">
            {i > 0 && <span aria-hidden>›</span>}
            <span className="truncate rounded-md border bg-muted/50 px-1.5 py-0.5 hover:text-foreground">
              {c}
            </span>
          </span>
        ))}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <Command>
          <CommandInput placeholder="Move to…" />
          <CommandList>
            <CommandEmpty>Nowhere matches.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="inbox"
                onSelect={() => pick({ area: null, achievement: null })}
              >
                Inbox
              </CommandItem>
            </CommandGroup>
            {kind === "achievement" ? (
              <CommandGroup heading="Areas">
                {targets?.map((a) => (
                  <CommandItem
                    key={a.id}
                    value={`area ${a.id} ${a.name}`}
                    keywords={[a.name]}
                    onSelect={() =>
                      pick({
                        area: { id: a.id, name: a.name, emoji: a.emoji },
                        achievement: null,
                      })
                    }
                  >
                    {areaName(a)}
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : (
              targets?.map(
                (a) =>
                  a.achievements.length > 0 && (
                    <CommandGroup key={a.id} heading={areaName(a)}>
                      {a.achievements.map((ach) => (
                        <CommandItem
                          key={ach.id}
                          value={`achievement ${ach.id} ${ach.title}`}
                          keywords={[ach.title, a.name]}
                          onSelect={() =>
                            pick({
                              area: { id: a.id, name: a.name, emoji: a.emoji },
                              achievement: { id: ach.id, title: ach.title },
                            })
                          }
                        >
                          {ach.title}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  ),
              )
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
