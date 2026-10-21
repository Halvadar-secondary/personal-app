import { Suspense } from "react";
import { requireOwner } from "@/server/auth/require-owner";
import { OwnerActions } from "./owner-actions";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-4">
      <Suspense fallback={null}>
        <OwnerHome />
      </Suspense>
    </main>
  );
}

async function OwnerHome() {
  await requireOwner();
  return (
    <>
      <h1 className="text-2xl font-semibold">Hello, owner</h1>
      <OwnerActions />
    </>
  );
}
