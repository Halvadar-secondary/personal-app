"use client";

import { ChevronLeft } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

/** The pages the tab bar links to: nothing to go back from. */
const TAB_ROOTS = new Set(["/today", "/", "/trackers"]);

/** Below md, every page under the tabs gets a Back button in the same place. */
export function BackBar() {
  return <BackBarView path={usePathname()} />;
}

export function BackBarView({ path }: { path: string | null }) {
  const router = useRouter();
  if (path === null || TAB_ROOTS.has(path)) return null;
  return (
    <div className="sticky top-0 z-30 flex items-center border-b bg-background/95 px-2 pt-[env(safe-area-inset-top)] backdrop-blur md:hidden">
      <Button
        variant="ghost"
        className="-ml-1 text-base"
        aria-label="Back"
        onClick={() => {
          // Opened straight on this page (a link, a reload): go Today.
          if (window.history.length > 1) router.back();
          else router.push("/today");
        }}
      >
        <ChevronLeft className="size-5" />
        Back
      </Button>
    </div>
  );
}
