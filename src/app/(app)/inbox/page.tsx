import { Suspense } from "react";
import { CaptureButton } from "@/components/app/capture-button";
import { InboxList } from "@/components/app/inbox-list";
import { read } from "@/server/actions/run";
import { listInbox } from "@/server/domain/inbox";
import { listFilingTargets } from "@/server/domain/views";

export default function InboxPage() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4 md:p-6">
      <header className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold md:text-2xl">Inbox</h1>
        <CaptureButton />
      </header>
      <Suspense
        fallback={<p className="text-sm text-muted-foreground">Loading…</p>}
      >
        <Inbox />
      </Suspense>
    </div>
  );
}

async function Inbox() {
  const [inbox, targets] = await Promise.all([
    read(listInbox, {}),
    read(listFilingTargets, {}),
  ]);
  return <InboxList inbox={inbox} targets={targets} />;
}
