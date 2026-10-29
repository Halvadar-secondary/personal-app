import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { DayList } from "@/components/app/day-list";
import { DonePlanning } from "@/components/app/done-planning";
import { PlanSkeleton } from "@/components/app/page-skeletons";
import { PickList } from "@/components/app/pick-list";
import { buttonVariants } from "@/components/ui/button";
import { addDays } from "@/lib/dates";
import { dayLabel } from "@/lib/plan";
import { read } from "@/server/actions/run";
import { getDay, getPlanOptions } from "@/server/domain/plan";

export default function PlanPage({ searchParams }: PageProps<"/plan">) {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5 p-4 md:p-6">
      <Suspense fallback={<PlanSkeleton />}>
        <Plan searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Plan({
  searchParams,
}: Pick<PageProps<"/plan">, "searchParams">) {
  const raw = (await searchParams).day;
  const asked = Array.isArray(raw) ? raw[0] : raw;
  // No day asked for: tomorrow, by the owner's clock.
  const day = asked ?? addDays((await read(getDay, {})).today, 1);
  const [d, options] = await Promise.all([
    read(getDay, { day }),
    read(getPlanOptions, { day }),
  ]);
  const title =
    day === d.today
      ? "today"
      : day === addDays(d.today, 1)
        ? "tomorrow"
        : dayLabel(day);
  const nav = buttonVariants({ variant: "ghost", size: "icon-sm" });
  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Link
            href={`/plan?day=${addDays(day, -1)}`}
            aria-label="Previous day"
            className={nav}
          >
            <ChevronLeft />
          </Link>
          <div>
            <h1 className="text-xl font-bold md:text-2xl">Plan {title}</h1>
            <p className="text-sm text-muted-foreground">{dayLabel(day)}</p>
          </div>
          <Link
            href={`/plan?day=${addDays(day, 1)}`}
            aria-label="Next day"
            className={nav}
          >
            <ChevronRight />
          </Link>
        </div>
        <DonePlanning day={day} />
      </header>
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
        <DayList key={day} day={day} today={d.today} sections={d.sections} />
        <PickList key={`pick-${day}`} day={day} options={options} />
      </div>
    </>
  );
}
