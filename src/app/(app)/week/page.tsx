import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { WeekSkeleton } from "@/components/app/page-skeletons";
import { WeekView } from "@/components/app/week-view";
import { buttonVariants } from "@/components/ui/button";
import { addDays, formatDeadline } from "@/lib/dates";
import { read } from "@/server/actions/run";
import { getWeek } from "@/server/domain/plan";

export default function WeekPage({ searchParams }: PageProps<"/week">) {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 p-4 md:p-6">
      <Suspense fallback={<WeekSkeleton />}>
        <Week searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Week({
  searchParams,
}: Pick<PageProps<"/week">, "searchParams">) {
  const raw = (await searchParams).start;
  const start = Array.isArray(raw) ? raw[0] : raw;
  const w = await read(getWeek, { start });
  const nav = buttonVariants({ variant: "ghost", size: "icon-sm" });
  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Link
            href={`/week?start=${addDays(w.start, -7)}`}
            aria-label="Previous week"
            className={nav}
          >
            <ChevronLeft />
          </Link>
          <h1 className="text-xl font-bold md:text-2xl">
            Week of {formatDeadline(w.start)}
          </h1>
          <Link
            href={`/week?start=${addDays(w.start, 7)}`}
            aria-label="Next week"
            className={nav}
          >
            <ChevronRight />
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/goals" className={buttonVariants({ variant: "ghost" })}>
            Goals
          </Link>
          <Link
            href="/review"
            className={buttonVariants({ variant: "outline" })}
          >
            Plan your week
          </Link>
        </div>
      </header>
      <WeekView key={w.start} week={w} />
    </>
  );
}
