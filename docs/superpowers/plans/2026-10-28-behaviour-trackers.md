# Behaviour Trackers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trackers for behaviours (negative thinking, anger, kindness): log a moment from the Capture dialog in seconds, see weekly trends on a Trackers page, and see last week's patterns in the Sunday review.

**Architecture:** Two soft-deleted, undoable tables (`trackers`, `tracker_moments`) with domain actions in `src/server/domain/trackers.ts`; weekly bucketing and trend wording are pure functions in `src/lib/trackers.ts`. The Capture dialog's Kind switch gains "Moment". Built on the `plan-your-days` branch (Today, Week and Review exist there).

**Tech Stack:** as the app: Next 16.4, React 19.3, Drizzle/Postgres (PGlite tests), zod 4, Radix, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-28-behaviour-trackers-design.md` (its "Settled after the builder check" section overrides the rest).

## Global Constraints

- Every mutation is a `defineAction`, recorded through `insertRecorded`/`updateRecorded`/`softDeleteRecorded`, reached by the UI through `act()`/`read()`.
- Weeks and days are the owner's (`ctx.timeZone`, `ctx.weekStart`); moments are `timestamptz`.
- Directions are exactly `less` and `more`. Trend copy: `"3 fewer than last week"`, `"2 more than last week"`, `"Same as last week"`, `"1 fewer than last week"` (singular is the same word); a trend that goes the wanted way uses the primary colour, the other way the muted colour, never red.
- Tracker name 1–60 chars, emoji up to 16, note up to 1,000 chars, intensity integer 1–5 or null.
- No streaks, XP or reminders for trackers.
- New pages get a layout-shaped Suspense placeholder and pass axe in E2E.
- Never use a Python heredoc in Bash; never put backticks inside double-quoted shell strings.

## Review Focus

1. **"This week so far" vs the same moment last week:** on Wednesday 12:00 with weekStart 1, last week's count includes Monday 00:00 to Wednesday 12:00 of last week only. Test in Task 2.
2. **Owner time zone at midnight:** a moment at 2026-03-10T11:30Z for an Auckland owner counts on Wednesday 2026-03-11. Test in Task 3.
3. **Deleting a tracker then undoing:** moments come back with it; moments deleted earlier on their own stay deleted. Test in Task 3.
4. **Logging to an archived or deleted tracker** is refused (`invalid_state` / `not_found`). Test in Task 3.
5. **A moment in the future** is refused (`invalid_input`). Test in Task 3.

---

### Task 1: Schema and migration

**Files:** Modify `src/server/db/goals.ts`; generate `drizzle/0008_*.sql`; test `src/server/db/goals.db.test.ts`; `src/server/health.db.test.ts` (schema version 9); `src/server/db/migrations.db.test.ts` (sort keys: add `trackers`).

**Produces:** `trackerDirection = pgEnum("tracker_direction", ["less", "more"])`; `trackers` (`...base()`, `name text not null`, `emoji text`, `direction` default `less`, `archivedAt timestamptz`, `sortKey`); `trackerMoments` (`...base()`, `trackerId uuid not null → trackers.id`, `at timestamptz not null`, `intensity smallint`, `note text`; check `intensity is null or intensity between 1 and 5`; index `(ownerId, trackerId, at)`); types `Tracker`, `TrackerMoment`, `TrackerDirection`.

- [ ] Step 1: failing db tests: `it("records a tracker and a moment")`, `it("refuses an intensity outside 1–5")`.
- [ ] Step 2: run `pnpm exec vitest run --project db src/server/db/goals.db.test.ts` → FAIL.
- [ ] Step 3: schema; `pnpm db:generate`.
- [ ] Step 4: run the db schema tests, health and migrations tests, `pnpm db:check` → PASS.
- [ ] Step 5: commit `feat(db): trackers and moments`.

### Task 2: Pure tracker functions

**Files:** Create `src/lib/trackers.ts`, `src/lib/trackers.test.ts`.

**Produces:**
- `weekBuckets(moments: Date[], timeZone: string, weekStart: number, lastStart: string, weeks: number): { start: string; count: number }[]` — `weeks` buckets ending with the week starting `lastStart`, oldest first, by each moment's local date.
- `soFarCounts(moments: Date[], now: Date, timeZone: string, weekStart: number): { thisWeek: number; lastWeek: number }` — this week from its start to `now`; last week from its start to `now − 7 days` (same weekday and time).
- `trendText(diff: number): string` (diff = this − last) and `trendGood(direction: "less" | "more", diff: number): boolean | null` (null for no change).
- [ ] Step 1: failing tests incl. Review Focus 1 (Wednesday 12:00: a Wednesday-last-week 13:00 moment is excluded, 11:00 included), bucket edges across a week start, Auckland date, trend texts for −3, 2, 0, −1, and `trendGood` for both directions.
- [ ] Step 2: `pnpm exec vitest run --project unit src/lib/trackers.test.ts` → FAIL.
- [ ] Step 3: implement with `localDate`, `weekStartOf`, `addDays`.
- [ ] Step 4: → PASS.
- [ ] Step 5: commit `feat(trackers): weekly buckets and trend wording`.

### Task 3: Trackers domain

**Files:** Create `src/server/domain/trackers.ts`, `trackers.db.test.ts`; modify `history.ts` (`"tracker" | "tracker_moment"`), `rows.ts` (SoftTable), `undo.ts` (registry; `rekeyIfTaken` for trackers), `integrity.ts` (moment live under a deleted tracker → conflict naming it; tracker deleted with live moments → conflict naming them), `export.ts` (`trackers`, `trackerMoments`), `purge.ts` (moments of purged trackers, moments deleted on their own, then trackers with no rows left; counts `trackers`, `trackerMoments`), `export.db.test.ts`, `purge.db.test.ts`.

**Produces:**
- `createTracker({ name, emoji?, direction? })`, `updateTracker({ trackerId, name?, emoji?, direction?, archived?: boolean })` (archived sets/clears `archivedAt`), `moveTracker({ trackerId, afterId?, beforeId? })`, `deleteTracker({ trackerId })` (soft-deletes its live moments, then it; one batch).
- `logMoment({ trackerId, at?: iso datetime, intensity?: 1–5, note?: ≤1000 })` → `TrackerMoment`; tracker must be live and not archived (`invalid_state`); `at > now` → `invalid_input`.
- `deleteMoment({ momentId })`.
- `listTrackers({})` → `{ trackers: (Tracker & { thisWeek: number; lastWeek: number; avgIntensity: number | null; weeks: { start: string; count: number }[] })[] }`: live trackers, active first by key then archived; counts from `soFarCounts`, 8 `weekBuckets` ending this week, average intensity of this week's moments.
- `listMoments({ trackerId, limit?: 1–100 = 20, before?: iso datetime })` → newest first.
- `getPatterns({ start: date })` → for the week before `start` and the one before that: `{ from, to, trackers: { id; name; emoji; direction; count: number; previous: number; notes: { at: Date; intensity: number | null; note: string }[] }[] }` (active trackers; notes are that week's moments with a note, newest first, at most 10).
- `activeTrackers(ctx)` helper → `{ id; name; emoji }[]` in order (for the dialog options).
- [ ] Step 1: failing tests: CRUD and order; archive refuses logging; future `at` refused; Auckland moment lands on Wednesday; `listTrackers` counts so-far and 8 weeks; `deleteTracker` + undo restores its moments but not an earlier separately deleted one; undo of a moment create after its tracker was deleted → conflict; `getPatterns` counts and notes; export and purge.
- [ ] Step 2: `pnpm exec vitest run --project db src/server/domain/trackers.db.test.ts` → FAIL.
- [ ] Step 3: implement.
- [ ] Step 4: that file plus `history.db.test.ts`, `export.db.test.ts`, `purge.db.test.ts` → PASS.
- [ ] Step 5: commit `feat(trackers): trackers and moments, with undo`.

### Task 4: Actions, MCP, dialog options

**Files:** Create `src/server/actions/trackers.ts` (`createTrackerAction`, `updateTrackerAction`, `moveTrackerAction`, `deleteTrackerAction`, `logMomentAction`, `deleteMomentAction`, `momentsAction` (read)); modify `actions.sweep.test.ts` (files +1, actions +7), `src/server/domain/create.ts` (`getCreateOptions` adds `trackers: activeTrackers(ctx)`), `src/server/mcp/tools.ts` (+ `list_trackers`, `create_tracker`, `log_moment`, `get_tracker` = `listMoments`), `mcp-actions.ts` (`delete_item` kind `tracker`), `server.test.ts` (tool list), new `src/server/mcp/tracker-tools.db.test.ts`.
- [ ] Steps: failing tests (sweep counts, tool list, `it("logs a moment and lists trackers through MCP")`, create options include trackers) → implement → PASS → commit `feat(trackers): actions and MCP tools`.

### Task 5: Moment in the Capture dialog

**Files:** Modify `src/components/app/create-rules.ts` (`Kind` adds `"moment"`; `defaultDestination`/`destinationFor` treat moment like task for the unused destination; `loadPrefs` accepts `"moment"`), `create-dialog.tsx`, `create-dialog.dom.test.tsx`, `create-rules.test.ts`; create `src/components/app/moment-fields.tsx`.

**Produces:** Kind group buttons Task / Achievement / Moment; dialog title "Log a moment"; for a moment the breadcrumb and Title are hidden; `MomentFields({ trackers, value, onChange })` renders a radio group "Tracker" (chips with emoji + name), "Intensity" (five toggle buttons "1"…"5", aria-pressed; tapping the pressed one clears), and a When chip ("When: Now" / "When: Mar 10, 18:30": `datetime-local`, max now); Notes placeholder "What was happening?"; primary button "Log moment"; save calls `logMomentAction({ trackerId, intensity?, note?, at? })`; toast "Logged <tracker name>" with Undo; Create more keeps the tracker and clears note/intensity; no trackers → "No trackers yet." with a link "Add one" to `/trackers` and the button disabled. Last used tracker remembered with the dialog prefs (`lastTracker`).
- [ ] Steps: failing dom tests (switch to Moment shows trackers and hides Title; logs with intensity and note; clearing intensity; no trackers state; Ctrl+Enter logs) → implement → PASS (all existing dialog tests too) → commit `feat(trackers): log a moment from Capture`.

### Task 6: Trackers page, navigation

**Files:** Create `src/app/(app)/trackers/page.tsx`, `src/components/app/tracker-card.tsx`, `tracker-manage.tsx`, `trackers.dom.test.tsx`; modify `page-skeletons.tsx` (+ `TrackersSkeleton`, test row), `sidebar.tsx` (Trackers after Review), `command-palette.tsx` ("Trackers"), `src/app/(app)/week/page.tsx` (header link "Trackers"), `nav.dom.test.tsx`, `e2e/loading.spec.ts` (sidebar list).

**Produces:** page `<h1>Trackers</h1>`, "New tracker" inline form (name, emoji, "Fewer is better"/"More is better"); empty state with three one-tap starters ("😟 Negative thinking" less, "😠 Anger" less, "💛 Kindness" more). `TrackerCard`: name/emoji, "This week so far: 4", trend line (`trendText`, coloured by `trendGood`), "Avg intensity 2.5" when known, an 8-bar chart (`<ol aria-label="Last 8 weeks">`, each bar `aria-label="Week of Mar 2: 3"`), recent moments list (time "Tue 18:30", intensity dots, note) with "Delete moment" buttons (undoable) and "Show more" (fetches `momentsAction` with `before`); a menu: Rename, Fewer/More is better, Move up, Move down, Archive/Unarchive, Delete (undoable). Archived trackers in a collapsed "Archived" details at the end.
- [ ] Steps: failing dom tests (card trend text and colour class, bars labels, delete moment calls action, starters create trackers, nav order) → implement → PASS → commit `feat(trackers): the trackers page`.

### Task 7: Patterns in the Sunday review

**Files:** Create `src/components/app/patterns.tsx` (+ dom test); modify `src/app/(app)/review/page.tsx`.

**Produces:** a `<section aria-label="Patterns">` after the goals: per active tracker "😠 Anger: 3 last week (5 the week before)" with the trend line and up to 10 notes ("Tue 18:30 · 4 · tired after the client call"); hidden when there are no active trackers; a link "Trackers" to the page.
- [ ] Steps: failing dom test → implement → PASS → commit `feat(trackers): patterns in the review`.

### Task 8: E2E, a11y, docs, verification

**Files:** Create `e2e/trackers.spec.ts`; modify `e2e/a11y.spec.ts` (`/trackers`), `docs/ROADMAP.md` (M7.1 section).
- Spec flow: on `/trackers` add starter "Anger"; press C (desktop) or Capture (phone), switch to Moment, pick Anger, intensity 3, note, Log moment; `/trackers` shows "This week so far: 1" and the note; delete the moment and Undo; `/review` shows Patterns.
- [ ] Run lint, format, typecheck, `pnpm test`, `pnpm db:check`; build; full Playwright in the background → all pass.
- [ ] Commit `test(e2e): trackers` and `docs: roadmap trackers`.
