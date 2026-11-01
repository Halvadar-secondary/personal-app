import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { ReviewSkeleton } from "@/components/app/page-skeletons";
import { Patterns } from "@/components/app/patterns";
import { ReviewGoal, ReviewTasks } from "@/components/app/review-sections";
import { WeekView } from "@/components/app/week-view";
import { buttonVariants } from "@/components/ui/button";
import { addDays, formatDeadline } from "@/lib/dates";
import { read } from "@/server/actions/run";
import { getReview } from "@/server/domain/goals";
import { getSettings } from "@/server/domain/settings";
import { getPatterns } from "@/server/domain/trackers";

export default function ReviewPage({ searchParams }: PageProps<"/review">) {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 p-4 md:p-6">
      <Suspense fallback={<ReviewSkeleton />}>
        <Review searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const areaName = (a: { name: string; emoji: string | null }) =>
  a.emoji ? `${a.emoji} ${a.name}` : a.name;

async function Review({
  searchParams,
}: Pick<PageProps<"/review">, "searchParams">) {
  const raw = (await searchParams).start;
  const start = Array.isArray(raw) ? raw[0] : raw;
  const r = await read(getReview, { start });
  const [patterns, settings] = await Promise.all([
    read(getPatterns, { start: r.start }),
    read(getSettings, {}),
  ]);
  const nav = buttonVariants({ variant: "ghost", size: "icon-sm" });
  return (
    <>
      <header className="flex flex-col gap-1">
        <div className="flex items-center justify-center gap-1 md:justify-start">
          <Link
            href={`/review?start=${addDays(r.start, -7)}`}
            aria-label="Previous week"
            className={nav}
          >
            <ChevronLeft />
          </Link>
          <h1 className="text-xl font-bold md:text-2xl">Plan your week</h1>
          <Link
            href={`/review?start=${addDays(r.start, 7)}`}
            aria-label="Next week"
            className={nav}
          >
            <ChevronRight />
          </Link>
        </div>
        <p className="text-sm text-muted-foreground">
          Week of {formatDeadline(r.start)} · Last week: {r.lastWeek.done} done,{" "}
          {r.lastWeek.rolled} rolled over
        </p>
      </header>

      {r.goals.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No active goals.{" "}
          <Link href="/goals" className="underline">
            Add one
          </Link>{" "}
          to plan your week around it.
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {r.goals.map((g) => (
            <ReviewGoal
              key={`${g.goal.id}:${r.start}`}
              start={r.start}
              goal={g.goal}
              tasks={g.tasks}
            />
          ))}
        </div>
      )}

      {r.unlinked.length > 0 && (
        <details className="rounded-[12px] border bg-card p-3">
          <summary className="cursor-pointer text-sm font-semibold">
            Achievements with no goal
          </summary>
          <div className="mt-3 flex flex-col gap-3">
            {r.unlinked.map((u) => (
              <section
                key={u.achievement.id}
                aria-label={u.achievement.title}
                className="flex flex-col gap-1"
              >
                <h3 className="text-sm font-medium">
                  {areaName(u.area)} · {u.achievement.title}
                </h3>
                <ReviewTasks
                  key={`${u.achievement.id}:${r.start}`}
                  start={r.start}
                  tasks={u.tasks}
                  empty=""
                />
              </section>
            ))}
          </div>
        </details>
      )}

      <Patterns patterns={patterns} clock={{ ...settings, now: new Date() }} />

      <section aria-label="Your week" className="flex flex-col gap-2">
        <h2 className="px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Your week
        </h2>
        <WeekView key={r.week.start} week={r.week} />
      </section>
    </>
  );
}
