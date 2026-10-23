import { Suspense } from "react";
import { requireOwner } from "@/server/auth/require-owner";

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 p-4">
      <Suspense fallback={null}>
        <OwnerHome />
      </Suspense>
    </div>
  );
}

async function OwnerHome() {
  await requireOwner();
  return <h1 className="text-2xl font-semibold">Hello, owner</h1>;
}
