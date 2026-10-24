import { Suspense } from "react";
import { Capture } from "@/components/app/capture";
import { CaptureProvider } from "@/components/app/capture-context";
import { CommandPalette } from "@/components/app/command-palette";
import { Sidebar } from "@/components/app/sidebar";
import { TabBar } from "@/components/app/tab-bar";
import { Toaster } from "@/components/ui/sonner";
import { read } from "@/server/actions/run";
import { getOverview } from "@/server/domain/views";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <CaptureProvider>
      <div className="flex min-h-dvh">
        <Suspense fallback={<div className="hidden w-[220px] md:block" />}>
          <Nav />
        </Suspense>
        {/* Bottom padding keeps the phone tab bar off the content. */}
        <main className="min-w-0 flex-1 pb-24 md:pb-0">{children}</main>
      </div>
      {/* Reads the pathname for its context: runtime data needs a boundary. */}
      <Suspense fallback={null}>
        <Capture />
      </Suspense>
      <Toaster position="bottom-center" />
    </CaptureProvider>
  );
}

async function Nav() {
  const o = await read(getOverview, {});
  const areas = o.areas.map(({ id, name, emoji }) => ({ id, name, emoji }));
  return (
    <>
      <Sidebar inboxCount={o.inboxCount} areas={areas} />
      <TabBar />
      {/* Here, not beside Capture: it lists the areas Nav already read. */}
      <CommandPalette areas={areas} />
    </>
  );
}
