"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  savePushSubscriptionAction,
  sendTestReminderAction,
  updateReminderAction,
} from "@/server/actions/reminders";
import { perform } from "./use-mutate";

/** The VAPID public key, from base64url to the bytes subscribe() wants. */
function keyBytes(key: string): Uint8Array<ArrayBuffer> {
  const b64 = (key + "=".repeat((4 - (key.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Browser support doesn't change while the page is open. */
const noChanges = () => () => {};

function canNotify() {
  return (
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    typeof PushManager !== "undefined" &&
    typeof Notification !== "undefined"
  );
}

/** Subscribes this browser to Web Push and saves it as a device. */
async function subscribeHere(publicKey: string): Promise<boolean> {
  const reg = await navigator.serviceWorker.register("/sw.js");
  const existing = await reg.pushManager.getSubscription();
  const sub =
    existing ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes(publicKey),
    }));
  const json = sub.toJSON() as {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  };
  const r = await perform(() =>
    savePushSubscriptionAction({
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
    }),
  );
  return !!r?.ok;
}

/** Settings → Evening reminder: on/off, the time, and a test. */
export function ReminderSettings({
  publicKey,
  initial,
}: {
  /** Null when the server has no VAPID keys yet. */
  publicKey: string | null;
  initial: { enabled: boolean; time: string; devices: number };
}) {
  // Browser features are known only after hydration: null on the server.
  const supported = useSyncExternalStore(noChanges, canNotify, () => null);
  const [enabled, setEnabled] = useState(initial.enabled);
  const [time, setTime] = useState(initial.time);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [savedTime, setSavedTime] = useState(initial.time);
  const [devices, setDevices] = useState(initial.devices);
  // Whether this browser is one of the devices; null until known.
  const [here, setHere] = useState<boolean | null>(null);

  useEffect(() => {
    if (!supported) return;
    let live = true;
    navigator.serviceWorker
      .getRegistration()
      .then((reg) => reg?.pushManager.getSubscription() ?? null)
      .then((sub) => live && setHere(sub !== null))
      .catch(() => live && setHere(false));
    return () => {
      live = false;
    };
  }, [supported]);

  /** Permission, then this device's subscription; false if either fails. */
  async function join(): Promise<boolean> {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      setProblem("Notifications are blocked for this site.");
      return false;
    }
    if (!(await subscribeHere(publicKey!))) return false;
    if (here !== true) setDevices((n) => n + 1);
    setHere(true);
    return true;
  }

  async function addThisDevice() {
    setProblem(null);
    setBusy(true);
    try {
      await join();
    } catch {
      setProblem("Couldn't turn on notifications on this device.");
    } finally {
      setBusy(false);
    }
  }

  async function turn(on: boolean) {
    setProblem(null);
    setBusy(true);
    try {
      if (on && !(await join())) return;
      const r = await perform(() => updateReminderAction({ enabled: on }));
      if (r?.ok) setEnabled(on);
    } catch {
      setProblem("Couldn't turn on notifications on this device.");
    } finally {
      setBusy(false);
    }
  }

  if (!publicKey) {
    return (
      <p className="text-sm text-muted-foreground">
        Reminders aren&apos;t set up on the server yet.
      </p>
    );
  }
  const off = supported === false;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label="Evening reminder"
            disabled={busy || off || supported === null}
            onClick={() => void turn(!enabled)}
            className={cn(
              "relative h-5 w-9 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
              enabled ? "bg-primary" : "bg-input",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "absolute top-0.5 size-4 rounded-full bg-background transition-[left]",
                enabled ? "left-4.5" : "left-0.5",
              )}
            />
          </button>
          Remind me to plan tomorrow
        </label>
        <label className="flex items-center gap-2 text-sm">
          Reminder time
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            onBlur={async () => {
              if (!/^\d{2}:\d{2}$/.test(time) || time === savedTime) return;
              const r = await perform(() => updateReminderAction({ time }));
              if (r?.ok) setSavedTime(time);
            }}
            className="rounded-md border bg-card px-2 py-1 text-sm"
          />
        </label>
        {enabled && (
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              const r = await perform(() => sendTestReminderAction({}));
              if (r?.ok) toast.success("Test sent");
            }}
          >
            Send a test
          </Button>
        )}
        {enabled && here === false && !off && (
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => void addThisDevice()}
          >
            Get reminders on this device
          </Button>
        )}
      </div>
      {enabled && (
        <p className="text-sm text-muted-foreground">
          On {devices} {devices === 1 ? "device" : "devices"}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Sent once an evening, only when tomorrow isn&apos;t planned yet. It can
        arrive up to half an hour after the time.
      </p>
      {off && (
        <p className="text-sm text-muted-foreground">
          This browser can&apos;t show notifications. On iPhone, add the app to
          your Home Screen first.
        </p>
      )}
      {problem && (
        <p role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      )}
    </div>
  );
}
