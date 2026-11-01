"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { markDayPlannedAction } from "@/server/actions/plan";
import { perform } from "./use-mutate";

/** Marks the day planned (the evening reminder skips it) and goes to Today. */
export function DonePlanning({
  day,
  ...props
}: { day: string } & Pick<
  React.ComponentProps<typeof Button>,
  "className" | "size"
>) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      {...props}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const r = await perform(() => markDayPlannedAction({ day }));
        setBusy(false);
        if (r?.ok) router.push("/today");
      }}
    >
      <Check /> Done planning
    </Button>
  );
}
