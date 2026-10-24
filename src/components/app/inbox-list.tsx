"use client";

import {
  type CollisionDetection,
  DndContext,
  type DragEndEvent,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { deleteAchievementAction } from "@/server/actions/achievements";
import { fileAchievementAction, fileTaskAction } from "@/server/actions/inbox";
import { deleteTaskAction } from "@/server/actions/tasks";
import type { Achievement, Task } from "@/server/db/goals";
import type { FilingArea } from "@/server/domain/views";
import { FileToMenu } from "./file-to-menu";
import { useMutate } from "./use-mutate";

type Kind = "achievement" | "task";
type Inbox = { achievements: Achievement[]; tasks: Task[] };
type Op = { kind: Kind; id: string };

/** Filing or deleting takes an item out of the Inbox. */
function reducer(inbox: Inbox, op: Op): Inbox {
  return op.kind === "achievement"
    ? {
        ...inbox,
        achievements: inbox.achievements.filter((a) => a.id !== op.id),
      }
    : { ...inbox, tasks: inbox.tasks.filter((t) => t.id !== op.id) };
}

// Prefer what's under the pointer; fall back to overlap for the keyboard.
const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length ? hits : rectIntersection(args);
};

/** The Inbox: sort captured items into areas and achievements. */
export function InboxList({
  inbox,
  targets,
}: {
  inbox: Inbox;
  targets: FilingArea[];
}) {
  const { state, run } = useMutate(reducer, inbox);
  const [dragging, setDragging] = useState<Kind | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const file = (kind: Kind, id: string, targetId: string) =>
    run({ kind, id }, () =>
      kind === "achievement"
        ? fileAchievementAction({ achievementId: id, areaId: targetId })
        : fileTaskAction({ taskId: id, achievementId: targetId }),
    );
  const remove = (kind: Kind, id: string) =>
    run(
      { kind, id },
      () =>
        kind === "achievement"
          ? deleteAchievementAction({ achievementId: id })
          : deleteTaskAction({ taskId: id }),
      { undoable: true },
    );

  function onDragStart({ active }: DragStartEvent) {
    setDragging(active.data.current?.kind as Kind);
  }
  function onDragEnd({ active, over }: DragEndEvent) {
    setDragging(null);
    if (!over) return;
    const kind = active.data.current?.kind as Kind;
    file(kind, String(active.data.current?.id), String(over.data.current?.id));
  }

  if (!state.achievements.length && !state.tasks.length) {
    return (
      <p className="rounded-[12px] border border-dashed p-8 text-center text-sm text-muted-foreground">
        Nothing to sort. Captured items land here.
      </p>
    );
  }

  const row = (kind: Kind, id: string, title: string) => (
    <InboxRow
      key={id}
      kind={kind}
      id={id}
      title={title}
      targets={targets}
      onFile={(targetId) => file(kind, id, targetId)}
      onDelete={() => remove(kind, id)}
    />
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      // A long File-to panel scrolls; only its very edges should scroll it.
      autoScroll={{ threshold: { x: 0, y: 0.05 } }}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDragging(null)}
    >
      <div className="flex gap-6">
        <div className="flex min-w-0 flex-1 flex-col gap-5">
          {state.achievements.length > 0 && (
            <section
              aria-labelledby="inbox-achievements"
              className="flex flex-col gap-2"
            >
              <h2
                id="inbox-achievements"
                className="text-sm font-semibold text-muted-foreground"
              >
                Achievements
              </h2>
              {state.achievements.map((a) => row("achievement", a.id, a.title))}
            </section>
          )}
          {state.tasks.length > 0 && (
            <section
              aria-labelledby="inbox-tasks"
              className="flex flex-col gap-2"
            >
              <h2
                id="inbox-tasks"
                className="text-sm font-semibold text-muted-foreground"
              >
                Tasks
              </h2>
              {state.tasks.map((t) => row("task", t.id, t.title))}
            </section>
          )}
        </div>
        <FilePanel targets={targets} dragging={dragging} />
      </div>
    </DndContext>
  );
}

function InboxRow({
  kind,
  id,
  title,
  targets,
  onFile,
  onDelete,
}: {
  kind: Kind;
  id: string;
  title: string;
  targets: FilingArea[];
  onFile: (targetId: string) => void;
  onDelete: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    isDragging,
  } = useDraggable({ id: `${kind}:${id}`, data: { kind, id } });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={cn(
        "flex items-center gap-2 rounded-[10px] border bg-card px-2 py-2",
        isDragging && "relative z-10 shadow-md",
      )}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        aria-label={`Drag ${title}`}
        {...attributes}
        {...listeners}
        className="hidden cursor-grab touch-none text-faint md:block"
      >
        <GripVertical className="size-4" />
      </button>
      {kind === "achievement" ? (
        <Link
          href={`/achievements/${id}`}
          className="min-w-0 flex-1 text-sm break-words hover:underline"
        >
          {title}
        </Link>
      ) : (
        <span className="min-w-0 flex-1 text-sm break-words">{title}</span>
      )}
      <FileToMenu
        kind={kind}
        title={title}
        targets={targets}
        onFile={onFile}
        onDelete={onDelete}
      />
    </div>
  );
}

/** md and up: drop targets. Areas take achievements; achievements take tasks. */
function FilePanel({
  targets,
  dragging,
}: {
  targets: FilingArea[];
  dragging: Kind | null;
}) {
  return (
    <aside
      aria-label="File to"
      className="sticky top-6 hidden max-h-[calc(100dvh-3rem)] w-64 shrink-0 flex-col gap-2 overflow-y-auto self-start rounded-[12px] border bg-card p-3 md:flex"
    >
      <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        File to
      </h2>
      {targets.length === 0 && (
        <p className="text-sm text-muted-foreground">Make an area first.</p>
      )}
      {targets.map((a) => (
        <div key={a.id} className="flex flex-col gap-1">
          <Target
            id={a.id}
            kind="achievement"
            dragging={dragging}
            className="font-medium"
          >
            {a.emoji && <span aria-hidden>{a.emoji} </span>}
            {a.name}
          </Target>
          {a.achievements.map((ach) => (
            <Target
              key={ach.id}
              id={ach.id}
              kind="task"
              dragging={dragging}
              className="ml-4 text-muted-foreground"
            >
              {ach.title}
            </Target>
          ))}
        </div>
      ))}
    </aside>
  );
}

function Target({
  id,
  kind,
  dragging,
  className,
  children,
}: {
  id: string;
  /** What this target accepts. */
  kind: Kind;
  dragging: Kind | null;
  className?: string;
  children: React.ReactNode;
}) {
  const disabled = dragging !== null && dragging !== kind;
  const { setNodeRef, isOver } = useDroppable({
    id: `${kind}-target:${id}`,
    data: { id },
    disabled,
  });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "truncate rounded-md px-2 py-1 text-sm",
        dragging === kind && "bg-muted",
        disabled && "opacity-40",
        isOver && "bg-accent text-accent-foreground ring-2 ring-primary/40",
        className,
      )}
    >
      {children}
    </div>
  );
}
