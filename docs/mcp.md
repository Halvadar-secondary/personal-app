# Connecting AI apps (MCP)

Any AI app that speaks MCP can read and change your goals, after you sign in
and approve it. Every change it makes shows in History as "<App> via MCP" and
can be undone. See and revoke connected apps in Settings → Connected AI apps.

The server URL is your app's origin plus `/api/mcp`; in production:

```
https://halvadar-life-goals.vercel.app/api/mcp
```

Each app opens a browser tab: sign in, then **Approve**. Menu names below are
where they were at the time of writing; apps move them around.

- **Claude (claude.ai and the desktop app):** Settings → Connectors → Add
  custom connector, paste the URL, then Connect.
- **ChatGPT:** Settings → Apps & Connectors; with developer mode on, create a
  connector with the URL and OAuth authentication.
- **Cursor:** add it to `~/.cursor/mcp.json`:
  `{ "mcpServers": { "life-goals": { "url": "<the URL>" } } }`, then
  log in from Settings → MCP.
- **Claude Code:** `claude mcp add --transport http life-goals <the URL>`,
  then `/mcp` → life-goals → Authenticate.
- **MCP Inspector (testing):**
  `npx @modelcontextprotocol/inspector@latest --server-url <the URL> --transport http`.

Limits: 120 requests a minute per app; access tokens last 15 minutes and are
refreshed by the app. Revoking in Settings cuts an app off on its next call.

Claude app users can tell Claude to use their profile, the notes under Settings
→ Profile: add "Use my life-goals profile: read it at the start and keep it up
to date" to your Claude instructions. Claude then calls `get_profile` and
`update_profile` on its own.

Locally, use `http://localhost:3000/api/mcp` and sign in with the test
password form or a passkey (Google isn't configured locally).

## Spike record: Better Auth as the authorization server

Date: 2026-10-24. Local production build (`pnpm build && pnpm start`) on
`http://localhost:3000`, local Postgres. Better Auth 1.7.12 with `jwt()`,
`@better-auth/mcp` `mcp()` and `@better-auth/cimd` `cimd()` (DCR fallback on);
MCP server via `@modelcontextprotocol/server` 2.4.0 `createMcpHandler`.

### Automated

`e2e/mcp.spec.ts`:

- `POST /api/mcp` without a token → 401 with `resource_metadata`; the
  protected-resource and authorization-server metadata advertise DCR, S256 and
  `client_id_metadata_document_supported`.
- DCR → PKCE authorize (signed out) → login page → password sign-in → consent
  → Approve → code → token → `get_overview` via the MCP client. Signing in on
  the login page resumes the authorization request without app code (the
  oauth-provider client plugin forwards the signed query; Better Auth's client
  follows the JSON redirect).

### Real clients

| Client | Version | Registration | Name the app saw | Result |
| --- | --- | --- | --- | --- |
| Claude Code | 2.1.310 | CIMD (URL `client_id`) | Claude Code | Approved, `get_overview` returned data |
| MCP Inspector | 2.12.0 | DCR | MCP Inspector | Approved, `get_overview` returned data |

Transport: one handler serves both protocol eras. Inspector 2.x connects in
its `legacy` era by default (plain `initialize`); nothing extra was needed for
either client. The route answers `POST` only; neither client needed `GET`.

### Notes

- Local sign-in: Google is not configured locally (no `GOOGLE_CLIENT_ID`), so
  "Continue with Google" fails silently with "Provider not found" in the server
  log. Use the test password form or a passkey locally.
- Inspector 2.x has no sidebar form; start it with
  `npx @modelcontextprotocol/inspector@latest --server-url http://localhost:3000/api/mcp --transport http`.

### Decision

Keep the Better Auth MCP plugin.
