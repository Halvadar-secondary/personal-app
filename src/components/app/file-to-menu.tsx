"use client";

import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { FilingArea } from "@/server/domain/views";

const areaLabel = (a: FilingArea) =>
  a.emoji ? `${a.emoji} ${a.name}` : a.name;

/**
 * "File to…" for an Inbox item: achievements go to an area, tasks to an
 * achievement (area → achievement). Plus Delete.
 */
export function FileToMenu({
  kind,
  title,
  targets,
  onFile,
  onDelete,
}: {
  kind: "achievement" | "task";
  title: string;
  targets: FilingArea[];
  /** The area id for an achievement, the achievement id for a task. */
  onFile: (targetId: string) => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`File to… ${title}`}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>File to…</DropdownMenuLabel>
        {targets.length === 0 && (
          <DropdownMenuItem disabled>Make an area first</DropdownMenuItem>
        )}
        {kind === "achievement"
          ? targets.map((a) => (
              <DropdownMenuItem key={a.id} onSelect={() => onFile(a.id)}>
                {areaLabel(a)}
              </DropdownMenuItem>
            ))
          : targets.map((a) => (
              <DropdownMenuSub key={a.id}>
                <DropdownMenuSubTrigger>{areaLabel(a)}</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {a.achievements.length === 0 && (
                    <DropdownMenuItem disabled>
                      No open achievements
                    </DropdownMenuItem>
                  )}
                  {a.achievements.map((ach) => (
                    <DropdownMenuItem
                      key={ach.id}
                      onSelect={() => onFile(ach.id)}
                    >
                      {ach.title}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={onDelete}>
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
