"use client";

import { Repeat } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { addDays, weekdayOf } from "@/lib/dates";
import {
  buildRecurrence,
  describeRecurrence,
  type Recurrence,
  type RepeatPreset,
  type RepeatSpan,
} from "@/lib/recurrence";
import { cn } from "@/lib/utils";

type Choice = "none" | "stop" | RepeatPreset;

const DAYS: [number, string][] = [
  [1, "Mon"],
  [2, "Tue"],
  [3, "Wed"],
  [4, "Thu"],
  [5, "Fri"],
  [6, "Sat"],
  [0, "Sun"],
];

const SPANS: [RepeatSpan, string][] = [
  ["week", "1 week"],
  ["month", "30 days"],
  ["forever", "Forever"],
];

type PickerState = { choice: Choice; days: number[]; span: RepeatSpan };

/** The picker's starting state for an existing rule. */
function initial(value: Recurrence | null): PickerState {
  if (!value) return { choice: "none", days: [], span: "forever" };
  const days = value.byWeekday ?? [weekdayOf(value.start)];
  const choice: Choice =
    value.freq === "daily"
      ? "daily"
      : [...days].sort().join() === "1,2,3,4,5"
        ? "weekdays"
        : "weekly";
  const until = value.end?.type === "until" ? value.end.date : null;
  const span: RepeatSpan =
    until === addDays(value.start, 6)
      ? "week"
      : until === addDays(value.start, 29)
        ? "month"
        : "forever";
  return { choice, days: value.freq === "weekly" ? days : [], span };
}

function Radio({
  name,
  label,
  checked,
  onChange,
}: {
  name: string;
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onChange}
        className="accent-primary"
      />
      {label}
    </label>
  );
}

/**
 * Presets from spec §4. A task with completions can't stop being
 * repeating (`locked`), so it offers "Stop after today" instead.
 */
export function RecurrencePicker({
  value,
  today,
  locked,
  disabled,
  onSave,
}: {
  value: Recurrence | null;
  today: string;
  locked: boolean;
  disabled?: boolean;
  onSave: (r: Recurrence | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState(() => initial(value));
  const { choice, days, span } = state;
  const set = (patch: Partial<PickerState>) =>
    setState((s) => ({ ...s, ...patch }));
  const off = locked && value ? "stop" : "none";
  const repeats = choice !== "none" && choice !== "stop";

  function save() {
    if (choice === "none") onSave(null);
    else if (choice === "stop") {
      onSave({ ...value!, end: { type: "until", date: today } });
    } else {
      onSave(
        buildRecurrence(
          { preset: choice, days, span },
          value?.start ?? today,
          today,
        ),
      );
    }
    setOpen(false);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        if (o) setState(initial(value));
        setOpen(o);
      }}
    >
      <PopoverTrigger
        disabled={disabled}
        aria-label={`Repeat: ${value ? describeRecurrence(value) : "Doesn't repeat"}`}
        className="flex items-center gap-1 rounded-full px-1.5 text-[11px] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
      >
        <Repeat className="size-3" />
        {value ? describeRecurrence(value) : null}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 gap-3 p-3">
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1 text-xs font-semibold">Repeat</legend>
          <Radio
            name="repeat"
            label={off === "stop" ? "Stop after today" : "Doesn't repeat"}
            checked={choice === off}
            onChange={() => set({ choice: off })}
          />
          <Radio
            name="repeat"
            label="Daily"
            checked={choice === "daily"}
            onChange={() => set({ choice: "daily" })}
          />
          <Radio
            name="repeat"
            label="Weekdays"
            checked={choice === "weekdays"}
            onChange={() => set({ choice: "weekdays" })}
          />
          <Radio
            name="repeat"
            label="Weekly on…"
            checked={choice === "weekly"}
            onChange={() => set({ choice: "weekly" })}
          />
          {choice === "weekly" && (
            <div className="flex flex-wrap gap-1 pl-5">
              {DAYS.map(([d, label]) => {
                const on = days.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      set({
                        days: on ? days.filter((x) => x !== d) : [...days, d],
                      })
                    }
                    className={cn(
                      "rounded-md border px-1.5 py-0.5 text-xs",
                      on && "border-primary bg-primary text-primary-foreground",
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}
        </fieldset>
        {repeats && (
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1 text-xs font-semibold">For</legend>
            {SPANS.map(([s, label]) => (
              <Radio
                key={s}
                name="span"
                label={label}
                checked={span === s}
                onChange={() => set({ span: s })}
              />
            ))}
          </fieldset>
        )}
        <Button
          size="sm"
          disabled={choice === "weekly" && days.length === 0}
          onClick={save}
        >
          Save
        </Button>
      </PopoverContent>
    </Popover>
  );
}
