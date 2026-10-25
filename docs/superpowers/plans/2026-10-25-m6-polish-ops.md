# M6 Polish and Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The data is safe even if the database is lost, errors reach the owner instead of disappearing, and the app feels like a real app on the phone: installable, announces new versions, passkeys manageable, accessible, and kept up to date without effort.

**Architecture:**
- **Operations live in GitHub Actions, not in the app:**
  - `backup.yml` runs nightly: `pg_dump`, then `age`-encrypt, then upload an artifact.
  - `purge.yml` runs weekly and calls a domain function through a tsx script.
  - Renovate is a config file.
  - Nothing new is exposed to the internet except Sentry's same-origin tunnel.
- **Sentry is wired through Next 16's instrumentation hooks**, with one pure, tested options builder that scrubs personal data.
  - Errors the UI rethrows reach Sentry through `onRequestError`.
  - The MCP adapter swallows errors on purpose, so it reports them through an injected callback.
- **Phone polish is plain web:**
  - A Next metadata manifest and static icons; no service worker.
  - A client banner that polls `/api/health` for a changed `buildId`.
  - A passkey list built on Better Auth's client.

**Tech Stack:** as M5. **New:**
- `@sentry/nextjs`
- dev `@axe-core/playwright`
- dev `sharp`, used once to render the icons
- In Actions only: `postgresql-client-18` and `age`

Versions are pinned by the lockfile at install. Before Task 2, check that `@sentry/nextjs` supports Next 16.4; if it doesn't, stop and ask.

**Spec:**
- Technical design `docs/superpowers/specs/2026-10-22-life-goals-app-technical-design.md`:
  - §11.6 backup, Renovate
  - §5.5 purge
  - §13 and §2 Sentry
  - §8 PWA, accessibility
  - §12 version banner
  - §6.1 and §15 passkeys
