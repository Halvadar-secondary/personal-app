"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";

/** The search field: updates ?q= once typing pauses, so results follow. */
export function SearchBox({ initial }: { initial: string }) {
  const router = useRouter();
  const [q, setQ] = useState(initial);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <Input
      type="search"
      aria-label="Search"
      placeholder="Search areas, achievements, tasks…"
      autoFocus
      value={q}
      maxLength={100}
      className="bg-card"
      onChange={(e) => {
        const next = e.target.value;
        setQ(next);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          const t = next.trim();
          router.replace(t ? `/search?q=${encodeURIComponent(t)}` : "/search");
        }, 200);
      }}
    />
  );
}
