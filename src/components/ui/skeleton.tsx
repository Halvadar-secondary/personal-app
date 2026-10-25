import { cn } from "@/lib/utils";

/** A placeholder bar; screen readers hear the surrounding status instead. */
export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      aria-hidden
      data-slot="skeleton"
      className={cn(
        "animate-pulse rounded-md bg-skeleton motion-reduce:animate-none",
        className,
      )}
      {...props}
    />
  );
}
