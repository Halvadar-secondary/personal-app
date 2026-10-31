import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { SectionSkeleton } from "@/components/app/page-skeletons";
import { ConnectedApps } from "@/components/app/connected-apps";
import { Passkeys } from "@/components/app/passkeys";
import { ReminderSettings } from "@/components/app/reminder-settings";
import { SettingsForm } from "@/components/app/settings-form";
import { SignOutButton } from "@/components/app/sign-out";
import { read } from "@/server/actions/run";
import { mcpResource } from "@/server/auth/auth";
import { requireOwner } from "@/server/auth/require-owner";
import { getDb } from "@/server/db/client";
import { getReminder } from "@/server/domain/reminders";
import { getSettings } from "@/server/domain/settings";
import { listConnectedApps } from "@/server/mcp/connected";

export default function SettingsPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 p-4 md:p-6">
      <h1 className="text-xl font-bold md:text-2xl">Settings</h1>
      <Suspense
        fallback={<SectionSkeleton testId="skeleton-settings" rows={3} />}
      >
        <Settings />
      </Suspense>
      <section className="flex flex-col gap-2 border-t pt-5">
        <h2 className="text-sm font-semibold">Evening reminder</h2>
        <Suspense fallback={<SectionSkeleton testId="skeleton-reminder" />}>
          <Reminder />
        </Suspense>
      </section>
      <section className="flex flex-col gap-2 border-t pt-5">
        <h2 className="text-sm font-semibold">Passkeys</h2>
        <Suspense fallback={<SectionSkeleton testId="skeleton-passkeys" />}>
          <PasskeySection />
        </Suspense>
      </section>
      <section className="flex flex-col gap-2 border-t pt-5">
        <h2 className="text-sm font-semibold">Connected AI apps</h2>
        <Suspense fallback={<SectionSkeleton testId="skeleton-connected" />}>
          <Connected />
        </Suspense>
      </section>
      <section className="flex flex-col gap-2 border-t pt-5">
        <h2 className="text-sm font-semibold">Account</h2>
        <SignOutButton />
      </section>
      <section className="flex flex-col gap-2 border-t pt-5">
        <h2 className="text-sm font-semibold">Your data</h2>
        <Link href="/history" className="text-sm text-primary hover:underline">
          History
        </Link>
        {/* A plain link: it's a file download from an API route, not a page. */}
        <a
          href="/api/export"
          download
          className="text-sm text-primary hover:underline"
        >
          Export all data
        </a>
      </section>
    </div>
  );
}

async function Settings() {
  return <SettingsForm initial={await read(getSettings, {})} />;
}

// Request time only: the auth client can't be built from the build's
// placeholder URL, so this must never prerender.
async function PasskeySection() {
  await connection();
  return <Passkeys />;
}

async function Reminder() {
  return (
    <ReminderSettings
      // The VAPID public key is meant for browsers; read at request time.
      publicKey={process.env.VAPID_PUBLIC_KEY || null}
      initial={await read(getReminder, {})}
    />
  );
}

async function Connected() {
  const { id } = await requireOwner();
  const { timeZone } = await read(getSettings, {});
  const apps = await listConnectedApps(getDb(), id, new Date(), timeZone);
  return <ConnectedApps apps={apps} mcpUrl={mcpResource(process.env)} />;
}
