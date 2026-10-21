# M0 Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A locked-down "Hello, owner" page live in production. You reach it only by signing in as the owner with Google or a passkey. Every PR gets CI, its own database branch, a preview URL and E2E. `main` deploys through migrate → deploy → smoke → rollback.

**Architecture:** A single Next.js (App Router) app in TypeScript. Postgres lives on Neon (`main` = production, `seed` = schema + sample data, `pr-<n>` = per-PR copies of `seed`); locally it runs in Docker. The server reaches it through Drizzle over node-postgres. Better Auth runs inside the app, storing its tables in the same database. A creation hook allows only `OWNER_EMAIL` to have an account, and `requireOwner()` gates every page and route. GitHub Actions runs checks and performs **all** deployments with the Vercel CLI. Vercel's Git integration is disabled.

**Tech Stack:** Node 24 LTS, pnpm, Next.js (latest stable), React, Tailwind CSS v4, shadcn/ui, Drizzle ORM + drizzle-kit, `pg`, PGlite (tests), Better Auth (Drizzle adapter, passkey plugin, Google provider, `nextCookies`), Docker Compose (Postgres 17), Vitest, Playwright, GitHub Actions, Neon (`neondatabase/create-branch-action`, `delete-branch-action`), Vercel CLI.

**Spec:** `docs/superpowers/specs/2026-10-22-life-goals-app-technical-design.md` (technical) and `docs/superpowers/specs/2026-10-21-life-goals-app-design.md` (product). Roadmap: `docs/ROADMAP.md` § M0.

## Global Constraints

- TypeScript `strict: true`; `noUncheckedIndexedAccess: true`.
- Node **24 LTS**, pinned in `.nvmrc` (`24`) and `package.json` `"engines": { "node": ">=24 <25" }`. Package manager pnpm, pinned via `"packageManager"`.
- Path alias `@/*` → `src/*`.
- `src/server/domain/**` must not import from `@/app/**`, `@/server/actions/**`, or `@/server/mcp/**` (lint-enforced).
- The browser never receives database credentials. Neon's Data API stays **disabled**.
- Runtime DB connection: `DATABASE_URL` = Neon **pooled** connection string (host contains `-pooler`), via a `pg` Pool. Migrations: `MIGRATION_DATABASE_URL` = Neon **direct** connection string. Locally both are `postgresql://app:app@localhost:5432/app`.
- **Owner lock, layer 1:** Better Auth's `databaseHooks.user.create.before` rejects any user whose email, lower-cased and trimmed, isn't `OWNER_EMAIL` (lower-cased, trimmed). It also rejects everyone when `OWNER_EMAIL` is unset or empty.
- **Owner lock, layer 2:** `requireOwner()` allows a request only when there's a session whose `user.email` matches `OWNER_EMAIL` the same way. Pages answer anything else with 404, and APIs with 401 `{ "error": "unauthorized" }`. It fails closed when `OWNER_EMAIL` is unset or empty.
- Public paths (no owner required): `/login`, `/api/auth/*`, `/api/health`. (`/.well-known/*` joins this list in M5.)
- **Email + password sign-in** is enabled only when `APP_ENV !== "production"` **and** `ENABLE_PASSWORD_LOGIN === "true"`. It's for local use and previews. Sign-up via password is always disabled (`disableSignUp: true`); test users are created by script.
- `APP_ENV` ∈ `local` | `preview` | `production`. Default `local`.
- `BETTER_AUTH_SECRET` is different in every environment.
- Repository is **public**: no secret values in any committed file; `.env*` ignored except `.env.example`.
- Vercel's Git integration is fully disabled (`vercel.json`: `{"git":{"deploymentEnabled":false}}`). All deployments come from GitHub Actions.
- Preview databases branch from Neon **`seed`**, never from `main`.
- Coverage gate: ≥90% lines for `src/lib/**` and `src/server/domain/**`.

## Review Focus

1. **A real account that isn't the owner** must never see the app. Scenario: a stranger signs in with their own Google account. Pinned in Task 4 (creation-hook DB test). Scenario: a non-owner user row already exists, e.g. after `OWNER_EMAIL` changes. Pinned in Task 4 (`checkOwner` unit) and Task 6 (E2E "intruder" gets 404).
2. **Password sign-in in production**: even if someone sets `ENABLE_PASSWORD_LOGIN=true` in prod, it must stay off. Pinned in Task 4 (`passwordLoginEnabled` unit) and Task 9 (prod smoke posts to the password endpoint and expects rejection).
3. **The `next` redirect on the login page**: absolute or protocol-relative values (`https://evil.com`, `//evil.com`, `/\evil.com`) must fall back to `/`. Pinned in Task 4 (`safeNextPath`).
4. **Database unreachable**: `/api/health` must answer 503 with `{ ok: false }`, without throwing and without echoing the connection string or error text. Pinned in Task 3.
5. **A preview deployment pointed at the production database**, or a failed deploy left live. E2E refuses to run against `environment: "production"` (Task 6). The smoke script exits non-zero on any unhealthy, wrong-environment or stale-build response (Task 8). `deploy.yml` orders migrate → deploy → smoke → rollback (Task 9).

---

### Task 1: Scaffold, toolchain and lint rules

