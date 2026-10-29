import { Suspense } from "react";
import { CaptureProvider } from "@/components/app/capture-context";
import { CommandPalette } from "@/components/app/command-palette";
import { CreateDialog } from "@/components/app/create-dialog";
import { Sidebar, SidebarSkeleton } from "@/components/app/sidebar";
import { TabBar, TabBarView } from "@/components/app/tab-bar";
import { VersionBanner } from "@/components/app/version-banner";
import { Toaster } from "@/components/ui/sonner";
import { read } from "@/server/actions/run";
import { getOverview } from "@/server/domain/views";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <CaptureProvider>
      <div className="flex min-h-dvh">
        <Suspense fallback={<NavSkeleton />}>
          <Nav />
        </Suspense>
        {/* Bottom padding keeps the phone tab bar off the content. */}
        <main className="min-w-0 flex-1 pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-0">
          {children}
        </main>
      </div>
      <CreateDialog />
      <Toaster position="bottom-center" />
      <VersionBanner current={process.env.APP_BUILD_ID ?? "dev"} />
    </CaptureProvider>
  );
}

/** Navigation stays usable while the area list and Inbox count load. */
function NavSkeleton() {
  return (
    <>
      <SidebarSkeleton />
      <TabBarView path={null} />
    </>
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
