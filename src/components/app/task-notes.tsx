"use client";

import { Pencil } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { linkParts } from "@/lib/links";

/** A task's notes, with web links you can tap, and an edit button. */
export function TaskNotes({
  notes,
  title,
  onEdit,
}: {
  notes: string;
  title: string;
  onEdit: () => void;
}) {
  return (
    <div className="flex items-start gap-1">
      <p className="min-w-0 flex-1 text-xs break-words whitespace-pre-wrap text-muted-foreground">
        {linkParts(notes).map((p, i) =>
          p.href ? (
            <a
              key={i}
              href={p.href}
              // Out of the app, without handing the other site this page.
              target="_blank"
              rel="noopener noreferrer"
              className="break-all text-primary underline underline-offset-2"
            >
              {p.text}
            </a>
          ) : (
            <span key={i}>{p.text}</span>
          ),
        )}
      </p>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={`Edit notes for ${title}`}
        onClick={onEdit}
        className="text-muted-foreground"
      >
        <Pencil />
      </Button>
    </div>
  );
}

/** Edits a task's notes; blank saves as none. */
export function TaskNotesEditor({
  value,
  onSave,
  onCancel,
}: {
  value: string;
  onSave: (notes: string | null) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(value);
  return (
    <div className="flex flex-col gap-1.5">
      <Textarea
        aria-label="Notes"
        autoFocus
        value={draft}
        maxLength={10_000}
        placeholder="A description, a link to the song or the tab…"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
        }}
        className="min-h-20"
      />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          aria-label="Save notes"
          onClick={() => onSave(draft.trim() || null)}
        >
          Save
        </Button>
      </div>
    </div>
  );
}
