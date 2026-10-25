import { cn } from "@/lib/utils";

/** A create-dialog property chip: outlined when unset, tinted when set. */
export function chipClass(set: boolean): string {
  return cn(
    "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
    set
      ? "border-primary/30 bg-accent text-accent-foreground"
      : "border-border text-muted-foreground hover:text-foreground",
  );
}