- Product design `docs/superpowers/specs/2026-10-21-life-goals-app-design.md`: "Visual style" (dark mode is the builder's call).
- `docs/ROADMAP.md` § M6.
- AGENTS.md: read `node_modules/next/dist/docs/` on instrumentation, `instrumentation-client`, the metadata `manifest` file and `viewport` before Tasks 2, 4 and 9.

## Global Constraints

- **Earlier milestones' Global Constraints hold:**
  - ≥90% line gate on `src/lib` and `src/server/domain`.
  - Owner check first in every adapter.
  - `await connection()` before any auth or DB use in a route.
  - Never build auth or db at module scope: CI builds with `BETTER_AUTH_URL=build-time-placeholder`.
- **Public repo:** nothing readable by the public may hold data.
  - Backups are encrypted with `age` to the owner's public key (`vars.BACKUP_AGE_RECIPIENT`) before upload.
  - The private key never enters GitHub, the repo or this session.
  - Workflow logs print counts only, never row content.
- **Secrets:**
  - Never print values.
  - The owner sets them with `gh secret set` / `vercel env add` from their own terminal or from a gitignored file.
  - A Sentry DSN is not secret, but it still goes in env, not code.
- **Backup (§11.6):**
  - Runs nightly at 03:00 UTC and on `workflow_dispatch`.
  - Dumps schemas `public` and `drizzle` from production (`secrets.PROD_MIGRATION_DATABASE_URL`).
  - Uses pg_dump custom format, `--no-owner --no-acl`.
  - The artifact is named `life-goals-backup-<YYYY-MM-DD>` and kept for 30 days.
  - Neon runs **Postgres 18**, so the client must be 18.
- **Purge (§5.5):**
  - Weekly, Sunday 04:00 UTC, after that night's backup.
  - Hard-deletes rows soft-deleted **more than 90 days** ago, plus their change events.
  - Never deletes a row a remaining row still references.
- **Sentry (§13):**
  - Client and server; source maps uploaded by `deploy.yml` only.
  - `sendDefaultPii: false`, `tracesSampleRate: 0`, no replay.
  - Enabled only when `NEXT_PUBLIC_SENTRY_DSN` is set, which is production only.
  - Uses `environment = APP_ENV` and `release = APP_BUILD_ID`.
  - Uses `tunnelRoute: "/monitoring"`, so the CSP stays `connect-src 'self'`.
- **PWA (§8):**
  - Name "Life Goals", `display: "standalone"`, `start_url: "/"`.
  - `background_color: "#f7f6fb"`, `theme_color: "#f7f6fb"`.
  - Icons 192, 512, maskable 512, Apple touch 180.
  - **No service worker, no offline caching.**
- **Version banner (§12):**
  - Polls `/api/health` every 5 minutes and when the tab becomes visible.
  - Shows when the deployed `buildId` differs from the one the page was built with.
  - Never shows when either side is `"dev"`.
  - Copy: "New version available." with a `Refresh` button.
- **Copy, Settings → Passkeys:**
  - Section title "Passkeys". Each row shows the name (or "Passkey" if unnamed) and "Added {d MMM yyyy}", with `Rename` and `Remove` buttons.
  - Remove confirm: "Remove this passkey? You can still sign in with Google." with buttons `Remove` and `Cancel`.
  - Empty state: "No passkeys yet. Add one to sign in with Face ID, fingerprint or Windows Hello."
  - Button: `Add a passkey`.
- **Renovate (§11.6):**
  - Weekly, with non-major updates grouped.
  - Auto-merges patch updates when the required checks pass.
  - `minimumReleaseAge` is 3 days.
- **Accessibility (§8):** an axe scan with tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa` on every page must return zero violations on both Playwright projects.

## Review Focus

1. **A purge that meets a soft-deleted parent with a live child** must skip the parent and still purge the rest, not fail the whole run with a foreign-key error. Test: Task 3, `"keeps a deleted parent a live row still points at"`.
2. **Undoing an old batch whose snapshot names a purged row** must refuse with a readable message, not a 500. Examples are a move away from a since-purged area, or categories that included a purged category. Tests: Task 3, `"undo of a move from a purged area refuses"` and `"category events naming a purged category are dropped"`.
3. **A backup that "succeeds" but is empty or truncated**, for example a wrong URL pointing at an empty branch. The workflow must fail when any of the key tables has no `TABLE DATA` entry. Check: Task 1, the `pg_restore --list` gate.
4. **Personal data in Sentry:** task titles and search terms can appear in a URL query, a request body, cookies or an MCP bearer token. `scrubEvent` must remove all of these. Test: Task 2.
5. **The version banner on a page left open across two deploys, or during a failed health fetch** (offline, or a 503). It must stay quiet on errors and must not stack banners. Test: Task 5.

---

### Task 1: Nightly encrypted backup and the restore drill

**Files:**
- Create:
  - `.github/workflows/backup.yml`
  - `src/server/backup-check.ts`
  - `src/server/backup-check.db.test.ts`
  - `scripts/restore-check.ts`
  - `docs/operations.md`
- Modify:
  - `package.json`: script `"restore:check": "tsx scripts/restore-check.ts"`
  - `docs/ROADMAP.md`

**Interfaces:**
- Produces:
  - `describeDatabase(db: Db): Promise<DbSummary>`, where `DbSummary = { schemaVersion: number; owners: number; rows: { areas: number; achievements: number; tasks: number; task_completions: number; practice_entries: number; change_events: number } }`.
    - `owners` counts `user` rows.
    - `rows` counts every row, soft-deleted ones included, because a backup holds them.
  - `checkRestore(summary: DbSummary, expectedSchemaVersion: number): string[]`. It returns problems, and an empty array means OK. The problems are:
    - `"schema version N, expected M"`
    - `"expected exactly one user, found N"`
    - `"no areas"`
  - `scripts/restore-check.ts <database-url>` prints the summary as JSON plus each problem. It exits 1 on any problem. The expected schema version is the length of `drizzle/meta/_journal.json`'s entries.

- [ ] **Step 1: Write the failing tests** in `backup-check.db.test.ts`:
  - `"describes a migrated database"`: PGlite with one user, one area and one soft-deleted task. Expect `owners: 1`, `rows.areas: 1` and `rows.tasks: 1`, with `schemaVersion` equal to the journal length.
  - `"checkRestore accepts a healthy summary"`: expect `[]`.
  - `"checkRestore names every problem"`: given schema 3 of 6, 0 owners and 0 areas, expect all three messages, in that order.
- [ ] **Step 2: Run it.** `pnpm exec vitest run --project db src/server/backup-check`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement `describeDatabase`, `checkRestore` and the script.** The script uses `drizzle(new Pool({connectionString}))` like `scripts/seed.ts`, wrapped in `main()`.
- [ ] **Step 4: Run it.** Same command plus `pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Write `backup.yml`.**
  - Triggers: `schedule: cron "0 3 * * *"` and `workflow_dispatch`. `permissions: contents: read`, `environment: production`.
  - Steps:
    1. Install `postgresql-client-18` from PGDG (`/usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y`) and `age` (apt).
    2. `pg_dump --format=custom --no-owner --no-acl --schema=public --schema=drizzle -f backup.dump "$DATABASE_URL"`.
    3. Gate: `pg_restore --list backup.dump` must contain a `TABLE DATA public <t>` line for each of `user`, `areas`, `achievements` and `tasks`, plus `TABLE DATA drizzle __drizzle_migrations`. Otherwise exit 1 and echo which one is missing.
    4. `age -r "$BACKUP_AGE_RECIPIENT" -o life-goals-$(date -u +%F).dump.age backup.dump`, then `rm backup.dump`. Fail if `vars.BACKUP_AGE_RECIPIENT` is empty.
    5. `actions/upload-artifact` with `retention-days: 30`, `if-no-files-found: error`.
  - Echo only the encrypted file's size.
- [ ] **Step 6: Write `docs/operations.md` § Backups and restore drill**, as numbered owner steps:
  1. **One-time setup:** `age-keygen -o life-goals-backup.key`, kept offline in a password manager. Then `gh variable set BACKUP_AGE_RECIPIENT --body "<age1… public key>"`.
  2. **Drill:**
     1. `gh run download <run> -n life-goals-backup-<date>`.
     2. `age -d -i life-goals-backup.key -o backup.dump life-goals-<date>.dump.age`.
     3. `neonctl branches create --project-id withered-hill-17786740 --name restore-drill-<date>`, then `neonctl connection-string restore-drill-<date>`.
     4. `pg_restore --clean --if-exists --no-owner --no-acl --single-transaction -d "<url>" backup.dump`.
     5. `pnpm restore:check "<url>"`. Expected: no problems, with counts close to production's.
     6. `neonctl branches delete restore-drill-<date>`, then delete `backup.dump`.
  3. **A real restore:** the same steps, but into a fresh branch you then make primary. Neon's point-in-time restore is for "the last few hours".
- [ ] **Step 7: Commit.** `git add -A && git commit -m "feat(ops): nightly age-encrypted backup, restore check and drill doc"`. Tick the roadmap line in the same commit.
- **Owner gate (after merge):** the owner runs the setup in Step 6. I run `gh workflow run backup.yml` and watch it go green, and the owner does the drill once. Ledger the result.

---

### Task 2: Sentry

**Files:**
- Create:
  - `src/lib/sentry-options.ts`
  - `src/lib/sentry-options.test.ts`
  - `src/instrumentation.ts`
  - `src/instrumentation-client.ts`
  - `src/app/api/debug/error/route.ts`
- Modify:
  - `next.config.ts`: `withSentryConfig`
  - `src/server/mcp/server.ts` and its test
  - `src/app/api/mcp/route.ts`
  - `src/server/auth/paths.ts` and its test
  - `.github/workflows/deploy.yml`, Build step
  - `docs/operations.md`
  - `docs/ROADMAP.md`

**Interfaces:**
- Produces:
  - `sentryOptions(env: { dsn?: string; appEnv?: string; buildId?: string }): { dsn?: string; enabled: boolean; environment: string; release: string; tracesSampleRate: 0; sendDefaultPii: false; beforeSend: typeof scrubEvent }`. `enabled` is `Boolean(dsn)`. `environment` is `appEnv ?? "local"` and `release` is `buildId ?? "dev"`.
  - `scrubEvent<E extends { request?: …; user?: … }>(event: E): E`. It deletes:
    - `request.cookies`, `request.data` and `request.query_string`
    - every `request.headers` entry except `user-agent`
    - `user` (all of it)
    - the query string from `request.url`
  - `createLifeGoalsServer(run: RunAction, onUnexpected?: (error: unknown, tool: string) => void)`. It calls `onUnexpected` once for any non-`DomainError`, and never for a `DomainError`.
  - `isPublicPath("/monitoring") === true`.
  - `GET /api/debug/error`:
    - It does `await connection()`, then `requireOwnerApi(req)`, then throws `new Error("Sentry test error")`.
    - It's owner-only because the proxy guards it, and the route checks again.
    - It exists to prove that capture and source maps work in production.

- [ ] **Step 1: Write the failing tests.**
  - `sentry-options.test.ts`:
    - `"disabled without a DSN"`
    - `"production options carry environment and release"`
    - `"scrubEvent removes cookies, body, query, auth headers and user"`. The event has `request.url: "https://x/search?q=guitar"`, `headers: {authorization: "Bearer t", cookie: "c", "user-agent": "UA"}`, `data` and `user.email`. Expect `url` to be `"https://x/search"`, `headers` to be `{ "user-agent": "UA" }`, and `data`, `cookies`, `query_string` and `user` to be undefined.
  - MCP server test: `"reports unexpected errors, not domain refusals"`.
  - `paths.test.ts`: `"/monitoring"` is public.
- [ ] **Step 2: Run them.** `pnpm exec vitest run src/lib/sentry-options src/server/mcp src/server/auth/paths`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `pnpm add @sentry/nextjs`.
  - `instrumentation.ts`:
    - `register()` calls `Sentry.init(sentryOptions(...process.env))` for the `nodejs` and `edge` runtimes.
    - `export const onRequestError = Sentry.captureRequestError`.
  - `instrumentation-client.ts`:
    - Init with `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_APP_ENV` and the inlined `APP_BUILD_ID`.
    - Export `onRouterTransitionStart`.
    - Add `NEXT_PUBLIC_APP_ENV: process.env.APP_ENV` to `next.config` `env`.
  - `withSentryConfig`:
    - Options: `org: process.env.SENTRY_ORG`, `project: process.env.SENTRY_PROJECT`, `authToken: process.env.SENTRY_AUTH_TOKEN`, `tunnelRoute: "/monitoring"`, `silent: !process.env.CI`, `telemetry: false`, `sourcemaps: { deleteSourcemapsAfterUpload: true }`.
    - Without a token it skips the upload, so CI and preview builds still pass.
  - MCP route: pass `(e, tool) => Sentry.captureException(e, { tags: { tool, surface: "mcp" } })`.
  - deploy.yml Build step env:
    - `SENTRY_AUTH_TOKEN: ${{ secrets.SENTRY_AUTH_TOKEN }}`
    - `SENTRY_ORG: ${{ vars.SENTRY_ORG }}`
    - `SENTRY_PROJECT: ${{ vars.SENTRY_PROJECT }}`
- [ ] **Step 4: Run them, then build like CI.**
  - `pnpm exec vitest run src/lib/sentry-options src/server/mcp src/server/auth/paths && pnpm typecheck`.
  - Then `APP_ENV=local BETTER_AUTH_URL=build-time-placeholder pnpm build`.
  - Expected: PASS, and the build succeeds with no DSN.
- [ ] **Step 5: Docs.** Add `docs/operations.md` § Errors (Sentry), covering:
  - the owner setup: a Sentry project (platform Next.js), `vercel env add NEXT_PUBLIC_SENTRY_DSN production`, `gh secret set SENTRY_AUTH_TOKEN`, and `gh variable set SENTRY_ORG` / `SENTRY_PROJECT`
  - the check: visit `/api/debug/error` signed in, then confirm in Sentry that the event's stack shows `route.ts` source lines.
- [ ] **Step 6: Commit.** `feat(ops): Sentry for client, server and MCP, with scrubbing and source maps`, with the roadmap tick.
- **Owner gate (after merge):** the setup in Step 5, then the check.

---

### Task 3: Soft-delete purge job

**Files:**
- Create:
  - `src/server/domain/purge.ts`
  - `src/server/domain/purge.db.test.ts`
  - `scripts/purge.ts`
  - `.github/workflows/purge.yml`
- Modify:
  - `package.json`: `"purge": "tsx scripts/purge.ts"`
  - `docs/operations.md`
  - `docs/ROADMAP.md`

**Interfaces:**
- Produces `purgeDeleted(db: Db, now: Date, retentionDays = 90): Promise<PurgeCounts>`, where `PurgeCounts = { tasks; achievements; areas; categories; practiceEntries; completions; events: number }`.
  - It runs in one transaction, across all owners, with cutoff = `now − retentionDays`. Only `deleted_at < cutoff` qualifies.
  - Order of work:
    1. **Tasks past the cutoff:** delete their `task_categories`, `task_completions` and `practice_entries` rows, then the tasks themselves.
    2. **Practice entries past the cutoff on live tasks.**
    3. **Categories past the cutoff:** delete their `task_categories` rows, then the categories.
    4. **Achievements past the cutoff** that no remaining task references.
    5. **Areas past the cutoff** that no remaining achievement or task references.
    6. **`change_events`:**
       - those whose `entity_id` is any purged id, including the purged tasks' completion and practice ids
       - those for any purged task (`entity_type = 'task_categories'` is keyed by task id)
       - `task_categories` events whose `before` or `after` `categoryIds` include a purged category (`?|`)
  - It writes no history.
- `scripts/purge.ts`:
  - Reads `MIGRATION_DATABASE_URL`, runs `purgeDeleted(db, new Date())` and prints the counts JSON.
  - It's wrapped in `main()`.

- [ ] **Step 1: Write the failing tests** in `purge.db.test.ts`. Create rows through the real domain actions, then backdate `deleted_at` with SQL.
  - `"purges an area deleted 91 days ago, with its achievements, tasks, their completions, categories links and events"`
  - `"keeps rows deleted 89 days ago, and live rows"`
  - `"keeps a deleted parent a live row still points at"`: a soft-deleted old achievement with a live task. The achievement stays and the run doesn't throw.
  - `"purges a category and its links; category events naming it are dropped"`
  - `"undo of a move from a purged area refuses"`:
    1. Move an achievement from area A to B (batch X).
    2. Delete A and backdate it.
    3. Purge.
    4. `undoBatch(X)` rejects with a `DomainError`.
    - If it throws something else, fix `assertParentsAndChildren` in `integrity.ts` so a missing parent is refused exactly like a deleted one.
  - `"returns the counts"`
- [ ] **Step 2: Run them.** `pnpm exec vitest run --project db src/server/domain/purge`. Expected: FAIL.
- [ ] **Step 3: Implement `purgeDeleted`, the script, and `purge.yml`.**
  - `purge.yml`: cron `"0 4 * * 0"` and `workflow_dispatch`, `environment: production`, setup action, then `pnpm purge` with `MIGRATION_DATABASE_URL: ${{ secrets.PROD_MIGRATION_DATABASE_URL }}`.
- [ ] **Step 4: Run them.** Same command, plus `pnpm test` (coverage gate). Expected: PASS.
- [ ] **Step 5: Docs and commit.** Add `docs/operations.md` § Purge: what it does, and that an undo older than 90 days may refuse. Then `feat(ops): weekly purge of rows soft-deleted over 90 days ago`, with the roadmap tick.

---

### Task 4: PWA manifest and icons

**Files:**
- Create:
  - `src/app/manifest.ts`
  - `scripts/make-icons.ts` (one-off)
  - `public/icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png`
  - `src/app/apple-icon.png` (180×180)
  - `e2e/pwa.spec.ts`
- Modify:
  - `src/app/layout.tsx`: `export const viewport = { themeColor: "#f7f6fb" }` and `metadata.appleWebApp = { capable: true, title: "Life Goals", statusBarStyle: "default" }`
  - `src/server/auth/paths.ts` and its test
  - `docs/ROADMAP.md`

**Interfaces:**
- Produces:
  - `manifest(): MetadataRoute.Manifest` with the Global Constraints values. Its icons are the three in `/icons/`, and the maskable one has `purpose: "maskable"`.
  - `isPublicPath` is true for `/manifest.webmanifest`, `/apple-icon.png` and the prefix `/icons/`.

- [ ] **Step 1: Write the failing tests.**
  - `paths.test.ts`: the three new public paths.
  - `e2e/pwa.spec.ts`, signed out:
    - `"the manifest and icons load without signing in"`: `GET /manifest.webmanifest` returns 200, with `display` equal to `"standalone"` and `name` equal to `"Life Goals"`. Every icon URL returns 200 with `content-type` `image/png`.
    - `"the login page links the manifest and an apple touch icon"`: `link[rel=manifest]` and `link[rel=apple-touch-icon]` exist.
- [ ] **Step 2: Run them.** `pnpm exec vitest run src/server/auth/paths`. Expected: FAIL. The E2E runs in CI at the end.
- [ ] **Step 3: Implement.**
  - `pnpm add -D sharp`.
  - `make-icons.ts` renders one inline SVG at each size:
    - The glyph is a white mountain with a flag on a `#6d4aff` background.
    - On "any" icons the corner radius is 22%. Maskable icons fill the whole square and keep the glyph inside the central 60%.
  - Run the script once and commit the PNGs. Delete `src/app/favicon.ico` only if the new `src/app/icon.png` (32 px) replaces it.
- [ ] **Step 4: Run them.** Unit command, `pnpm typecheck`, then locally `pnpm build && pnpm start` with `pnpm exec playwright test e2e/pwa.spec.ts`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(pwa): manifest, icons and Apple touch icon`, with the roadmap tick, once the owner gate passes.
- **Owner gate (on the PR preview):**
  1. iPhone Safari: Share → Add to Home Screen. It opens full-screen with the icon.
  2. Android Chrome: ⋮ → Add to Home screen / Install. Same result.
  3. If Android offers only a shortcut, not an install, rule on adding a minimal service worker (fetch passthrough, no caching), per §8.

---

### Task 5: "New version available" banner

**Files:**
- Create:
  - `src/components/app/version-banner.tsx`
  - `src/components/app/version-banner.dom.test.tsx`
- Modify:
  - `src/app/(app)/layout.tsx`: `<VersionBanner current={process.env.APP_BUILD_ID ?? "dev"} />`
  - `docs/ROADMAP.md`

**Interfaces:**
- Produces:
  - `isNewerBuild(current: string, deployed: string | undefined): boolean`. False when either is `"dev"` or undefined, or when they are equal.
  - `VersionBanner({ current, fetchBuildId = defaultFetch, intervalMs = 300_000 })`.
    - `fetchBuildId(): Promise<string | undefined>` GETs `/api/health` with `cache: "no-store"`. It returns `json.buildId`, or undefined on any error or non-OK response.
    - It checks on mount, every `intervalMs`, and on `visibilitychange` to visible.
    - Once shown, it stops polling.
    - `Refresh` calls `location.reload()`.
    - It renders as `role="status"`, fixed above the phone tab bar.

- [ ] **Step 1: Write the failing tests** (fake timers):
  - `"stays hidden while the build matches"`
  - `"shows after a poll finds a new build, and refresh reloads"`
  - `"checks again when the tab becomes visible"`
  - `"stays quiet when the health check fails"`
  - `"never shows in dev"`
  - `"shows once even across further polls"`
- [ ] **Step 2: Run them.** `pnpm exec vitest run --project dom version-banner`. Expected: FAIL.
- [ ] **Step 3: Implement and mount.**
- [ ] **Step 4: Run them.** Same command, plus `pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(app): banner when a new version is deployed`, with the roadmap tick.

---

### Task 6: Settings → Passkeys

**Files:**
- Create:
  - `src/components/app/passkeys.tsx`
  - `src/components/app/passkeys.dom.test.tsx`
  - `e2e/passkeys.spec.ts`
- Modify:
  - `src/app/(app)/settings/page.tsx`: a "Passkeys" section above "Connected AI apps"
  - `docs/ROADMAP.md`

**Interfaces:**
- Produces:
  - `type PasskeyRow = { id: string; name: string | null; createdAt: Date }`
  - `type PasskeyApi = { list(): Promise<PasskeyRow[]>; add(): Promise<{ error?: string }>; rename(id: string, name: string): Promise<{ error?: string }>; remove(id: string): Promise<{ error?: string }> }`
  - `betterAuthPasskeys: PasskeyApi` wraps `authClient.passkey.listUserPasskeys`, `addPasskey`, `updatePasskey({ id, name })` and `deletePasskey({ id })`. Check those names in `node_modules/@better-auth/passkey/dist/client.d.mts`.
  - `Passkeys({ api = betterAuthPasskeys })`:
    - A client component with the Global Constraints copy.
    - Rename uses the existing `InlineText`.
    - Remove uses a confirm `Dialog`.
    - Errors show as a toast, and the list reloads after every change.
  - These are Better Auth's own session-scoped endpoints, so there's no new server action, and the sweep test's file count stays at 9.

- [ ] **Step 1: Write the failing tests.**
  - `passkeys.dom.test.tsx`, with a fake `PasskeyApi` object:
    - `"lists passkeys with name and added date"`
    - `"unnamed passkey shows as Passkey"`
    - `"empty state"`
    - `"rename saves the new name"`
    - `"remove asks first; Cancel keeps it, Remove deletes it"`
    - `"add reloads the list; an error shows a toast"`
  - `e2e/passkeys.spec.ts`, desktop only:
    1. A CDP virtual authenticator (`WebAuthn.enable`, then `WebAuthn.addVirtualAuthenticator` with `protocol: "ctap2"`, `transport: "internal"`, `hasResidentKey: true`, `hasUserVerification: true`, `isUserVerified: true`).
    2. Sign in with the password, open Settings and click `Add a passkey`. The row appears.
    3. Rename it to `E2E key <n>`, then Remove → Remove. The row is gone.
- [ ] **Step 2: Run them.** `pnpm exec vitest run --project dom passkeys`. Expected: FAIL.
- [ ] **Step 3: Implement and add the section.**
- [ ] **Step 4: Run them.**
  - The DOM test and `pnpm typecheck`.
  - Then the E2E locally: `pnpm build && pnpm start`, then `pnpm exec playwright test e2e/passkeys.spec.ts --project desktop`.
  - Expected: PASS.
- [ ] **Step 5: Commit.** `feat(settings): list, rename and remove passkeys`, with the roadmap tick.

---

### Task 7: Renovate

**Files:**
- Create: `renovate.json`
- Modify: `docs/operations.md`, `docs/ROADMAP.md`

**Interfaces:**
- Produces `renovate.json`:
  - `extends: ["config:recommended", "group:allNonMajor", ":semanticCommitTypeAll(chore)"]`
  - `schedule: ["before 6am on monday"]`
  - `minimumReleaseAge: "3 days"`
  - `lockFileMaintenance: { enabled: true, schedule: ["before 6am on the first day of the month"] }`
  - `packageRules`:
    - `{ matchUpdateTypes: ["patch"], automerge: true }`
    - `{ matchPackageNames: ["better-auth", "@better-auth/**"], groupName: "better-auth" }` (they must move together)
    - `{ matchPackageNames: ["next", "eslint-config-next"], groupName: "next" }`
    - `{ matchDepNames: ["node"], matchUpdateTypes: ["major"], enabled: false }` (Node 24 is pinned by `engines` and `.nvmrc`)

- [ ] **Step 1: Validate (the test for config).** `pnpm dlx --package renovate renovate-config-validator renovate.json`. Expected: "Config validated successfully".
- [ ] **Step 2: Docs and commit.** Add `docs/operations.md` § Dependency updates:
  - The owner installs the Renovate GitHub App on this repo only.
  - Auto-merge relies on branch protection's required checks.
  - Majors and minors wait for review.
  - Commit with `chore: configure Renovate`, with the roadmap tick.
- **Owner gate:** install the app. The first onboarding PR is expected.

---

### Task 8: Accessibility pass

**Files:**
- Create: `e2e/a11y.spec.ts`
- Modify: whatever components the scan flags, and `docs/ROADMAP.md`

**Interfaces:**
- Produces:
  - `e2e/a11y.spec.ts`: `expectNoAxeViolations(page)` uses `new AxeBuilder({ page }).withTags(["wcag2a","wcag2aa","wcag21a","wcag21aa"])`. The assertion is `violations` mapped to `{id, nodes: targets}` and equal to `[]`, so a failure names each one.
  - Pages scanned on both projects:
    - `/login` (signed out)
    - `/`, `/inbox`, `/active`, `/search?q=a`, `/history` and `/settings`
    - an area page and an achievement page, made fresh with `createArea` and `addAchievements`
    - the capture dialog open
    - the command palette open (desktop)
- Keyboard: board drag is already covered (`e2e/goals.spec.ts`). Add:
  - `"tasks reorder by keyboard"`: on the achievement page, focus `Move <task>`, then `keyboardDrag(page, ["ArrowDown"])`. The order changes and survives a reload.
  - `"inbox files by keyboard"` (desktop): focus the inbox item's drag handle, then keyboard-drag it onto an area.
    - If inbox filing has no keyboard path, add the dnd-kit `KeyboardSensor` with `sortableKeyboardCoordinates` the same way `board.tsx` does.

- [ ] **Step 1: Write the spec.** `pnpm add -D @axe-core/playwright`.
- [ ] **Step 2: Run it against a local production build.** `pnpm build && pnpm start`, then `pnpm exec playwright test e2e/a11y.spec.ts`. Expected: FAIL, with the violations listed. Save the list to the ledger.
- [ ] **Step 3: Fix each violation at its source.**
  - Contrast: adjust the token in `globals.css`, not the component.
  - Labels and roles: fix them in the component.
  - Use no `disableRules` unless a violation sits inside a third-party primitive we can't change, and give each one a `Ruling:` line.
- [ ] **Step 4: Run it again, plus the full E2E.** `pnpm exec playwright test`. Expected: PASS on both projects.
- [ ] **Step 5: Commit.** `fix(a11y): axe-clean pages; keyboard reorder for tasks and inbox`, with the roadmap tick.

---

### Task 9: Dark mode (optional; follows the system setting)

**Files:**
- Modify:
  - `src/app/globals.css`
  - `src/app/layout.tsx` (viewport `themeColor`)
  - `e2e/a11y.spec.ts`
  - `docs/ROADMAP.md`

**Interfaces:**
- Behavior:
  - It follows `prefers-color-scheme`, with no toggle (YAGNI).
  - `@custom-variant dark (@media (prefers-color-scheme: dark))`.
  - The `.dark` block is replaced by `@media (prefers-color-scheme: dark) { :root { … } }`.
  - A purple-tinted dark palette. Defaults: background `#16131f`, card `#201c2c`, foreground `#ecebf5`, primary `#8b6cff`, border `#2e2940`. The implementer tunes them until axe passes.
  - Area cover gradients are unchanged.
  - `viewport.themeColor`: `[{ media: "(prefers-color-scheme: light)", color: "#f7f6fb" }, { media: "(prefers-color-scheme: dark)", color: "#16131f" }]`.

- [ ] **Step 1: Write the failing test.** In `a11y.spec.ts`, add a `describe("dark")` with `test.use({ colorScheme: "dark" })` that runs the same page list. Also add `"dark mode applies"`: on `/`, the computed `body` `background-color` is `rgb(22, 19, 31)`.
- [ ] **Step 2: Run it.** `pnpm exec playwright test e2e/a11y.spec.ts -g dark`. Expected: FAIL.
- [ ] **Step 3: Implement the tokens.** Also replace hard-coded light colors in components (`grep -rn "bg-white\|#fff" src/components`) with tokens.
- [ ] **Step 4: Run it.** The full `pnpm exec playwright test`, then `pnpm test`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(ui): dark mode following the system setting`, with the roadmap tick.

---

## Out of scope

- M5's deferred minors (DCR throttling, approved-but-unused apps in Settings, a wrong-audience test, and "Last used" moving on a 429) stay deferred unless the owner asks.
- Offline support and a theme toggle: both are spec non-goals or YAGNI.
