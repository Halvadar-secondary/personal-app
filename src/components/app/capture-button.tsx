"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCapture } from "./capture-context";

/** The header's "+ Capture" (md and up; the tab bar has it below). */
export function CaptureButton({ className }: { className?: string }) {
  const { setOpen } = useCapture();
  return (
    <Button
      onClick={() => setOpen(true)}
      className={cn("hidden md:inline-flex", className)}
    >
      <Plus /> Capture
    </Button>
  );
}
