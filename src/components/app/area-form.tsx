"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { COVER_PRESETS } from "@/lib/covers";
import { cn } from "@/lib/utils";
import type { Cover } from "@/server/db/goals";

export type AreaValues = {
  name: string;
  emoji: string | null;
  cover: Cover | null;
  description: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Editing when given; creating otherwise. */
  initial?: AreaValues;
  onSubmit: (values: AreaValues) => void | Promise<void>;
};

export function AreaForm({ open, onOpenChange, initial, onSubmit }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? "Edit area" : "New area"}</DialogTitle>
        </DialogHeader>
        {/* Remounts on open, so a reopened form starts from `initial`. */}
        {open && <Fields initial={initial} onSubmit={onSubmit} />}
      </DialogContent>
    </Dialog>
  );
}

function Fields({ initial, onSubmit }: Pick<Props, "initial" | "onSubmit">) {
  const [name, setName] = useState(initial?.name ?? "");
  const [emoji, setEmoji] = useState(initial?.emoji ?? "");
  const [cover, setCover] = useState(
    initial ? initial.cover?.value : COVER_PRESETS[0]!.value,
  );
  const [description, setDescription] = useState(initial?.description ?? "");
  const [saving, setSaving] = useState(false);

  return (
    <form
      className="grid gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim() || saving) return;
        setSaving(true);
        try {
          await onSubmit({
            name: name.trim(),
            emoji: emoji.trim() || null,
            cover: cover ? { type: "gradient", value: cover } : null,
            description: description.trim() || null,
          });
        } finally {
          setSaving(false);
        }
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="area-name">Name</Label>
        <Input
          id="area-name"
          value={name}
          maxLength={80}
          required
          autoFocus
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="area-emoji">Emoji</Label>
        <Input
          id="area-emoji"
          value={emoji}
          maxLength={16}
          className="w-20"
          onChange={(e) => setEmoji(e.target.value)}
        />
      </div>
      <fieldset className="grid gap-1.5">
        <legend className="mb-1.5 text-sm font-medium">Cover</legend>
        <div className="flex flex-wrap gap-2">
          {COVER_PRESETS.map((p) => (
            <label
              key={p.id}
              className={cn(
                "size-8 cursor-pointer rounded-lg ring-offset-2 has-checked:ring-2 has-checked:ring-primary has-focus-visible:ring-2 has-focus-visible:ring-ring",
              )}
              style={{ background: p.value }}
            >
              <input
                type="radio"
                name="cover"
                aria-label={p.id}
                className="sr-only"
                checked={cover === p.value}
                onChange={() => setCover(p.value)}
              />
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-1.5">
        <Label htmlFor="area-description">Description</Label>
        <Textarea
          id="area-description"
          value={description}
          maxLength={2000}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <DialogFooter>
        <Button type="submit" disabled={saving}>
          {initial ? "Save" : "Create area"}
        </Button>
      </DialogFooter>
    </form>
  );
}
