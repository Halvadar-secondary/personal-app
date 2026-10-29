import { trendGood, trendText } from "@/lib/trackers";
import { cn } from "@/lib/utils";

// Shared by the Trackers page (client) and the review's Patterns (server):
// no directive, so both can call these.

export const trackerLabel = (t: { name: string; emoji: string | null }) =>
  t.emoji ? `${t.emoji} ${t.name}` : t.name;

/** "Same as last week" etc., coloured by whether it went the wanted way. */
export function Trend({
  direction,
  diff,
  than,
}: {
  direction: "less" | "more";
  diff: number;
  than?: string;
}) {
  const good = trendGood(direction, diff);
  return (
    <span
      data-good={good === null ? "same" : String(good)}
      className={cn(
        "text-xs",
        good ? "font-medium text-primary" : "text-muted-foreground",
      )}
    >
      {trendText(diff, than)}
    </span>
  );
}
