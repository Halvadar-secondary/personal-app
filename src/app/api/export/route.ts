import { connection } from "next/server";
import { localDate } from "@/lib/dates";
import { requireOwnerApi } from "@/server/auth/require-owner";
import { getDb } from "@/server/db/client";
import { runAction } from "@/server/domain/context";
import { exportData } from "@/server/domain/export";

/** Settings → Export all data: the owner's rows as a JSON download. */
export async function GET(req: Request) {
  const owner = await requireOwnerApi(req);
  if (owner instanceof Response) return owner;
  await connection();
  const data = await runAction(
    { db: getDb(), ownerId: owner.id, actor: "ui" },
    exportData,
    {},
  );
  const day = localDate(new Date(data.exportedAt), data.settings.timeZone);
  return Response.json(data, {
    headers: {
      "Content-Disposition": `attachment; filename="life-goals-${day}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
