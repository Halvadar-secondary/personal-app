import type { LevelProgress } from "@/lib/levels";
import { cn } from "@/lib/utils";

// Game-style progress, quiet by design: numbers only, no fanfare.

export function LevelBadge({ level }: { level: number }) {
  return (
    <span
      aria-label={`Level ${level}`}
      className="shrink-0 rounded-[8px] bg-badge px-1.5 py-px text-[10px] font-extrabold text-badge-foreground"
    >
      LV {level}
    </span>
  );
}

export function XpBar({
  progress,
  className,
}: {
  progress: LevelProgress;
  className?: string;
}) {
  const pct = Math.min(100, (progress.into / progress.span) * 100);
  return (
    <div
      role="progressbar"
      aria-label={`XP toward level ${progress.level + 1}`}
      aria-valuemin={0}
      aria-valuemax={progress.span}
      aria-valuenow={progress.into}
      className={cn(
        "h-1.5 overflow-hidden rounded-full bg-xp-track",
        className,
      )}
    >
      <div
        className="h-full rounded-full"
        style={{ width: `${pct}%`, background: "var(--xp-gradient)" }}
      />
    </div>
  );
}

export function Streak({ days }: { days: number }) {
  if (days === 0) return null;
  return <span aria-label={`${days}-day streak`}>🔥 {days}</span>;
}

export function Trophies({ count }: { count: number }) {
  if (count === 0) return null;
  const label = count === 1 ? "1 trophy" : `${count} trophies`;
  return <span aria-label={label}>🏆 {count}</span>;
}
