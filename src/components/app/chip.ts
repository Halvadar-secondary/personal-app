import { cn } from "@/lib/utils";

/** A create-dialog property chip: outlined when unset, tinted when set. */
export function chipClass(set: boolean): string {
  return cn(
    "inline-flex min-h-9 items-center gap-1.5 rounded-md border px-3 py-1 text-sm outline-none md:min-h-0 md:px-2.5 md:text-xs focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
    set
      ? "border-primary/30 bg-accent text-accent-foreground"
      : "border-border text-muted-foreground hover:text-foreground",
  );
}
