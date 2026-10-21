# M0 Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A locked-down "Hello, owner" page live in production, reachable only after the owner's login, with CI, a preview URL and E2E on every PR, and a migrate → deploy → smoke → rollback pipeline on `main`.

**Architecture:** A single Next.js (App Router) app in TypeScript. Supabase provides Postgres and Auth. The server talks to Postgres through Drizzle. RLS is enabled on every table with no policies, so Supabase's public Data API sees nothing. Every page and route is gated by `requireOwner()`. GitHub Actions runs checks. Vercel builds a preview for each PR. Production deploys run from Actions after migrations.

**Tech Stack:** Node 24 LTS, pnpm, Next.js (latest stable), React, Tailwind CSS v4, shadcn/ui, Drizzle ORM + drizzle-kit, postgres-js, PGlite (tests), Supabase Auth + `@supabase/ssr` + Supabase CLI, Vitest, Playwright, GitHub Actions, Vercel CLI.

**Spec:** `docs/superpowers/specs/2026-10-22-life-goals-app-technical-design.md` (technical) and `docs/superpowers/specs/2026-10-21-life-goals-app-design.md` (product). Roadmap: `docs/ROADMAP.md` § M0.

## Global Constraints

- TypeScript `strict: true`; `noUncheckedIndexedAccess: true`.
- Node **24 LTS**, pinned in `.nvmrc` (`24`) and `package.json` `"engines": { "node": ">=24 <25" }`. Package manager pnpm, pinned via `"packageManager"`.
- Path alias `@/*` → `src/*`.
- `src/server/domain/**` must not import from `@/app/**`, `@/server/actions/**`, or `@/server/mcp/**` (lint-enforced).
- The browser never talks to the database. The Supabase **service-role key is never used by app code** (only by scripts under `scripts/`, run locally or in CI).
- RLS is enabled on every table in `public`, with **no** policies for `anon` or `authenticated`.
- Sign-ups are disabled in every Supabase environment (`enable_signup = false` locally; the dashboard toggle on staging/prod).
- Owner gate: a request is allowed only if the Supabase user id equals env `OWNER_USER_ID`. Pages answer non-owners with 404 and APIs with 401.
- Public paths (no owner required): `/login`, `/auth/callback`, `/auth/signout`, `/api/health`. (`/.well-known/*` joins this list in M5.)
- Password sign-in exists **only** when `NEXT_PUBLIC_ENABLE_PASSWORD_LOGIN === "true"`, which is set locally and in preview/staging only. **Never in production.**
- Runtime DB connection: `DATABASE_URL` = Supabase **transaction pooler** (port 6543), postgres-js with `prepare: false`. Migrations: `MIGRATION_DATABASE_URL` = Supabase **session pooler** (port 5432 on the pooler host; GitHub runners have no IPv6 for the direct host).
- Repository is **public**: no secret values in any committed file; `.env*` ignored except `.env.example`.
- Production auto-deploy from Vercel's Git integration is disabled; production deploys only via `deploy.yml`.
- Coverage gate: ≥90% lines for `src/lib/**` and `src/server/domain/**`.

## Review Focus

1. **A real Supabase account that isn't the owner** (e.g. someone signs in with Google, or an admin-created user) must see 404, not the app. Pinned in Task 4 (unit) and Task 6 (E2E "intruder").
2. **`next` redirect parameter on the auth callback**: absolute or protocol-relative URLs (`https://evil.com`, `//evil.com`, `/\evil.com`) must fall back to `/`. Pinned in Task 4 (`safeNextPath`).
3. **Database unreachable**: `/api/health` must answer 503 with `{ ok: false }`, without throwing and without echoing the connection string or error text. Pinned in Task 3.
4. **A preview build wired to the production database**: E2E must refuse to run when the target reports `environment: "production"`. Pinned in Task 6 (global setup) and Task 9.
5. **A failed migration or failed smoke check on `main`**: the new version must not stay live. The smoke script exits non-zero on any unhealthy response, and `deploy.yml` orders migrate → deploy → smoke → rollback. Pinned in Task 8 (smoke script tests).

---

### Task 1: Scaffold, toolchain and lint rules

