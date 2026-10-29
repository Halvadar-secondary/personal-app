import { createHash, randomBytes } from "node:crypto";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { expect, test } from "@playwright/test";
import { apiContext, isPhone } from "./helpers/app";
import { loginWithPassword } from "./helpers/login";

const b64url = (b: Buffer) => b.toString("base64url");

test("an AI client gets 401 with a pointer to the metadata", async ({
  request,
  baseURL,
}) => {
  const res = await request.post("/api/mcp", {
    data: { jsonrpc: "2.0", id: 1, method: "tools/list" },
    headers: { accept: "application/json, text/event-stream" },
  });
  expect(res.status()).toBe(401);
  const challenge = res.headers()["www-authenticate"] ?? "";
  expect(challenge).toContain("resource_metadata=");
  const metadataUrl = /resource_metadata="([^"]+)"/.exec(challenge)?.[1];
  expect(metadataUrl).toContain("/.well-known/oauth-protected-resource");

  const resource = await (await request.get(metadataUrl!)).json();
  expect(resource.authorization_servers.join(" ")).toContain(
    new URL(baseURL!).host,
  );

  const as = await (
    await request.get("/.well-known/oauth-authorization-server")
  ).json();
  expect(as.registration_endpoint).toBeTruthy();
  expect(as.code_challenge_methods_supported).toContain("S256");
  expect(as.client_id_metadata_document_supported).toBe(true);
});

test("owner approves a client and it calls a tool", async ({
  page,
  playwright,
  baseURL,
}, testInfo) => {
  test.skip(isPhone(testInfo), "one full OAuth run is enough");
  // The client's own requests carry no browser or bypass cookies.
  const request = await apiContext(playwright, baseURL);
  const as = await (
    await request.get("/.well-known/oauth-authorization-server")
  ).json();
  const redirectUri = `${baseURL}/e2e-callback`;
  // Unique per run: earlier runs leave their own connected clients behind.
  const clientName = `E2E Client ${Date.now()}`;

  // 1. Dynamic client registration, as a 2025-era MCP client does.
  const reg = await request.post(as.registration_endpoint, {
    data: {
      client_name: clientName,
      redirect_uris: [redirectUri],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    },
  });
  expect(reg.ok(), await reg.text()).toBe(true);
  const { client_id: clientId } = await reg.json();

  // 2. Authorization code with S256 PKCE, bound to the MCP resource.
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  const resource = `${baseURL}/api/mcp`;
  const authorize = new URL(as.authorization_endpoint);
  authorize.search = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    code_challenge: challenge,
    code_challenge_method: "S256",
    scope: "openid offline_access mcp:goals",
    resource,
    state: "e2e",
  }).toString();

  // 3. Signed out, the owner is sent to log in, then on to the consent page.
  await page.goto(authorize.toString());
  await page.waitForURL((url) => url.pathname === "/login");
  await page.getByTestId("password-email").fill(process.env.E2E_OWNER_EMAIL!);
  await page
    .getByTestId("password-password")
    .fill(process.env.E2E_OWNER_PASSWORD!);
  await page.getByTestId("password-submit").click();
  await expect(page.getByRole("heading", { name: /E2E Client/ })).toBeVisible();
  // The name is self-chosen; the owner also sees where the code would go.
  await expect(page.getByTestId("client-origin")).toContainText(
    `Unverified app. After you approve, it continues at ${new URL(redirectUri).host}.`,
  );

  // 4. Approve; the browser is sent back to the client with a code.
  const callback = page.waitForRequest((r) => r.url().startsWith(redirectUri));
  await page.getByRole("button", { name: "Approve" }).click();
  const code = new URL((await callback).url()).searchParams.get("code");
  expect(code).toBeTruthy();

  // 5. Exchange it for tokens.
  const tokenRes = await request.post(as.token_endpoint, {
    form: {
      grant_type: "authorization_code",
      code: code!,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: verifier,
      resource,
    },
  });
  expect(tokenRes.ok(), await tokenRes.text()).toBe(true);
  const { access_token: token } = await tokenRes.json();

  // 6. Call a tool with the bearer token.
  const client = new Client({ name: "e2e", version: "1.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(resource), {
      requestInit: {
        headers: {
          Authorization: `Bearer ${token}`,
          // A protected preview needs the bypass, as every other request has.
          ...(process.env.VERCEL_AUTOMATION_BYPASS_SECRET
            ? {
                "x-vercel-protection-bypass":
                  process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
              }
            : {}),
        },
      },
    }),
  );
  const result = await client.callTool({ name: "get_overview", arguments: {} });
  expect(result.isError).toBeFalsy();
  expect(JSON.stringify(result.content)).toContain("areas");
  await client.close();

  // 7. Settings lists it; revoking cuts the same token off at once.
  await page.goto("/settings");
  const row = page.getByRole("listitem").filter({ hasText: clientName });
  await expect(row).toContainText("Last used");
  await row.getByRole("button", { name: "Revoke" }).click();
  await expect(row).toHaveCount(0);
  const after = await request.post("/api/mcp", {
    data: { jsonrpc: "2.0", id: 2, method: "tools/list" },
    headers: {
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${token}`,
    },
  });
  expect(after.status()).toBe(401);
  await request.dispose();
});

test("the consent page without valid params offers nothing to approve", async ({
  page,
}) => {
  await loginWithPassword(
    page,
    process.env.E2E_OWNER_EMAIL!,
    process.env.E2E_OWNER_PASSWORD!,
  );
  await page.goto("/oauth/consent?client_id=x");
  await expect(
    page.getByText("This link has expired or is invalid."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve" })).toHaveCount(0);
});
