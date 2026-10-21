# Roadmap

Development progress for the life goals app. Tick items as they merge to
`main` (tick in the same PR). Each milestone gets a step-by-step
implementation plan in `docs/superpowers/plans/` before work starts.

- Product design: [specs/2026-10-21-life-goals-app-design.md](superpowers/specs/2026-10-21-life-goals-app-design.md)
- Technical design: [specs/2026-10-22-life-goals-app-technical-design.md](superpowers/specs/2026-10-22-life-goals-app-technical-design.md)

Legend: `[ ]` todo · `[~]` in progress · `[x]` done

---

## M0 — Foundations: an empty app that deploys safely
*Done when: a locked-down "Hello, owner" page is live in production, reached only after the owner's login, and every PR gets CI, a preview URL and E2E.*

- [ ] Next.js + TypeScript (strict) + pnpm + Node 24 scaffold; Tailwind v4 + shadcn/ui
- [ ] ESLint (with import-boundary rule), Prettier, `tsc` scripts
- [ ] Vitest set up (unit + PGlite integration harness) with a first passing test
- [ ] Playwright set up with desktop + phone projects
- [ ] Supabase projects created: `personal-app-staging`, `personal-app-prod`; sign-ups disabled; owner (and staging test owner) accounts created
- [ ] Supabase CLI local stack for development; `.env.example`
- [ ] Drizzle wired up; first migration; RLS enabled with no anon/authenticated policies
- [ ] Login (magic link + Google), `@supabase/ssr` middleware, `requireOwner()` with `OWNER_USER_ID`
- [ ] Vercel project linked; preview deploys on PRs; production auto-deploy disabled
- [ ] `ci.yml`: lint, format, typecheck, test + coverage gate, drizzle check, build
- [ ] `e2e.yml`: migrate + seed staging, Playwright against preview
- [ ] `deploy.yml`: migrate prod → build → deploy → smoke (`/api/health`) → auto-rollback on failure
- [ ] Branch protection on `main`; GitHub secret scanning + push protection on
- [ ] Security headers (CSP, HSTS, frame-ancestors)

## M1 — Core data and domain layer
*Done when: every core action exists in the domain layer, is fully tested against Postgres, and records history.*

- [ ] Schema: areas, achievements, tasks, categories, task_categories, task_completions, practice_entries, change_events, settings
- [ ] `runAction` + `Ctx` (transaction, owner scoping, actor, batch id, injected clock)
- [ ] Fractional ordering helpers
- [ ] Areas: create / update / reorder / delete
- [ ] Achievements: create / update / move (status, area, position) / delete
- [ ] Tasks: create (single + batch) / update / move / complete / uncomplete / delete
- [ ] Categories: create / update / delete / set on task; "used in this area first" query
- [ ] Inbox: capture, file achievement, file task
- [ ] Practice log: add / list entries on a task
- [ ] History: change events on every mutation; undo batch with conflict refusal; undo-of-undo
- [ ] Seed script with realistic sample data (Guitar, Social confidence, …)

## M2 — Core UI
*Done when: the owner can run their goals day-to-day from desktop and phone (without XP and repeats yet).*

- [ ] App shell: desktop sidebar, phone bottom tab bar, theme tokens matching the approved mockup
- [ ] Overview page: summary strip, area cards (desktop grid / phone list), "+ New area"
- [ ] Area page: desktop board (Backlog / Active / Done) with drag between and within columns
- [ ] Area page: phone grouped list with "Move to…" menus
- [ ] Achievement page: task checklist, inline add, reorder, effort picker, categories, deadline
- [ ] Global "+ Capture" (Enter saves and stays open), `C` shortcut
- [ ] Inbox page with filing (drag on desktop, "File to…" on phone)
- [ ] Optimistic updates with rollback + error toasts
- [ ] Undo toast after destructive actions
- [ ] E2E golden paths for the above (desktop + phone)

## M3 — Progress and repeating tasks
*Done when: completing tasks visibly grows levels and streaks, and daily-practice tasks work.*

- [ ] XP per effort, frozen at completion; area XP and level curve
- [ ] Streaks in owner's time zone (settings page: time zone, week start)
- [ ] Level badge, XP bar, streak and trophy counts on overview and area pages
- [ ] Trophies view for completed achievements
- [ ] Recurrence model + pure recurrence functions (with DST tests)
- [ ] Recurrence picker UI with presets (daily, weekdays, weekly on…, for 1 week / 30 days / forever)
- [ ] Repeating task check-off for today, 4-week completion strip
- [ ] "Up next" and "due this week" logic
- [ ] Active page: everything active or due soon across areas
- [ ] E2E: complete task → XP/level updates; repeating task daily check-off

## M4 — History and search
*Done when: the owner can see every change, undo any batch, and find anything fast.*

- [ ] History page: batches with actor, summary, time; Undo per batch; conflict message
- [ ] Search page (titles + notes across areas, achievements, tasks, inbox)
- [ ] `⌘K` / `Ctrl+K` command palette: jump anywhere, quick actions
- [ ] Settings → Export all data as JSON

## M5 — MCP server (AI access)
*Done when: the owner can connect Claude and at least one other AI app, brainstorm, and have it create and organise items, and undo them, safely.*

- [ ] **Spike:** Supabase OAuth server + dynamic client registration with Claude and one other client; decide keep vs. fallback (§7.4)
- [ ] `/.well-known/oauth-protected-resource` metadata; 401 + `WWW-Authenticate` on `/api/mcp`
- [ ] `/oauth/consent` page (owner-only, Approve / Deny)
- [ ] Token verification (JWKS, audience, expiry, `sub === OWNER_USER_ID`); actor = `mcp:<client>`
- [ ] MCP tools (read, create incl. batch, update, move, complete, capture, file, categories, practice log, history, undo, delete)
- [ ] Tool descriptions tuned for model use; compact responses
- [ ] Settings → Connected AI apps (list + revoke)
- [ ] Adapter tests + MCP smoke script in nightly and post-deploy
- [ ] Rate limiting on `/api/mcp` and `/login`

## M6 — Polish and operations
*Done when: it feels like a real app on the phone and problems are visible.*

- [ ] PWA manifest, icons, Apple touch icons; verified "Add to Home Screen" on iOS and Android
- [ ] "New version available" banner
- [ ] Sentry (client + server, source maps)
- [ ] Nightly encrypted backup workflow + documented restore drill on staging
- [ ] Staging keep-alive ping; soft-delete purge job
- [ ] Renovate configured
- [ ] Accessibility pass (axe in E2E clean; keyboard drag works)
- [ ] Dark mode *(optional)*

---

## Later (not scheduled)

- [ ] Metronome tool that logs practice entries against a task
- [ ] Arpeggio / chord trainer tool
- [ ] Completion celebrations
- [ ] Practice entries count toward streaks
- [ ] In-app chat panel with Claude (on top of the same actions)
- [ ] Offline support
- [ ] Custom domain
- [ ] Other personal features beyond goals
