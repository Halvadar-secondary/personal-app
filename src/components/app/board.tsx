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
import { placeOnBoard, type Slot, type Status } from "@/lib/placement";
import { cn } from "@/lib/utils";
import type { AchievementCard } from "@/server/domain/views";
import { AchievementSummary, type ChipCategory } from "./achievement-card";
import { AddAchievement } from "./add-achievement";
import { columnsOf, STATUS_LABELS, STATUSES } from "./board-state";

type Props = {
  cards: AchievementCard[];
  categories: Map<string, ChipCategory>;
  onMove: (id: string, to: Slot & { status: Status }) => void;
  onAdd: (title: string, status: Status) => void;
};

const COLUMN = "column:";

/** md and up: Backlog / Active / Done, with drag between and within. */
export function Board({ cards, categories, onMove, onAdd }: Props) {
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
    const to = placeOnBoard(columns, String(active.id), target);
    if (to) onMove(String(active.id), to);
  }

  return (
    <section aria-label="Board" className="hidden gap-4 md:grid md:grid-cols-3">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragEnd={onDragEnd}
      >
        {STATUSES.map((status) => (
          <Column
            key={status}
            status={status}
            cards={columns[status].map((id) => byId.get(id)!)}
            categories={categories}
            onAdd={(title) => onAdd(title, status)}
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
  onAdd,
}: {
  status: Status;
  cards: AchievementCard[];
  categories: Map<string, ChipCategory>;
  onAdd: (title: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: COLUMN + status });
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
      <AddAchievement onAdd={onAdd} className="mt-auto bg-card" />
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
    transform,
    transition,
    isDragging,
  } = useSortable({ id: card.id, disabled: card.id.startsWith("draft-") });
  return (
    <div
      ref={setNodeRef}
      data-card
      {...attributes}
      {...listeners}
      aria-label={`Move ${card.title}`}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "cursor-grab touch-none rounded-[10px] border bg-card p-2.5 shadow-card outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isDragging && "z-10 opacity-80 shadow-md",
      )}
    >
      <AchievementSummary card={card} categories={categories} />
    </div>
  );
}
