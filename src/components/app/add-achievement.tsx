"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";

/** An inline "Add achievement" field: Enter adds and keeps focus. */
export function AddAchievement({
  onAdd,
  className,
}: {
  onAdd: (title: string) => void;
  className?: string;
}) {
  const [title, setTitle] = useState("");
  return (
    <Input
      aria-label="Add achievement"
      placeholder="+ Add achievement"
      value={title}
      maxLength={200}
      className={className}
      onChange={(e) => setTitle(e.target.value)}
      onKeyDown={(e) => {
        if (e.key !== "Enter" || !title.trim()) return;
        e.preventDefault();
        onAdd(title.trim());
        setTitle("");
      }}
    />
  );
}