**Files:**
- Create: `package.json`, `pnpm-lock.yaml`, `.nvmrc`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `components.json`, `src/lib/utils.ts` (shadcn), `eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`, `.env.example`
- Modify: `.gitignore` (add `coverage/`, `playwright-report/`, `test-results/`, `.vercel/`, `supabase/.temp/`)
- Test: `src/test/lint-boundaries.test.ts`

**Interfaces:**
- Produces: scripts `dev`, `build`, `start`, `lint` (`eslint .`), `format` / `format:check` (Prettier), `typecheck` (`tsc --noEmit`), plus `test` (wired up in Task 2).

- [ ] **Step 1: Owner action: install Node 24.** The machine has Node 22. Install Node 24 LTS (e.g. `fnm install 24 && fnm use 24`, or nvm-windows). Verify with `node -v` → `v24.x`.
- [ ] **Step 2: Scaffold** with `pnpm create next-app@latest . --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-pnpm --no-turbopack` (accept the existing `README.md`/`docs`). Then `pnpm dlx shadcn@latest init` (base color neutral, CSS variables on). Set `engines`/`packageManager`, `.nvmrc`, and the tsconfig flags from Global Constraints.
- [ ] **Step 3: Replace `src/app/page.tsx`** with a placeholder `<h1>Hello, owner</h1>` (Task 4 puts the gate around it).
- [ ] **Step 4: Write the failing test** `src/test/lint-boundaries.test.ts`. Use ESLint's Node API (`new ESLint({ cwd })` then `lintText(code, { filePath })`):

```ts
it("forbids domain code importing adapters", async () => {
  const [r] = await eslint.lintText(`import x from "@/server/mcp/tools"; export default x;\n`,
    { filePath: "src/server/domain/example.ts" });
  expect(r.messages.some(m => m.ruleId === "no-restricted-imports")).toBe(true);
});
it("allows domain code importing lib", async () => {
  const [r] = await eslint.lintText(`import { cn } from "@/lib/utils"; export const y = cn;\n`,
    { filePath: "src/server/domain/example.ts" });
  expect(r.messages.filter(m => m.ruleId === "no-restricted-imports")).toHaveLength(0);
});
```

(It runs once Task 2 adds Vitest. Write it now so the rule lands together with its test.)
- [ ] **Step 5: Add the rule** to `eslint.config.mjs`. Scope a block with `files: ["src/server/domain/**"]` and `no-restricted-imports` `patterns`: `@/app/*`, `@/server/actions/*`, `@/server/mcp/*`, plus the equivalent relative patterns (`**/app/**`, `**/actions/**`, `**/mcp/**`). Include `eslint-config-prettier` last.
- [ ] **Step 6: Write `.env.example`** with every variable used in M0, each with a one-line comment and no values: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `DATABASE_URL`, `MIGRATION_DATABASE_URL`, `OWNER_USER_ID`, `NEXT_PUBLIC_ENABLE_PASSWORD_LOGIN`, `APP_ENV` (`local` | `preview` | `production`), `SUPABASE_SERVICE_ROLE_KEY` (scripts only), `E2E_OWNER_EMAIL`, `E2E_OWNER_PASSWORD`, `E2E_INTRUDER_EMAIL`, `E2E_INTRUDER_PASSWORD`, `VERCEL_AUTOMATION_BYPASS_SECRET`.
- [ ] **Step 7: Verify.** `pnpm lint && pnpm format:check && pnpm typecheck && pnpm build`. Expected: all exit 0.
- [ ] **Step 8: Commit** `chore: scaffold Next.js app with lint, format and typecheck`.

### Task 2: Drizzle, first migration, RLS, and the test harness

**Files:**
- Create: `vitest.config.ts`, `drizzle.config.ts`, `src/server/db/schema.ts`, `src/server/db/client.ts`, `src/server/db/types.ts`, `drizzle/0000_*.sql` (generated), `drizzle/0001_enable_rls.sql` (custom), `src/test/db.ts`
- Test: `src/server/db/migrations.db.test.ts`, `src/lib/smoke.test.ts` (trivial unit sanity, deleted once real unit tests exist in M1)

