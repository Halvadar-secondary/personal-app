# Loading UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every page shows its navigation and a layout-shaped placeholder while it loads, search is usable at once, and a cold open no longer waits on the database just to check the sign-in.

**Architecture:** One `Skeleton` primitive and a file of page-shaped skeletons replace every `Loading…`/`null` Suspense fallback. The app layout's Nav boundary falls back to a data-free sidebar and tab bar. Search splits into two boundaries (box from the URL, results from the DB) with a shared transition that dims stale results. Better Auth's signed session cookie cache (5 min) lets the proxy and `requireOwner` skip the session query; the proxy forwards the refreshed cookie.

**Tech Stack:** Next 16.4 (cacheComponents, PPR), React 19.3, Tailwind 4, Better Auth 1.7.12, Vitest (unit/db/dom), Playwright (desktop + Pixel 7), axe.

**Spec:** No written spec: the owner approved the five items in conversation on 2026-10-25 (findings from a screenshot audit of every page). They are copied verbatim into Global Constraints and are the binding authority. App design spec for tone/tokens: `docs/superpowers/specs/2026-10-21-life-goals-app-design.md`.

## Global Constraints

- Item 1: "Keep the navigation on screen while a page loads. The tab bar always shows. The sidebar shows its fixed links (Your areas, Active, Search, Inbox, Settings, History) straight away, with placeholder rows where the area list and Inbox count will appear."
- Item 2: "Show a grey placeholder outline of each page in place of 'Loading…'. The outline matches the real layout … one shared placeholder component with a gentle pulse that turns off if your device is set to reduce motion. It would also work in dark mode."
- Item 3: "Make the search box appear immediately, and dim the results slightly while a new search runs."
- Item 4: "Make the sign-in check not wait on the database … a short-lived signed copy of your session in a cookie … cookie lifetime of about 5 minutes." The page-data owner check still runs.
- Item 5: "Add placeholder outlines for Login and OAuth consent too."
- No `Loading…` text and no `fallback={null}` may remain in `src/app` after this plan (Capture's `fallback={null}` in the app layout is the one exception: it renders a closed dialog).
- Builds must still pass with `APP_ENV=local BETTER_AUTH_URL=build-time-placeholder`: nothing in a fallback may call `usePathname`, `useSearchParams`, or build the auth client during prerender.
- Skeletons are `aria-hidden` bars inside one `role="status"` wrapper with an accessible name `Loading`; axe must stay clean.
- Node 24; `tsx` scripts wrapped in `main()`; tests by project naming (`*.test.ts`, `*.db.test.ts`, `*.dom.test.tsx`).

## Review Focus

1. A session revoked elsewhere (signed out on another device, or the row deleted) stays valid for up to 5 minutes; signing out on *this* device must end access at once (Task 5 test: sign-out clears the cache cookie).
2. Dark mode: skeleton bars must be visible against `--card` and `--background` in both themes (Task 1 sets a dedicated `--skeleton` token; Task 3's a11y run includes the dark describe).
3. Reduced motion: the pulse must stop (Task 1 dom test asserts `motion-reduce:animate-none`).
4. Text typed into the search box while results load must not be lost when results stream in (Task 4 E2E types before results arrive).
5. The CI-style placeholder build must still succeed after fallbacks move into the static shell (every task touching `src/app` ends with the CI-style build).

---

### Task 1: Skeleton primitive and page skeletons

**Files:**
- Create: `src/components/ui/skeleton.tsx`
- Create: `src/components/app/page-skeletons.tsx`
- Modify: `src/app/globals.css` (add `--skeleton` token, light and dark, and `--color-skeleton`)
- Test: `src/components/app/page-skeletons.dom.test.tsx`

**Interfaces:**
- Produces:
  - `Skeleton(props: React.ComponentProps<"div">): JSX` — `aria-hidden`, classes `animate-pulse motion-reduce:animate-none rounded-md bg-skeleton`, merged with `className` via `cn`.
  - `Loading({ testId, className, children }: { testId: string; className?: string; children: ReactNode })` — wrapper `<div role="status" aria-label="Loading" data-testid={testId}>`.
  - Page skeletons, each a `Loading` with the given testId:
    - `OverviewSkeleton()` → `skeleton-overview`: 4 chips (2×2 phone, 4 across md), then 6 area cards (md+: grid with gradient-banner-height bar + title + progress bar; phone: 6 rows).
    - `AreaSkeleton()` → `skeleton-area`: header card (banner bar, icon square, title bar, progress bar), then 3 board columns md+ (stacked on phone) each with 2 card bars.
    - `AchievementSkeleton()` → `skeleton-achievement`: header card (title bar, meta bar), then 5 task rows.
    - `ListSkeleton({ testId, rows = 5 }: { testId: string; rows?: number })` — rounded card rows (title bar + meta bar); used by Active, Inbox, History, Trophies, Search results.
    - `SectionSkeleton({ testId, rows = 2 })` — compact rows for Settings sections.
    - `FormSkeleton({ testId })` — a card with a title bar, two input-height bars and a button-height bar (Login, Consent).
- Token values: light `--skeleton: #e6e2f0`; dark `--skeleton: #2e2840`.

- [ ] **Step 1: Write the failing dom tests** in `page-skeletons.dom.test.tsx`:

```tsx
it("Skeleton is hidden from assistive tech and stops pulsing for reduced motion", () => {
  render(<Skeleton data-testid="s" className="h-4" />);
  const s = screen.getByTestId("s");
  expect(s).toHaveAttribute("aria-hidden", "true");
  expect(s).toHaveClass("animate-pulse", "motion-reduce:animate-none", "bg-skeleton", "h-4");
});

it.each([
  ["skeleton-overview", <OverviewSkeleton key="o" />],
  ["skeleton-area", <AreaSkeleton key="a" />],
  ["skeleton-achievement", <AchievementSkeleton key="c" />],
  ["skeleton-inbox", <ListSkeleton key="l" testId="skeleton-inbox" />],
  ["skeleton-passkeys", <SectionSkeleton key="s" testId="skeleton-passkeys" />],
  ["skeleton-login", <FormSkeleton key="f" testId="skeleton-login" />],
])("%s announces one loading status and no text", (id, el) => {
  render(el);
  const status = screen.getByRole("status", { name: "Loading" });
  expect(status).toHaveAttribute("data-testid", id);
  expect(status.textContent).toBe("");
});

it("ListSkeleton draws the requested number of rows", () => {
  render(<ListSkeleton testId="x" rows={3} />);
  expect(screen.getByTestId("x").querySelectorAll("[data-row]")).toHaveLength(3);
});
```

- [ ] **Step 2: Run** `pnpm exec vitest run --project dom src/components/app/page-skeletons.dom.test.tsx` — Expected: FAIL, module not found.
- [ ] **Step 3: Implement** `skeleton.tsx`, `page-skeletons.tsx` (rows carry `data-row`), and the `--skeleton` token (light in `:root`, dark in the existing dark media block, plus `--color-skeleton: var(--skeleton)` in `@theme inline`).
- [ ] **Step 4: Run** the same command — Expected: PASS. Then `pnpm typecheck && pnpm lint`.
- [ ] **Step 5: Commit** `feat(ui): skeleton primitive and page-shaped placeholders`.

### Task 2: Navigation stays during load

**Files:**
- Modify: `src/components/app/sidebar.tsx`, `src/components/app/tab-bar.tsx`, `src/app/(app)/layout.tsx`
- Create: `e2e/helpers/no-script.ts`, `e2e/loading.spec.ts`
- Test: `e2e/loading.spec.ts`

**Interfaces:**
- Consumes: `Skeleton` (Task 1).
- Produces:
  - `SidebarSkeleton()` in `sidebar.tsx`: the same `<aside>` (Life Goals link, Capture button, Main nav with Your areas/Active/Search/Inbox, Settings, History, AccountMenu) with 5 skeleton rows in the Areas nav and no Inbox count. `NavLink` takes `active?: boolean` instead of calling `usePathname`; `Sidebar` calls `usePathname()` once and passes it.
  - `TabBarView({ path }: { path: string | null })` exported from `tab-bar.tsx`; `TabBar()` renders `<TabBarView path={usePathname()} />`.
  - Layout: Nav's fallback is `<><SidebarSkeleton /><TabBarView path={null} /></>`.
  - `openWithoutScripts(browser: Browser, testInfo: TestInfo, path: string): Promise<Page>` — logs in with `loginWithPassword` in a scripted context, copies `storageState()` into a new context with `javaScriptEnabled: false` and the project's `use` options (viewport, userAgent, isMobile, hasTouch, deviceScaleFactor, baseURL), and opens `path`. With scripts off, React never swaps streamed content in, so the page stays in its loading state: this is how every loading test sees the fallback.

- [ ] **Step 1: Write the failing E2E test** in `loading.spec.ts`:

```ts
test("navigation shows while the page loads", async ({ browser }, testInfo) => {
  const page = await openWithoutScripts(browser, testInfo, "/");
  if (testInfo.project.name === "phone") {
    const tabs = page.getByRole("navigation", { name: "Tabs" });
    for (const name of ["Areas", "Active", "Search", "Settings"])
      await expect(tabs.getByRole("link", { name })).toBeVisible();
  } else {
    const main = page.getByRole("navigation", { name: "Main" });
    for (const name of ["Your areas", "Active", "Search", "Inbox"])
      await expect(main.getByRole("link", { name })).toBeVisible();
    await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();
    await expect(page.getByRole("link", { name: "History" })).toBeVisible();
  }
});
```

- [ ] **Step 2: Run** against a local production build (`pnpm build`, `pnpm start` in background, `E2E_BASE_URL=http://localhost:3000 pnpm exec playwright test e2e/loading.spec.ts`) — Expected: FAIL on both projects (no nav in the fallback).
- [ ] **Step 3: Implement** the Sidebar/TabBar split and the layout fallback.
- [ ] **Step 4: Run** the spec again — Expected: PASS on desktop and phone. Run `pnpm exec playwright test e2e/goals.spec.ts e2e/a11y.spec.ts` — Expected: PASS (active-link highlighting unchanged). Run the CI-style build `APP_ENV=local BETTER_AUTH_URL=build-time-placeholder pnpm build` — Expected: success.
- [ ] **Step 5: Commit** `feat(ui): keep the sidebar and tab bar on screen while pages load`.

### Task 3: Page skeletons on every page, Login and Consent

**Files:**
- Modify: every `page.tsx` under `src/app/(app)/` except Search, plus `src/app/login/page.tsx`
- Test: `e2e/loading.spec.ts`

**Interfaces:**
- Consumes: page skeletons (Task 1), `openWithoutScripts` (Task 2).
- Fallback map (testIds are what the tests assert):

| Page | Fallback |
|---|---|
| `/` | `OverviewSkeleton` |
| `/active` | `ListSkeleton testId="skeleton-active"` |
| `/inbox` | `ListSkeleton testId="skeleton-inbox"` |
| `/areas/[id]` | `AreaSkeleton` |
| `/areas/[id]/trophies` | `ListSkeleton testId="skeleton-trophies" rows={4}` |
| `/achievements/[id]` | `AchievementSkeleton` |
| `/history` | `ListSkeleton testId="skeleton-history" rows={6}` |
| `/settings` form / passkeys / connected | `SectionSkeleton` `skeleton-settings` (rows 3) / `skeleton-passkeys` / `skeleton-connected` |
| `/oauth/consent` | `FormSkeleton testId="skeleton-consent"` |
| `/login` | `FormSkeleton testId="skeleton-login"` |

- [ ] **Step 1: Write the failing E2E tests**: a `test.each` over the table's paths (area/achievement ids from a fixture created in `beforeAll` through the logged-in UI, as `goals.spec.ts` does), each asserting `await expect(page.getByTestId(id)).toBeVisible()` and `await expect(page.getByText("Loading…")).toHaveCount(0)`; Settings asserts all three ids. Login opens in a fresh no-script context without logging in. Plus `"loading state passes axe"`: `openWithoutScripts(…, "/")` then `new AxeBuilder({ page }).analyze()` has no violations; add the same in the dark describe with `colorScheme: "dark"`.
- [ ] **Step 2: Run** the spec — Expected: FAIL (`skeleton-*` not found) for every row.
- [ ] **Step 3: Implement** the fallbacks per the table. Area, Achievement and Trophies render no title in the fallback (the name isn't known yet); pages whose header is outside the boundary keep it.
- [ ] **Step 4: Run** the spec — Expected: PASS on both projects. `rg -n 'Loading…|fallback=\{null\}' src/app` — Expected: only the Capture line in `(app)/layout.tsx`. CI-style build — Expected: success.
- [ ] **Step 5: Commit** `feat(ui): layout-shaped placeholders on every page`.

### Task 4: Search box at once, dimmed stale results

**Files:**
- Modify: `src/app/(app)/search/page.tsx`, `src/components/app/search-box.tsx`
- Create: `src/components/app/search-pending.tsx`
- Test: `e2e/loading.spec.ts`, `e2e/history-search.spec.ts` (must stay green)

**Interfaces:**
- Consumes: `ListSkeleton` (Task 1), `openWithoutScripts` (Task 2).
- Produces (`search-pending.tsx`, client):
  - `SearchPendingProvider({ children })` — holds `useTransition()`, provides `{ pending, startTransition }`.
  - `useSearchTransition(): { pending: boolean; startTransition: React.TransitionStartFunction }`.
  - `SearchResults({ children })` — `<div data-testid="search-results" aria-busy={pending} className={cn("transition-opacity", pending && "opacity-60")}>`.
- `SearchBox()` takes no props: reads `q` with `useSearchParams()`, and calls `router.replace` inside `startTransition` from the context. Page: `SearchPendingProvider` wraps `<Suspense fallback={<Skeleton className="h-9 w-full" />}><SearchBox /></Suspense>` and `<Suspense fallback={<ListSkeleton testId="skeleton-search" />}><SearchResults><Results …/></SearchResults></Suspense>`. The box's boundary needs no DB, so it streams before results.

- [ ] **Step 1: Write the failing E2E tests:**

```ts
test("search box shows before results load", async ({ browser }, testInfo) => {
  const page = await openWithoutScripts(browser, testInfo, "/search?q=guitar");
  await expect(page.getByRole("searchbox", { name: "Search" })).toHaveValue("guitar");
  await expect(page.getByTestId("skeleton-search")).toBeVisible();
});

test("results dim while a new search runs, typed text survives", async ({ page }) => {
  await loginWithPassword(page, process.env.E2E_OWNER_EMAIL!, process.env.E2E_OWNER_PASSWORD!);
  await page.goto("/search?q=a");
  await expect(page.getByTestId("search-results")).toHaveAttribute("aria-busy", "false");
  // Hold the next results request so the transition stays pending.
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  await page.route(/\/search\?q=ab/, async (route) => { await held; await route.continue(); });
  await page.getByRole("searchbox", { name: "Search" }).pressSequentially("b");
  await expect(page.getByTestId("search-results")).toHaveAttribute("aria-busy", "true");
  await expect(page.getByTestId("search-results")).toHaveClass(/opacity-60/);
  await expect(page.getByRole("searchbox", { name: "Search" })).toHaveValue("ab");
  release();
  await expect(page.getByTestId("search-results")).toHaveAttribute("aria-busy", "false");
});
```

- [ ] **Step 2: Run** — Expected: FAIL (box absent without scripts; no `search-results`).
- [ ] **Step 3: Implement** per Interfaces.
- [ ] **Step 4: Run** `e2e/loading.spec.ts` and `e2e/history-search.spec.ts` — Expected: PASS. CI-style build — Expected: success (if `useSearchParams` in the box forces a build error, the Suspense around it is the fix, not removing the hook).
- [ ] **Step 5: Commit** `feat(search): box renders at once; results dim while searching`.

### Task 5: Session cookie cache

**Files:**
- Modify: `src/server/auth/auth.ts`, `src/proxy.ts`, `docs/operations.md`
- Create: `src/server/auth/forward-cookies.ts`
- Test: `src/server/auth/auth.db.test.ts`, `src/server/auth/forward-cookies.test.ts`

**Interfaces:**
- `createAuth` gains `session: { cookieCache: { enabled: true, maxAge: SESSION_CACHE_SECONDS } }`, with `export const SESSION_CACHE_SECONDS = 5 * 60` in `auth.ts`.
- `forwardSetCookies(from: Headers, to: Headers): void` — appends every `set-cookie` of `from` (via `getSetCookie()`) to `to`.
- Proxy: `getAuth().api.getSession({ headers, returnHeaders: true })`; on `allow`, `NextResponse.next()` with `forwardSetCookies(result.headers, res.headers)`, so a cache refreshed from the DB reaches the browser (the proxy is the one place every page request passes, and RSC pages can't set cookies).

- [ ] **Step 1: Write the failing tests.** In `auth.db.test.ts`, a `describe("session cookie cache")` with a helper that creates the owner, signs in with `auth.api.signInEmail({ body, returnHeaders: true })` and turns the `set-cookie` headers into a `cookie` request header:

```ts
it("answers from the cookie without the session row", async () => {
  // sign in → cookies; delete from "session"; getSession({ headers: cookies }) → user.email "me@x.com"
});
it("goes back to the database after 5 minutes", async () => {
  // vi.useFakeTimers({ toFake: ["Date"] }); sign in; delete rows; advance Date by SESSION_CACHE_SECONDS*1000 + 1000; getSession → null
});
it("signing out clears the cache cookie", async () => {
  // signOut({ headers: cookies, returnHeaders: true }) → a set-cookie for the session-data cookie with Max-Age=0
});
```

In `forward-cookies.test.ts`: two `set-cookie` values on `from` both appear in `to.getSetCookie()`; a `from` with none leaves `to` unchanged.

- [ ] **Step 2: Run** `pnpm exec vitest run --project db src/server/auth/auth.db.test.ts` and `pnpm exec vitest run --project unit src/server/auth/forward-cookies.test.ts` — Expected: FAIL for the first test (null after the row delete) and the forward-cookies module (missing). The 5-minute and sign-out tests may already pass before the change (no cache → DB → null; no cache cookie to clear): they are guards that must stay green after it, so confirm the sign-out one asserts the session-data cookie by name once the cache exists.
- [ ] **Step 3: Implement** the config, helper and proxy change. Add to `docs/operations.md` under a "Sessions" heading: sign-in checks use a 5-minute signed cookie; a session revoked on another device keeps working for up to 5 minutes; sign-out here ends it at once; to cut everyone off now, rotate `BETTER_AUTH_SECRET`.
- [ ] **Step 4: Run** both — Expected: PASS. Then `pnpm test` (coverage gate), and `e2e/auth.spec.ts e2e/passkeys.spec.ts e2e/mcp.spec.ts` against a fresh local production build — Expected: PASS.
- [ ] **Step 5: Commit** `perf(auth): 5-minute signed session cookie so the sign-in check skips the database`.

### Task 6: Roadmap and full verification

**Files:**
- Modify: `docs/ROADMAP.md`

- [ ] **Step 1:** Add under M6 a `## M6.1 — Loading states` section with five ticked lines matching items 1–5.
- [ ] **Step 2: Run** `pnpm typecheck && pnpm lint && pnpm test`, the CI-style build, then the full E2E suite against a fresh local production build — Expected: all green (previous totals 486 unit, 87 E2E passed + 5 skipped, plus the new loading tests).
- [ ] **Step 3: Commit** `docs: roadmap M6.1 loading states`.