**Files:**
- Create: `package.json`, `pnpm-lock.yaml`, `.nvmrc`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `components.json`, `src/lib/utils.ts` (shadcn), `eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`, `.env.example`
- Modify: `.gitignore` (add `coverage/`, `playwright-report/`, `test-results/`, `.vercel/`)
- Test: `src/test/lint-boundaries.test.ts`

**Interfaces:**
- Produces: scripts `dev`, `build`, `start`, `lint` (`eslint .`), `format` / `format:check` (Prettier), `typecheck` (`tsc --noEmit`), plus `test` (wired up in Task 2).

- [ ] **Step 1: Owner action: install Node 24.** The machine has Node 22. Install Node 24 LTS (e.g. `fnm install 24 && fnm use 24`, or nvm-windows). Verify with `node -v` → `v24.x`.
- [ ] **Step 2: Scaffold** with `pnpm create next-app@latest . --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-pnpm` (keep the existing `README.md`/`docs`). Then `pnpm dlx shadcn@latest init` (base color neutral, CSS variables on). Set `engines`/`packageManager`, `.nvmrc`, and the tsconfig flags from Global Constraints.
- [ ] **Step 3: Replace `src/app/page.tsx`** with a placeholder `<h1>Hello, owner</h1>` (Task 4 puts the gate around it).
- [ ] **Step 4: Write the test** `src/test/lint-boundaries.test.ts` using ESLint's Node API (`new ESLint({ cwd })`, `lintText(code, { filePath })`):

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

(This runs once Task 2 adds Vitest.)
- [ ] **Step 5: Add the rule** to `eslint.config.mjs`. Scope a block with `files: ["src/server/domain/**"]` and `no-restricted-imports` `patterns`: `@/app/*`, `@/server/actions/*`, `@/server/mcp/*`, plus the relative equivalents (`**/app/**`, `**/actions/**`, `**/mcp/**`). Add `eslint-config-prettier` last.
- [ ] **Step 6: Write `.env.example`** with every M0 variable, each with a one-line comment and no values: `DATABASE_URL`, `MIGRATION_DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `OWNER_EMAIL`, `APP_ENV`, `ENABLE_PASSWORD_LOGIN`, `E2E_OWNER_EMAIL`, `E2E_OWNER_PASSWORD`, `E2E_INTRUDER_EMAIL`, `E2E_INTRUDER_PASSWORD`, `E2E_BASE_URL`, `VERCEL_AUTOMATION_BYPASS_SECRET`.
- [ ] **Step 7: Verify.** `pnpm lint && pnpm format:check && pnpm typecheck && pnpm build`. Expected: all exit 0.
- [ ] **Step 8: Commit** `chore: scaffold Next.js app with lint, format and typecheck`.

### Task 2: Local Postgres, Drizzle, first migration, test harness

**Files:**
- Create: `docker-compose.yml`, `vitest.config.ts`, `drizzle.config.ts`, `src/server/db/schema.ts`, `src/server/db/client.ts`, `src/server/db/types.ts`, `drizzle/0000_*.sql` (generated), `src/test/db.ts`
- Test: `src/server/db/migrations.db.test.ts`

**Interfaces:**
- Produces:
  - `docker-compose.yml`: service `db`, image `postgres:17`, env `POSTGRES_USER=app POSTGRES_PASSWORD=app POSTGRES_DB=app`, port `5432:5432`, a named volume. Scripts `db:up` (`docker compose up -d db`) and `db:down`.
  - `settings` table: `owner_id text primary key` (references the Better Auth `user.id`, which is text; the FK is added in Task 4), `time_zone text not null default 'UTC'`, `week_start smallint not null default 1`, `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`.
  - `src/server/db/schema.ts` re-exports every table module (`export * from "./auth-schema"` is added in Task 4).
  - `type Db` in `types.ts`: a Drizzle Postgres database typed with `typeof schema`, assignable from both the node-postgres and the PGlite drizzle instances (`PgDatabase<PgQueryResultHKT, typeof schema>`).
  - `getDb(): Db` in `client.ts`: a lazy singleton `pg.Pool({ connectionString: DATABASE_URL, max: 5 })` wrapped with `drizzle(pool, { schema })`, registered via `attachDatabasePool(pool)` from `@vercel/functions`. Server-only (`import "server-only"`).
  - `createTestDb(): Promise<{ db: Db; client: PGlite; close(): Promise<void> }>` in `src/test/db.ts`: a fresh in-memory PGlite with all `drizzle/` migrations applied via `drizzle-orm/pglite/migrator`.
  - Scripts: `test` (`vitest run --coverage`), `test:watch`, `db:generate`, `db:migrate` (reads `MIGRATION_DATABASE_URL`), `db:check`.
- Vitest: two projects. `unit` (`environment: node`, include `src/**/*.test.ts(x)` and `scripts/**/*.test.ts`, exclude `**/*.db.test.ts`) and `db` (include `src/**/*.db.test.ts`). Coverage provider v8, `include: ["src/lib/**", "src/server/domain/**"]`, `thresholds.lines: 90`. Resolve `@/`, and alias `server-only` to an empty module.

- [ ] **Step 1: Write the failing test** `migrations.db.test.ts`:

```ts
it("applies migrations and creates settings with defaults", async () => {
  const { client, close } = await createTestDb();
  await client.query(`insert into settings (owner_id) values ('u1')`);
  const r = await client.query(`select time_zone, week_start from settings where owner_id='u1'`);
  expect(r.rows[0]).toEqual({ time_zone: "UTC", week_start: 1 });
  await close();
});
```

- [ ] **Step 2: Run** `pnpm vitest run --project db`. Expected: FAIL (`createTestDb` not defined).
- [ ] **Step 3: Implement** the compose file, schema, types, client, `drizzle.config.ts` (out `./drizzle`, dialect `postgresql`, `dbCredentials.url = process.env.MIGRATION_DATABASE_URL`), and `createTestDb`. Run `pnpm db:generate`.
- [ ] **Step 4: Run** `pnpm test`. Expected: the db test and the Task 1 lint-boundary tests PASS, and the coverage gate passes (nothing in scope yet). Also run `pnpm db:up && pnpm db:migrate` against local Docker. Expected: it applies with no error.
- [ ] **Step 5: Commit** `feat(db): local postgres, drizzle, settings table, PGlite test harness`.

### Task 3: Health endpoint

**Files:**
- Create: `src/server/health.ts`, `src/app/api/health/route.ts`
- Modify: `next.config.ts` (inline `APP_BUILD_ID`)
- Test: `src/server/health.db.test.ts`

**Interfaces:**
- Consumes: `Db`, `getDb()`, `createTestDb()` (Task 2).
- Produces:
  - `type Health = { ok: boolean; db: "up" | "down"; schemaVersion: number | null; buildId: string; environment: "local" | "preview" | "production" }`
  - `checkHealth(db: Db, env: { buildId: string; environment: Health["environment"] }): Promise<Health>`. `schemaVersion` = row count of `drizzle.__drizzle_migrations`.
  - `next.config.ts` sets `env: { APP_BUILD_ID: process.env.APP_BUILD_ID ?? "dev" }`. Workflows pass `APP_BUILD_ID=${{ github.sha }}` to `vercel build`. The route passes `{ buildId: process.env.APP_BUILD_ID, environment: process.env.APP_ENV ?? "local" }`.
  - `GET /api/health`: 200 with `Health` when ok, 503 when not; `Cache-Control: no-store`; `export const dynamic = "force-dynamic"`.

- [ ] **Step 1: Write the failing tests:**

```ts
it("reports up with schema version", async () => {
  const { db, close } = await createTestDb();
  const h = await checkHealth(db, { buildId: "abc", environment: "preview" });
  expect(h).toEqual({ ok: true, db: "up", schemaVersion: 1, buildId: "abc", environment: "preview" });
  await close();
});
it("reports down without leaking details when the db fails", async () => {
  const broken = { execute: () => Promise.reject(new Error("password=hunter2 host=db.secret")) } as unknown as Db;
  const h = await checkHealth(broken, { buildId: "abc", environment: "production" });
  expect(h).toEqual({ ok: false, db: "down", schemaVersion: null, buildId: "abc", environment: "production" });
  expect(JSON.stringify(h)).not.toContain("hunter2");
});
```

(When Task 4 adds its migration, update the first test's expected `schemaVersion` to `2`.)
- [ ] **Step 2: Run** `pnpm vitest run src/server/health.db.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement** with one `db.execute(sql\`select count(*)::int as n from drizzle.__drizzle_migrations\`)` in a try/catch. On failure, log `console.error("health: db check failed")` without the error message.
- [ ] **Step 4: Run** `pnpm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: /api/health with db and schema version`.