**Interfaces:**
- Produces:
  - `settings` table: `owner_id uuid primary key`, `time_zone text not null default 'UTC'`, `week_start smallint not null default 1`, `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`. (M1 adds the remaining tables. Remove `settings` from M1's roadmap list when M1 starts.)
  - `type Db` in `src/server/db/types.ts`: a Drizzle Postgres database typed with `typeof schema`, assignable from both the postgres-js and the PGlite drizzle instances (use `PgDatabase<PgQueryResultHKT, typeof schema>`).
  - `getDb(): Db` in `client.ts`: a lazy singleton over postgres-js using `DATABASE_URL` with `{ prepare: false }`. Server-only (`import "server-only"`).
  - `createTestDb(): Promise<{ db: Db; client: PGlite; close(): Promise<void> }>` in `src/test/db.ts`: a fresh in-memory PGlite with all `drizzle/` migrations applied via `drizzle-orm/pglite/migrator`.
  - Scripts: `test` (`vitest run --coverage`), `test:watch`, `db:generate` (`drizzle-kit generate`), `db:migrate` (`drizzle-kit migrate`, reads `MIGRATION_DATABASE_URL`), `db:check` (`drizzle-kit check`).
- Vitest config: two projects. `unit` (`environment: node`, include `src/**/*.test.ts(x)`, exclude `**/*.db.test.ts`) and `db` (include `src/**/*.db.test.ts`). Coverage provider v8, `include: ["src/lib/**", "src/server/domain/**"]`, thresholds `lines: 90`. Resolve the `@/` alias, and alias `server-only` to an empty module in tests.

- [ ] **Step 1: Write the failing test** `migrations.db.test.ts`:

```ts
it("applies migrations and creates settings", async () => {
  const { client, close } = await createTestDb();
  const r = await client.query(`select to_regclass('public.settings') as t`);
  expect(r.rows[0]).toEqual({ t: "settings" });
  await close();
});
it("enables RLS on every public table, with no policies", async () => {
  const { client, close } = await createTestDb();
  const noRls = await client.query(`select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r' and not c.relrowsecurity`);
  expect(noRls.rows).toEqual([]);
  const policies = await client.query(`select * from pg_policies where schemaname='public'`);
  expect(policies.rows).toEqual([]);
  await close();
});
```

- [ ] **Step 2: Run** `pnpm vitest run --project db`. Expected: FAIL (`createTestDb` is not defined / no migrations).
- [ ] **Step 3: Implement** `schema.ts` (settings), `types.ts`, `client.ts`, `drizzle.config.ts` (out `./drizzle`, dialect postgresql, `dbCredentials.url = process.env.MIGRATION_DATABASE_URL`), and run `pnpm db:generate`. Then `pnpm drizzle-kit generate --custom --name enable_rls` and write a `DO` block that runs `alter table ... enable row level security` for every table in `public`. Implement `createTestDb`.
- [ ] **Step 4: Run** `pnpm test`. Expected: both db tests and the lint-boundary tests from Task 1 PASS, and the coverage gate passes (no files in scope yet).
- [ ] **Step 5: Commit** `feat(db): drizzle setup, settings table, RLS lockdown, PGlite test harness`.

> Rule for every future migration (M1+): a migration that creates a table also enables RLS on it. The second test above fails otherwise.

### Task 3: Health endpoint

**Files:**
- Create: `src/server/health.ts`, `src/app/api/health/route.ts`
- Test: `src/server/health.db.test.ts`

**Interfaces:**
- Consumes: `Db`, `getDb()`, `createTestDb()` (Task 2).
- Produces:
  - `type Health = { ok: boolean; db: "up" | "down"; schemaVersion: number | null; buildId: string; environment: "local" | "preview" | "production" }`
  - `checkHealth(db: Db, env?: { buildId?: string; environment?: string }): Promise<Health>`. `schemaVersion` = row count of `drizzle.__drizzle_migrations`. `buildId` = `process.env.APP_BUILD_ID`, which `next.config.ts` inlines at build time via `env: { APP_BUILD_ID: process.env.APP_BUILD_ID ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "dev" }`. Prebuilt CLI deploys don't reliably expose `VERCEL_GIT_COMMIT_SHA` at runtime, so `deploy.yml` sets `APP_BUILD_ID=${{ github.sha }}` for `vercel build`. `environment` = `APP_ENV ?? "local"`.
  - `GET /api/health`: 200 with `Health` when ok, 503 with `Health` when not. Header `Cache-Control: no-store`. `export const dynamic = "force-dynamic"`.

- [ ] **Step 1: Write the failing tests:**

```ts
it("reports up with schema version", async () => {
  const { db, close } = await createTestDb();
  const h = await checkHealth(db, { buildId: "abc", environment: "preview" });
  expect(h).toEqual({ ok: true, db: "up", schemaVersion: 2, buildId: "abc", environment: "preview" });
  await close();
});
it("reports down without leaking details when the db fails", async () => {
  const broken = { execute: () => Promise.reject(new Error("password=hunter2 host=db.secret")) } as unknown as Db;
  const h = await checkHealth(broken, { buildId: "abc", environment: "production" });
  expect(h).toEqual({ ok: false, db: "down", schemaVersion: null, buildId: "abc", environment: "production" });
  expect(JSON.stringify(h)).not.toContain("hunter2");
});
```

- [ ] **Step 2: Run** `pnpm vitest run src/server/health.db.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `checkHealth`: one `db.execute(sql\`select count(*)::int as n from drizzle.__drizzle_migrations\`)` inside try/catch. Log the error server-side with `console.error("health: db check failed")`, without the error message, since it may contain connection details. Then implement the route.
- [ ] **Step 4: Run** `pnpm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: /api/health with db and schema version`.

