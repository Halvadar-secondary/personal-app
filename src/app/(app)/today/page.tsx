import Link from "next/link";
import { Suspense } from "react";
import { CaptureButton } from "@/components/app/capture-button";
import { DayList } from "@/components/app/day-list";
import { DaySkeleton } from "@/components/app/page-skeletons";
import { QuickLog } from "@/components/app/quick-log";
import { buttonVariants } from "@/components/ui/button";
import { dayLabel } from "@/lib/plan";
import { read } from "@/server/actions/run";
import { getDay } from "@/server/domain/plan";
import { listTrackers } from "@/server/domain/trackers";

export default function TodayPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 p-4 md:p-6">
      <Suspense fallback={<DaySkeleton />}>
        <Today />
      </Suspense>
    </div>
  );
}

async function Today() {
  const [d, { trackers }] = await Promise.all([
    read(getDay, {}),
    read(listTrackers, {}),
  ]);
  const empty = d.sections.work.length + d.sections.spare.length === 0;
  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold md:text-2xl">Today</h1>
          <p className="text-sm text-muted-foreground">{dayLabel(d.day)}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/week" className={buttonVariants({ variant: "ghost" })}>
            Week
          </Link>
          <Link href="/plan" className={buttonVariants({ variant: "outline" })}>
            Plan tomorrow
          </Link>
          <CaptureButton />
        </div>
      </header>
      <QuickLog
        trackers={trackers
          .filter((t) => !t.archivedAt)
          .map(({ id, name, emoji, today }) => ({ id, name, emoji, today }))}
      />
      {empty && (
        <div className="flex flex-col items-start gap-2 rounded-[12px] border border-dashed p-4">
          <p className="text-sm text-muted-foreground">
            Nothing planned for today.
          </p>
          <Link
            href={`/plan?day=${d.day}`}
            className={buttonVariants({ size: "sm" })}
          >
            Plan today
          </Link>
        </div>
      )}
      {/* Keyed by day so a new day starts from the server's state. */}
      <DayList key={d.day} day={d.day} today={d.today} sections={d.sections} />
    </>
  );
}
