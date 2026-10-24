"use client";

import { Inbox, LayoutGrid, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useCapture } from "./capture-context";

const tab =
  "flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] text-muted-foreground";

/** Below md: the bottom tab bar. */
export function TabBar({ inboxCount }: { inboxCount: number }) {
  const path = usePathname();
  const { setOpen } = useCapture();
  return (
    <nav
      aria-label="Tabs"
      className="fixed inset-x-0 bottom-0 z-40 flex border-t bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <Link
        href="/"
        aria-current={path === "/" ? "page" : undefined}
        className={cn(tab, path === "/" && "text-primary")}
      >
        <LayoutGrid className="size-5" /> Areas
      </Link>
      <Link
        href="/inbox"
        aria-current={path === "/inbox" ? "page" : undefined}
        className={cn(tab, "relative", path === "/inbox" && "text-primary")}
      >
        <Inbox className="size-5" /> Inbox
        {inboxCount > 0 && (
          <span className="absolute top-1 left-1/2 ml-2 rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
            {inboxCount}
          </span>
        )}
      </Link>
      <button
        type="button"
        aria-label="Capture"
        onClick={() => setOpen(true)}
        className={tab}
      >
        <Plus className="size-5" /> Capture
      </button>
    </nav>
  );
}
