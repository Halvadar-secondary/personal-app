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
  Plus,
  Search,
  Settings,
  Sun,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AccountMenu } from "./account-menu";
import { useCapture } from "./capture-context";
import type { NavData } from "./nav-data";

function NavLink({
  href,
  active = false,
  children,
}: {
  href: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted",
        active && "bg-accent font-medium text-accent-foreground",
      )}
    >
      {children}
    </Link>
  );
}

/** md and up: the left rail. */
export function Sidebar({ inboxCount, areas }: NavData) {
  const path = usePathname();
  return (
    <SidebarFrame path={path} inboxCount={inboxCount}>
      {areas.map((a) => (
        <NavLink
          key={a.id}
          href={`/areas/${a.id}`}
          active={path === `/areas/${a.id}`}
        >
          <span aria-hidden className="w-5 text-center">
            {a.emoji ?? "•"}
          </span>
          <span className="truncate">{a.name}</span>
        </NavLink>
      ))}
    </SidebarFrame>
  );
}

/**
 * The rail while the area list loads: the fixed links work, the areas are
 * placeholder rows. No pathname: it is the static shell for every route.
 */
export function SidebarSkeleton() {
  return (
    <SidebarFrame path={null}>
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="flex items-center gap-2 px-2 py-1.5">
          <Skeleton className="size-5 shrink-0" />
          <Skeleton className="h-3.5 flex-1" />
        </div>
      ))}
    </SidebarFrame>
  );
}

function SidebarFrame({
  path,
  inboxCount = 0,
  children,
}: {
  path: string | null;
  inboxCount?: number;
  children: React.ReactNode;
}) {
  const { setOpen } = useCapture();
  const link = (href: string) => ({ href, active: path === href });
  return (
    <aside className="sticky top-0 hidden h-dvh w-[220px] shrink-0 flex-col gap-4 border-r bg-sidebar p-3 md:flex">
      <Link href="/today" className="px-2 pt-1 text-base font-bold">
        Life Goals
      </Link>
      <Button onClick={() => setOpen(true)} className="justify-start">
        <Plus /> Capture
      </Button>
      <nav aria-label="Main" className="flex flex-col gap-0.5">
        <NavLink {...link("/today")}>
          <Sun className="size-4" /> Today
        </NavLink>
        <NavLink {...link("/week")}>
          <CalendarDays className="size-4" /> Week
        </NavLink>
        <NavLink {...link("/goals")}>
          <Flag className="size-4" /> Goals
        </NavLink>
        <NavLink {...link("/review")}>
          <ClipboardList className="size-4" /> Review
        </NavLink>
        <NavLink {...link("/trackers")}>
          <Activity className="size-4" /> Trackers
        </NavLink>
        <NavLink {...link("/")}>
          <LayoutGrid className="size-4" /> Your areas
        </NavLink>
        <NavLink {...link("/active")}>
          <ListChecks className="size-4" /> Active
        </NavLink>
        <NavLink {...link("/search")}>
          <Search className="size-4" /> Search
        </NavLink>
        <NavLink {...link("/inbox")}>
          <Inbox className="size-4" /> Inbox
          {inboxCount > 0 && (
            <span className="ml-auto rounded-full bg-badge px-1.5 text-xs font-semibold text-badge-foreground">
              {inboxCount}
            </span>
          )}
        </NavLink>
      </nav>
      <nav
        aria-label="Areas"
        className="-mx-1 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-1"
      >
        {children}
      </nav>
      <NavLink {...link("/settings")}>
        <Settings className="size-4" /> Settings
      </NavLink>
      <NavLink {...link("/history")}>
        <HistoryIcon className="size-4" /> History
      </NavLink>
      <AccountMenu />
    </aside>
  );
}
