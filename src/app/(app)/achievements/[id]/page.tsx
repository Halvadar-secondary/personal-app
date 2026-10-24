import { Suspense } from "react";
import { AchievementHeader } from "@/components/app/achievement-header";
import { CaptureDestination } from "@/components/app/capture-context";
import { TaskList } from "@/components/app/task-list";
import { read } from "@/server/actions/run";
import { getAchievement } from "@/server/domain/achievements";
import { listAreas } from "@/server/domain/areas";
import { listCategories } from "@/server/domain/categories";

export default function AchievementPage({
  params,
}: PageProps<"/achievements/[id]">) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 p-4 md:p-6">
      <Suspense
        fallback={<p className="text-sm text-muted-foreground">Loading…</p>}
      >
        <Achievement params={params} />
      </Suspense>
    </div>
  );
}

async function Achievement({
  params,
}: Pick<PageProps<"/achievements/[id]">, "params">) {
  const { id } = await params;
  const { achievement, tasks } = await read(getAchievement, {
    achievementId: id,
  });
  const [areas, categories] = await Promise.all([
    read(listAreas, {}),
    read(listCategories, { areaId: achievement.areaId ?? undefined }),
  ]);
  return (
    <>
      <CaptureDestination name={achievement.title} />
      <AchievementHeader
        key={`${achievement.id}:${achievement.updatedAt.getTime()}`}
        achievement={achievement}
        areas={areas.map(({ id, name, emoji }) => ({ id, name, emoji }))}
      />
      <TaskList
        key={achievement.id}
        achievementId={achievement.id}
        tasks={tasks}
        categories={categories.map(({ id, name, color, usedInArea }) => ({
          id,
          name,
          color,
          usedInArea,
        }))}
      />
    </>
  );
}