### Task 4: Better Auth, owner lock, login, security headers

**Files:**
- Create: `src/server/auth/owner.ts`, `src/server/auth/config.ts`, `src/server/auth/auth.ts`, `src/server/auth/require-owner.ts`, `src/server/auth/paths.ts`, `src/server/db/auth-schema.ts` (generated by the Better Auth CLI, then committed), `drizzle/0001_*.sql` (generated), `src/app/api/auth/[...all]/route.ts`, `src/lib/auth-client.ts`, `src/app/login/page.tsx`, `src/app/login/login-form.tsx`, `src/app/add-passkey-button.tsx`, `src/proxy.ts` (Next ≥16; on older Next, `src/middleware.ts` exporting `middleware`), `src/security-headers.ts`
- Modify: `src/server/db/schema.ts` (export auth schema; add `settings.owner_id` FK → `user.id` on delete cascade), `src/app/page.tsx`, `next.config.ts`
- Test: `src/server/auth/owner.test.ts`, `src/server/auth/config.test.ts`, `src/server/auth/paths.test.ts`, `src/security-headers.test.ts`, `src/server/auth/auth.db.test.ts`

**Interfaces:**
- Consumes: `Db`, `getDb()`, `createTestDb()` (Task 2).
- Produces:
  - `owner.ts` (pure):
    - `normalizeEmail(e: string | null | undefined): string` (trim + lower-case; `""` for nullish)
    - `isOwnerEmail(email: string | null | undefined, ownerEmail: string | undefined): boolean`. False when either normalised value is `""`.
    - `class NotOwnerError extends Error {}`
    - `checkOwner(session: { user: { id: string; email: string } } | null, ownerEmail: string | undefined): { id: string; email: string }`. Throws `NotOwnerError` unless `isOwnerEmail(session.user.email, ownerEmail)`.
  - `config.ts` (pure): `passwordLoginEnabled(env: { APP_ENV?: string; ENABLE_PASSWORD_LOGIN?: string }): boolean`. True only for `APP_ENV !== "production" && ENABLE_PASSWORD_LOGIN === "true"`.
  - `auth.ts`: `createAuth(db: Db, env: NodeJS.ProcessEnv)` returns a `betterAuth({...})` instance with:
    - `database: drizzleAdapter(db, { provider: "pg", schema })`
    - `emailAndPassword: { enabled: passwordLoginEnabled(env), disableSignUp: true }`
    - `socialProviders.google` (when `GOOGLE_CLIENT_ID` is set)
    - `plugins: [passkey({ rpName: "Life Goals" }), nextCookies()]`. `rpID` and `origin` are derived from `BETTER_AUTH_URL`.
    - `trustedOrigins`: `BETTER_AUTH_URL`, plus `https://${VERCEL_URL}` and `https://${VERCEL_BRANCH_URL}` when set
    - `databaseHooks.user.create.before`: `if (!isOwnerEmail(user.email, env.OWNER_EMAIL)) throw new APIError("FORBIDDEN", { message: "Sign-ups are closed" })`

    Also `export const auth = createAuth(getDb(), process.env)` (lazy-safe for build).
  - `require-owner.ts`: `requireOwner(): Promise<{ id: string; email: string }>`. Gets the session via `auth.api.getSession({ headers: await headers() })`. No session → `redirect("/login?next=<current path>")`. A session that fails `checkOwner` → `notFound()`. `requireOwnerApi(req: Request): Promise<Response | { id: string; email: string }>` returns a 401 JSON response on failure.
  - `paths.ts`: `isPublicPath(pathname: string): boolean` (exact `/login`, `/api/health`; prefix `/api/auth/`), and `safeNextPath(next: string | null): string`. Returns `next` only if it starts with a single `/` not followed by `/` or `\` and contains no control characters; otherwise `/`.
  - Proxy: for non-public paths, if `getSessionCookie(request)` (from `better-auth/cookies`) is absent, redirect to `/login?next=<path>`. Otherwise pass through. It's never the real lock.
  - Login page: a "Continue with Google" button (`authClient.signIn.social({ provider: "google", callbackURL: safeNextPath(next) })`) and a "Sign in with passkey" button (`authClient.signIn.passkey()`). When the server reports `passwordLoginEnabled`, it also shows an email + password form with `data-testid="password-email"`, `"password-password"` and `"password-submit"`.
  - `/` page: `await requireOwner()`, then renders `<h1>Hello, owner</h1>`, an **"Add a passkey"** button (`authClient.passkey.addPasskey()`), and a sign-out button.
  - `securityHeaders(): { key: string; value: string }[]` applied to `/:path*` in `next.config.ts`.

- [ ] **Step 1: Write the failing unit tests:**

```ts
// owner.test.ts
it.each([["Me@X.com ", "me@x.com", true], ["me@x.com", "you@x.com", false], ["me@x.com", undefined, false],
         ["me@x.com", "", false], ["", "", false], [null, "me@x.com", false]])
  ("isOwnerEmail(%j, %j) = %s", (e, o, r) => expect(isOwnerEmail(e, o)).toBe(r));
