import { verifyOAuthQueryParams } from "@better-auth/oauth-provider";
import { eq } from "drizzle-orm";
import { Suspense } from "react";
import { ConsentForm } from "@/components/app/consent-form";
import { requireOwner } from "@/server/auth/require-owner";
import { getDb } from "@/server/db/client";
import { oauthClient } from "@/server/db/schema";
import { clientOrigin } from "@/server/mcp/client-origin";

export default function ConsentPage({
  searchParams,
}: PageProps<"/oauth/consent">) {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 p-6">
      <Suspense fallback={null}>
        <Consent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Consent({
  searchParams,
}: Pick<PageProps<"/oauth/consent">, "searchParams">) {
  await requireOwner();
  const params = await searchParams;
  const query = new URLSearchParams(
    Object.entries(params).flatMap(([k, v]) =>
      (Array.isArray(v) ? v : [v]).map((x) => [k, x ?? ""] as [string, string]),
    ),
  ).toString();
  const valid = await verifyOAuthQueryParams(
    query,
    process.env.BETTER_AUTH_SECRET ?? "",
  ).catch(() => false);
  const clientId = typeof params.client_id === "string" ? params.client_id : "";
  const [client] = valid
    ? await getDb()
        .select({
          name: oauthClient.name,
          redirectUris: oauthClient.redirectUris,
        })
        .from(oauthClient)
        .where(eq(oauthClient.clientId, clientId))
    : [];
  if (!valid || !client) {
    return (
      <p className="text-sm text-muted-foreground">
        This link has expired or is invalid. Start connecting again from your AI
        app.
      </p>
    );
  }
  return (
    <ConsentForm
      clientName={client.name ?? clientId}
      origin={clientOrigin({ clientId, redirectUris: client.redirectUris })}
    />
  );
}
