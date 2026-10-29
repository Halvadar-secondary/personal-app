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

- [x] Next.js + TypeScript (strict) + pnpm + Node 24 scaffold; Tailwind v4 + shadcn/ui
- [x] ESLint (with import-boundary rule), Prettier, `tsc` scripts
- [x] Vitest set up (unit + PGlite integration harness) with a first passing test
- [x] Playwright set up with desktop + phone projects
- [x] Local Postgres via Docker Compose; `.env.example`
- [x] Drizzle wired up; first migration (settings + Better Auth tables)
- [x] Better Auth: Google + passkey sign-in, owner-email creation lock, `requireOwner()`; password sign-in only outside production
- [x] Neon project with `main` (prod) and `seed` branches; Data API off; Google OAuth client
- [x] Vercel project linked; Git auto-deploys fully disabled (Actions deploys everything)
- [x] `ci.yml`: lint, format, typecheck, test + coverage gate, drizzle check, build
- [x] `preview.yml`: Neon branch per PR from `seed` → migrate → test owner → preview deploy → Playwright; `preview-cleanup.yml` deletes the branch
- [x] `deploy.yml`: migrate prod + seed → build → deploy (not live) → smoke that deployment → promote → smoke production
- [x] Branch protection on `main`; GitHub secret scanning + push protection on
- [x] Security headers (CSP, HSTS, frame-ancestors)

## M1 — Core data and domain layer
*Done when: every core action exists in the domain layer, is fully tested against Postgres, and records history.*

- [x] Schema: areas, achievements, tasks, categories, task_categories, task_completions, practice_entries, change_events
- [x] `runAction` + `Ctx` (transaction, owner scoping, actor, batch id, injected clock)
- [x] Fractional ordering helpers
- [x] Areas: create / update / reorder / delete
- [x] Achievements: create / update / move (status, area, position) / delete
- [x] Tasks: create (single + batch) / update / move / complete / uncomplete / delete
- [x] Categories: create / update / delete / set on task; "used in this area first" query
- [x] Inbox: capture, file achievement, file task
- [x] Practice log: add / list entries on a task
- [x] History: change events on every mutation; undo batch with conflict refusal; undo-of-undo
- [x] Seed script with realistic sample data (Guitar, Social confidence, …)

## M2 — Core UI
*Done when: the owner can run their goals day-to-day from desktop and phone (without XP and repeats yet).*

- [x] App shell: desktop sidebar, phone bottom tab bar, theme tokens matching the approved mockup
- [x] Overview page: summary strip, area cards (desktop grid / phone list), "+ New area"
- [x] Area page: desktop board (Backlog / Active / Done) with drag between and within columns
- [x] Area page: phone grouped list with "Move to…" menus
- [x] Achievement page: task checklist, inline add, reorder, effort picker, categories, deadline
- [x] Global "+ Capture" (Enter saves and stays open), `C` shortcut
- [x] Inbox page with filing (drag on desktop, "File to…" on phone)
- [x] Optimistic updates with rollback + error toasts
- [x] Undo toast after destructive actions
- [x] E2E golden paths for the above (desktop + phone)

## M3 — Progress and repeating tasks
*Done when: completing tasks visibly grows levels and streaks, and daily-practice tasks work.*

- [x] XP per effort, frozen at completion; area XP and level curve
- [x] Streaks in owner's time zone (settings page: time zone, week start)
- [x] Level badge, XP bar, streak and trophy counts on overview and area pages
- [x] Trophies view for completed achievements
- [x] Recurrence model + pure recurrence functions (with DST tests)
- [x] Recurrence picker UI with presets (daily, weekdays, weekly on…, for 1 week / 30 days / forever)
- [x] Repeating task check-off for today, 4-week completion strip
- [x] "Up next" and "due this week" logic
- [x] Active page: everything active or due soon across areas
- [x] E2E: complete task → XP/level updates; repeating task daily check-off

## M4 — History and search
*Done when: the owner can see every change, undo any batch, and find anything fast.*

- [x] History page: batches with actor, summary, time; Undo per batch; conflict message
- [x] Search page (titles + notes across areas, achievements, tasks, inbox)
- [x] `⌘K` / `Ctrl+K` command palette: jump anywhere, quick actions
- [x] Settings → Export all data as JSON