it("checkOwner rejects no session", () => expect(() => checkOwner(null, "me@x.com")).toThrow(NotOwnerError));
it("checkOwner rejects a non-owner user", () =>
  expect(() => checkOwner({ user: { id: "2", email: "you@x.com" } }, "me@x.com")).toThrow(NotOwnerError));
it("checkOwner fails closed with no OWNER_EMAIL", () =>
  expect(() => checkOwner({ user: { id: "1", email: "me@x.com" } }, undefined)).toThrow(NotOwnerError));
it("checkOwner accepts the owner", () =>
  expect(checkOwner({ user: { id: "1", email: "ME@x.com" } }, "me@x.com")).toEqual({ id: "1", email: "ME@x.com" }));

// config.test.ts
it.each([[{ APP_ENV: "production", ENABLE_PASSWORD_LOGIN: "true" }, false], [{ APP_ENV: "preview", ENABLE_PASSWORD_LOGIN: "true" }, true],
         [{ APP_ENV: "local", ENABLE_PASSWORD_LOGIN: "true" }, true], [{ ENABLE_PASSWORD_LOGIN: "true" }, true],
         [{ APP_ENV: "preview" }, false], [{ APP_ENV: "preview", ENABLE_PASSWORD_LOGIN: "1" }, false]])
  ("passwordLoginEnabled(%j) = %s", (env, r) => expect(passwordLoginEnabled(env)).toBe(r));

