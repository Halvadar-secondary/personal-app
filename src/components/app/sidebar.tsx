"use client";

import { Inbox, LayoutGrid, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { AccountMenu } from "./account-menu";
import { useCapture } from "./capture-context";
import type { NavData } from "./nav-data";

function NavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  const active = usePathname() === href;
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
  const { setOpen } = useCapture();
  return (
    <aside className="sticky top-0 hidden h-dvh w-[220px] shrink-0 flex-col gap-4 border-r bg-sidebar p-3 md:flex">
      <Link href="/" className="px-2 pt-1 text-base font-bold">
        Life Goals
      </Link>
      <Button onClick={() => setOpen(true)} className="justify-start">
        <Plus /> Capture
      </Button>
      <nav aria-label="Main" className="flex flex-col gap-0.5">
        <NavLink href="/">
          <LayoutGrid className="size-4" /> Your areas
        </NavLink>
        <NavLink href="/inbox">
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
        {areas.map((a) => (
          <NavLink key={a.id} href={`/areas/${a.id}`}>
            <span aria-hidden className="w-5 text-center">
              {a.emoji ?? "•"}
            </span>
            <span className="truncate">{a.name}</span>
          </NavLink>
        ))}
      </nav>
      <AccountMenu />
    </aside>
  );
}
