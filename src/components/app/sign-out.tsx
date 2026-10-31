"use client";

import { Loader2, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

/** Settings → Sign out: the way out on phones, where there's no sidebar. */
export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="outline"
      className="self-start"
      disabled={busy}
      aria-label="Sign out"
      onClick={async () => {
        setBusy(true);
        try {
          await authClient.signOut();
          router.replace("/login");
        } catch {
          setBusy(false);
        }
      }}
    >
      {busy ? <Loader2 className="animate-spin" /> : <LogOut />}
      {busy ? "Signing out…" : "Sign out"}
    </Button>
  );
}
