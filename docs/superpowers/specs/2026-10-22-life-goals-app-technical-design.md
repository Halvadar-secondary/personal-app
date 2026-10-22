# Life Goals App — Technical Design

Date: 2026-10-22
Status: Draft, awaiting owner approval
Companion to: [2026-10-21-life-goals-app-design.md](2026-10-21-life-goals-app-design.md) (the *what*; this is the *how*)
Progress tracking: [../../ROADMAP.md](../../ROADMAP.md)

The owner has no stack preference; every choice below is the author's call
unless marked otherwise. Versions say "latest stable at setup" rather than
pinning numbers that will age; the lockfile pins exact versions.

---

## 1. Guiding principles

1. **One domain layer, many front doors.** All reads and writes go through a
   single server-side domain layer. The web UI (server actions) and the MCP
   server are thin adapters over it. Nothing else touches the database.
2. **Server-only data access.** The browser never talks to the database.
   The database is unreachable from the public internet except through our
   server code.
3. **Every change is an event.** Each mutation writes a history record in
   the same transaction, which is what makes undo and "who did this" work.
4. **Feels instant.** Mutations are applied optimistically in the UI and
   reconciled with the server response.
5. **Boring, well-documented tools.** Popular choices with good docs and
   free tiers, so future work (by the owner or an AI) is easy.

---

## 2. Stack

