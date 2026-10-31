"use client";

import { useState } from "react";
import { updateSettingsAction } from "@/server/actions/settings";
import { perform } from "./use-mutate";

type TierKey = "quick" | "smart" | "deep";
type Field = "chatModelQuick" | "chatModelSmart" | "chatModelDeep";

const FIELD: Record<TierKey, Field> = {
  quick: "chatModelQuick",
  smart: "chatModelSmart",
  deep: "chatModelDeep",
};

export type TierRow = { tier: TierKey; label: string; name: string };

/** Which Claude model each chat tier uses: the newest, or one you pin. */
export function ChatModelSettings({
  tiers,
  overrides,
}: {
  tiers: TierRow[];
  overrides: Record<TierKey, string | null>;
}) {
  const [pinned, setPinned] = useState(overrides);
  const [drafts, setDrafts] = useState(
    () =>
      Object.fromEntries(
        tiers.map((t) => [t.tier, overrides[t.tier] ?? ""]),
      ) as Record<TierKey, string>,
  );
  const [errors, setErrors] = useState<Partial<Record<TierKey, string>>>({});

  async function save(tier: TierKey, value: string | null) {
    const r = await perform(
      () => updateSettingsAction({ [FIELD[tier]]: value }),
      { success: "Saved" },
    );
    setErrors((e) => ({ ...e, [tier]: r && !r.ok ? r.message : "" }));
    if (r?.ok) {
      setPinned((p) => ({ ...p, [tier]: value }));
      if (value === null) setDrafts((d) => ({ ...d, [tier]: "" }));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">
        Each tier uses the newest model of its kind unless you pin a model id,
        such as claude-opus-5.
      </p>
      {tiers.map(({ tier, label, name }) => {
        const draft = drafts[tier].trim();
        return (
          <div key={tier} className="flex flex-col gap-1">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-sm font-medium">{label}</span>
              <span className="text-sm text-muted-foreground">{name}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {pinned[tier] ? `Pinned: ${pinned[tier]}` : "Automatic (newest)"}
            </p>
            <div className="flex flex-wrap gap-2">
              <input
                aria-label={`${label} model id`}
                value={drafts[tier]}
                placeholder="claude-…"
                onChange={(e) =>
                  setDrafts((d) => ({ ...d, [tier]: e.target.value }))
                }
                className="min-w-0 flex-1 rounded-md border bg-card px-2 py-1.5 text-sm"
              />
              <button
                type="button"
                aria-label={`Pin ${label}`}
                disabled={!draft || draft === pinned[tier]}
                onClick={() => save(tier, draft)}
                className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
              >
                Pin
              </button>
              <button
                type="button"
                aria-label={`Use automatic for ${label}`}
                disabled={!pinned[tier]}
                onClick={() => save(tier, null)}
                className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
              >
                Automatic
              </button>
            </div>
            {errors[tier] ? (
              <p role="alert" className="text-xs text-destructive">
                {errors[tier]}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
