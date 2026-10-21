"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

export function LoginForm({
  next,
  passwordEnabled,
}: {
  next: string;
  passwordEnabled: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  function done(result: { error: { message?: string } | null } | undefined) {
    if (result?.error) setError(result.error.message ?? "Sign-in failed");
    else router.replace(next);
  }

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <Button
        onClick={() =>
          authClient.signIn.social({ provider: "google", callbackURL: next })
        }
      >
        Continue with Google
      </Button>
      <Button
        variant="outline"
        onClick={async () => done(await authClient.signIn.passkey())}
      >
        Sign in with passkey
      </Button>
      {passwordEnabled && (
        <form
          className="flex flex-col gap-2 border-t pt-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            done(
              await authClient.signIn.email({
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
          <Button type="submit" data-testid="password-submit">
            Sign in with password
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
