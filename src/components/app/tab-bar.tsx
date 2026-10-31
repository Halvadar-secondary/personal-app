"use client";

import { CalendarDays, LayoutGrid, Plus, Search, Sun } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useCapture } from "./capture-context";

const tab =
  "flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] text-muted-foreground";

function Tab({
  href,
  path,
  children,
}: {
  href: string;
  path: string | null;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={path === href ? "page" : undefined}
      className={cn(tab, "relative", path === href && "text-primary")}
    >
      {children}
    </Link>
  );
}

/**
 * Below md: the bottom tab bar: Today, Areas, Week, Search, plus Capture
 * (Settings sits in the Areas header). The Inbox is one tap away from the
 * overview's "in Inbox" chip, whose count stands in for a badge here.
 */
export function TabBar() {
  return <TabBarView path={usePathname()} />;
}

/** The bar itself; `path: null` (no tab current) while the page loads. */
export function TabBarView({ path }: { path: string | null }) {
  const { setOpen } = useCapture();
  return (
    <nav
      aria-label="Tabs"
      className="fixed inset-x-0 bottom-0 z-40 flex border-t bg-card pr-[max(0.75rem,env(safe-area-inset-right))] pb-[max(0.25rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] md:hidden"
    >
      <Tab href="/today" path={path}>
        <Sun className="size-5" /> Today
      </Tab>
      <Tab href="/" path={path}>
        <LayoutGrid className="size-5" /> Areas
      </Tab>
      <button
        type="button"
        aria-label="Capture"
        onClick={() => setOpen(true)}
        className={tab}
      >
        <Plus className="size-5" /> Capture
      </button>
      <Tab href="/week" path={path}>
        <CalendarDays className="size-5" /> Week
      </Tab>
      <Tab href="/search" path={path}>
        <Search className="size-5" /> Search
      </Tab>
    </nav>
  );
}
