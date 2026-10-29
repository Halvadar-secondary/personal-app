import { Suspense } from "react";
import { GoalDetail } from "@/components/app/goal-detail";
import { AchievementSkeleton } from "@/components/app/page-skeletons";
import { read } from "@/server/actions/run";
import { getGoal } from "@/server/domain/goals";

export default function GoalPage({ params }: PageProps<"/goals/[id]">) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 p-4 md:p-6">
      <Suspense fallback={<AchievementSkeleton />}>
        <Goal params={params} />
      </Suspense>
    </div>
  );
}

async function Goal({ params }: Pick<PageProps<"/goals/[id]">, "params">) {
  const { id } = await params;
  const { goal, achievements } = await read(getGoal, { goalId: id });
  return (
    <GoalDetail
      key={`${goal.id}:${goal.updatedAt.getTime()}`}
      goal={goal}
      achievements={achievements}
    />
  );
}
