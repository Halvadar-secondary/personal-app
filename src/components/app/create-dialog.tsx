"use client";

import { CalendarDays, Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Status } from "@/lib/placement";
import type { Recurrence } from "@/lib/recurrence";
import { cn } from "@/lib/utils";
import type { Effort } from "@/lib/xp";
import { createCategoryAction } from "@/server/actions/categories";
import { createItemAction, createOptionsAction } from "@/server/actions/create";
import { STATUS_LABELS, STATUSES } from "./board-state";
import { type CreatePreset, useCapture } from "./capture-context";
import {
  CATEGORY_COLORS,
  CategoryPicker,
  type PickerCategory,
} from "./category-picker";
import { chipClass } from "./chip";
import {
  type Destination,
  defaultDestination,
  destinationFor,
  type Kind,
  kindForPage,
  loadPrefs,
  savePrefs,
} from "./create-rules";
import { DateField } from "./date-field";
import { DestinationPicker } from "./destination-picker";
import { EffortPicker } from "./effort-picker";
import { RecurrencePicker } from "./recurrence-picker";
import { perform, undo } from "./use-mutate";

// A thrown call is usually a stale action id after a deploy; a reload fixes it.
const RELOAD = "Couldn't save. Reload the page and try again.";

type Options = Awaited<ReturnType<typeof createOptionsAction>>;

/** Typing in a field must never open the dialog. */
function isTyping(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
  );
}

/**
 * The one way to create a task or achievement (C, Capture, "Add …"):
 * a title, notes and property chips, filed where the breadcrumb says.
 */
export function CreateDialog() {
  const { open, setOpen, preset } = useCapture();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key.toLowerCase() !== "c") return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      if (isTyping(e.target)) return;
      e.preventDefault();
      setOpen(true);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [setOpen]);

  // Mounted per opening, so every opening starts clean.
  return open ? (
    <CreateForm preset={preset} onClose={() => setOpen(false)} />
  ) : null;
}

