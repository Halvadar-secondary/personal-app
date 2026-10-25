import Link from "next/link";
import { Suspense } from "react";
import { ListSkeleton } from "@/components/app/page-skeletons";
import { SearchBox, SearchBoxShell } from "@/components/app/search-box";
import {
  SearchPendingProvider,
  SearchResults,
} from "@/components/app/search-pending";
import { read } from "@/server/actions/run";
import { search } from "@/server/domain/search";
import type { NavArea } from "@/server/domain/views";

export default function SearchPage({ searchParams }: PageProps<"/search">) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4 md:p-6">
      <h1 className="text-xl font-bold md:text-2xl">Search</h1>
      <SearchPendingProvider>
        {/* Two boundaries: the box needs only the URL, so it shows first. */}
        <Suspense fallback={<SearchBoxShell />}>
          <SearchBox />
        </Suspense>
        <Suspense fallback={<ListSkeleton testId="skeleton-search" />}>
          <SearchResults>
            <Results searchParams={searchParams} />
          </SearchResults>
        </Suspense>
      </SearchPendingProvider>
    </div>
  );
}

function where(area: NavArea | null) {
  return area ? `${area.emoji ?? ""} ${area.name}`.trim() : "Inbox";
}

function Group({
  title,
  rows,
}: {
  title: string;
  rows: { key: string; href: string; label: string; meta: string }[];
}) {
  if (rows.length === 0) return null;
  return (
    <section className="flex flex-col gap-1.5">
      <h2 className="px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </h2>
      <ul className="flex flex-col gap-1.5">
        {rows.map((r) => (
          <li key={r.key}>
            <Link
              href={r.href}
              className="flex flex-col rounded-[10px] border bg-card px-3 py-2 hover:border-primary"
            >
              <span className="text-sm break-words">{r.label}</span>
              <span className="text-xs text-muted-foreground">{r.meta}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

async function Results({
  searchParams,
}: Pick<PageProps<"/search">, "searchParams">) {
  const raw = (await searchParams).q;
  const q = (Array.isArray(raw) ? raw[0] : raw)?.trim().slice(0, 100) ?? "";
  const r = q ? await read(search, { q }) : null;
  const found = r
    ? r.areas.length + r.achievements.length + r.tasks.length > 0
    : false;
  return (
    <>
      {!r ? (
        <p className="text-sm text-muted-foreground">
          Type to search areas, achievements, tasks and the Inbox.
        </p>
      ) : !found ? (
        <p className="text-sm text-muted-foreground">Nothing matches “{q}”.</p>
      ) : (
        <>
          <Group
            title="Areas"
            rows={r.areas.map((a) => ({
              key: a.id,
              href: `/areas/${a.id}`,
              label: `${a.emoji ?? ""} ${a.name}`.trim(),
              meta: "Area",
            }))}
          />
          <Group
            title="Achievements"
            rows={r.achievements.map((a) => ({
              key: a.id,
              href: `/achievements/${a.id}`,
              label: a.title,
              meta: where(a.area),
            }))}
          />
          <Group
            title="Tasks"
            rows={r.tasks.map((t) => ({
              key: t.id,
              href: t.achievementId
                ? `/achievements/${t.achievementId}`
                : "/inbox",
              label: t.title,
              meta: t.achievementTitle
                ? `${where(t.area)} · ${t.achievementTitle}`
                : "Inbox",
            }))}
          />
        </>
      )}
    </>
  );
}
