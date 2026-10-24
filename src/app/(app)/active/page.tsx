import Link from "next/link";
import { Suspense } from "react";
import { CaptureButton } from "@/components/app/capture-button";
import { PracticeList } from "@/components/app/practice-list";
import { formatDeadline, isOverdue } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { read } from "@/server/actions/run";
import { getActive } from "@/server/domain/views";

export default function ActivePage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 p-4 md:p-6">
      <header className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold md:text-2xl">Active</h1>
        <CaptureButton />
      </header>
      <Suspense
        fallback={<p className="text-sm text-muted-foreground">Loading…</p>}
      >
        <Active />
      </Suspense>
    </div>
  );
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <h2
        id={id}
        className="px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function Deadline({ date, today }: { date: string; today: string }) {
  return (
    <span
      className={cn(isOverdue(date, today) && "font-semibold text-destructive")}
    >
      {formatDeadline(date)}
    </span>
  );
}

async function Active() {
  const { today, practice, dueSoon, groups } = await read(getActive, {});
  return (
    <>
      <Section id="today" title="Today">
        {/* Keyed by day so a new day starts from the server's state. */}
        <PracticeList key={today} tasks={practice} />
      </Section>

      {dueSoon.length > 0 && (
        <Section id="due-soon" title="Due soon">
          <ul className="flex flex-col gap-1.5">
            {dueSoon.map((d) => (
              <li key={`${d.kind}:${d.id}`}>
                <Link
                  href={`/achievements/${d.achievementId}`}
                  className="flex items-baseline justify-between gap-3 rounded-[10px] border bg-card px-3 py-2 text-sm hover:border-primary"
                >
                  <span className="min-w-0 break-words">
                    {d.kind === "achievement" && "🎯 "}
                    {d.title}
                    <span className="block text-xs text-muted-foreground">
                      {d.area.emoji} {d.area.name}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs">
                    <Deadline date={d.deadline} today={today} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section id="active-achievements" title="Active achievements">
        {groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing active. Move an achievement to Active to see it here.
          </p>
        ) : (
          groups.map((g) => (
            <div key={g.area.id} className="flex flex-col gap-1.5">
              <Link
                href={`/areas/${g.area.id}`}
                className="px-1 text-sm font-semibold hover:text-primary"
              >
                {g.area.emoji} {g.area.name}
              </Link>
              <ul className="flex flex-col gap-1.5">
                {g.achievements.map((a) => (
                  <li key={a.id}>
                    <Link
                      href={`/achievements/${a.id}`}
                      className="flex flex-col gap-0.5 rounded-[10px] border bg-card px-3 py-2 hover:border-primary"
                    >
                      <span className="text-sm font-medium break-words">
                        {a.title}
                      </span>
                      <span className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                        {a.taskCount > 0 && (
                          <span>
                            {a.doneCount}/{a.taskCount} tasks
                          </span>
                        )}
                        {a.deadline && (
                          <Deadline date={a.deadline} today={today} />
                        )}
                        {a.upNext && (
                          <span className="min-w-0 truncate">
                            Up next: {a.upNext.title}
                          </span>
                        )}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </Section>
    </>
  );
}
