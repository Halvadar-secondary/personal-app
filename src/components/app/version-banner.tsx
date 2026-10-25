"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

/** True when a real deployed build differs from the one this page runs. */
export function isNewerBuild(
  current: string,
  deployed: string | undefined,
): boolean {
  if (!deployed || current === "dev" || deployed === "dev") return false;
  return deployed !== current;
}

/** The deployed build id, or undefined when the check fails for any reason. */
async function fetchDeployedBuildId(): Promise<string | undefined> {
  try {
    const res = await fetch("/api/health", { cache: "no-store" });
    if (!res.ok) return undefined;
    const body = (await res.json()) as { buildId?: unknown };
    return typeof body.buildId === "string" ? body.buildId : undefined;
  } catch {
    return undefined;
  }
}

/**
 * "New version available" (spec §12): polls /api/health every few minutes
 * and when the app comes back to the foreground, e.g. a home-screen app
 * reopened on the phone.
 */
export function VersionBanner({
  current,
  fetchBuildId = fetchDeployedBuildId,
  intervalMs = 5 * 60_000,
  reload = () => window.location.reload(),
}: {
  current: string;
  fetchBuildId?: () => Promise<string | undefined>;
  intervalMs?: number;
  reload?: () => void;
}) {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    if (stale || current === "dev") return;
    let live = true;
    const check = async () => {
      const deployed = await fetchBuildId();
      if (live && isNewerBuild(current, deployed)) setStale(true);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    void check();
    const timer = setInterval(check, intervalMs);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      live = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [stale, current, fetchBuildId, intervalMs]);

  if (!stale) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-20 z-50 mx-auto flex max-w-sm items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3 text-sm shadow-lg md:bottom-4"
    >
      <span>New version available.</span>
      <Button size="sm" onClick={reload}>
        Refresh
      </Button>
    </div>
  );
}
