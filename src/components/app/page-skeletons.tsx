import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// Page-shaped placeholders for Suspense fallbacks: the outline of what is
// coming, so the content lands without pushing things around.

const card = "rounded-[12px] border bg-card shadow-card";

/** One status for the whole placeholder; the bars inside are aria-hidden. */
export function Loading({
  testId,
  className,
  children,
}: {
  testId: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role="status"
      aria-label="Loading"
      data-testid={testId}
      className={className}
    >
      {children}
    </div>
  );
}

function Row() {
  return (
    <div data-row className={cn(card, "flex flex-col gap-2 px-3 py-3")}>
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-3 w-1/3" />
    </div>
  );
}

export function ListSkeleton({
  testId,
  rows = 5,
}: {
  testId: string;
  rows?: number;
}) {
  return (
    <Loading testId={testId} className="flex flex-col gap-2">
      {Array.from({ length: rows }, (_, i) => (
        <Row key={i} />
      ))}
    </Loading>
  );
}

export function SectionSkeleton({
  testId,
  rows = 2,
}: {
  testId: string;
  rows?: number;
}) {
  return (
    <Loading testId={testId} className="flex flex-col gap-2.5">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} data-row className="h-9 w-full max-w-md" />
      ))}
    </Loading>
  );
}

export function FormSkeleton({ testId }: { testId: string }) {
  return (
    <Loading
      testId={testId}
      className={cn(card, "flex w-full max-w-sm flex-col gap-3 p-6")}
    >
      <Skeleton className="h-6 w-1/2" />
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-9 w-full" />
      <Skeleton className="mt-1 h-9 w-full" />
    </Loading>
  );
}

function Header({ banner }: { banner: string }) {
  return (
    <div className={cn(card, "overflow-hidden")}>
      <Skeleton className={cn("rounded-none", banner)} />
      <div className="flex items-start gap-3 px-4 pt-3 pb-4">
        <Skeleton className="size-11 shrink-0 rounded-[10px]" />
        <div className="flex flex-1 flex-col gap-2 pt-1">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-2 w-full max-w-xs" />
        </div>
      </div>
    </div>
  );
}

export function OverviewSkeleton() {
  return (
    <Loading testId="skeleton-overview" className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className="flex flex-col gap-1.5 rounded-[10px] border bg-card px-3 py-2"
          >
            <Skeleton className="h-4 w-8" />
            <Skeleton className="h-3 w-24" />
          </div>
        ))}
      </div>
      <div className="hidden grid-cols-2 gap-3 md:grid lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className={cn(card, "overflow-hidden")}>
            <Skeleton className="h-12 rounded-none" />
            <div className="flex flex-col gap-2 px-3 pt-6 pb-3">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-1.5 w-full" />
              <Skeleton className="h-3 w-1/3" />
              <Skeleton className="mt-2 h-3 w-3/4" />
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2 md:hidden">
        {Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-[12px] border bg-card p-2.5"
          >
            <Skeleton className="size-9 shrink-0 rounded-[10px]" />
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-1.5 w-full" />
            </div>
          </div>
        ))}
      </div>
    </Loading>
  );
}

export function AreaSkeleton() {
  return (
    <Loading testId="skeleton-area" className="flex flex-col gap-4">
      <Header banner="h-14" />
      <div className="grid gap-3 md:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div
            key={i}
            className="flex flex-col gap-2 rounded-[12px] bg-muted p-2"
          >
            <Skeleton className="m-1 h-3 w-16" />
            {Array.from({ length: 2 }, (_, j) => (
              <Row key={j} />
            ))}
          </div>
        ))}
      </div>
    </Loading>
  );
}

export function AchievementSkeleton() {
  return (
    <Loading testId="skeleton-achievement" className="flex flex-col gap-5">
      <div className={cn(card, "flex flex-col gap-2 p-4")}>
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-3 w-1/3" />
      </div>
      <div className="flex flex-col gap-2">
        {Array.from({ length: 5 }, (_, i) => (
          <div
            key={i}
            data-row
            className={cn(card, "flex items-center gap-3 px-3 py-3")}
          >
            <Skeleton className="size-5 shrink-0 rounded-full" />
            <Skeleton className="h-4 flex-1" />
          </div>
        ))}
      </div>
    </Loading>
  );
}

function Sections({ rows = [2, 3] }: { rows?: number[] }) {
  return (
    <>
      {rows.map((n, i) => (
        <div key={i} className="flex flex-col gap-2">
          <Skeleton className="m-1 h-3 w-20" />
          {Array.from({ length: n }, (_, j) => (
            <div
              key={j}
              data-row
              className={cn(card, "flex items-center gap-3 px-3 py-3")}
            >
              <Skeleton className="size-4 shrink-0 rounded-sm" />
              <Skeleton className="h-4 flex-1" />
            </div>
          ))}
        </div>
      ))}
    </>
  );
}

/** Today: the title line, then Work and Spare time. */
export function DaySkeleton() {
  return (
    <Loading testId="skeleton-day" className="flex flex-col gap-5">
      <Skeleton className="h-7 w-40" />
      <Sections />
    </Loading>
  );
}

/** Plan tomorrow: the day's sections beside the pick list. */
export function PlanSkeleton() {
  return (
    <Loading
      testId="skeleton-plan"
      className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]"
    >
      <div className="flex flex-col gap-5">
        <Skeleton className="h-7 w-48" />
        <Sections rows={[1, 2]} />
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="m-1 h-3 w-24" />
        {Array.from({ length: 4 }, (_, i) => (
          <Row key={i} />
        ))}
      </div>
    </Loading>
  );
}

/** Week: seven day cards, then the week's list. */
export function WeekSkeleton() {
  return (
    <Loading testId="skeleton-week" className="flex flex-col gap-6">
      <Skeleton className="h-7 w-44" />
      <div className="grid gap-2 md:grid-cols-7">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className={cn(card, "flex flex-col gap-2 p-2")}>
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-full" />
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        {Array.from({ length: 2 }, (_, i) => (
          <Row key={i} />
        ))}
      </div>
    </Loading>
  );
}

/** Goals: a grid of goal cards. */
export function GoalsSkeleton() {
  return (
    <Loading testId="skeleton-goals" className="grid gap-3 md:grid-cols-2">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className={cn(card, "flex flex-col gap-2 p-3")}>
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-1.5 w-full" />
        </div>
      ))}
    </Loading>
  );
}

/** The review: one card per goal, then the week. */
export function ReviewSkeleton() {
  return (
    <Loading testId="skeleton-review" className="flex flex-col gap-4">
      <Skeleton className="h-7 w-48" />
      {Array.from({ length: 2 }, (_, i) => (
        <div key={i} className={cn(card, "flex flex-col gap-2 p-3")}>
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-1.5 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ))}
    </Loading>
  );
}
