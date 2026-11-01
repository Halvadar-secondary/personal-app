"use client";

import {
  Activity,
  CalendarDays,
  ClipboardList,
  Flag,
  History as HistoryIcon,
  Inbox,
  LayoutGrid,
  ListChecks,
  Menu,
  Plus,
  Search,
  Settings,
  Sun,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useCapture } from "./capture-context";

const tab =
  "flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] text-muted-foreground outline-none focus-visible:text-foreground";

/** Everything that isn't a tab, behind More. */
const MORE = [
  { href: "/week", label: "Week", icon: CalendarDays },
  { href: "/goals", label: "Goals", icon: Flag },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/search", label: "Search", icon: Search },
  { href: "/review", label: "Review", icon: ClipboardList },
  { href: "/active", label: "Active", icon: ListChecks },
  { href: "/history", label: "History", icon: HistoryIcon },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

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
      className={cn(tab, path === href && "text-primary")}
    >
      {children}
    </Link>
  );
}

/**
 * Below md: the bottom tab bar: Today, Areas, Capture (raised, in the
 * middle), Trackers and More, which holds every other page.
 */
export function TabBar({ inboxCount = 0 }: { inboxCount?: number }) {
  return <TabBarView path={usePathname()} inboxCount={inboxCount} />;
}

export function TabBarView({
  path,
  inboxCount = 0,
}: {
  path: string | null;
  inboxCount?: number;
}) {
  const { setOpen } = useCapture();
  const [more, setMore] = useState(false);
  const inMore = MORE.some((m) => path === m.href);
  return (
    <nav
      aria-label="Tabs"
      className="fixed inset-x-0 bottom-0 z-40 flex items-end border-t bg-card pr-[max(0.75rem,env(safe-area-inset-right))] pb-[max(0.25rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] md:hidden"
    >
      <Tab href="/today" path={path}>
        <Sun className="size-6" /> Today
      </Tab>
      <Tab href="/" path={path}>
        <LayoutGrid className="size-6" /> Areas
      </Tab>
      <button
        type="button"
        aria-label="Capture"
        onClick={() => setOpen(true)}
        className={cn(tab, "text-foreground")}
      >
        {/* Raised above the bar so it reads as the main action. */}
        <span className="-mt-6 mb-0.5 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-4 ring-card transition-transform active:scale-95">
          <Plus className="size-7" strokeWidth={2.5} />
        </span>
        Capture
      </button>
      <Tab href="/trackers" path={path}>
        <Activity className="size-6" /> Trackers
      </Tab>
      <button
        type="button"
        aria-label="More"
        aria-current={inMore ? "page" : undefined}
        aria-haspopup="dialog"
        onClick={() => setMore(true)}
        className={cn(tab, "relative", inMore && "text-primary")}
      >
        <Menu className="size-6" /> More
        {inboxCount > 0 && (
          <span
            aria-hidden
            className="absolute top-1.5 left-1/2 ml-2 size-2 rounded-full bg-badge"
          />
        )}
      </button>
      <Dialog open={more} onOpenChange={setMore}>
        <DialogContent className="top-auto bottom-0 left-0 max-w-none translate-x-0 translate-y-0 rounded-t-2xl rounded-b-none p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:max-w-none data-open:slide-in-from-bottom data-open:zoom-in-100">
          <DialogTitle className="text-base">More</DialogTitle>
          <DialogDescription className="sr-only">
            Every other page in the app.
          </DialogDescription>
          <ul className="grid grid-cols-3 gap-2">
            {MORE.map(({ href, label, icon: Icon }) => (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={path === href ? "page" : undefined}
                  onClick={() => setMore(false)}
                  className={cn(
                    "relative flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-xl border bg-card text-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring",
                    path === href && "border-primary/40 bg-accent",
                  )}
                >
                  <Icon className="size-6 text-muted-foreground" />
                  {label}
                  {href === "/inbox" && inboxCount > 0 && (
                    <span className="absolute top-2 right-2 rounded-full bg-badge px-1.5 text-xs font-semibold text-badge-foreground">
                      {inboxCount}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </nav>
  );
}
