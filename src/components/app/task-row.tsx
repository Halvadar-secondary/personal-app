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
import { cn } from "@/lib/utils";
import type { Effort } from "@/lib/xp";
import type { Task } from "@/server/db/goals";
import { CategoryChip, type ChipCategory, today } from "./achievement-card";
import { CategoryPicker, type PickerCategory } from "./category-picker";
import { DateField } from "./date-field";
import { EffortPicker } from "./effort-picker";
import { InlineText } from "./inline-text";

export type TaskItem = Task & { categoryIds: string[] };

export type TaskRowHandlers = {
  onToggle: (task: TaskItem) => void;
  onPatch: (
    id: string,
    patch: Partial<Pick<TaskItem, "title" | "effort" | "deadline">>,
  ) => void;
  onCategories: (id: string, ids: string[]) => void;
  onCreateCategory: (name: string) => Promise<string | null>;
  onDelete: (id: string) => void;
};

export function TaskRow({
  task,
  categories,
  ...on
}: {
  task: TaskItem;
  categories: PickerCategory[];
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
  const done = task.completedAt !== null;
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
        aria-label={`Complete ${task.title}`}
        checked={done}
        disabled={draft}
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
              done && "text-muted-foreground line-through",
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
                isOverdue(task.deadline, today()) &&
                  !done &&
                  "font-semibold text-destructive",
              )}
            />
          </div>
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