// paths.test.ts
it.each(["/login", "/api/health", "/api/auth/sign-in/social", "/api/auth/callback/google"])("%s is public", p => expect(isPublicPath(p)).toBe(true));
it.each(["/", "/areas/1", "/api/mcp", "/loginx", "/api/healthz", "/api/authx"])("%s is private", p => expect(isPublicPath(p)).toBe(false));
it.each([["/areas/1", "/areas/1"], [null, "/"], ["https://evil.com", "/"], ["//evil.com", "/"],
         ["/\\evil.com", "/"], ["/ok\n", "/"]])("safeNextPath(%j) -> %s", (i, o) => expect(safeNextPath(i)).toBe(o));

// security-headers.test.ts
const h = Object.fromEntries(securityHeaders().map(x => [x.key, x.value]));
it("sets CSP with frame-ancestors none", () => {
  expect(h["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
  expect(h["Content-Security-Policy"]).toContain("form-action 'self' https://accounts.google.com");
});
it("sets HSTS, referrer and nosniff", () => {
  expect(h["Strict-Transport-Security"]).toBe("max-age=63072000; includeSubDomains; preload");
  expect(h["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
  expect(h["X-Content-Type-Options"]).toBe("nosniff");
});
```

- [ ] **Step 2: Run** `pnpm vitest run --project unit`. Expected: FAIL (modules missing).
- [ ] **Step 3: Implement** `owner.ts`, `config.ts`, `paths.ts`, `security-headers.ts`. CSP: `default-src 'self'; script-src 'self' 'unsafe-inline'` (Next's inline bootstrap; tighten with nonces later); `style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://accounts.google.com`. Add `'unsafe-eval'` to `script-src` only in development. Run `pnpm vitest run --project unit`. Expected: PASS.
- [ ] **Step 4: Generate the auth schema.** Write `auth.ts`. Run `pnpm dlx @better-auth/cli@latest generate --config src/server/auth/auth.ts --output src/server/db/auth-schema.ts`. Add the `settings` FK, then `pnpm db:generate`. Expected: `drizzle/0001_*.sql` creates `user`, `session`, `account`, `verification`, `passkey`. Update Task 3's health test to `schemaVersion: 2`.
- [ ] **Step 5: Write the failing DB test** `auth.db.test.ts`, which runs the real Better Auth against PGlite:

```ts
const env = { OWNER_EMAIL: "me@x.com", APP_ENV: "local", ENABLE_PASSWORD_LOGIN: "true",
              BETTER_AUTH_SECRET: "x".repeat(32), BETTER_AUTH_URL: "http://localhost:3000" };
it("lets the owner's email get an account", async () => {
  const { db, close } = await createTestDb();
  const auth = createAuth(db, env);
  // disableSignUp blocks the public endpoint, so create via the server-side admin path used by the script (Task 5):
  await expect(createUserWithPassword(auth, "Me@X.com", "pw-123456789")).resolves.toMatchObject({ email: "me@x.com" });
  await close();
});
it("refuses any other email at creation (hook)", async () => {
  const { db, close } = await createTestDb();
  const auth = createAuth(db, env);
  await expect(createUserWithPassword(auth, "stranger@y.com", "pw-123456789")).rejects.toThrow(/Sign-ups are closed/);
  const r = await db.execute(sql`select count(*)::int as n from "user"`);
  expect(r.rows[0]).toEqual({ n: 0 });
  await close();
});
it("refuses public password sign-up even for the owner email", async () => {
  const { db, close } = await createTestDb();
  const auth = createAuth(db, env);
  await expect(auth.api.signUpEmail({ body: { email: "me@x.com", password: "pw-123456789", name: "Me" } })).rejects.toThrow();
  await close();
});
```

  This adds `createUserWithPassword(auth, email, password): Promise<{ id: string; email: string }>` to `src/server/auth/users.ts`. It goes through Better Auth's internal adapter (`(await auth.$context).internalAdapter.createUser` + `linkAccount` with `providerId: "credential"`, password from `ctx.password.hash`), so the `create.before` hook runs. Scripts only; never called from app routes.
- [ ] **Step 6: Run** `pnpm vitest run --project db`. Expected: FAIL. **Implement** `users.ts`. **Run** again. Expected: PASS.
- [ ] **Step 7: Wire the routes and UI.** Add the `[...all]` handler (`toNextJsHandler(auth)`), `auth-client.ts` (`createAuthClient({ plugins: [passkeyClient()] })`), proxy, login page, `/` page, `require-owner.ts`, and the headers in `next.config.ts`.
- [ ] **Step 8: Verify.** `pnpm db:migrate && pnpm test && pnpm lint && pnpm typecheck && pnpm build`. Expected: PASS.
- [ ] **Step 9: Commit** `feat(auth): better auth with owner lock, google + passkey, login page, security headers`.

### Task 5: Test-user script

**Files:**
- Create: `scripts/ensure-test-users.ts`, `scripts/lib/env.ts`
- Test: `scripts/lib/env.test.ts`

**Interfaces:**
- Consumes: `createAuth`, `createUserWithPassword` (Task 4); a `Db` built from `MIGRATION_DATABASE_URL`.
- Produces:
  - `requireEnv(name: string): string`. Throws `Error("Missing env: <name>")` if unset or empty.
  - `pnpm e2e:users` runs `tsx scripts/ensure-test-users.ts`. It **exits 1 with "refusing to run in production" when `APP_ENV === "production"`**. Otherwise it is idempotent:
    1. With `OWNER_EMAIL = E2E_OWNER_EMAIL`, create the owner via `createUserWithPassword`, or reset the password if the user exists, and upsert their `settings` row.
    2. Insert the **intruder** (`E2E_INTRUDER_EMAIL`) **directly with SQL**: a `user` row plus a `credential` `account` row with a password hashed by `hashPassword` from `better-auth/crypto`. This deliberately bypasses the creation hook, to simulate a non-owner row existing (e.g. after `OWNER_EMAIL` changes) so E2E can prove layer 2 holds.

- [ ] **Step 1: Write the failing tests** for `requireEnv`: returns the value; throws `"Missing env: X"` for unset; throws for `""`.
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement** `env.ts` and the script. **Step 4: Run** `pnpm test`. Expected: PASS.
- [ ] **Step 5: Manual check (local).** In `.env.local`: `APP_ENV=local`, `ENABLE_PASSWORD_LOGIN=true`, `OWNER_EMAIL=$E2E_OWNER_EMAIL`, a generated `BETTER_AUTH_SECRET` (`openssl rand -base64 32`), and `BETTER_AUTH_URL=http://localhost:3000`. Run `pnpm e2e:users && pnpm dev`. Opening `http://localhost:3000` should redirect to `/login`. Signing in as the owner with a password should show "Hello, owner". Signing out and signing in as the intruder should give a 404.
- [ ] **Step 6: Commit** `feat: script to provision e2e owner and intruder users`.

### Task 6: Playwright E2E (desktop + phone)

**Files:**
- Create: `playwright.config.ts`, `e2e/global-setup.ts`, `e2e/auth.spec.ts`, `e2e/helpers/login.ts`
- Modify: `package.json` (`e2e` = `playwright test`), and lint/tsconfig includes for `e2e/`

**Interfaces:**
- Consumes: `Health` (Task 3); login `data-testid`s (Task 4); users (Task 5).
- Produces:
  - Config: `baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000"`. Projects `desktop` (`devices["Desktop Chrome"]`) and `phone` (`devices["Pixel 7"]`). When `E2E_BASE_URL` is unset, `webServer` runs `pnpm build && pnpm start`. If `VERCEL_AUTOMATION_BYPASS_SECRET` is set, `extraHTTPHeaders` = `{ "x-vercel-protection-bypass": secret, "x-vercel-set-bypass-cookie": "true" }`. `trace: "retain-on-failure"`. `workers: 1` (shared DB branch).
  - `loginWithPassword(page, email, password)` helper.
  - Global setup: fetch `${baseURL}/api/health` and **throw if `environment === "production"` or `ok !== true`**.

- [ ] **Step 1: Write the specs** in `e2e/auth.spec.ts`:

```ts
test("anonymous visitor is sent to login", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login(\?|$)/);
});
test("owner signs in and sees the app", async ({ page }) => {
  await loginWithPassword(page, process.env.E2E_OWNER_EMAIL!, process.env.E2E_OWNER_PASSWORD!);
  await expect(page.getByRole("heading", { name: "Hello, owner" })).toBeVisible();
});
test("a signed-in non-owner gets 404", async ({ page }) => {
  await loginWithPassword(page, process.env.E2E_INTRUDER_EMAIL!, process.env.E2E_INTRUDER_PASSWORD!);
  const res = await page.goto("/");
  expect(res?.status()).toBe(404);
  await expect(page.getByText("Hello, owner")).toHaveCount(0);
});
test("public password sign-up is refused", async ({ request }) => {
  const res = await request.post("/api/auth/sign-up/email",
    { data: { email: process.env.E2E_OWNER_EMAIL, password: "another-pw-123", name: "x" } });
  expect(res.ok()).toBe(false);
});
test("health is public and not cached", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  expect(res.headers()["cache-control"]).toContain("no-store");
});
```

- [ ] **Step 2: Run** `pnpm exec playwright install --with-deps chromium`, then `pnpm e2e` (with local Docker DB, users from Task 5). Expected: 10 runs (5 tests × 2 projects) PASS. If a spec fails, fix the app, not the spec.
- [ ] **Step 3: Commit** `test(e2e): playwright desktop+phone auth golden paths`.

### Task 7: Hosted setup (owner-assisted)

No code tests. Each step ends with a verification. **Owner** marks steps that need the owner's browser or dashboard login. The agent drives the CLIs.

**Files:**
- Create: `vercel.json`

- [ ] **Step 1: Owner, Neon:** create project `personal-app` (free plan, region AWS `us-east-1` to sit near Vercel's default `iad1`). Under Settings, leave **Data API disabled**. Create branch **`seed`** from `main`. Create an API key. Collect the pooled and direct connection strings for `main` and `seed`, the project id, and the API key.
- [ ] **Step 2: Migrate `main` and `seed`.** Run `MIGRATION_DATABASE_URL=<main direct> pnpm db:migrate`, then the same with `<seed direct>`. Verify in Neon's SQL editor on each: `select count(*) from drizzle.__drizzle_migrations` → `2`.
- [ ] **Step 3: Owner, Google Cloud:** create an OAuth client (type Web) with authorized redirect URIs `http://localhost:3000/api/auth/callback/google` and `https://<prod-domain>/api/auth/callback/google`. The prod domain is known after Step 4's `vercel link`: `<project>.vercel.app`. Collect the client id and secret.
- [ ] **Step 4: Vercel:** run `pnpm dlx vercel@latest link` (**Owner** logs in) and commit `vercel.json` = `{ "git": { "deploymentEnabled": false } }`. Set env with `vercel env add`:
  - **Production:** `DATABASE_URL` (main pooled), `BETTER_AUTH_SECRET` (new random), `BETTER_AUTH_URL=https://<prod-domain>`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `OWNER_EMAIL=<owner's Google email>`, `APP_ENV=production`. **No** `ENABLE_PASSWORD_LOGIN`.
  - **Preview:** `BETTER_AUTH_SECRET` (a different random), `APP_ENV=preview`, `ENABLE_PASSWORD_LOGIN=true`, `OWNER_EMAIL=$E2E_OWNER_EMAIL`. `DATABASE_URL` is **not** set here; each preview deploy passes its own.
- [ ] **Step 5: Owner, Vercel:** under Project → Settings → Deployment Protection, enable "Protection Bypass for Automation" and copy the secret.
- [ ] **Step 6: GitHub secrets and variables.** Secrets (`gh secret set`): `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `VERCEL_AUTOMATION_BYPASS_SECRET`, `NEON_API_KEY`, `PROD_MIGRATION_DATABASE_URL`, `SEED_MIGRATION_DATABASE_URL`, `E2E_OWNER_EMAIL`, `E2E_OWNER_PASSWORD`, `E2E_INTRUDER_EMAIL`, `E2E_INTRUDER_PASSWORD`. Variables (`gh variable set`): `NEON_PROJECT_ID`, `PROD_URL`. Verify with `gh secret list` (11) and `gh variable list` (2).
- [ ] **Step 7: Commit** `chore: vercel config, all git deploys disabled`.

### Task 8: Smoke script

**Files:**
- Create: `scripts/smoke.ts`, `scripts/lib/smoke.ts`
- Test: `scripts/lib/smoke.test.ts`

**Interfaces:**
- Consumes: `Health` (Task 3).
- Produces:
  - `evaluateHealth(status: number, body: unknown, expect: { environment: string; buildId?: string }): { ok: true } | { ok: false; reason: string }`
  - `evaluatePasswordProbe(status: number): { ok: true } | { ok: false; reason: string }`. Ok only for a 4xx response.
  - `pnpm smoke <url> --env <environment> [--build <sha>] [--expect-no-password]`. It fetches `/api/health`, retrying up to 5 attempts 10 s apart with a 10 s timeout each. With `--expect-no-password` it also POSTs `{email,password}` to `/api/auth/sign-in/email` and applies `evaluatePasswordProbe`. Exits 0 when all pass, otherwise exits 1 and prints the reason.

- [ ] **Step 1: Write the failing tests:**

```ts
const good = { ok: true, db: "up", schemaVersion: 2, buildId: "abc", environment: "production" };
it("accepts a healthy matching response", () => expect(evaluateHealth(200, good, { environment: "production", buildId: "abc" })).toEqual({ ok: true }));
it("rejects 503", () => expect(evaluateHealth(503, { ...good, ok: false, db: "down" }, { environment: "production" }).ok).toBe(false));
it("rejects wrong environment", () => expect(evaluateHealth(200, { ...good, environment: "preview" }, { environment: "production" }).ok).toBe(false));
it("rejects stale build", () => expect(evaluateHealth(200, good, { environment: "production", buildId: "def" }).ok).toBe(false));
it("rejects non-JSON / malformed body", () => expect(evaluateHealth(200, "<html>", { environment: "production" }).ok).toBe(false));
it.each([[404, true], [400, true], [403, true], [200, false], [500, false]])
  ("password probe status %i ok=%s", (s, ok) => expect(evaluatePasswordProbe(s).ok).toBe(ok));
```

- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement.** **Step 4: Run** `pnpm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: deploy smoke-check script`.

### Task 9: GitHub Actions: CI, preview, cleanup, deploy

**Files:**
- Create: `.github/actions/setup/action.yml` (composite: pnpm setup, setup-node from `.nvmrc` with pnpm cache, `pnpm install --frozen-lockfile`), `.github/workflows/ci.yml`, `.github/workflows/preview.yml`, `.github/workflows/preview-cleanup.yml`, `.github/workflows/deploy.yml`

**Interfaces:**
- Consumes: scripts from Tasks 1–8; secrets and variables from Task 7.
- Produces job names that branch protection requires: `checks` and `playwright`.

- [ ] **Step 1: `ci.yml`.** Triggers: `pull_request` and `workflow_call`. Job `checks` runs `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test`, `pnpm db:check`, and `pnpm build` (with `APP_ENV=local`, dummy `BETTER_AUTH_SECRET`, no DB needed at build). `concurrency: ci-${{ github.ref }}`, `cancel-in-progress: true`.
- [ ] **Step 2: `preview.yml`.** Trigger: `pull_request` (opened, synchronize, reopened). Job `checks` uses `./.github/workflows/ci.yml`. Job `playwright` needs `checks`. `concurrency: preview-${{ github.event.number }}`, `cancel-in-progress: true`. Steps:
  1. `neondatabase/create-branch-action` with `project_id: ${{ vars.NEON_PROJECT_ID }}`, `branch_name: pr-${{ github.event.number }}`, `parent: seed`, `api_key`. Outputs: `db_url` (direct) and `db_url_pooled`. If the branch already exists, the action returns it. To start each run fresh, first run `neondatabase/reset-branch-action` against parent `seed` (or delete and recreate).
  2. `pnpm db:migrate` with `MIGRATION_DATABASE_URL=<db_url>`.
  3. `pnpm e2e:users` with `APP_ENV=preview`, `MIGRATION_DATABASE_URL=<db_url>`, `OWNER_EMAIL=${{ secrets.E2E_OWNER_EMAIL }}`, and the E2E secrets.
  4. `vercel pull --yes --environment=preview --token=…`, then `APP_BUILD_ID=${{ github.sha }} vercel build --token=…`, then `url=$(vercel deploy --prebuilt --env DATABASE_URL=<db_url_pooled> --token=…)`.
  5. Post or update a PR comment with `url` (`marocchino/sticky-pull-request-comment`).
  6. `pnpm exec playwright install --with-deps chromium`, then `pnpm e2e` with `E2E_BASE_URL=$url`, the bypass secret, and the E2E creds. On failure, upload `playwright-report/` and `test-results/` (retention 7 days; test data only).
- [ ] **Step 3: `preview-cleanup.yml`.** Trigger: `pull_request: closed`. Runs `neondatabase/delete-branch-action` for `pr-${{ github.event.number }}`.
- [ ] **Step 4: `deploy.yml`.** Trigger: `push` to `main`. `concurrency: deploy-prod`, no cancel. Jobs:
  - `checks`: `uses: ./.github/workflows/ci.yml`.
  - `migrate` (after `checks`, `environment: production`): `pnpm db:migrate` with `PROD_MIGRATION_DATABASE_URL`, then again with `SEED_MIGRATION_DATABASE_URL`.
  - `deploy` (after `migrate`):
    1. `vercel pull --yes --environment=production`
    2. `APP_BUILD_ID=${{ github.sha }} vercel build --prod`
    3. `vercel deploy --prebuilt --prod`
    4. `pnpm smoke ${{ vars.PROD_URL }} --env production --build ${{ github.sha }} --expect-no-password`
    5. Only if `failure()` in the deploy or smoke steps: `vercel rollback --yes --token=…`, then fail the job. GitHub emails the owner.
- [ ] **Step 5: Lint the workflows:** `pnpm dlx @action-validator/cli .github/workflows/*.yml` (or `actionlint`). Expected: no errors.
- [ ] **Step 6: Push the branch and open the PR.** Expected: `checks` is green. A preview URL comment appears. `playwright` is green with all 10 runs passing. `curl -H "x-vercel-protection-bypass: $SECRET" <preview>/api/health` returns `"environment":"preview"`.
- [ ] **Step 7: Commit** `ci: checks, per-PR neon branch previews with e2e, production deploy pipeline` (any fixes made while getting green).

### Task 10: Protect `main`, first production deploy, owner sign-in, tick the roadmap

**Files:**
- Modify: `docs/ROADMAP.md`

- [ ] **Step 1: Branch protection** (the owner approves the command):
  `gh api -X PUT repos/Halvadar-secondary/personal-app/branches/main/protection --input -`, with JSON requiring status checks `checks` and `playwright` (strict), `enforce_admins: false`, `required_pull_request_reviews: null`, `restrictions: null`, `allow_force_pushes: false`, `allow_deletions: false`.
  Verify: `gh api repos/Halvadar-secondary/personal-app/branches/main/protection --jq '.required_status_checks.contexts'` → `["checks","playwright"]`.
- [ ] **Step 2: Secret scanning + push protection:** `gh api -X PATCH repos/Halvadar-secondary/personal-app -f 'security_and_analysis[secret_scanning][status]=enabled' -f 'security_and_analysis[secret_scanning_push_protection][status]=enabled'`. Verify with `gh api repos/Halvadar-secondary/personal-app --jq .security_and_analysis`.
- [ ] **Step 3: Tick the roadmap.** In `docs/ROADMAP.md` M0, mark every item `[x]` in this PR.
- [ ] **Step 4: Merge the PR.** Expected: `deploy.yml` runs checks → migrate (prod + seed) → deploy → smoke, all green.
- [ ] **Step 5: Owner, first sign-in on prod (desktop):** open `PROD_URL`. You should be redirected to `/login`, with **no password form** shown. "Continue with Google" with the owner's Google account should show "Hello, owner", because the creation hook let the owner's email through. Click **Add a passkey** and complete the Windows Hello prompt.
- [ ] **Step 6: Owner, phone:** open `PROD_URL` and sign in with Google, then **Add a passkey** (Face ID / fingerprint). Sign out, then sign back in with "Sign in with passkey". Expected: "Hello, owner".
- [ ] **Step 7: Owner, intruder check:** in a private window, try "Continue with Google" with a *different* Google account. Expected: sign-in fails ("Sign-ups are closed"), and the Neon `user` table still has exactly one row.
