"use client";

import {
  closestCorners,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, MoreHorizontal, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { addDays } from "@/lib/dates";
import { dragAnnouncements } from "@/lib/drag-announcements";
import { placeOnBoard } from "@/lib/placement";
import { type Section, SECTION_LABELS, SECTIONS } from "@/lib/plan";
import { cn } from "@/lib/utils";
import { placeTaskAction, planTaskAction } from "@/server/actions/plan";
import {
  completeTaskAction,
  uncompleteTaskAction,
} from "@/server/actions/tasks";
import type { DayItem, Sections } from "@/server/domain/plan";
import { useCapture } from "./capture-context";
import { ProgressButton } from "./plan-chips";
import { useMutate } from "./use-mutate";

type Op =
  | { type: "done"; id: string; done: boolean }
  | { type: "remove"; id: string }
  | {
      type: "move";
      id: string;
      section: Section;
      afterId: string | null;
      beforeId: string | null;
    };

function reducer(state: Sections, op: Op): Sections {
  const all = [...state.work, ...state.spare];
  const without = (s: Section) => state[s].filter((i) => i.id !== op.id);
  switch (op.type) {
    case "done":
      return {
        work: state.work.map((i) =>
          i.id === op.id ? { ...i, done: op.done } : i,
        ),
        spare: state.spare.map((i) =>
          i.id === op.id ? { ...i, done: op.done } : i,
        ),
      };
    case "remove":
      return { work: without("work"), spare: without("spare") };
    case "move": {
      const moving = all.find((i) => i.id === op.id);
      if (!moving) return state;
      // A moved one-off is adopted by the day: no longer "rolled".
      const moved: DayItem = {
        ...moving,
        section: op.section,
        ...(moving.kind === "once"
          ? { rolledFrom: null, rolledLabel: null }
          : {}),
      };
      const next = { work: without("work"), spare: without("spare") };
      const list = next[op.section];
      const at = op.afterId
        ? list.findIndex((i) => i.id === op.afterId) + 1
        : op.beforeId
          ? list.findIndex((i) => i.id === op.beforeId)
          : list.length;
      next[op.section] = [...list.slice(0, at), moved, ...list.slice(at)];
      return next;
    }
  }
}

const ZONE = "section:";

/**
 * A day's Work and Spare time lists: tick, reorder and move between them,
 * replan a one-off from its menu, add to a section.
 */
export function DayList({
  day,
  today,
  sections,
}: {
  day: string;
  /** The owner's date: repeating tasks can only be ticked today. */
  today: string;
  sections: Sections;
}) {
  const { state, run } = useMutate(reducer, sections);
  const { openCreate } = useCapture();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const byId = new Map(
    [...state.work, ...state.spare].map((i) => [i.id, i] as const),
  );

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over) return;
    const overId = String(over.id);
    const target = overId.startsWith(ZONE)
      ? { column: overId.slice(ZONE.length) as Section, id: null }
      : { column: byId.get(overId)!.section, id: overId };
    const to = placeOnBoard(
      {
        work: state.work.map((i) => i.id),
        spare: state.spare.map((i) => i.id),
      },
      String(active.id),
      target,
    );
    if (!to) return;
    const id = String(active.id);
    void run({ type: "move", id, section: to.status, ...to }, () =>
      placeTaskAction({
        taskId: id,
        day,
        section: to.status,
        afterId: to.afterId,
        beforeId: to.beforeId,
      }),
    );
  }

  const toggle = (i: DayItem) =>
    run({ type: "done", id: i.id, done: !i.done }, () =>
      i.done
        ? uncompleteTaskAction({ taskId: i.id })
        : completeTaskAction({ taskId: i.id }),
    );
  const replan = (
    i: DayItem,
    plan: Parameters<typeof planTaskAction>[0]["plan"],
  ) =>
    run({ type: "remove", id: i.id }, () =>
      planTaskAction({ taskId: i.id, plan }),
    );

  return (
    <DndContext
      sensors={sensors}
      accessibility={{
        announcements: dragAnnouncements((id) => {
          const key = String(id);
          return key.startsWith(ZONE)
            ? SECTION_LABELS[key.slice(ZONE.length) as Section]
            : byId.get(key)?.title;
        }),
      }}
      collisionDetection={closestCorners}
      onDragEnd={onDragEnd}
    >
      <div className="flex flex-col gap-5">
        {SECTIONS.map((s) => (
          <DaySection
            key={s}
            section={s}
            day={day}
            today={today}
            items={state[s]}
            onToggle={toggle}
            onReplan={replan}
          />
        ))}
        {/* One way in; the task dialog picks Work or Spare time. */}
        <Button
          variant="outline"
          className="self-center rounded-full px-6"
          onClick={() =>
            openCreate({
              kind: "task",
              plan: { type: "day", date: day, section: "work" },
            })
          }
        >
          <Plus /> Add task
        </Button>
      </div>
    </DndContext>
  );
}

