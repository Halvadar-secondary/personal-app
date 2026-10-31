"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

type Method = "google" | "passkey" | "password";

/** A sign-in button's label: a spinner and "Signing in…" while it runs. */
function Working({ on, label }: { on: boolean; label: string }) {
  return on ? (
    <>
      <Loader2 className="animate-spin" aria-hidden /> Signing in…
    </>
  ) : (
    label
  );
}

export function LoginForm({
  next,
  passwordEnabled,
}: {
  next: string;
  passwordEnabled: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  // One sign-in at a time; it stays set while the next page loads.
  const [busy, setBusy] = useState<Method | null>(null);

  // A passkey first asks the server for a challenge: wake the server and its
  // database now, so that answer comes quickly when the button is tapped.
  useEffect(() => {
    // Read the body: an unread one keeps the request open.
    fetch("/api/health", { cache: "no-store" })
      .then((r) => r.text())
      .catch(() => {});
  }, []);

  async function run(
    method: Method,
    call: () => Promise<{ error: { message?: string } | null } | undefined>,
  ) {
    if (busy) return;
    setBusy(method);
    setError(null);
    let result: Awaited<ReturnType<typeof call>>;
    try {
      result = await call();
    } catch {
      result = { error: { message: "Sign-in failed. Try again." } };
    }
    if (result?.error) {
      setError(result.error.message ?? "Sign-in failed");
      setBusy(null);
    } else if (method !== "google") {
      router.replace(next);
    }
  }

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <Button
        aria-label="Continue with Google"
        disabled={busy !== null}
        onClick={() =>
          void run("google", async () => {
            const r = await authClient.signIn.social({
              provider: "google",
              callbackURL: next,
            });
            // On success the browser leaves for Google: keep the spinner.
            return r?.error ? r : { error: null };
          })
        }
      >
        <Working on={busy === "google"} label="Continue with Google" />
      </Button>
      <Button
        variant="outline"
        aria-label="Sign in with passkey"
        disabled={busy !== null}
        onClick={() => void run("passkey", () => authClient.signIn.passkey())}
      >
        <Working on={busy === "passkey"} label="Sign in with passkey" />
      </Button>
      {passwordEnabled && (
        <form
          className="flex flex-col gap-2 border-t pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            void run("password", () =>
              authClient.signIn.email({
                email: String(form.get("email")),
                password: String(form.get("password")),
              }),
            );
          }}
        >
          <Label htmlFor="email">Email (test sign-in)</Label>
          <Input
            id="email"
            name="email"
            type="email"
            data-testid="password-email"
            required
          />
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            data-testid="password-password"
            required
          />
          <Button
            type="submit"
            data-testid="password-submit"
            disabled={busy !== null}
          >
            <Working on={busy === "password"} label="Sign in with password" />
          </Button>
        </form>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
