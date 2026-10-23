"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { captureAction } from "@/server/actions/inbox";
import { useCapture } from "./capture-context";

/** Where capture files things, from the route: an area, an achievement, or the Inbox. */
function contextFor(path: string) {
  const [, kind, id] = path.split("/");
  if (kind === "areas" && id) return { areaId: id };
  if (kind === "achievements" && id) return { achievementId: id };
  return undefined;
}

/** Typing in a field must never open capture. */
function isTyping(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
  );
}

type Status = { kind: "saved" } | { kind: "error"; message: string } | null;

/** The global capture dialog: one field, Enter saves and stays open. */
export function Capture() {
  const { open, setOpen, destination } = useCapture();
  const path = usePathname();
  const context = contextFor(path);
  const [text, setText] = useState("");
  const [achievement, setAchievement] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [saving, setSaving] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key.toLowerCase() !== "c") return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      if (isTyping(e.target)) return;
      e.preventDefault();
      setOpen(true);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [setOpen]);

  async function save() {
    const value = text.trim();
    if (!value || saving) return;
    setSaving(true);
    let message: string | null = null;
    try {
      const r = await captureAction({
        text: achievement ? `!${value}` : value,
        context,
      });
      if (!r.ok) message = r.message;
    } catch {
      message = "Couldn't save. Reload the page and try again.";
    }
    setSaving(false);
    if (message) {
      setStatus({ kind: "error", message });
    } else {
      setText("");
      setStatus({ kind: "saved" });
    }
    input.current?.focus();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        setStatus(null);
      }}
    >
      <DialogContent className="top-[20%] translate-y-0">
        <DialogHeader>
          <DialogTitle>Capture</DialogTitle>
          <DialogDescription>
            → {destination ?? (context ? "here" : "Inbox")}
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Input
            ref={input}
            aria-label="Capture text"
            placeholder={achievement ? "An achievement…" : "A task or idea…"}
            value={text}
            maxLength={300}
            autoFocus
            onChange={(e) => {
              setText(e.target.value);
              setStatus(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void save();
              }
            }}
          />
          <button
            type="button"
            aria-pressed={achievement}
            onClick={() => {
              setAchievement((a) => !a);
              input.current?.focus();
            }}
            className={cn(
              "shrink-0 rounded-lg border px-2.5 text-sm",
              achievement
                ? "border-primary bg-accent text-accent-foreground"
                : "text-muted-foreground",
            )}
          >
            Achievement
          </button>
        </div>
        <p
          role="status"
          className={cn(
            "min-h-5 text-sm",
            status?.kind === "error"
              ? "text-destructive"
              : "text-muted-foreground",
          )}
        >
          {status?.kind === "saved" && "Saved"}
          {status?.kind === "error" && status.message}
        </p>
      </DialogContent>
    </Dialog>
  );
}
