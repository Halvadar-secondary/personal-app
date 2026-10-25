import Link from "next/link";
import { Suspense } from "react";
import { ListSkeleton } from "@/components/app/page-skeletons";
import { HistoryList } from "@/components/app/history-list";
import { read } from "@/server/actions/run";
import { listHistory } from "@/server/domain/history-view";

export default function HistoryPage({ searchParams }: PageProps<"/history">) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4 md:p-6">
      <h1 className="text-xl font-bold md:text-2xl">History</h1>
      <Suspense fallback={<ListSkeleton testId="skeleton-history" rows={6} />}>
        <History searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function History({
  searchParams,
}: Pick<PageProps<"/history">, "searchParams">) {
  const raw = (await searchParams).before;
  const n = Number(Array.isArray(raw) ? raw[0] : raw);
  // A missing or malformed cursor just means the first page.
  const before = Number.isInteger(n) && n > 0 ? n : undefined;
  const { batches, nextBefore } = await read(listHistory, { before });
  return (
    <>
      {/* Keyed by page so a new page starts with no undo in flight. */}
      <HistoryList key={before ?? "first"} batches={batches} />
      {nextBefore !== null && (
        <Link
          href={`/history?before=${nextBefore}`}
          className="self-center text-sm text-muted-foreground hover:text-foreground"
        >
          Show older
        </Link>
      )}
    </>
  );
}
