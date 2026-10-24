import Link from "next/link";
import { Suspense } from "react";
import { formatDeadline, localDate } from "@/lib/dates";
import { read } from "@/server/actions/run";
import { getSettings } from "@/server/domain/settings";
import { getAreaBoard } from "@/server/domain/views";

export default function TrophiesPage({
  params,
}: PageProps<"/areas/[id]/trophies">) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4 md:p-6">
      <Suspense
        fallback={<p className="text-sm text-muted-foreground">Loading…</p>}
      >
        <Trophies params={params} />
      </Suspense>
    </div>
  );
}

async function Trophies({
  params,
}: Pick<PageProps<"/areas/[id]/trophies">, "params">) {
  const { id } = await params;
  const [board, { timeZone }] = await Promise.all([
    read(getAreaBoard, { areaId: id }),
    read(getSettings, {}),
  ]);
  const won = board.achievements
    .filter((a) => a.status === "done")
    .sort(
      (a, b) =>
        (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0),
    );
  return (
    <>
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
        <Link
          href={`/areas/${board.area.id}`}
          className="hover:text-foreground"
        >
          {board.area.emoji} {board.area.name}
        </Link>
      </nav>
      <h1 className="text-xl font-bold md:text-2xl">Trophies</h1>
      {won.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No trophies yet. Finish an achievement to earn one.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {won.map((a) => (
            <li key={a.id}>
              <Link
                href={`/achievements/${a.id}`}
                className="flex flex-col gap-0.5 rounded-[12px] border bg-card p-3 shadow-card hover:border-primary"
              >
                <span className="font-semibold break-words">🏆 {a.title}</span>
                <span className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                  {a.completedAt && (
                    <span>
                      Completed{" "}
                      {formatDeadline(localDate(a.completedAt, timeZone))}
                    </span>
                  )}
                  {a.taskCount > 0 && (
                    <span>
                      {a.doneCount}/{a.taskCount} tasks
                    </span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
