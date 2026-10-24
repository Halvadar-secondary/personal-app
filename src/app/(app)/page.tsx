import Link from "next/link";
import { Suspense } from "react";
import { AreaCard, AreaRow } from "@/components/app/area-card";
import { CaptureButton } from "@/components/app/capture-button";
import { NewArea } from "@/components/app/new-area";
import { read } from "@/server/actions/run";
import { getOverview } from "@/server/domain/views";

export default function OverviewPage() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4 md:p-6">
      <header className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold md:text-2xl">Your areas</h1>
        <CaptureButton />
      </header>
      <Suspense
        fallback={<p className="text-sm text-muted-foreground">Loading…</p>}
      >
        <Overview />
      </Suspense>
    </div>
  );
}

async function Overview() {
  const o = await read(getOverview, {});
  return (
    <>
      <div className="flex gap-2.5">
        <div className="flex-1 rounded-[10px] border bg-card px-3 py-2 text-xs text-muted-foreground">
          <b className="block text-base text-foreground">{o.activeCount}</b>
          active achievements
        </div>
        <Link
          href="/inbox"
          className="flex-1 rounded-[10px] border bg-card px-3 py-2 text-xs text-muted-foreground hover:border-primary"
        >
          <b className="block text-base text-foreground">{o.inboxCount}</b>
          in Inbox
        </Link>
      </div>

      <div className="hidden grid-cols-2 gap-3 md:grid lg:grid-cols-3">
        {o.areas.map((a) => (
          <AreaCard key={a.id} area={a} />
        ))}
        <NewArea variant="tile" />
      </div>

      <div className="flex flex-col gap-2 md:hidden">
        {o.areas.map((a) => (
          <AreaRow key={a.id} area={a} />
        ))}
        <NewArea variant="button" />
      </div>
    </>
  );
}
