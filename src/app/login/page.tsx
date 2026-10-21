import { Suspense } from "react";
import { passwordLoginEnabled } from "@/server/auth/config";
import { safeNextPath } from "@/server/auth/paths";
import { LoginForm } from "./login-form";

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <Suspense fallback={null}>
        <LoginContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function LoginContent({
  searchParams,
}: Pick<PageProps<"/login">, "searchParams">) {
  const { next } = await searchParams;
  return (
    <LoginForm
      next={safeNextPath(typeof next === "string" ? next : null)}
      passwordEnabled={passwordLoginEnabled({
        APP_ENV: process.env.APP_ENV,
        ENABLE_PASSWORD_LOGIN: process.env.ENABLE_PASSWORD_LOGIN,
      })}
    />
  );
}
