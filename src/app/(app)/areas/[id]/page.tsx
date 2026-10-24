import { Suspense } from "react";
import { AreaBoard } from "@/components/app/area-board";
import { AreaHeader } from "@/components/app/area-header";
import { CaptureDestination } from "@/components/app/capture-context";
import { read } from "@/server/actions/run";
import { listCategories } from "@/server/domain/categories";
import { getAreaBoard } from "@/server/domain/views";

export default function AreaPage({ params }: PageProps<"/areas/[id]">) {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4 md:p-6">
      <Suspense
        fallback={<p className="text-sm text-muted-foreground">Loading…</p>}
      >
        <Area params={params} />
      </Suspense>
    </div>
  );
}

async function Area({ params }: Pick<PageProps<"/areas/[id]">, "params">) {
  const { id } = await params;
  const [board, categories] = await Promise.all([
    read(getAreaBoard, { areaId: id }),
    read(listCategories, { areaId: id }),
  ]);
  return (
    <>
      <CaptureDestination name={board.area.name} />
      <AreaHeader area={board.area} progress={board.progress} />
      {/* Keyed by area so client state never carries over between areas. */}
      <AreaBoard
        key={board.area.id}
        areaId={board.area.id}
        achievements={board.achievements}
        categories={categories.map(({ id, name, color }) => ({
          id,
          name,
          color,
        }))}
      />
    </>
  );
}
