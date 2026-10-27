"use client";

import { createContext, use, useCallback, useEffect, useState } from "react";
import type { Section } from "@/lib/plan";
import type { NavArea } from "@/server/domain/views";
import type { Kind, PageContext } from "./create-rules";

/** What the button that opened the dialog asks for. */
export type CreatePreset = {
  kind?: Kind;
  status?: "backlog" | "active" | "done";
  /** From Today, the planner and Week: when to do the new task. */
  plan?:
    | { type: "day"; date: string; section: Section }
    | { type: "week"; date: string };
};

type Capture = {
  open: boolean;
  /** Opening this way starts from the page alone, with no preset. */
  setOpen: (open: boolean) => void;
  preset: CreatePreset;
  openCreate: (preset?: CreatePreset) => void;
  /** Where you are, as the area and achievement pages register it. */
  page: PageContext;
  setPage: (page: PageContext) => void;
};

const CaptureContext = createContext<Capture>({
  open: false,
  setOpen: () => {},
  preset: {},
  openCreate: () => {},
  page: null,
  setPage: () => {},
});

/** Holds whether the create dialog is open, so any button can open it. */
export function CaptureProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpenState] = useState(false);
  const [preset, setPreset] = useState<CreatePreset>({});
  const [page, setPage] = useState<PageContext>(null);
  const openCreate = useCallback((p: CreatePreset = {}) => {
    setPreset(p);
    setOpenState(true);
  }, []);
  const setOpen = useCallback(
    (o: boolean) => (o ? openCreate() : setOpenState(false)),
    [openCreate],
  );
  return (
    <CaptureContext
      value={{ open, setOpen, preset, openCreate, page, setPage }}
    >
      {children}
    </CaptureContext>
  );
}

export function useCapture(): Capture {
  return use(CaptureContext);
}

/** Rendered by the area and achievement pages to say where new items go. */
export function CaptureDestination({
  area,
  achievement,
}: {
  area: NavArea | null;
  achievement?: { id: string; title: string };
}) {
  const { setPage } = useCapture();
  // Primitives, so a re-render with equal values doesn't re-register.
  const areaId = area?.id;
  const areaName = area?.name;
  const areaEmoji = area?.emoji ?? null;
  const achId = achievement?.id;
  const achTitle = achievement?.title;
  useEffect(() => {
    setPage({
      area: areaId ? { id: areaId, name: areaName!, emoji: areaEmoji } : null,
      ...(achId ? { achievement: { id: achId, title: achTitle! } } : {}),
    });
    return () => setPage(null);
  }, [areaId, areaName, areaEmoji, achId, achTitle, setPage]);
  return null;
}