| Concern | Choice | Why |
|---|---|---|
| Language | **TypeScript** (strict) everywhere | One language front to back; shared types with the MCP tool schemas |
| Runtime | **Node.js 24 LTS** (pinned via `.nvmrc` and `engines`) | Current LTS; supported by Vercel |
| Package manager | **pnpm** | Fast, strict, already installed |
| Framework | **Next.js** (App Router, React Server Components, Server Actions), latest stable | Web UI, API routes and the MCP endpoint in one deployable |
| UI components | **shadcn/ui** (Radix primitives) + **Tailwind CSS v4** | Accessible primitives, fully restylable to the playful look |
| Icons | **lucide-react**; emoji for areas | |
| Drag and drop | **dnd-kit** | Works with touch (phone) and mouse; supports board columns and sortable lists |
| Client data/cache | **TanStack Query** wrapping server actions | Optimistic updates, rollback on error, cache invalidation |
| Validation | **Zod** | One schema per action, reused for server-action input, MCP tool input schemas, and form validation |
| Database | **PostgreSQL on Neon** (one project; `main` branch = production) | Plain managed Postgres, free tier, instant copy-on-write **branches** give every PR its own database |
| DB driver | **node-postgres (`pg`)** pool via `drizzle-orm/node-postgres`, using Neon's pooled connection string at runtime | Works identically against local Docker Postgres and Neon; supports transactions |
| ORM / migrations | **Drizzle ORM** + **drizzle-kit** (SQL migrations committed to the repo) | Typed queries, real transactions, plain SQL migrations |
| Auth | **Better Auth**, a library running inside the app that stores users and sessions in our own Postgres via its Drizzle adapter | No external auth service. Sign-in with **passkeys** and **Google**, locked to one owner email |
| MCP | **@modelcontextprotocol/sdk** with Streamable HTTP transport, served from a Next.js route (via Vercel's `mcp-handler` adapter) | Official SDK; works with Claude, ChatGPT, Cursor and other MCP clients |
| MCP auth | **OAuth 2.1** per the MCP authorization spec, provided by **Better Auth's MCP / OAuth-provider plugin** (dynamic client registration, consent, token issuance); spike first, fallback in §7.4 | Same login and user table as the web UI; a maintained component instead of a custom auth server |
| Hosting | **Vercel** (Hobby/free) | First-class Next.js hosting, preview deployment per PR, instant rollback |
| CI | **GitHub Actions** | Repo already on GitHub |
| Error tracking | **Sentry** (free tier), added in the polish milestone | Know when something breaks on the phone |
| Dependency updates | **Renovate** (weekly, grouped, auto-merge patch updates when CI is green) | Keeps the app current without noise |

### Why Neon + Better Auth (and not a backend-as-a-service)?
The app has exactly one user, and all data access goes through our server
code. A hosted auth service and a browser-facing database API would add
moving parts we don't need. Instead:

- **The database is reachable only with credentials that exist solely in
  server env vars.** Neon's optional Data API stays **disabled**. No HTTP
  endpoint exposes the database, and the browser never receives database
  credentials.
- **Auth is code in the repo** (Better Auth). Its tables (`user`, `session`,
  `account`, `verification`, `passkey`, plus the OAuth-provider tables in
  M5) live in the same Postgres and are migrated with Drizzle like
  everything else.
- **Neon branches** replace a separate staging project. Each PR gets a
  throwaway database branched from a `seed` branch that holds schema and
  sample data, never personal data (§10).
- Ownership is enforced in the domain layer (every row carries `owner_id`,
  and every query is scoped by it), behind an explicit owner check on every
  request (§6).

---

## 3. Repository layout

```
personal-app/
├─ .github/workflows/        ci.yml, preview.yml, preview-cleanup.yml, deploy.yml, backup.yml
├─ docs/
│  ├─ ROADMAP.md
│  └─ superpowers/         specs/ (design docs), plans/ (implementation plans)
├─ drizzle/                  generated SQL migrations (committed)
├─ e2e/                      Playwright tests
├─ public/                   icons, manifest assets
├─ src/
│  ├─ app/                   Next.js routes (UI pages, /api/mcp, /oauth/consent, /auth/*)
│  ├─ components/            UI components (ui/ = shadcn primitives)
│  ├─ server/
│  │  ├─ db/                 Drizzle client, schema.ts
│  │  ├─ auth/               requireOwner(), session + token verification
│  │  ├─ domain/             one module per aggregate: areas, achievements, tasks,
│  │  │                      categories, inbox, completions, practice-log, history
│  │  ├─ actions/            Next.js server actions (UI adapter)
│  │  └─ mcp/                MCP server + tool definitions (AI adapter)
│  ├─ lib/                   pure logic: xp.ts, levels.ts, streaks.ts, recurrence.ts, ordering.ts
│  └─ test/                  test helpers, factories, PGlite setup
├─ .env.example              every env var, documented, no values
└─ package.json
```

**Rule:** `src/server/domain` depends on `db` and `lib` only. It never
imports from `app`, `actions` or `mcp`. Lint enforces this
(`eslint-plugin-boundaries` or an import restriction rule).

---

## 4. Data model

All tables have `id uuid pk default gen_random_uuid()`, `owner_id uuid not
null`, `created_at`, `updated_at`. Soft delete via `deleted_at`, which
undo needs.

| Table | Key columns | Notes |
|---|---|---|
| `areas` | name, emoji, cover (jsonb: `{type:"gradient"\|"color"\|"image", value}`), description, sort_key | Level, XP and streak are **derived**, not stored (see §5) |
| `achievements` | area_id **nullable** (null = Inbox), title, notes, status enum(`backlog`,`active`,`done`), deadline date null, completed_at null, sort_key | sort_key orders within (area, status) |
| `tasks` | achievement_id **nullable**, area_id **nullable**, title, notes, effort smallint 1–5, deadline date null, recurrence jsonb null, completed_at null (one-off only), sort_key | Inbox task: both nulls. Task directly in an area without an achievement is *not* allowed (filed means under an achievement); area_id is denormalised from its achievement for fast queries |
| `task_completions` | task_id, completed_at timestamptz, occurrence_date date, xp_awarded int | One row per completion (one-off tasks get exactly one). XP is frozen at award time so later effort edits don't rewrite history |
| `categories` | name (unique per owner), color | Global pool |
| `task_categories` | task_id, category_id | Join table |
| `practice_entries` | task_id, started_at, duration_seconds null, metrics jsonb (e.g. `{bpm: 95}`), note, source text (`manual`, `mcp:<client>`, later `tool:metronome`) | The extension point for future tools |
| `change_events` | batch_id, actor text (`ui`, `mcp:<client name>`), entity_type, entity_id, op enum(`create`,`update`,`delete`,`restore`), before jsonb, after jsonb, created_at, undone_at null, undone_by_batch null | History + undo (§5.5) |
| `settings` | owner_id pk, time_zone text (IANA), week_start smallint | Streaks and "due this week" use the owner's time zone |
| `oauth_clients_seen` | client_id, client_name, last_used_at | Display only ("connected AI apps"); the auth server holds the real registrations |

**Ordering:** `sort_key` is a fractional-index string (`fractional-indexing`
library). Reordering updates one row instead of renumbering a list.

**Recurrence** (`tasks.recurrence`), a small explicit shape instead of full
RRULE:

```ts
{
  freq: "daily" | "weekly",
  interval: number,          // every N days/weeks, default 1
  byWeekday?: (0..6)[],      // weekly only; default = weekday of start
  start: "YYYY-MM-DD",
  end?: { type: "never" } | { type: "until", date: "YYYY-MM-DD" } | { type: "count", count: number }
}
```

"Every day for one week" is stored as `until = start + 6 days`. The UI offers
presets: *daily, weekdays, weekly on…, for 1 week / 30 days / forever*.

---

## 5. Domain logic

### 5.1 Shape of an action
```ts
// src/server/domain/tasks.ts
export const completeTaskInput = z.object({ taskId: z.string().uuid(), occurrenceDate: zDate.optional() });

export async function completeTask(ctx: Ctx, input: z.infer<typeof completeTaskInput>): Promise<TaskView> { ... }

// Ctx = { db: Tx, ownerId: string, actor: Actor, batchId: string, now: () => Date }
```
- Every action runs in **one transaction**. It loads rows scoped by
  `ownerId`, applies the change, writes `change_events`, and returns a view
  model.
- `now` is injected, which makes time-based logic (streaks, recurrence,
  deadlines) deterministic in tests.
- Server actions and MCP tools both call `runAction(actor, fn, input)`,
  which opens the transaction, builds `Ctx`, validates input with the Zod
  schema, and maps domain errors to adapter-specific errors.

### 5.2 XP and levels (`src/lib/xp.ts`, `levels.ts`)
- XP per effort: **1→10, 2→25, 3→50, 4→100, 5→200**.
- Area XP = sum of `task_completions.xp_awarded` for tasks in that area.
- Level curve: the XP needed to reach level *n* is `50 × n × (n − 1)`.
  Level 2 at 100 XP, level 3 at 300, level 5 at 1,000, level 10 at 4,500.
  Early levels come fast; later ones take sustained work.
- Un-completing a task deletes its completion row, which removes the XP.
- Inbox tasks award no XP. Their completion is recorded with
  `xp_awarded = 0`, and filing the task later does **not** back-award XP
  (simple and predictable).

### 5.3 Streaks (`src/lib/streaks.ts`)
- Days are computed in `settings.time_zone`.
- An area's current streak is the number of consecutive days ending today
  *or yesterday* that have ≥1 completion in that area. Ending yesterday
  means the streak isn't shown as broken before you've had a chance to
  practise today.
- The overview's "best streak" is the best *current* streak across areas.
- Computed with one SQL query over `task_completions`. No stored counters
  that can drift.

### 5.4 Repeating tasks (`src/lib/recurrence.ts`)
- Pure function `occurrencesBetween(recurrence, from, to): Date[]` and
  `isDueOn(recurrence, date)`.
- A repeating task is "due today" if today is an occurrence with no
  completion row for that `occurrence_date`. Completing it records one row
  for today's occurrence.
- Missed occurrences are not stored. The task view shows a 4-week
  completion strip (✓ / missed / upcoming) derived from occurrences vs.
  completions.
- Once `end` has passed, the task counts as finished. It stays visible
  with its completion history.
- Achievement progress ("2 of 5") counts one-off tasks only (design doc).

### 5.5 History and undo
- Every action writes one `change_events` row per touched entity, all
  sharing a `batch_id`. A drag that moves one card is one batch. An MCP
  call that creates 15 tasks is one batch.
- **Undo a batch** = apply the `before` snapshots in reverse order, inside a
  new transaction that itself writes events (`op: restore`). The original
  events get `undone_at`. Undo is therefore itself undoable.
- **Conflict rule:** if an entity in the batch was changed by a *later*
  batch, undo refuses and lists what changed since. This keeps undo from
  silently overwriting newer work.
- Deletes are soft (`deleted_at`), so undoing a delete just restores the row.
  A weekly job hard-deletes rows soft-deleted more than 90 days ago, and
  their events.
- UI: a History panel lists batches ("Claude via MCP created 15 tasks in
  Social confidence · 2 min ago · Undo"). A toast with **Undo** appears
  after any destructive UI action.

### 5.6 Inbox and filing
- `fileAchievement(achievementId, areaId)` and
  `fileTask(taskId, achievementId)` move items out of the Inbox. Both are
  ordinary, undoable actions.
- Capture (`captureItem`) takes free text plus an optional context
  (current area or achievement) and creates a task by default. Prefixing
  with `!` or toggling in the capture box creates an achievement instead.
  *(Builder's call; tune once in use.)*

---

## 6. Authentication and access control

### 6.1 Web UI
- **Better Auth** with two sign-in methods:
  - **Google** (social provider). This is how the owner signs in the first
    time.
  - **Passkeys** (Better Auth passkey plugin, WebAuthn). The owner adds one
    from Settings after the first Google sign-in, then signs in with Face ID,
    fingerprint or Windows Hello. Passkeys are tied to the production
    domain.
- **One-owner lock at account creation:** a Better Auth
  `databaseHooks.user.create.before` hook rejects any user whose email is
  not exactly `OWNER_EMAIL` (case-insensitive) **and** verified. Nobody
  else can ever get a row in the `user` table, whichever sign-in method
  they try.
- Sessions are HTTP-only, `Secure`, `SameSite=Lax` cookies managed by Better
  Auth. The `nextCookies()` plugin covers server actions.
- **`requireOwner()`** runs at the top of every server action, page and API
  route. It loads the session (`auth.api.getSession`) and checks
  `session.user.email === OWNER_EMAIL`. Anything else gets 404 (pages) or
  401 (APIs). This is a second lock behind the creation hook, and it
  covers a changed `OWNER_EMAIL` too.
- The Next.js proxy (middleware) does only a cheap cookie-presence check
  and redirects to `/login`. It is never the real lock.
- Everything except `/login`, `/api/auth/*` (Better Auth's own endpoints),
  `/api/health` and the OAuth metadata endpoints requires the owner.
- **Email + password sign-in exists only outside production.** It's
  enabled when `APP_ENV !== "production"` **and**
  `ENABLE_PASSWORD_LOGIN === "true"`, for E2E tests and for trying preview
  builds against seed data. The production config can't turn it on.

### 6.2 Defence in depth
- Neon's Data API is disabled; DB credentials live only in server env
  vars, and migration credentials only in GitHub Actions secrets.
- `BETTER_AUTH_SECRET` differs per environment, so a preview session cookie
  is worthless in production.
- Security headers via Next config: a strict CSP, `frame-ancestors 'none'`,
  HSTS, and `Referrer-Policy`.
- Rate limiting on `/login` and `/api/mcp` (Vercel's built-in firewall
  rules, or a small Postgres-backed limiter).

---

## 7. MCP server

### 7.1 Endpoint
`POST/GET /api/mcp`. Streamable HTTP transport, stateless mode: each
request is independent, which suits serverless.

### 7.2 Tools
Tools mirror domain actions one-to-one. Their input schemas come from the
same Zod schemas.

| Tool | Purpose |
|---|---|
| `get_overview` | Areas with level, XP, streak, counts, "up next" |
| `list_achievements` | By area and/or status, including Inbox |
| `get_achievement` | With tasks, completions, categories |
| `search` | Title/notes search across everything |
| `create_area`, `update_area` | |
| `create_achievement`, `update_achievement`, `move_achievement` (status/area/position) | |
| `create_tasks` (**batch**: many tasks in one call, ordered), `update_task`, `move_task`, `complete_task`, `uncomplete_task` | Batch creation makes "build me a 15-step ladder" one undoable step |
| `capture` | Drop free text into the Inbox |
| `file_item` | Move from the Inbox into an area or achievement |
| `list_categories`, `create_category`, `set_task_categories` | |
| `log_practice` | Add a practice entry to a task |
| `list_history`, `undo_batch` | So the AI can undo its own mistakes when asked |
| `delete_item` | Soft delete; always undoable |

Tool descriptions are written for the model, with examples of good
granularity (e.g. "prefer one achievement with 5–15 ordered tasks").
Responses are compact JSON plus a one-line human summary.

### 7.3 Authorization flow
1. An AI client calls `/api/mcp` without a token and gets 401 with a
   `WWW-Authenticate` header pointing to
   `/.well-known/oauth-protected-resource`.
2. That metadata names the authorization server, which is the app itself
   (Better Auth's OAuth-provider endpoints under `/api/auth/*`, with
   `/.well-known/oauth-authorization-server` metadata).
3. The client registers itself (dynamic client registration) and sends the
   owner to authorize. This lands on our **`/oauth/consent`** page, which
   requires the owner's login, shows "*ChatGPT wants to read and change
   your goals*", and has Approve / Deny.
4. The client receives an access token. Every MCP request validates it
   through Better Auth (the plugin's session-from-token helper, e.g.
   `withMcpAuth`), checking that it's unexpired and unrevoked and that its
   user is the owner. The OAuth client's name is recorded as the actor
   (`mcp:<client name>`).
5. Settings → **Connected AI apps** lists clients and lets the owner revoke
   them.

### 7.4 Risk and fallback
MCP client auth behaviour still varies between AI apps. **Milestone 5
starts with a spike** to connect Claude and one other client end-to-end
through Better Auth's plugin. If a client can't complete the flow, the
fallback is a small authorization server built on a maintained OAuth 2.1
library (e.g. `oidc-provider`), mounted in the app. It would keep the same
consent page and owner-only rule.

---

## 8. Frontend

- **Routes:** `/` overview · `/inbox` · `/areas/[id]` (board on ≥768px,
  grouped list below) · `/achievements/[id]` · `/active` · `/search` ·
  `/history` · `/settings` · `/login`.
- **Responsive:** the same routes on every device. Layout switches at
  Tailwind's `md` breakpoint. The phone gets a bottom tab bar (Areas,
  Active, Search, Settings) with Inbox reachable from the overview; desktop
  gets a left sidebar.
- **Capture:** a global "+ Capture" button. On desktop, also the `C`
  shortcut and a `⌘K`/`Ctrl+K` command palette (`cmdk`) for jumping and
  quick actions. Capture is a single text field; pressing Enter saves and
  keeps it open for the next item, which makes brain-dumping fast.
- **Optimistic UI:** TanStack Query mutations update the cache immediately
  and roll back with an error toast if the server rejects the change.
- **Styling:** design tokens (colors, radii, shadows) as CSS variables in
  Tailwind's theme. They match the approved overview mockup: lavender
  background, white rounded cards, purple accent, gradient covers.
- **PWA:** web app manifest (name, icons, `display: standalone`, theme
  color) via Next's metadata API, plus Apple touch icons, so "Add to Home
  Screen" opens a full-screen app on iOS and Android. **No offline caching**
  (non-goal). A tiny service worker is added only if Android install
  requires one.
- **Accessibility:** Radix primitives, keyboard-operable drag-and-drop (dnd-kit
  sensors), visible focus, and color contrast checked by an automated axe
  check in E2E.

---

## 9. Testing strategy

Development follows **test-first** for domain logic. The pyramid:

| Layer | Tool | What | Where it runs |
|---|---|---|---|
| **Unit** | Vitest | Pure logic in `src/lib`: XP, levels, streaks (including time-zone and DST edges), recurrence, fractional ordering | Every commit, < 5 s |
| **Domain integration** | Vitest + **PGlite** (in-process Postgres) with real Drizzle migrations | Every domain action: ownership scoping, transactions, history events, undo (including conflict refusal), inbox filing, completions and XP | Every commit, < 30 s |
| **Adapter tests** | Vitest | Server actions call `requireOwner()` (unauthenticated or wrong user is rejected). MCP: an in-process MCP SDK client lists tools, calls them with a stubbed verified token, and a bad or foreign token is rejected | Every commit |
| **Component** | Vitest + Testing Library (jsdom) | Interactive pieces with logic: capture box, recurrence picker, effort picker, board column reorder handlers | Every commit |
| **End-to-end** | **Playwright**, two projects: Desktop Chrome and a phone profile (Pixel 7 / iPhone 14 emulation) | Golden paths: log in, create area, capture to Inbox, file it, drag achievement Backlog→Active, add tasks, complete task (XP updates), repeating task daily check-off, undo from History, axe accessibility scan | On every PR, against its **preview deployment** and that PR's own Neon branch |
| **MCP smoke** | Script using the MCP SDK client with a token issued on the PR's branch | Connect, `get_overview`, `create_tasks`, `undo_batch` | On every PR (from M5) |

**Test data:** factories in `src/test/factories.ts`. Each PR's database is a
fresh branch of `seed`, so E2E never depends on leftovers and never touches
personal data.

**E2E auth:** in preview environments, `OWNER_EMAIL` is a dedicated test
owner, and email + password sign-in is enabled (§6.1). The test owner is
created on the PR's branch by a setup script. Production can't enable
password sign-in.

**Coverage target:** ≥90% lines for `src/lib` and `src/server/domain`,
enforced in CI. UI coverage is not enforced; E2E covers it.

---

## 10. Environments

| Env | App | Database / Auth | Who uses it |
|---|---|---|---|
| **Local** | `pnpm dev` on the owner's machine | **Postgres 17 in Docker** (`docker compose up -d`, already installed), seeded with sample areas; password login enabled | Development |
| **Preview** | Vercel preview deployment per PR (unique URL), deployed by GitHub Actions | Neon branch **`pr-<number>`**, created from **`seed`** when the PR opens, deleted when it closes | E2E tests; the owner tries changes on their phone (signing in as the test owner) before merging |
| **Production** | Vercel production (`<project>.vercel.app`; custom domain optional later) | Neon **`main`** branch | The owner, daily |

Neon's `seed` branch holds the current schema plus sample data. It is never
branched from production data. `deploy.yml` migrates it after production,
so new PR branches start current.

Config comes from env vars only. `.env.example` documents each one:
`DATABASE_URL`, `MIGRATION_DATABASE_URL`, `BETTER_AUTH_SECRET`,
`BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`OWNER_EMAIL`, `APP_ENV`, `ENABLE_PASSWORD_LOGIN`, `SENTRY_DSN`, ….
Values live in Vercel (per environment) and GitHub Actions secrets. Nothing
secret is ever committed. **The repository is public**, so this matters.

---

## 11. CI/CD

### 11.1 Branching
- `main` is always deployable and protected: changes land only through a PR
  with green checks. The owner can merge their own PRs; no reviewer is
  required.
- Work happens on short-lived branches, one per roadmap item or small
  group.

### 11.2 `ci.yml` (every PR, and called by `deploy.yml`)
1. Checkout, set up Node from `.nvmrc`, pnpm install with cache.
2. `pnpm lint` (ESLint, including the import-boundary rule) and
   `pnpm format:check` (Prettier).
3. `pnpm typecheck` (`tsc --noEmit`).
4. `pnpm test` (unit + domain integration + adapter + component, with coverage gate).
5. `pnpm drizzle-kit check`: migrations are consistent with the schema,
   and no uncommitted schema drift.
6. `pnpm build`.

### 11.3 `preview.yml` (every PR push, after `ci.yml` passes)
1. Create (or reset) Neon branch `pr-<number>` from `seed`
   (`neondatabase/create-branch-action`) and apply pending migrations to
   it.
2. Create the test owner on that branch.
3. `vercel build` (preview env pulled from Vercel), then `vercel deploy
   --prebuilt`, passing this branch's `DATABASE_URL` as a runtime env for
   this deployment only.
4. Comment or update the preview URL on the PR.
5. Run Playwright (desktop + phone) against the preview URL. Upload the
   report and traces as artifacts on failure.
6. Report status back to the PR; branch protection requires it.

`preview-cleanup.yml` deletes the PR's Neon branch when the PR closes.

### 11.4 `deploy.yml` (on push to `main`)
Production deploys run from GitHub Actions, not Vercel's auto-deploy, so
migrations are guaranteed to run first:
1. Run CI steps (or require the CI run's success).
2. **Migrate production** (Neon `main`, direct connection string), then
   migrate the `seed` branch.
3. `vercel build --prod` then `vercel deploy --prebuilt --prod`.
4. Post-deploy smoke: `GET /api/health` (checks DB connectivity and schema
   version) and the MCP smoke script. On failure, run `vercel rollback`
   automatically and fail the workflow, which emails the owner.

Vercel's Git integration is **fully disabled**
(`git.deploymentEnabled: false` in `vercel.json`). Every deployment,
preview and production, comes from Actions, so the database it talks to
is always chosen explicitly.

### 11.5 Migration rules
- Migrations are generated by drizzle-kit, reviewed, and committed. They're
  never hand-applied.
- **Expand/contract only:** each migration must work with both the
  currently deployed code and the new code. Add columns as nullable or with
  defaults first, backfill, then tighten or drop in a later PR. This makes
  rollback of app code safe without rolling back the DB.

### 11.6 Other workflows
- `backup.yml` runs nightly. It does a `pg_dump` of production, **encrypts
  it with `age`** using the owner's public key (the repo is public, so
  artifacts must not be readable), and uploads it as an artifact with
  30-day retention. The owner keeps the private key. A documented restore
  drill restores into a scratch Neon branch. Neon's own point-in-time
  restore (short history window on the free plan) covers "undo the last
  few hours".
- In-app **Settings → Export**: download all data as JSON at any time.
- Renovate runs weekly. It groups updates and auto-merges patch updates
  when CI and E2E pass.

---

## 12. How the app gets updated (day-to-day)

1. Pick the next item in `docs/ROADMAP.md`. For anything non-trivial,
   write or refresh its implementation plan in
   `docs/superpowers/plans/`.
2. Create a branch, build it test-first (with Claude Code or by hand), and
   commit.
3. Open a PR. CI runs, a **preview URL** with its own database branch is
   posted on the PR, and E2E runs against it.
4. Open the preview URL on the phone and try it for real. Sign in as the
   test owner; the data is sample data from `seed`.
5. Merge. `deploy.yml` migrates the production DB, deploys, and smoke-tests.
   Production is live within a few minutes.
6. Tick the item in `ROADMAP.md` as part of the PR.
7. **If something's wrong:** "Instant Rollback" in the Vercel dashboard (or
   `vercel rollback`) restores the previous app version in seconds. Because
   migrations are expand/contract, the DB doesn't need rolling back. Fix
   forward with a new PR.

**Phone updates:** there's no app store and no offline cache, so the next
time the home-screen app is opened or refreshed it's on the new version. A
small "New version available, tap to refresh" banner appears if the
deployed build id changes while the app is open (polls `/api/health`
every few minutes).

---

## 13. Observability

- Vercel runtime and function logs, with structured logs from
  `runAction` (action name, actor, duration, error).
- Sentry for client and server errors (added in Milestone 6), with source
  maps uploaded in `deploy.yml`.
- `/api/health` for smoke checks and the version banner.

---

## 14. Cost

Everything fits free tiers for one user: Vercel Hobby, one Neon free
project (its branch limit easily covers `main`, `seed` and a few open
PRs), GitHub Actions on a public repo, and the Sentry developer tier. Neon
suspends idle compute and wakes it on the next query, usually in well
under a second, so there is no pausing to manage. A Google Cloud OAuth
client is free.

---

## 15. Open technical risks

| Risk | Mitigation |
|---|---|
| An MCP client can't complete Better Auth's OAuth flow | Spike first in M5; fallback auth server on a maintained OAuth library (§7.4) |
| We own the auth code | Maintained library, no hand-rolled crypto; owner lock is tested at both layers (creation hook + `requireOwner`); E2E covers an intruder |
| Losing the only passkey or Google access | Google and passkey are independent; Settings shows registered passkeys; recovery = set `OWNER_EMAIL` and sign in with Google |
| Drag-and-drop feel on phones | dnd-kit touch sensors with a long-press to drag; the phone list view also gets "Move to…" menus so drag is never the only way |
| Serverless + Postgres connection limits | Neon's pooled connection string at runtime (direct string only for migrations); a small `pg` pool attached with `@vercel/functions` `attachDatabasePool` |
| Time-zone bugs in streaks and recurrence | Pure functions with injected clock and time zone; dedicated DST and midnight test cases |
| Public repo leaks something | Secrets only in env vars; GitHub secret scanning + push protection enabled; encrypted backups |