## M5 — MCP server (AI access)
*Done when: the owner can connect Claude and at least one other AI app, brainstorm, and have it create and organise items, and undo them, safely.*

- [x] **Spike:** Better Auth MCP/OAuth-provider plugin + dynamic client registration with Claude and one other client; decide keep vs. fallback (§7.4)
- [x] `/.well-known/oauth-protected-resource` metadata; 401 + `WWW-Authenticate` on `/api/mcp`
- [x] `/oauth/consent` page (owner-only, Approve / Deny)
- [x] Token validation via Better Auth (unexpired, unrevoked, user is owner); actor = `mcp:<client>`
- [x] MCP tools (read, create incl. batch, update, move, complete, capture, file, categories, practice log, history, undo, delete)
- [x] Tool descriptions tuned for model use; compact responses
- [x] Settings → Connected AI apps (list + revoke)
- [x] Adapter tests + MCP smoke script in nightly and post-deploy
- [x] Rate limiting on `/api/mcp` and `/login`

## M6 — Polish and operations
*Done when: it feels like a real app on the phone and problems are visible.*

- [ ] PWA manifest, icons, Apple touch icons; verified "Add to Home Screen" on iOS and Android
- [x] "New version available" banner
- [x] Sentry (client + server, source maps)
- [x] Nightly encrypted backup workflow + documented restore drill into a scratch Neon branch
- [x] Soft-delete purge job
- [x] Settings: manage passkeys (list, rename, remove)
- [x] Renovate configured
- [x] Accessibility pass (axe in E2E clean; keyboard drag works)
- [x] Dark mode *(optional)*

---

## M6.1 — Loading states
*Done when: no page shows "Loading…", and a cold open shows the app's frame at once.*

- [x] Sidebar and tab bar stay on screen while a page loads
- [x] Layout-shaped placeholders on every page (pulse off for reduced motion; dark mode)
- [x] Search box appears at once; results dim while a new search runs
- [x] Sign-in check reads a 5-minute signed session cookie instead of the database
- [x] Placeholders for Login and OAuth consent

## M6.2 — Create dialog
*Done when: every task and achievement is created in one Linear-style dialog ([design](superpowers/specs/2026-10-25-create-dialog-design.md)).*

- [x] Title, notes and property chips (effort, deadline, repeat, categories; status, deadline), Ctrl/⌘+Enter
- [x] Breadcrumb shows where it goes and moves it elsewhere
- [x] "Create more" for a run of items; one Undo removes a task with its categories
- [x] Capture and the C key open the same dialog, with a Task / Achievement switch
- [x] "Add task" / "Add achievement" buttons replace the inline fields
- [x] Full-screen sheet on phones

---

## M7 — Plan your days
*Done when: the owner plans tomorrow the night before, works down Today's two lists, and plans each week from their life goals ([design](superpowers/specs/2026-10-28-plan-your-days-design.md)).*

- [x] Tasks planned on a day (Work / Spare time, ordered) or in a week, separate from the deadline; loose tasks with a plan leave the Inbox
- [x] Unfinished tasks roll onto today, and onto tomorrow while planning
- [x] Today, Plan tomorrow (pick from the week and active achievements, or write new), and Week
- [x] Goals with a deadline that link achievements from any area; Sunday review plans the week from them
- [x] Targets (100 times, 10 hours, 400 pages) with progress logging
- [x] Evening reminder: Web Push at a chosen time when tomorrow isn't planned
- [ ] Reminder keys stored and verified on the owner's phone (Home Screen app)
- [x] AI tools for days, weeks, goals and progress

## M7.1 — Behaviour trackers
*Done when: the owner logs a moment (anger, negative thinking, kindness) in seconds and sees weekly patterns ([design](superpowers/specs/2026-10-28-behaviour-trackers-design.md)).*

- [x] Trackers with a direction (fewer or more is better), archive and reorder
- [x] Log a moment from Capture: tracker, intensity, note, an earlier time
- [x] Trackers page: this week so far vs the same point last week, 8 weekly bars, moments with delete and Undo
- [x] Patterns in the Sunday review
- [x] AI tools for trackers and moments

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