function DaySection({
  section,
  day,
  today,
  items,
  onToggle,
  onReplan,
}: {
  section: Section;
  day: string;
  today: string;
  items: DayItem[];
  onToggle: (i: DayItem) => void;
  onReplan: (
    i: DayItem,
    plan: Parameters<typeof planTaskAction>[0]["plan"],
  ) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: ZONE + section });
  const label = SECTION_LABELS[section];
  const done = items.filter((i) => i.done).length;
  return (
    <section
      aria-label={label}
      ref={setNodeRef}
      className={cn(
        "flex flex-col gap-2 rounded-[12px] p-1",
        isOver && "ring-2 ring-primary/40",
      )}
    >
      <h2 className="flex items-center justify-between px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
        {items.length > 0 && (
          <span className="font-normal tabular-nums">
            {done}/{items.length}
          </span>
        )}
      </h2>
      <SortableContext
        items={items.map((i) => i.id)}
        strategy={verticalListSortingStrategy}
      >
        <ul className="flex flex-col gap-1.5">
          {items.map((i) => (
            <DayRow
              key={i.id}
              item={i}
              day={day}
              today={today}
              onToggle={onToggle}
              onReplan={onReplan}
            />
          ))}
        </ul>
      </SortableContext>
    </section>
  );
}

const areaName = (a: { name: string; emoji: string | null }) =>
  a.emoji ? `${a.emoji} ${a.name}` : a.name;

function DayRow({
  item,
  day,
  today,
  onToggle,
  onReplan,
}: {
  item: DayItem;
  day: string;
  today: string;
  onToggle: (i: DayItem) => void;
  onReplan: (
    i: DayItem,
    plan: Parameters<typeof planTaskAction>[0]["plan"],
  ) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });
  const [picking, setPicking] = useState(false);
  const notToday = item.kind === "repeat" && day !== today;
  const where = item.achievement
    ? [item.area && areaName(item.area), item.achievement.title]
        .filter(Boolean)
        .join(" · ")
    : null;

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
        aria-label={`Move ${item.title}`}
        {...attributes}
        {...listeners}
        className="mt-0.5 cursor-grab touch-none text-faint outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <GripVertical className="size-4" />
      </button>
      <Checkbox
        aria-label={`Complete ${item.title}`}
        title={notToday ? "Only today" : undefined}
        checked={item.done}
        disabled={notToday}
        onCheckedChange={() => onToggle(item)}
        className="mt-0.5"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          className={cn(
            "text-sm break-words",
            item.done && "text-muted-foreground line-through",
          )}
        >
          {item.title}
        </span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {item.rolledLabel && (
            <span className="rounded-full bg-badge px-1.5 font-medium text-badge-foreground">
              {item.rolledLabel}
            </span>
          )}
          {where && (
            <Link
              href={`/achievements/${item.achievement!.id}`}
              className="min-w-0 truncate hover:text-foreground"
            >
              {where}
            </Link>
          )}
          {item.target && (
            <ProgressButton
              taskId={item.id}
              title={item.title}
              unit={item.target.unit}
              amount={item.target.amount}
              progress={item.target.progress}
              disabled={item.done}
            />
          )}
        </span>
        {picking && (
          <input
            type="date"
            aria-label={`Move ${item.title} to a day`}
            autoFocus
            onBlur={() => setPicking(false)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setPicking(false);
            }}
            onChange={(e) => {
              if (/^(19|2\d)\d{2}-\d{2}-\d{2}$/.test(e.target.value)) {
                setPicking(false);
                onReplan(item, { type: "day", date: e.target.value });
              }
            }}
            className="w-fit rounded-md border bg-transparent px-2 py-0.5 text-xs"
          />
        )}
      </div>
      {item.kind === "once" && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`Task menu ${item.title}`}
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={() =>
                onReplan(item, { type: "day", date: addDays(day, 1) })
              }
            >
              {day === today ? "Move to tomorrow" : "Move to the next day"}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setPicking(true)}>
              Pick a day…
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => onReplan(item, { type: "week", date: day })}
            >
              Move to this week&apos;s list
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onReplan(item, null)}>
              Remove from plan
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </li>
  );
}
