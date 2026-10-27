"use client";

import { Link2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
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
import {
  linkableAchievementsAction,
  linkAchievementAction,
} from "@/server/actions/goals";
import { perform } from "./use-mutate";

type Linkable = Awaited<ReturnType<typeof linkableAchievementsAction>>;

const areaName = (a: { name: string; emoji: string | null } | null) =>
  a ? (a.emoji ? `${a.emoji} ${a.name}` : a.name) : "Inbox";

/** Searches every achievement, from any area, to feed this goal. */
export function GoalLinkPicker({ goalId }: { goalId: string }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Linkable | null>(null);

  function toggle(o: boolean) {
    setOpen(o);
    if (!o) return;
    // Fetched on every open: achievements and links come and go.
    linkableAchievementsAction({ goalId })
      .then(setItems)
      .catch(() => setItems([]));
  }

  return (
    <Popover open={open} onOpenChange={toggle}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <Link2 /> Link achievement
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <Command>
          <CommandInput placeholder="Find an achievement…" />
          <CommandList>
            <CommandEmpty>
              {items ? "No achievement matches." : "Loading…"}
            </CommandEmpty>
            <CommandGroup>
              {items?.map((a) => (
                <CommandItem
                  key={a.id}
                  value={`${a.id} ${a.title}`}
                  keywords={[a.title, a.area?.name ?? "Inbox"]}
                  onSelect={async () => {
                    setOpen(false);
                    await perform(() =>
                      linkAchievementAction({ achievementId: a.id, goalId }),
                    );
                  }}
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate">{a.title}</span>
                    <span className="flex gap-1 text-xs text-muted-foreground">
                      <span>{areaName(a.area)}</span>
                      {a.goalTitle && <span>in {a.goalTitle}</span>}
                    </span>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
