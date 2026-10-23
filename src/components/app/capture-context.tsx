"use client";

import { createContext, use, useState } from "react";

type Capture = { open: boolean; setOpen: (open: boolean) => void };

const CaptureContext = createContext<Capture>({
  open: false,
  setOpen: () => {},
});

/** Holds whether the capture dialog is open, so any button can open it. */
export function CaptureProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return <CaptureContext value={{ open, setOpen }}>{children}</CaptureContext>;
}

export function useCapture(): Capture {
  return use(CaptureContext);
}
