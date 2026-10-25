"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { createAreaAction } from "@/server/actions/areas";
import { AreaForm } from "./area-form";
import { perform } from "./use-mutate";

/** "New area": the dashed grid tile (md and up) or a button (phone). */
export function NewArea({ variant }: { variant: "tile" | "button" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      {variant === "tile" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex min-h-40 items-center justify-center gap-1 rounded-[12px] border-2 border-dashed border-[var(--dashed)] text-faint hover:border-primary hover:text-primary"
        >
          <Plus className="size-4" /> New area
        </button>
      ) : (
        <Button variant="outline" onClick={() => setOpen(true)}>
          <Plus /> New area
        </Button>
      )}
      <AreaForm
        open={open}
        onOpenChange={setOpen}
        onSubmit={async (values) => {
          const r = await perform(() => createAreaAction(values));
          if (r?.ok) {
            setOpen(false);
            router.push(`/areas/${r.data.id}`);
          }
        }}
      />
    </>
  );
}