### Task 4: Auth, owner gate, login, security headers, local Supabase

**Files:**
- Create: `supabase/config.toml` (via `supabase init`), `src/server/auth/supabase.ts`, `src/server/auth/owner.ts`, `src/server/auth/paths.ts`, `src/proxy.ts` (Next ≥16; on older Next use `src/middleware.ts` exporting `middleware`), `src/app/login/page.tsx`, `src/app/login/actions.ts`, `src/app/auth/callback/route.ts`, `src/app/auth/signout/route.ts`, `src/security-headers.ts`
- Modify: `src/app/page.tsx`, `next.config.ts`, `package.json` (add `db:local:start` = `supabase start`, `db:local:stop`)
- Test: `src/server/auth/owner.test.ts`, `src/server/auth/paths.test.ts`, `src/security-headers.test.ts`

**Interfaces:**
- Consumes: env from Task 1.
- Produces:
  - `createServerSupabase(): Promise<SupabaseClient>` (cookie-bound via `@supabase/ssr` `createServerClient` and `next/headers` cookies).
  - `class NotOwnerError extends Error {}`
  - `checkOwner(user: { id: string } | null, ownerId: string | undefined): { id: string }`. Throws `NotOwnerError` when `user` is null, when `ownerId` is empty or undefined (fail closed), or when ids differ.
  - `requireOwner(): Promise<{ id: string; email?: string }>`. Calls `supabase.auth.getUser()`, then `checkOwner(user, process.env.OWNER_USER_ID)`. On `NotOwnerError` with no user it calls `redirect("/login")`; with a user it calls `notFound()`. API routes use `requireOwnerApi()`, which returns `Response | { id }`: 401 JSON `{ error: "unauthorized" }` on failure.
  - `isPublicPath(pathname: string): boolean`, using the list in Global Constraints (exact match, or prefix match for `/auth/`).
  - `safeNextPath(next: string | null): string`. Returns `next` only if it starts with a single `/`, is not followed by `/` or `\`, and contains no control characters. Otherwise returns `/`.
  - `securityHeaders(supabaseUrl: string): { key: string; value: string }[]`, used by `next.config.ts` `headers()` for `/:path*`.
  - Proxy: refreshes the Supabase session cookie on every request (the standard `@supabase/ssr` pattern). For non-public paths with no session it redirects to `/login`. The owner check itself stays in `requireOwner()`; the proxy is not the only lock.
  - Login page: an email field + "Send magic link" (`signInWithOtp`, `shouldCreateUser: false`, `emailRedirectTo` = `${origin}/auth/callback?next=…`), a "Continue with Google" button (`signInWithOAuth`), and **only if** `NEXT_PUBLIC_ENABLE_PASSWORD_LOGIN === "true"`, an email + password form (`signInWithPassword`). The password form's inputs carry `data-testid="password-email"`, `"password-password"`, `"password-submit"`.
  - `/auth/callback`: `exchangeCodeForSession(code)`, then redirect to `safeNextPath(next)`.
  - `/` page: `const owner = await requireOwner()`, then renders `<h1>Hello, owner</h1>` and a sign-out form posting to `/auth/signout`.

- [ ] **Step 1: Write the failing tests:**

```ts
// owner.test.ts
it("rejects no user", () => expect(() => checkOwner(null, "u1")).toThrow(NotOwnerError));
it("rejects a real non-owner user", () => expect(() => checkOwner({ id: "u2" }, "u1")).toThrow(NotOwnerError));
it("fails closed when OWNER_USER_ID is unset", () => expect(() => checkOwner({ id: "u1" }, undefined)).toThrow(NotOwnerError));
it("fails closed when OWNER_USER_ID is empty", () => expect(() => checkOwner({ id: "" }, "")).toThrow(NotOwnerError));
it("accepts the owner", () => expect(checkOwner({ id: "u1" }, "u1")).toEqual({ id: "u1" }));

