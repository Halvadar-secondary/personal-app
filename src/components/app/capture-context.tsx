"use client";

import { createContext, use, useEffect, useState } from "react";

type Capture = {
  open: boolean;
  setOpen: (open: boolean) => void;
  /** The current page's name for the "→ …" hint; null means the Inbox. */
  destination: string | null;
  setDestination: (name: string | null) => void;
};

const CaptureContext = createContext<Capture>({
  open: false,
  setOpen: () => {},
  destination: null,
  setDestination: () => {},
});

/** Holds whether the capture dialog is open, so any button can open it. */
export function CaptureProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [destination, setDestination] = useState<string | null>(null);
  return (
    <CaptureContext value={{ open, setOpen, destination, setDestination }}>
      {children}
    </CaptureContext>
  );
}

export function useCapture(): Capture {
  return use(CaptureContext);
}

/** Rendered by the area and achievement pages to name where capture goes. */
export function CaptureDestination({ name }: { name: string }) {
  const { setDestination } = useCapture();
  useEffect(() => {
    setDestination(name);
    return () => setDestination(null);
  }, [name, setDestination]);
  return null;
}
