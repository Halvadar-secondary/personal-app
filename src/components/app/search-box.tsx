"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { useSearchTransition } from "./search-pending";

/**
 * The search field: updates ?q= once typing pauses, so results follow. Reads
 * the query from the URL itself, so it renders before the results load.
 */
export function SearchBox() {
  const router = useRouter();
  const initial = (useSearchParams().get("q") ?? "").trim().slice(0, 100);
  const { startTransition } = useSearchTransition();
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
          startTransition(() =>
            router.replace(
              t ? `/search?q=${encodeURIComponent(t)}` : "/search",
            ),
          );
        }, 200);
      }}
    />
  );
}

/**
 * The box as the static shell draws it, before the URL's query is known:
 * same look, read-only, so nothing typed is lost when the real box arrives.
 */
export function SearchBoxShell() {
  return (
    <Input
      type="search"
      aria-label="Search"
      placeholder="Search areas, achievements, tasks…"
      readOnly
      className="bg-card"
    />
  );
}
