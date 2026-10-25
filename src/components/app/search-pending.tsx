"use client";

import { createContext, useContext, useTransition } from "react";
import { cn } from "@/lib/utils";

type SearchTransition = {
  pending: boolean;
  startTransition: React.TransitionStartFunction;
};

const Ctx = createContext<SearchTransition | null>(null);

/**
 * Shares one transition between the search box and the results: while a new
 * query loads, the old results stay, dimmed.
 */
export function SearchPendingProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [pending, startTransition] = useTransition();
  return <Ctx value={{ pending, startTransition }}>{children}</Ctx>;
}

export function useSearchTransition(): SearchTransition {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSearchTransition needs SearchPendingProvider");
  return ctx;
}

export function SearchResults({ children }: { children: React.ReactNode }) {
  const { pending } = useSearchTransition();
  return (
    <div
      data-testid="search-results"
      aria-busy={pending}
      className={cn(
        "flex flex-col gap-4 transition-opacity",
        pending && "opacity-60",
      )}
    >
      {children}
    </div>
  );
}
