import Link from "next/link";
import { formatDeadline, isOverdue } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { Category } from "@/server/db/goals";
import type { AchievementCard as Card } from "@/server/domain/views";

export type ChipCategory = Pick<Category, "id" | "name" | "color">;

/** Today in the viewer's zone, as YYYY-MM-DD. */
export function today(): string {
  return new Date().toLocaleDateString("en-CA");
}

export function CategoryChip({ category }: { category: ChipCategory }) {
  return (
    // In dark mode the chip's own colour is too dark to read: lighten it.
    <span
      className="rounded-full px-1.5 text-[11px] font-medium text-(--chip) dark:text-[color-mix(in_oklab,var(--chip)_45%,white)]"
      style={
        {
          background: `${category.color}1f`,
          "--chip": category.color,
        } as React.CSSProperties
      }
    >
      {category.name}
    </span>
  );
}

/** Title, progress, deadline and up to 3 category chips. */
export function AchievementSummary({
  card,
  categories,
}: {
  card: Card;
  categories: Map<string, ChipCategory>;
}) {
  const chips = card.categoryIds
    .map((id) => categories.get(id))
    .filter((c) => c !== undefined)
    .slice(0, 3);
  const draft = card.id.startsWith("draft-");
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {draft ? (
        <span className="text-sm font-medium text-muted-foreground">
          {card.title}
        </span>
      ) : (
        <Link
          href={`/achievements/${card.id}`}
          className="text-sm font-medium break-words hover:underline"
        >
          {card.title}
        </Link>
      )}
      {(card.taskCount > 0 || card.deadline || chips.length > 0) && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {card.taskCount > 0 && (
            <span>
              {card.doneCount}/{card.taskCount} tasks
            </span>
          )}
          {card.deadline && (
            <span
              className={cn(
                isOverdue(card.deadline, today()) &&
                  "font-semibold text-destructive",
              )}
            >
              {formatDeadline(card.deadline)}
            </span>
          )}
          {chips.map((c) => (
            <CategoryChip key={c.id} category={c} />
          ))}
        </div>
      )}
    </div>
  );
}
