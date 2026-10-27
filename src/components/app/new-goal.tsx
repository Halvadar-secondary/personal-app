"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createGoalAction } from "@/server/actions/goals";
import { perform } from "./use-mutate";

/** "New goal": a title and an optional deadline; Enter saves. */
export function NewGoal() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [deadline, setDeadline] = useState("");
  const [busy, setBusy] = useState(false);

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Plus /> New goal
      </Button>
    );
  }
  return (
    <form
      aria-label="New goal"
      className="flex w-full flex-wrap items-end gap-2 rounded-[12px] border bg-card p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const t = title.trim();
        if (!t || busy) return;
        setBusy(true);
        const r = await perform(() =>
          createGoalAction({ title: t, deadline: deadline || null }),
        );
        setBusy(false);
        if (r?.ok) {
          setTitle("");
          setDeadline("");
          setOpen(false);
        }
      }}
    >
      <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs">
        Goal
        <Input
          autoFocus
          value={title}
          maxLength={200}
          placeholder="Write and record a full song"
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs">
        Deadline
        <Input
          type="date"
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
        />
      </label>
      <Button type="submit" disabled={!title.trim() || busy}>
        Add goal
      </Button>
      <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </form>
  );
}
