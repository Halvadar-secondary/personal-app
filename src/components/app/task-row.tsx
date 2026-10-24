"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { isOverdue } from "@/lib/dates";
import { completionStrip, hasEnded, isDueOn } from "@/lib/recurrence";
import { cn } from "@/lib/utils";
import type { Effort } from "@/lib/xp";
import type { Task } from "@/server/db/goals";
import { CategoryChip, type ChipCategory } from "./achievement-card";
import { CategoryPicker, type PickerCategory } from "./category-picker";
import { CompletionStrip } from "./completion-strip";
import { DateField } from "./date-field";
import { EffortPicker } from "./effort-picker";
import { InlineText } from "./inline-text";
import { RecurrencePicker } from "./recurrence-picker";

export type TaskItem = Task & {
  categoryIds: string[];
  /** Repeating tasks: completed days inside the 4-week strip. */
  recentDone: string[];
  hasCompletions: boolean;
};

export type TaskRowHandlers = {
  onToggle: (task: TaskItem) => void;
  onPatch: (
    id: string,
    patch: Partial<
      Pick<TaskItem, "title" | "effort" | "deadline" | "recurrence">
    >,
  ) => void;
  onCategories: (id: string, ids: string[]) => void;
  onCreateCategory: (name: string) => Promise<string | null>;
  onDelete: (id: string) => void;
};

export function TaskRow({
  task,
  categories,
  today,
  weekStart,
  ...on
}: {
  task: TaskItem;
  categories: PickerCategory[];
  /** The owner's date. */
  today: string;
  weekStart: number;
} & TaskRowHandlers) {
  const draft = task.id.startsWith("draft-");
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id, disabled: draft });
  const rule = task.recurrence;
  // A repeating task is "done" for today only; one-off tasks for good.
  const done = rule
    ? task.recentDone.includes(today)
    : task.completedAt !== null;
  const notDue = rule !== null && !isDueOn(rule, today);
  const chips = new Map<string, ChipCategory>(categories.map((c) => [c.id, c]));

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "flex items-start gap-2 rounded-[10px] border bg-card px-2 py-2",
        isDragging && "relative z-10 shadow-md",
      )}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        aria-label={`Reorder ${task.title}`}
        disabled={draft}
        {...attributes}
        {...listeners}
        className="mt-0.5 cursor-grab touch-none text-faint outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <GripVertical className="size-4" />
      </button>
      <Checkbox
        aria-label={
          rule ? `Complete ${task.title} for today` : `Complete ${task.title}`
        }
        title={notDue ? "Not due today" : undefined}
        checked={done}
        disabled={draft || notDue}
        onCheckedChange={() => on.onToggle(task)}
        className="mt-0.5"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {draft ? (
          // Not saved yet: there's no id to send an edit to.
          <span className="text-sm text-muted-foreground">{task.title}</span>
        ) : (
          <InlineText
            value={task.title}
            label="Task title"
            maxLength={300}
            onSave={(title) => on.onPatch(task.id, { title })}
            className={cn(
              "text-sm",
              done && !rule && "text-muted-foreground line-through",
            )}
          />
        )}
        {!draft && (
          <div className="flex flex-wrap items-center gap-1.5">
            <EffortPicker
              value={task.effort as Effort}
              onChange={(effort) => on.onPatch(task.id, { effort })}
            />
            {task.categoryIds.map((id) => {
              const c = chips.get(id);
              return c && <CategoryChip key={id} category={c} />;
            })}
            <CategoryPicker
              categories={categories}
              value={task.categoryIds}
              onChange={(ids) => on.onCategories(task.id, ids)}
              onCreate={on.onCreateCategory}
            />
            <DateField
              label="Deadline"
              value={task.deadline}
              onSave={(deadline) => on.onPatch(task.id, { deadline })}
              className={cn(
                "h-5 rounded-sm text-[11px] text-muted-foreground",
                isOverdue(task.deadline, today) &&
                  !done &&
                  "font-semibold text-destructive",
              )}
            />
            <RecurrencePicker
              value={rule}
              today={today}
              locked={task.hasCompletions}
              // A finished one-off task can't start repeating.
              disabled={!rule && task.completedAt !== null}
              onSave={(recurrence) => on.onPatch(task.id, { recurrence })}
            />
            {rule && hasEnded(rule, today) && (
              <span className="text-[11px] text-muted-foreground">Ended</span>
            )}
          </div>
        )}
        {rule && (
          <CompletionStrip
            days={completionStrip(
              rule,
              new Set(task.recentDone),
              today,
              weekStart,
            )}
          />
        )}
      </div>
      {!draft && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`Task menu ${task.title}`}
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => on.onDelete(task.id)}
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </li>
  );
}
