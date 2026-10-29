import { Suspense } from "react";
import { GoalCard } from "@/components/app/goal-card";
import { NewGoal } from "@/components/app/new-goal";
import { GoalsSkeleton } from "@/components/app/page-skeletons";
import { read } from "@/server/actions/run";
import { listGoals } from "@/server/domain/goals";

export default function GoalsPage() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold md:text-2xl">Goals</h1>
        <NewGoal />
      </header>
      <Suspense fallback={<GoalsSkeleton />}>
        <Goals />
      </Suspense>
    </div>
  );
}

async function Goals() {
  const { goals } = await read(listGoals, {});
  const active = goals.filter((g) => g.status === "active");
  const done = goals.filter((g) => g.status === "done");
  if (goals.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No goals yet. A goal is a big thing with a deadline, like writing a
        song, that achievements from any area feed.
      </p>
    );
  }
  return (
    <>
      <div className="grid gap-3 md:grid-cols-2">
        {active.map((g) => (
          <GoalCard key={g.id} goal={g} />
        ))}
      </div>
      {done.length > 0 && (
        <section aria-label="Done" className="flex flex-col gap-2">
          <h2 className="px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Done
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {done.map((g) => (
              <GoalCard key={g.id} goal={g} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
