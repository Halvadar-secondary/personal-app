"use client";

import { CalendarClock, Plus, Target as TargetIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { addDays, formatDeadline, weekStartOf } from "@/lib/dates";
import {
  dayLabel,
  formatProgress,
  type Section,
  SECTION_LABELS,
  SECTIONS,
} from "@/lib/plan";
import { cn } from "@/lib/utils";
import { logProgressAction } from "@/server/actions/plan";
import { chipClass } from "./chip";
import { perform, undo } from "./use-mutate";

// The plan and target chips: in the create dialog, on task rows, on Today.

/** When to do a task, as the chips edit it (the section rides separately). */
export type ChipPlan =
  { type: "day"; date: string } | { type: "week"; date: string } | null;

export type ChipTarget = { amount: number; unit: string } | null;

/** "Today", "Tomorrow", "Thu Mar 12", "This week", "Next week", "Week of Mar 23". */
export function whenText(
  plan: ChipPlan,
  today: string,
  weekStart: number,
): string {
  if (!plan) return "When";
  // Before the owner's date is known (the dialog's options load), no "Today".
  if (plan.type === "day") {
    if (today && plan.date === today) return "Today";
    if (today && plan.date === addDays(today, 1)) return "Tomorrow";
    return dayLabel(plan.date);
  }
  const start = weekStartOf(plan.date, weekStart);
  if (today) {
    const thisWeek = weekStartOf(today, weekStart);
    if (start === thisWeek) return "This week";
    if (start === addDays(thisWeek, 7)) return "Next week";
  }
  return `Week of ${formatDeadline(start)}`;
}

/** A plausible typed date, as DateField accepts. */
const PLAUSIBLE = /^(19|2\d)\d{2}-\d{2}-\d{2}$/;

export function WhenPicker({
  value,
  today,
  weekStart,
  onChange,
  disabled,
  className,
}: {
  value: ChipPlan;
  today: string;
  weekStart: number;
  onChange: (plan: ChipPlan) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [picking, setPicking] = useState(false);
  const [draft, setDraft] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (picking) input.current?.focus();
  }, [picking]);
  const text = whenText(value, today, weekStart);
  const thisWeek = today ? weekStartOf(today, weekStart) : "";

  if (picking) {
    const done = () => {
      setPicking(false);
      if (PLAUSIBLE.test(draft)) onChange({ type: "day", date: draft });
    };
    return (
      <span className={className ?? chipClass(true)}>
        <CalendarClock className="size-3" aria-hidden />
        <input
          ref={input}
          type="date"
          aria-label="Pick a day"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={done}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              done();
            } else if (e.key === "Escape") {
              e.stopPropagation();
              setPicking(false);
            }
          }}
          className="bg-transparent text-xs outline-none"
        />
      </span>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled}
        aria-label={`When: ${value ? text : "none"}`}
        className={className ?? chipClass(value !== null)}
      >
        <CalendarClock className="size-3" aria-hidden />
        {text}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem
          onSelect={() => onChange({ type: "day", date: today })}
        >
          Today
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => onChange({ type: "day", date: addDays(today, 1) })}
        >
          Tomorrow
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => onChange({ type: "week", date: thisWeek })}
        >
          This week
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() =>
            onChange({ type: "week", date: addDays(thisWeek, 7) })
          }
        >
          Next week
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            setDraft(value?.type === "day" ? value.date : "");
            setPicking(true);
          }}
        >
          Pick a day…
        </DropdownMenuItem>
        {value && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onChange(null)}>
              No date
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function SectionPicker({
  value,
  onChange,
  className,
}: {
  value: Section;
  onChange: (section: Section) => void;
  className?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Section: ${SECTION_LABELS[value]}`}
        className={className ?? chipClass(true)}
      >
        {SECTION_LABELS[value]}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(v) => onChange(v as Section)}
        >
          {SECTIONS.map((s) => (
            <DropdownMenuRadioItem key={s} value={s}>
              {SECTION_LABELS[s]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const UNITS = ["times", "hours", "pages", "lessons"];

export function TargetPicker({
  value,
  onChange,
  disabled,
  className,
}: {
  value: ChipTarget;
  onChange: (target: ChipTarget) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("1");
  const [unit, setUnit] = useState("times");
  const [word, setWord] = useState("");
  const text = value ? `${value.amount} ${value.unit}` : "Target";

  function start(o: boolean) {
    if (o) {
      setAmount(String(value?.amount ?? 1));
      const known = !value || UNITS.includes(value.unit);
      setUnit(known ? (value?.unit ?? "times") : "other");
      setWord(known ? "" : value!.unit);
    }
    setOpen(o);
  }

  const n = Number(amount);
  const name = unit === "other" ? word.trim() : unit;
  const valid = n > 0 && n <= 1_000_000 && name.length > 0 && name.length <= 20;

  return (
    <Popover open={open} onOpenChange={start}>
      <PopoverTrigger
        disabled={disabled}
        aria-label={`Target: ${value ? text : "none"}`}
        className={className ?? chipClass(value !== null)}
      >
        <TargetIcon className="size-3" aria-hidden />
        {text}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60">
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) return;
            onChange({ amount: n, unit: name });
            setOpen(false);
          }}
        >
          <div className="flex gap-2">
            <label className="flex flex-1 flex-col gap-1 text-xs">
              Amount
              <input
                type="number"
                min={1}
                step="any"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="rounded-md border bg-transparent px-2 py-1 text-sm"
              />
            </label>
            <label className="flex flex-1 flex-col gap-1 text-xs">
              Unit
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="rounded-md border bg-transparent px-1 py-1 text-sm"
              >
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
                <option value="other">other…</option>
              </select>
            </label>
          </div>
          {unit === "other" && (
            <label className="flex flex-col gap-1 text-xs">
              Unit name
              <input
                value={word}
                maxLength={20}
                onChange={(e) => setWord(e.target.value)}
                className="rounded-md border bg-transparent px-2 py-1 text-sm"
              />
            </label>
          )}
          <div className="flex justify-end gap-2">
            {value && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="Clear target"
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                Clear
              </Button>
            )}
            <Button
              type="submit"
              size="sm"
              disabled={!valid}
              aria-label="Set target"
            >
              Set
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

/** A target's progress with a bar, and + to log more. */
export function ProgressButton({
  taskId,
  title,
  unit,
  amount,
  progress,
  disabled,
}: {
  taskId: string;
  title: string;
  unit: string;
  amount: number;
  progress: number;
  disabled?: boolean;
}) {
  const hours = unit === "hours";
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(hours ? "30" : "1");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const share = Math.min(1, progress / amount);

  async function log() {
    const n = Number(value);
    if (!(n > 0) || busy) return;
    setBusy(true);
    const r = await perform(() =>
      logProgressAction({
        taskId,
        amount: n,
        ...(note.trim() ? { note: note.trim() } : {}),
      }),
    );
    setBusy(false);
    if (!r?.ok) return;
    setOpen(false);
    setNote("");
    const batchId = r.batchId;
    toast(r.data.completed ? "Target reached" : "Logged", {
      action: { label: "Undo", onClick: () => void undo(batchId) },
    });
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <span
        aria-hidden
        className="h-1.5 w-14 overflow-hidden rounded-full bg-muted"
      >
        <span
          className="block h-full rounded-full bg-primary"
          style={{ width: `${share * 100}%` }}
        />
      </span>
      <span className="tabular-nums">
        {formatProgress(progress, amount, unit)}
      </span>
      <Popover
        open={open}
        onOpenChange={(o) => {
          if (o) setValue(hours ? "30" : "1");
          setOpen(o);
        }}
      >
        <PopoverTrigger
          disabled={disabled}
          aria-label={`Log progress on ${title}`}
          className={cn(
            "rounded-sm p-0.5 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
          )}
        >
          <Plus className="size-3.5" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-56">
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void log();
            }}
          >
            <label className="flex flex-col gap-1 text-xs">
              {hours ? "Minutes" : "Amount"}
              <input
                type="number"
                min={0}
                step="any"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="rounded-md border bg-transparent px-2 py-1 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              Note
              <input
                value={note}
                maxLength={2000}
                onChange={(e) => setNote(e.target.value)}
                className="rounded-md border bg-transparent px-2 py-1 text-sm"
              />
            </label>
            <Button type="submit" size="sm" disabled={busy}>
              Log
            </Button>
          </form>
        </PopoverContent>
      </Popover>
    </span>
  );
}
