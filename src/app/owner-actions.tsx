"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function OwnerActions() {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex gap-2">
        <Button
          variant="outline"
          onClick={async () => {
            const res = await authClient.passkey.addPasskey();
            setMessage(
              res?.error
                ? (res.error.message ?? "Could not add passkey")
                : "Passkey added",
            );
          }}
        >
          Add a passkey
        </Button>
        <Button
          variant="ghost"
          onClick={async () => {
            await authClient.signOut();
            router.replace("/login");
          }}
        >
          Sign out
        </Button>
      </div>
      {message && <p className="text-sm">{message}</p>}
    </div>
  );
}