function CreateForm({
  preset,
  onClose,
}: {
  preset: CreatePreset;
  onClose: () => void;
}) {
  const { page } = useCapture();
  const [prefs] = useState(() => loadPrefs());
  const [kind, setKind] = useState<Kind>(
    () => preset.kind ?? kindForPage(page, prefs.kind),
  );
  const [more, setMore] = useState(prefs.more);
  const [dest, setDest] = useState<Destination>(() =>
    defaultDestination(kind, page),
  );
  const [picked, setPicked] = useState(false);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [effort, setEffort] = useState<Effort>(2);
  const [deadline, setDeadline] = useState<string | null>(null);
  const [recurrence, setRecurrence] = useState<Recurrence | null>(null);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [status, setStatus] = useState<Status>(preset.status ?? "backlog");
  const [options, setOptions] = useState<Options | null>(null);
  const [extra, setExtra] = useState<PickerCategory[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const titleRef = useRef<HTMLInputElement>(null);

  // The page can register after the dialog opens (C right after navigating).
  const [seenPage, setSeenPage] = useState(page);
  if (seenPage !== page) {
    setSeenPage(page);
    setDest(destinationFor(kind, dest, picked, page));
  }

  const areaId = dest.area?.id;
  useEffect(() => {
    let live = true;
    createOptionsAction({ areaId })
      .then((o) => live && setOptions(o))
      .catch(() => {}); // Title, notes and Create work without them.
    return () => {
      live = false;
    };
    // Fetched once per opening; the area only orders the categories.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const categories = [...(options?.categories ?? []), ...extra];
  const noun = kind === "task" ? "task" : "achievement";
  const mac =
    typeof navigator !== "undefined" &&
    /Mac|iP(hone|ad)/.test(navigator.platform);

  function remember(next: { kind?: Kind; more?: boolean }) {
    savePrefs({ kind: next.kind ?? kind, more: next.more ?? more });
  }

  function switchKind(next: Kind) {
    if (next === kind) return;
    setKind(next);
    setDest(destinationFor(next, dest, picked, page));
    remember({ kind: next });
  }

  function requestClose() {
    if (title.trim() || notes.trim()) setConfirming(true);
    else onClose();
  }

  async function save() {
    const t = title.trim();
    if (!t || busy.current) return;
    busy.current = true;
    setSaving(true);
    setError(null);
    setCreated(null);
    const n = notes.trim() || null;
    let r: Awaited<ReturnType<typeof createItemAction>> | null;
    try {
      r = await createItemAction(
        kind === "task"
          ? {
              kind,
              achievementId: dest.achievement?.id ?? null,
              title: t,
              notes: n,
              effort,
              deadline,
              recurrence,
              categoryIds,
            }
          : {
              kind,
              areaId: dest.area?.id ?? null,
              title: t,
              notes: n,
              status,
              deadline,
            },
      );
    } catch {
      r = null;
    }
    busy.current = false;
    setSaving(false);
    if (!r || !r.ok) {
      setError(r?.message ?? RELOAD);
      return;
    }
    if (more) {
      setTitle("");
      setNotes("");
      setCreated(t);
      titleRef.current?.focus();
      return;
    }
    onClose();
    const batchId = r.batchId;
    toast(kind === "task" ? "Task created" : "Achievement created", {
      action: { label: "Undo", onClick: () => void undo(batchId) },
    });
  }

  async function createCategory(name: string) {
    const r = await perform(() =>
      createCategoryAction({
        name,
        color: CATEGORY_COLORS[categories.length % 8]!,
      }),
    );
    if (!r?.ok) return null;
    setExtra((e) => [
      ...e,
      {
        id: r.data.id,
        name,
        color: CATEGORY_COLORS[categories.length % 8]!,
        usedInArea: 0,
      },
    ]);
    return r.data.id;
  }

  return (
    <Dialog open onOpenChange={(o) => !o && requestClose()}>
      <DialogContent
        aria-describedby={undefined}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            void save();
          }
        }}
        className="inset-0 flex h-dvh max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none p-0 sm:max-w-none md:inset-auto md:top-[15%] md:left-1/2 md:h-auto md:max-w-[620px] md:-translate-x-1/2 md:rounded-xl"
      >
        <DialogTitle className="sr-only">New {noun}</DialogTitle>
        <DialogDescription className="sr-only">
          Ctrl+Enter creates it.
        </DialogDescription>
        <div className="flex min-w-0 items-center gap-2 px-4 pt-3 pr-12 text-xs text-muted-foreground">
          <div
            role="group"
            aria-label="Kind"
            className="flex shrink-0 rounded-md border p-0.5"
          >
            {(["task", "achievement"] as const).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={kind === k}
                onClick={() => switchKind(k)}
                className={cn(
                  "rounded-[5px] px-2 py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  kind === k
                    ? "bg-accent font-medium text-primary"
                    : "hover:text-foreground",
                )}
              >
                {k === "task" ? "Task" : "Achievement"}
              </button>
            ))}
          </div>
          <DestinationPicker
            kind={kind}
            value={dest}
            targets={options?.targets ?? null}
            onChange={(d) => {
              setDest(d);
              setPicked(true);
            }}
          />
          <span aria-hidden className="shrink-0">
            › New {noun}
          </span>
        </div>
        <div className="flex flex-col px-4 pt-2">
          <input
            ref={titleRef}
            aria-label="Title"
            placeholder={kind === "task" ? "Task title" : "Achievement title"}
            value={title}
            maxLength={kind === "task" ? 300 : 200}
            autoFocus
            onChange={(e) => {
              setTitle(e.target.value);
              setError(null);
              setCreated(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                void save();
              }
            }}
            className="w-full bg-transparent py-1.5 text-xl font-semibold outline-none placeholder:text-faint"
          />
          <textarea
            aria-label="Notes"
            placeholder="Add notes…"
            value={notes}
            maxLength={10_000}
            rows={2}
            onChange={(e) => setNotes(e.target.value)}
            className="field-sizing-content max-h-60 min-h-12 w-full resize-none bg-transparent pb-3 text-sm outline-none placeholder:text-faint"
          />
        </div>
        <div className="flex flex-wrap gap-1.5 px-4 pb-3">
          {kind === "task" ? (
            <>
              <EffortPicker
                value={effort}
                onChange={setEffort}
                prefix="Effort: "
                className={chipClass(true)}
              />
              <DeadlineChip value={deadline} onChange={setDeadline} />
              <RecurrencePicker
                value={recurrence}
                today={options?.today ?? ""}
                locked={false}
                disabled={!options}
                onSave={setRecurrence}
                emptyLabel="Repeat"
                className={chipClass(recurrence !== null)}
              />
              {categoryIds.map((id) => {
                const c = categories.find((x) => x.id === id);
                if (!c) return null;
                return (
                  <span key={id} className={chipClass(true)}>
                    <span
                      aria-hidden
                      className="size-2 rounded-full"
                      style={{ background: c.color }}
                    />
                    {c.name}
                    <button
                      type="button"
                      aria-label={`Remove ${c.name}`}
                      onClick={() =>
                        setCategoryIds((ids) => ids.filter((x) => x !== id))
                      }
                      className="text-faint hover:text-foreground"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                );
              })}
              <CategoryPicker
                categories={categories}
                value={categoryIds}
                onChange={setCategoryIds}
                onCreate={createCategory}
                trigger={
                  <button
                    type="button"
                    disabled={!options}
                    className={chipClass(false)}
                  >
                    <Plus className="size-3" aria-hidden />
                    Category
                  </button>
                }
              />
            </>
          ) : (
            <>
              <StatusChip value={status} onChange={setStatus} />
              <DeadlineChip value={deadline} onChange={setDeadline} />
            </>
          )}
        </div>
        <div className="px-4">
          {error && (
            <p role="alert" className="pb-2 text-sm text-destructive">
              {error}
            </p>
          )}
          {created && (
            <p role="status" className="pb-2 text-sm text-muted-foreground">
              Created “{created}”
            </p>
          )}
        </div>
        <div className="mt-auto flex items-center gap-3 border-t px-4 py-2.5 md:mt-0">
          {confirming ? (
            <>
              <span className="text-sm">Discard this {noun}?</span>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto"
                autoFocus
                onClick={() => {
                  setConfirming(false);
                  titleRef.current?.focus();
                }}
              >
                Keep editing
              </Button>
              <Button variant="destructive" size="sm" onClick={onClose}>
                Discard
              </Button>
            </>
          ) : (
            <>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <button
                  type="button"
                  role="switch"
                  aria-checked={more}
                  aria-label="Create more"
                  onClick={() => {
                    setMore(!more);
                    remember({ more: !more });
                  }}
                  className={cn(
                    "relative h-4 w-7 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    more ? "bg-primary" : "bg-input",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "absolute top-0.5 size-3 rounded-full bg-background transition-[left]",
                      more ? "left-3.5" : "left-0.5",
                    )}
                  />
                </button>
                Create more
              </label>
              <Button
                className="ml-auto"
                disabled={!title.trim() || saving}
                onClick={() => void save()}
              >
                Create {noun}
                <kbd
                  aria-hidden
                  className="rounded border border-primary-foreground/40 px-1 text-[11px] font-normal"
                >
                  {mac ? "⌘" : "Ctrl"} ↵
                </kbd>
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** "Deadline" until set; then the date, with a clear button. */
function DeadlineChip({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (date: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (editing) wrap.current?.querySelector("input")?.focus();
  }, [editing]);

  if (!value && !editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className={chipClass(false)}
      >
        <CalendarDays className="size-3" aria-hidden />
        Deadline
      </button>
    );
  }
  return (
    <span ref={wrap} className={chipClass(value !== null)}>
      <CalendarDays className="size-3" aria-hidden />
      <DateField
        label="Deadline"
        value={value}
        onSave={(d) => {
          onChange(d);
          if (!d) setEditing(false);
        }}
        className="text-xs outline-none"
      />
    </span>
  );
}

function StatusChip({
  value,
  onChange,
}: {
  value: Status;
  onChange: (s: Status) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Status: ${STATUS_LABELS[value]}`}
        className={chipClass(true)}
      >
        <span aria-hidden className="size-2 rounded-full bg-primary" />
        {STATUS_LABELS[value]}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(v) => onChange(v as Status)}
        >
          {STATUSES.map((s) => (
            <DropdownMenuRadioItem key={s} value={s}>
              {STATUS_LABELS[s]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
