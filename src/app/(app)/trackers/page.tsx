import { Suspense } from "react";
import { TrackersSkeleton } from "@/components/app/page-skeletons";
import { TrackerCard } from "@/components/app/tracker-card";
import { NewTracker } from "@/components/app/tracker-manage";
import { read } from "@/server/actions/run";
import { getSettings } from "@/server/domain/settings";
import { listMoments, listTrackers } from "@/server/domain/trackers";

export default function TrackersPage() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4 md:p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-bold md:text-2xl">Trackers</h1>
        <p className="text-sm text-muted-foreground">
          Log a moment from Capture (C): pick Moment, the tracker, and what was
          happening.
        </p>
      </header>
      <Suspense fallback={<TrackersSkeleton />}>
        <Trackers />
      </Suspense>
    </div>
  );
}

async function Trackers() {
  const [{ trackers }, settings] = await Promise.all([
    read(listTrackers, {}),
    read(getSettings, {}),
  ]);
  const clock = { ...settings, now: new Date() };
  const moments = await Promise.all(
    trackers.map((t) => read(listMoments, { trackerId: t.id })),
  );
  const active = trackers.filter((t) => !t.archivedAt);
  const archived = trackers.filter((t) => t.archivedAt);
  const card = (i: number, list: typeof trackers) => {
    const t = list[i]!;
    return (
      <TrackerCard
        key={`${t.id}:${t.updatedAt.getTime()}`}
        tracker={t}
        moments={moments[trackers.indexOf(t)]!}
        prevId={list[i - 1]?.id ?? null}
        nextId={list[i + 1]?.id ?? null}
        clock={clock}
      />
    );
  };
  return (
    <>
      <NewTracker starters={active.length === 0} />
      {active.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {active.map((_, i) => card(i, active))}
        </div>
      )}
      {archived.length > 0 && (
        <details className="rounded-[12px] border bg-card p-3">
          <summary className="cursor-pointer text-sm font-semibold">
            Archived
          </summary>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {archived.map((_, i) => card(i, archived))}
          </div>
        </details>
      )}
    </>
  );
}
