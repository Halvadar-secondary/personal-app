import { Suspense } from "react";
import { SettingsForm } from "@/components/app/settings-form";
import { read } from "@/server/actions/run";
import { getSettings } from "@/server/domain/settings";

export default function SettingsPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 p-4 md:p-6">
      <h1 className="text-xl font-bold md:text-2xl">Settings</h1>
      <Suspense
        fallback={<p className="text-sm text-muted-foreground">Loading…</p>}
      >
        <Settings />
      </Suspense>
    </div>
  );
}

async function Settings() {
  return <SettingsForm initial={await read(getSettings, {})} />;
}
