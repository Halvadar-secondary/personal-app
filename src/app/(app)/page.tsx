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

const chip =
  "rounded-[10px] border bg-card px-3 py-2 text-xs text-muted-foreground";

async function Overview() {
  const o = await read(getOverview, {});
  return (
    <>
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <div className={chip}>
          <b className="block text-base text-foreground">{o.activeCount}</b>
          active achievements
        </div>
        <Link href="/active" className={`${chip} hover:border-primary`}>
          <b className="block text-base text-foreground">{o.dueThisWeek}</b>
          due this week
        </Link>
        <div className={chip}>
          <b className="block text-base text-foreground">🔥 {o.bestStreak}</b>
          day best streak
        </div>
        <Link href="/inbox" className={`${chip} hover:border-primary`}>
          <b className="block text-base text-foreground">{o.inboxCount}</b>
          in Inbox
        </Link>
      </div>

      <div className="hidden grid-cols-2 gap-3 md:grid lg:grid-cols-3">
        {o.areas.map((a) => (
          <AreaCard key={a.id} area={a} today={o.today} />
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