// paths.test.ts
it.each(["/login", "/auth/callback", "/auth/signout", "/api/health"])("%s is public", p => expect(isPublicPath(p)).toBe(true));
it.each(["/", "/areas/1", "/api/mcp", "/loginx", "/api/healthz"])("%s is private", p => expect(isPublicPath(p)).toBe(false));
it.each([["/areas/1", "/areas/1"], [null, "/"], ["https://evil.com", "/"], ["//evil.com", "/"],
         ["/\\evil.com", "/"], ["/ok\n", "/"]])("safeNextPath(%j) -> %s", (i, o) => expect(safeNextPath(i)).toBe(o));

// security-headers.test.ts
const h = Object.fromEntries(securityHeaders("https://abc.supabase.co").map(x => [x.key, x.value]));
it("sets CSP with frame-ancestors none and supabase connect-src", () => {
  expect(h["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
  expect(h["Content-Security-Policy"]).toContain("connect-src 'self' https://abc.supabase.co");
});
it("sets HSTS, referrer and nosniff", () => {
  expect(h["Strict-Transport-Security"]).toBe("max-age=63072000; includeSubDomains; preload");
  expect(h["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
  expect(h["X-Content-Type-Options"]).toBe("nosniff");
});
```

- [ ] **Step 2: Run** `pnpm vitest run --project unit`. Expected: FAIL (modules missing).
- [ ] **Step 3: Implement** the modules above. CSP: `default-src 'self'; script-src 'self' 'unsafe-inline'` (Next inline bootstrap; tighten with nonces later); `style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' <supabaseUrl>; frame-ancestors 'none'; base-uri 'self'; form-action 'self' <supabaseUrl> https://accounts.google.com`. In `next dev`, also allow `'unsafe-eval'` in `script-src`.
- [ ] **Step 4: Local Supabase.** `pnpm dlx supabase init`, then in `supabase/config.toml` set `[auth] enable_signup = false`, `site_url = "http://localhost:3000"`, `additional_redirect_urls = ["http://localhost:3000/auth/callback"]`, `[auth.email] enable_signup = false`. Leave Google off locally (configured in the hosted projects in Task 7). Run `pnpm db:local:start` and copy the printed URL and anon key into `.env.local`. Point `DATABASE_URL`/`MIGRATION_DATABASE_URL` at the local DB (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`), then `pnpm db:migrate`.
- [ ] **Step 5: Run** `pnpm test && pnpm lint && pnpm typecheck && pnpm build`. Expected: PASS.
- [ ] **Step 6: Commit** `feat(auth): supabase login, owner gate, security headers, local supabase`.

### Task 5: Test-user script

**Files:**
- Create: `scripts/ensure-test-users.ts`, `scripts/lib/env.ts`
- Test: `scripts/lib/env.test.ts` (add `scripts/**/*.test.ts` to the `unit` project)

**Interfaces:**
- Produces:
  - `requireEnv(name: string): string`. Throws `Error("Missing env: <name>")` if unset or empty.
  - `pnpm e2e:users` runs `tsx scripts/ensure-test-users.ts`. With `SUPABASE_SERVICE_ROLE_KEY` + `NEXT_PUBLIC_SUPABASE_URL`, it uses `supabase.auth.admin` to create (or update the password of) the owner `E2E_OWNER_EMAIL` and the intruder `E2E_INTRUDER_EMAIL`, both `email_confirm: true`. It prints `OWNER_USER_ID=<uuid>` and then upserts a `settings` row for the owner via `MIGRATION_DATABASE_URL`. It **refuses to run when `APP_ENV === "production"`** (exit 1 with message).

- [ ] **Step 1: Write the failing tests** for `requireEnv`: returns the value; throws `"Missing env: X"` for unset; throws for `""`.
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement** `env.ts` and the script. **Step 4: Run** `pnpm test`. Expected: PASS. Then run `pnpm e2e:users` against local Supabase and put the printed id in `.env.local` as `OWNER_USER_ID`.
- [ ] **Step 5: Manual check:** `pnpm dev`, open `http://localhost:3000`. Expected: you're redirected to `/login`. Sign in with the owner's password and you see "Hello, owner". Sign out and sign in as the intruder, and you get 404.
- [ ] **Step 6: Commit** `feat: script to provision e2e owner and intruder users`.

### Task 6: Playwright E2E (desktop + phone)

**Files:**
- Create: `playwright.config.ts`, `e2e/global-setup.ts`, `e2e/auth.spec.ts`, `e2e/helpers/login.ts`
- Modify: `package.json` (`e2e` = `playwright test`), `eslint.config.mjs` / `tsconfig.json` to include `e2e/`

**Interfaces:**
- Consumes: `/api/health` `Health` (Task 3); login `data-testid`s (Task 4); users from Task 5.
- Produces:
  - Config: `baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000"`. Projects `desktop` (`devices["Desktop Chrome"]`) and `phone` (`devices["Pixel 7"]`). When `E2E_BASE_URL` is unset, `webServer` runs `pnpm build && pnpm start`. If `VERCEL_AUTOMATION_BYPASS_SECRET` is set, `extraHTTPHeaders` = `{ "x-vercel-protection-bypass": secret, "x-vercel-set-bypass-cookie": "true" }`. `trace: "retain-on-failure"`.
  - `loginWithPassword(page, email, password)` helper.
  - Global setup: fetch `${baseURL}/api/health`, and **throw if `environment === "production"`** or if `ok !== true`.

- [ ] **Step 1: Write the specs** in `e2e/auth.spec.ts`:

```ts
test("anonymous visitor is sent to login", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
});
test("owner signs in and sees the app", async ({ page }) => {
  await loginWithPassword(page, process.env.E2E_OWNER_EMAIL!, process.env.E2E_OWNER_PASSWORD!);
  await expect(page.getByRole("heading", { name: "Hello, owner" })).toBeVisible();
});
test("a real non-owner account gets 404", async ({ page }) => {
  await loginWithPassword(page, process.env.E2E_INTRUDER_EMAIL!, process.env.E2E_INTRUDER_PASSWORD!);
  const res = await page.goto("/");
  expect(res?.status()).toBe(404);
  await expect(page.getByText("Hello, owner")).toHaveCount(0);
});
test("health is public and not cached", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  expect(res.headers()["cache-control"]).toContain("no-store");
});
```

- [ ] **Step 2: Run** `pnpm exec playwright install --with-deps chromium`, then `pnpm e2e` (local Supabase running). Expected: all 8 runs (4 tests × 2 projects) PASS. If a spec fails, fix the app, not the spec.
- [ ] **Step 3: Commit** `test(e2e): playwright desktop+phone auth golden paths`.

### Task 7: Hosted environments (owner-assisted)

No code tests. Each step ends with a verification command. Steps marked **Owner** need the owner's dashboard or browser login. The agent drives the CLI where it can.

**Files:**
- Create: `vercel.json`

- [ ] **Step 1: Owner:** create Supabase projects `personal-app-staging` and `personal-app-prod` (free tier, same region as Vercel's default `iad1`, i.e. US East). In each: Authentication → Sign-ups **off**. Enable the Google provider with a Google Cloud OAuth client (redirect `https://<ref>.supabase.co/auth/v1/callback`). Set Site URL and redirect URLs: prod uses `https://<vercel-prod-domain>/auth/callback`; staging uses `https://*-<vercel-team>.vercel.app/auth/callback`. Staging only: keep Email+password enabled. Prod: disable password sign-in. Collect for each: project URL, anon key, service-role key, transaction-pooler URL (6543), session-pooler URL (5432).
- [ ] **Step 2: Owner, prod account:** in prod Supabase → Authentication → Users → "Add user", enter the owner's own email (or sign in once with Google before turning sign-ups off). Record the user id as prod `OWNER_USER_ID`. Staging: run `APP_ENV=preview pnpm e2e:users` with staging env and record the owner id it prints.
- [ ] **Step 3: Migrate both:** `MIGRATION_DATABASE_URL=<staging session pooler> pnpm db:migrate`, then the same for prod. Verify in each SQL editor: `select relname, relrowsecurity from pg_class where relname='settings'` → `true`.
- [ ] **Step 4: Vercel:** `pnpm dlx vercel@latest link` (Owner logs in). Write `vercel.json`:

```json
{ "git": { "deploymentEnabled": { "main": false } } }
```

  Set env vars with `vercel env add`. **Production:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `DATABASE_URL`, `OWNER_USER_ID` (prod values), `APP_ENV=production`, and **no** `NEXT_PUBLIC_ENABLE_PASSWORD_LOGIN`. **Preview:** the staging values, `APP_ENV=preview`, `NEXT_PUBLIC_ENABLE_PASSWORD_LOGIN=true`. Do **not** give Vercel the service-role key or `MIGRATION_DATABASE_URL`.
- [ ] **Step 5: Owner:** Vercel → Project → Settings → Deployment Protection → enable "Protection Bypass for Automation". Copy the secret.
- [ ] **Step 6: GitHub secrets** (`gh secret set …`): `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` (from `.vercel/project.json`), `VERCEL_AUTOMATION_BYPASS_SECRET`, `STAGING_MIGRATION_DATABASE_URL`, `STAGING_SUPABASE_URL`, `STAGING_SERVICE_ROLE_KEY`, `PROD_MIGRATION_DATABASE_URL`, `E2E_OWNER_EMAIL`, `E2E_OWNER_PASSWORD`, `E2E_INTRUDER_EMAIL`, `E2E_INTRUDER_PASSWORD`, `PROD_URL`. Verify: `gh secret list` shows all 13.
- [ ] **Step 7: Commit** `chore: vercel config, disable main auto-deploy`, then open the PR for Tasks 1–7. Expected: Vercel comments a preview URL. `curl -H "x-vercel-protection-bypass: $SECRET" <preview>/api/health` → `{"ok":true,…,"environment":"preview"}`.

### Task 8: Smoke script

**Files:**
- Create: `scripts/smoke.ts`, `scripts/lib/smoke.ts`
- Test: `scripts/lib/smoke.test.ts`

**Interfaces:**
- Consumes: `Health` (Task 3).
- Produces:
  - `evaluateHealth(status: number, body: unknown, expect: { environment: string; buildId?: string }): { ok: true } | { ok: false; reason: string }`
  - `pnpm smoke <url>` (`tsx scripts/smoke.ts`): fetches `<url>/api/health`, with up to 5 attempts 10 s apart, each with a 10 s timeout. Takes `--env` and `--build`. Exits 0 on ok; otherwise exits 1 and prints the reason.

- [ ] **Step 1: Write the failing tests:**

```ts
const good = { ok: true, db: "up", schemaVersion: 2, buildId: "abc", environment: "production" };
it("accepts a healthy matching response", () => expect(evaluateHealth(200, good, { environment: "production", buildId: "abc" })).toEqual({ ok: true }));
it("rejects 503", () => expect(evaluateHealth(503, { ...good, ok: false, db: "down" }, { environment: "production" }).ok).toBe(false));
it("rejects wrong environment", () => expect(evaluateHealth(200, { ...good, environment: "preview" }, { environment: "production" }).ok).toBe(false));
it("rejects stale build", () => expect(evaluateHealth(200, good, { environment: "production", buildId: "def" }).ok).toBe(false));
it("rejects non-JSON / malformed body", () => expect(evaluateHealth(200, "<html>", { environment: "production" }).ok).toBe(false));
```

- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement.** **Step 4: Run** `pnpm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: deploy smoke-check script`.

### Task 9: GitHub Actions: CI, E2E, deploy

**Files:**
- Create: `.github/workflows/ci.yml`, `.github/workflows/e2e.yml`, `.github/workflows/deploy.yml`, `.github/actions/setup/action.yml` (composite: checkout is done by caller; setup pnpm, setup-node from `.nvmrc` with pnpm cache, `pnpm install --frozen-lockfile`)

**Interfaces:**
- Consumes: scripts from Tasks 1–8; secrets from Task 7.
- Produces job names that branch protection requires: `ci / checks` and `e2e / playwright`.

- [ ] **Step 1: `ci.yml`.** Triggers: `pull_request` and `workflow_call`. Pushes to `main` get their checks through `deploy.yml`, which calls this workflow, so they don't run twice. Job `checks` runs `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test`, `pnpm db:check`, `pnpm build`. The build gets placeholder public env (`NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321`, `NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder`) so it builds without real secrets. `concurrency: ci-${{ github.ref }}`, `cancel-in-progress: true`.
- [ ] **Step 2: `e2e.yml`.** Trigger: `deployment_status`. Job `playwright` runs only if `github.event.deployment_status.state == 'success' && github.event.deployment.environment == 'Preview'`. Steps:
  1. Run `pnpm db:migrate` with `MIGRATION_DATABASE_URL=${{ secrets.STAGING_MIGRATION_DATABASE_URL }}`.
  2. Run `APP_ENV=preview pnpm e2e:users` with the staging service key. It is idempotent and resets the passwords.
  3. Run `pnpm exec playwright install --with-deps chromium`.
  4. Run `pnpm e2e` with `E2E_BASE_URL=${{ github.event.deployment_status.environment_url }}` and the bypass secret.
  5. On failure, upload `playwright-report/` and `test-results/` with `actions/upload-artifact`, retention 7 days. These contain only test-account data.

  `concurrency: e2e-staging` with no cancel, so runs never overlap on the shared staging DB.
- [ ] **Step 3: `deploy.yml`.** Trigger: `push` to `main`. `concurrency: deploy-prod`, no cancel. Jobs:
  - `checks`: `uses: ./.github/workflows/ci.yml`.
  - `migrate`, after `checks`: `pnpm db:migrate` with `PROD_MIGRATION_DATABASE_URL`. `environment: production`.
  - `deploy`, after `migrate`:
    1. `pnpm dlx vercel@latest pull --yes --environment=production --token=$VERCEL_TOKEN`
    2. `APP_BUILD_ID=${{ github.sha }} vercel build --prod`
    3. `vercel deploy --prebuilt --prod`
    4. Capture the deployment URL, then run `pnpm smoke $PROD_URL --env production --build ${{ github.sha }}`.
    5. Only if `failure()`, run `vercel rollback --yes --token=$VERCEL_TOKEN` and then fail the job. GitHub emails the owner on workflow failure.
- [ ] **Step 4: Lint the workflows:** `pnpm dlx @action-validator/cli .github/workflows/*.yml` (or `actionlint` if installed). Expected: no errors.
- [ ] **Step 5: Commit and push** the branch. Expected on the PR: `ci / checks` is green. After Vercel's preview, `e2e / playwright` is green with all 8 Playwright runs passing.
- [ ] **Step 6: Commit** `ci: checks, preview e2e, and production deploy pipeline` (if anything changed while getting green).

### Task 10: Protect `main`, first production deploy, tick the roadmap

**Files:**
- Modify: `docs/ROADMAP.md` (tick M0 items)

- [ ] **Step 1: Branch protection** (owner approves the command):
  `gh api -X PUT repos/Halvadar-secondary/personal-app/branches/main/protection --input -`, with JSON requiring status checks `checks` and `playwright` (strict), `enforce_admins: false`, `required_pull_request_reviews: null`, `restrictions: null`, `allow_force_pushes: false`, `allow_deletions: false`.
  Verify: `gh api repos/Halvadar-secondary/personal-app/branches/main/protection --jq '.required_status_checks.contexts'` → `["checks","playwright"]`.
- [ ] **Step 2: Secret scanning + push protection:** `gh api -X PATCH repos/Halvadar-secondary/personal-app -f 'security_and_analysis[secret_scanning][status]=enabled' -f 'security_and_analysis[secret_scanning_push_protection][status]=enabled'`. Verify with `gh api repos/Halvadar-secondary/personal-app --jq .security_and_analysis`.
- [ ] **Step 3: Tick the roadmap.** In `docs/ROADMAP.md` M0, mark every item `[x]` and remove `settings` from M1's schema bullet (it now exists).
- [ ] **Step 4: Merge the PR.** Expected: `deploy.yml` runs checks → migrate → deploy → smoke, all green.
- [ ] **Step 5: Owner verification on prod:** on desktop and phone, open `PROD_URL`. You're redirected to `/login`, there's **no password form**, and signing in with the magic link or Google shows "Hello, owner". Then visit `PROD_URL/api/health` and expect `"environment":"production"` with `buildId` equal to the merge commit SHA.
