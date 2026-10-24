import { formatDeadline } from "@/lib/dates";
import type { StripDay, StripState } from "@/lib/recurrence";
import { cn } from "@/lib/utils";

const LOOK: Record<StripState, string> = {
  done: "bg-primary",
  missed: "bg-destructive/25",
  due: "bg-card ring-1 ring-primary",
  upcoming: "bg-xp-track",
  off: "bg-transparent",
};

/** Four weeks of a repeating task: done / missed / due / upcoming. */
export function CompletionStrip({ days }: { days: StripDay[] }) {
  return (
    <ol aria-label="Last 4 weeks" className="flex flex-wrap gap-[3px]">
      {days.map((d, i) => (
        <li
          key={d.date}
          title={`${formatDeadline(d.date)}: ${d.state}`}
          className={cn(
            "size-2 rounded-[2px]",
            LOOK[d.state],
            // A gap between weeks.
            i % 7 === 6 && i < 27 && "mr-1",
          )}
        />
      ))}
    </ol>
  );
}
