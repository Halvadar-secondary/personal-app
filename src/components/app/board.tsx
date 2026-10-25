"use client";

import {
  closestCorners,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
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
import { GripVertical } from "lucide-react";
import { dragAnnouncements } from "@/lib/drag-announcements";
import { placeOnBoard, type Slot, type Status } from "@/lib/placement";
import { cn } from "@/lib/utils";
import type { AchievementCard } from "@/server/domain/views";
import { AchievementSummary, type ChipCategory } from "./achievement-card";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { columnsOf, confirmed, STATUS_LABELS, STATUSES } from "./board-state";
import { useCapture } from "./capture-context";

type Props = {
  cards: AchievementCard[];
  categories: Map<string, ChipCategory>;
  onMove: (id: string, to: Slot & { status: Status }) => void;
};

const COLUMN = "column:";

/** md and up: Backlog / Active / Done, with drag between and within. */
export function Board({ cards, categories, onMove }: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const columns = columnsOf(cards);
  const byId = new Map(cards.map((c) => [c.id, c]));

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over) return;
    const overId = String(over.id);
    const target = overId.startsWith(COLUMN)
      ? { column: overId.slice(COLUMN.length) as Status, id: null }
      : { column: byId.get(overId)!.status, id: overId };
    const real = {
      backlog: confirmed(columns.backlog),
      active: confirmed(columns.active),
      done: confirmed(columns.done),
    };
    const to = placeOnBoard(real, String(active.id), target);
    if (to) onMove(String(active.id), to);
  }

  return (
    <section aria-label="Board" className="hidden gap-4 md:grid md:grid-cols-3">
      <DndContext
        sensors={sensors}
        accessibility={{
          announcements: dragAnnouncements((id) => {
            const key = String(id);
            return key.startsWith(COLUMN)
              ? STATUS_LABELS[key.slice(COLUMN.length) as Status]
              : byId.get(key)?.title;
          }),
        }}
        collisionDetection={closestCorners}
        onDragEnd={onDragEnd}
      >
        {STATUSES.map((status) => (
          <Column
            key={status}
            status={status}
            cards={columns[status].map((id) => byId.get(id)!)}
            categories={categories}
          />
        ))}
      </DndContext>
    </section>
  );
}

function Column({
  status,
  cards,
  categories,
}: {
  status: Status;
  cards: AchievementCard[];
  categories: Map<string, ChipCategory>;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: COLUMN + status });
  const { openCreate } = useCapture();
  return (
    <div
      ref={setNodeRef}
      data-column={status}
      className={cn(
        "flex min-h-40 flex-col gap-2 rounded-[12px] bg-muted/60 p-2",
        isOver && "ring-2 ring-primary/40",
      )}
    >
      <h2 className="flex items-center justify-between px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {STATUS_LABELS[status]}
        <span className="font-normal">{cards.length}</span>
      </h2>
      <SortableContext
        items={cards.map((c) => c.id)}
        strategy={verticalListSortingStrategy}
      >
        {cards.map((c) => (
          <SortableCard key={c.id} card={c} categories={categories} />
        ))}
      </SortableContext>
      <Button
        variant="ghost"
        aria-label={`Add achievement to ${STATUS_LABELS[status]}`}
        className="mt-auto justify-start text-muted-foreground"
        onClick={() => openCreate({ kind: "achievement", status })}
      >
        <Plus /> Add achievement
      </Button>
    </div>
  );
}

function SortableCard({
  card,
  categories,
}: {
  card: AchievementCard;
  categories: Map<string, ChipCategory>;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: card.id, disabled: card.id.startsWith("draft-") });
  return (
    // The whole card drags with a pointer; the keyboard (and screen readers)
    // use the handle, so no button wraps the card's link.
    <div
      ref={setNodeRef}
      data-card
      {...listeners}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "flex cursor-grab touch-none items-start gap-1.5 rounded-[10px] border bg-card p-2.5 shadow-card",
        isDragging && "z-10 opacity-80 shadow-md",
      )}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        {...attributes}
        aria-label={`Move ${card.title}`}
        className="mt-0.5 shrink-0 rounded-sm text-faint outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <GripVertical className="size-4" />
      </button>
      <AchievementSummary card={card} categories={categories} />
    </div>
  );
}
