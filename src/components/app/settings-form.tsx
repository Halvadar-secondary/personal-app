"use client";

import { useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { updateSettingsAction } from "@/server/actions/settings";
import type { OwnerSettings } from "@/server/domain/settings";
import { perform } from "./use-mutate";

const noSubscribe = () => () => {};

/** The browser's zone; null while rendering on the server. */
function useDeviceZone(): string | null {
  return useSyncExternalStore(
    noSubscribe,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => null,
  );
}

function zones(current: string): string[] {
  const all = new Set(Intl.supportedValuesOf("timeZone"));
  all.add("UTC");
  all.add(current);
  return [...all].sort();
}

const WEEK_STARTS: [number, string][] = [
  [1, "Monday"],
  [0, "Sunday"],
];

/** Time zone and week start; each change saves at once. */
export function SettingsForm({ initial }: { initial: OwnerSettings }) {
  const [settings, setSettings] = useState(initial);
  const device = useDeviceZone();

  async function save(patch: Partial<OwnerSettings>) {
    const before = settings;
    setSettings({ ...settings, ...patch });
    const r = await perform(() => updateSettingsAction(patch), {
      success: "Saved",
    });
    if (!r?.ok) setSettings(before);
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <label htmlFor="time-zone" className="text-sm font-semibold">
          Time zone
        </label>
        <p className="text-xs text-muted-foreground">
          Streaks, “today” and due dates follow this zone.
        </p>
        <select
          id="time-zone"
          value={settings.timeZone}
          onChange={(e) => save({ timeZone: e.target.value })}
          className="h-9 max-w-sm rounded-md border bg-card px-2 text-sm"
        >
          {zones(settings.timeZone).map((z) => (
            <option key={z} value={z}>
              {z}
            </option>
          ))}
        </select>
        {device && device !== settings.timeZone && (
          <Button
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => save({ timeZone: device })}
          >
            Use this device&apos;s time zone ({device})
          </Button>
        )}
      </section>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold">Week starts on</legend>
        {WEEK_STARTS.map(([day, label]) => (
          <label key={day} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="week-start"
              checked={settings.weekStart === day}
              onChange={() => save({ weekStart: day })}
              className="accent-primary"
            />
            {label}
          </label>
        ))}
      </fieldset>
    </div>
  );
}
