import Link from "next/link";
import { Button } from "@/components/ui/button";

/** Inside the app shell, so the sidebar and tab bar stay: never a dead end. */
export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 p-10 text-center">
      <h1 className="text-xl font-bold">That page doesn&apos;t exist</h1>
      <p className="text-sm text-muted-foreground">
        It may have been deleted, or the link is wrong.
      </p>
      <Button asChild>
        <Link href="/">Back to your areas</Link>
      </Button>
    </div>
  );
}
