"use client";

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { dragAnnouncements } from "@/lib/drag-announcements";
import { placeInList, type Slot } from "@/lib/placement";
import {
  createCategoryAction,
  setTaskCategoriesAction,
} from "@/server/actions/categories";
import {
  completeTaskAction,
  createTaskAction,
  deleteTaskAction,
  moveTaskAction,
  uncompleteTaskAction,
  updateTaskAction,
} from "@/server/actions/tasks";
import { confirmed } from "./board-state";
import { CATEGORY_COLORS, type PickerCategory } from "./category-picker";
import { type TaskItem, TaskRow } from "./task-row";
import { perform, useMutate } from "./use-mutate";

type Patch = Partial<
  Pick<
    TaskItem,
    | "title"
    | "effort"
    | "deadline"
    | "recurrence"
    | "completedAt"
    | "categoryIds"
    | "recentDone"
    | "hasCompletions"
  >
>;
type Op =
  | { type: "add"; task: TaskItem }
  | { type: "patch"; id: string; patch: Patch }
  | { type: "remove"; id: string }
  | ({ type: "move"; id: string } & Slot);

function reducer(tasks: TaskItem[], op: Op): TaskItem[] {
  switch (op.type) {
    case "add":
      return [...tasks, op.task];
    case "patch":
      return tasks.map((t) => (t.id === op.id ? { ...t, ...op.patch } : t));
    case "remove":
      return tasks.filter((t) => t.id !== op.id);
    case "move": {
      const task = tasks.find((t) => t.id === op.id);
      const rest = tasks.filter((t) => t.id !== op.id);
      if (!task) return tasks;
      const at = op.afterId
        ? rest.findIndex((t) => t.id === op.afterId) + 1
        : rest.findIndex((t) => t.id === op.beforeId);
      return [...rest.slice(0, at), task, ...rest.slice(at)];
    }
  }
}

function draftTask(achievementId: string, title: string): TaskItem {
  const now = new Date();
  return {
    id: `draft-${crypto.randomUUID()}`,
    ownerId: "",
    achievementId,
    areaId: null,
    title,
    notes: null,
    effort: 2,
    deadline: null,
    recurrence: null,
    completedAt: null,
    sortKey: "",
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    categoryIds: [],
    recentDone: [],
    hasCompletions: false,
  };
}

/** The achievement's checklist: complete, edit, tag, reorder, add. */
export function TaskList({
  achievementId,
  tasks,
  categories,
  today,
  weekStart,
}: {
  achievementId: string;
  tasks: TaskItem[];
  categories: PickerCategory[];
  /** The owner's date, for repeating tasks and deadlines. */
  today: string;
  weekStart: number;
}) {
  const { state, run } = useMutate(reducer, tasks);
  const [title, setTitle] = useState("");
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over) return;
    const ids = confirmed(state.map((t) => t.id));
    const slot = placeInList(
      ids,
      String(active.id),
      ids.indexOf(String(over.id)),
    );
    if (!slot) return;
    const id = String(active.id);
    run({ type: "move", id, ...slot }, () =>
      moveTaskAction({ taskId: id, ...slot }),
    );
  }

  const patch = (
    id: string,
    p: Pick<Patch, "title" | "effort" | "deadline" | "recurrence">,
  ) =>
    run({ type: "patch", id, patch: p }, () =>
      updateTaskAction({ taskId: id, ...p }),
    );

  /** One-off: done for good. Repeating: done for today only. */
  function toggle(t: TaskItem) {
    const undo = t.recurrence
      ? t.recentDone.includes(today)
      : t.completedAt !== null;
    const p: Patch = t.recurrence
      ? {
          recentDone: undo
            ? t.recentDone.filter((d) => d !== today)
            : [...t.recentDone, today],
        }
      : { completedAt: undo ? null : new Date() };
    if (!undo) p.hasCompletions = true;
    return run({ type: "patch", id: t.id, patch: p }, () =>
      undo
        ? uncompleteTaskAction({ taskId: t.id })
        : completeTaskAction({ taskId: t.id }),
    );
  }

  return (
    <section aria-label="Tasks" className="flex flex-col gap-2">
      <DndContext
        sensors={sensors}
        accessibility={{
          announcements: dragAnnouncements(
            (id) => state.find((t) => t.id === id)?.title,
          ),
        }}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
      >
        <SortableContext
          items={state.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          <ul className="flex flex-col gap-1.5">
            {state.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                categories={categories}
                today={today}
                weekStart={weekStart}
                onToggle={toggle}
                onPatch={patch}
                onCategories={(id, categoryIds) =>
                  run({ type: "patch", id, patch: { categoryIds } }, () =>
                    setTaskCategoriesAction({ taskId: id, categoryIds }),
                  )
                }
                onCreateCategory={async (name) => {
                  const r = await perform(() =>
                    createCategoryAction({
                      name,
                      color: CATEGORY_COLORS[categories.length % 8]!,
                    }),
                  );
                  return r?.ok ? r.data.id : null;
                }}
                onDelete={(id) =>
                  run(
                    { type: "remove", id },
                    () => deleteTaskAction({ taskId: id }),
                    { undoable: true },
                  )
                }
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      <Input
        aria-label="Add task"
        placeholder="+ Add task"
        value={title}
        maxLength={300}
        className="bg-card"
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          const t = title.trim();
          if (e.key !== "Enter" || !t) return;
          e.preventDefault();
          setTitle("");
          run({ type: "add", task: draftTask(achievementId, t) }, () =>
            createTaskAction({ achievementId, title: t, effort: 2 }),
          );
        }}
      />
    </section>
  );
}
