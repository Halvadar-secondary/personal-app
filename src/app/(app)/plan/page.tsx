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
      {/* Phone: the day switcher centred on its own row, Done planning below
          on the right. Wider screens: one row. */}
      <header className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center justify-center gap-1 md:justify-start">
          <Link
            href={`/plan?day=${addDays(day, -1)}`}
            aria-label="Previous day"
            className={nav}
          >
            <ChevronLeft />
          </Link>
          <div className="text-center md:text-left">
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
        <div className="self-end md:self-auto">
          <DonePlanning day={day} />
        </div>
      </header>
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
        <DayList key={day} day={day} today={d.today} sections={d.sections} />
        <PickList key={`pick-${day}`} day={day} options={options} />
      </div>
    </>
  );
}
