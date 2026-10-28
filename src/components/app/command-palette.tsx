"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { jumpTargetsAction } from "@/server/actions/palette";
import type { JumpTarget } from "@/server/domain/views";
import { useCapture } from "./capture-context";
import type { NavData } from "./nav-data";

const PAGES: [string, string][] = [
  ["/today", "Today"],
  ["/plan", "Plan tomorrow"],
  ["/week", "Week"],
  ["/goals", "Goals"],
  ["/review", "Plan your week"],
  ["/trackers", "Trackers"],
  ["/", "Your areas"],
  ["/active", "Active"],
  ["/inbox", "Inbox"],
  ["/search", "Search"],
  ["/history", "History"],
  ["/settings", "Settings"],
];

/** Ctrl+K / ⌘K: jump to any page, area or achievement, or capture. */
export function CommandPalette({ areas }: { areas: NavData["areas"] }) {
  const router = useRouter();
  const { setOpen: setCaptureOpen } = useCapture();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  // Fetched on every open (achievements come and go); the last list shows
  // until the new one arrives.
  const [targets, setTargets] = useState<JumpTarget[] | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    let live = true;
    jumpTargetsAction()
      .then((t) => live && setTargets(t))
      .catch(() => {}); // The palette still works with pages and areas.
    return () => {
      live = false;
    };
  }, [open]);

  function go(href: string) {
    setOpen(false);
    setQuery("");
    router.push(href);
  }

  const q = query.trim();
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQuery("");
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="top-1/3 translate-y-0 overflow-hidden rounded-xl! p-0"
      >
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <DialogDescription className="sr-only">
          Jump to a page, area or achievement.
        </DialogDescription>
        <Command>
          <CommandInput
            placeholder="Jump to…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>Nothing to jump to.</CommandEmpty>
            <CommandGroup heading="Go to">
              {PAGES.map(([href, label]) => (
                <CommandItem key={href} onSelect={() => go(href)}>
                  {label}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandGroup heading="Areas">
              {areas.map((a) => (
                <CommandItem
                  key={a.id}
                  value={`area ${a.id} ${a.name}`}
                  keywords={[a.name]}
                  onSelect={() => go(`/areas/${a.id}`)}
                >
                  {a.emoji ?? "•"} {a.name}
                </CommandItem>
              ))}
            </CommandGroup>
            {targets && targets.length > 0 && (
              <CommandGroup heading="Achievements">
                {targets.map((t) => (
                  <CommandItem
                    key={t.id}
                    value={`achievement ${t.id} ${t.title}`}
                    keywords={[t.title, t.area.name]}
                    onSelect={() => go(`/achievements/${t.id}`)}
                  >
                    <span className="min-w-0 flex-1 truncate">{t.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {t.area.emoji} {t.area.name}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            <CommandGroup heading="Actions" forceMount>
              <CommandItem
                onSelect={() => {
                  setOpen(false);
                  setCaptureOpen(true);
                }}
              >
                Capture…
              </CommandItem>
              {q && (
                // Always shown for any text: it's the way out of no match.
                <CommandItem
                  value={`search ${q}`}
                  forceMount
                  onSelect={() => go(`/search?q=${encodeURIComponent(q)}`)}
                >
                  Search for “{q}”
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
