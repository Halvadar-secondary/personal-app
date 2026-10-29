# Plan Your Days Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tasks can be planned on a day or in a week; Today, Plan tomorrow and Week pages run the owner's days; goals link achievements across areas and drive a Sunday review; tasks can have a numeric target; an evening push reminder asks to plan tomorrow.

**Architecture:** Plan state lives on `tasks` (new columns), read through new read models in `src/server/domain/plan.ts` that compute rolling and ordering in pure functions in `src/lib/plan.ts`. Goals are a new soft-deleted, undoable entity. The reminder is a push-only service worker plus a script run every 15 minutes by GitHub Actions, sharing one sender module with a "Send a test" Server Action.

**Tech Stack:** Next 16.4 (App Router, cacheComponents), React 19.3, Drizzle + Postgres (PGlite in tests), zod 4, dnd-kit, Radix via `radix-ui`, cmdk, Vitest (unit/db/dom projects), Playwright (desktop + phone), `web-push` (new dependency).

**Spec:** `docs/superpowers/specs/2026-10-28-plan-your-days-design.md`

## Global Constraints

- Every mutation is a `defineAction` in `src/server/domain/`, records history through `insertRecorded`/`updateRecorded`/`softDeleteRecorded` (except `day_plans`, reminder settings and push subscriptions, which the spec exempts), and is reached by the UI only through `act()`/`read()` in `src/server/actions/run.ts`.
- Dates are owner-local `YYYY-MM-DD` strings; "today" is `localDate(ctx.now(), ctx.timeZone)`; weeks use `weekStartOf(date, ctx.weekStart)`.
- Sections are exactly `work` and `spare`; UI labels "Work" and "Spare time". Default section `spare`.
- Target units: `times`, `hours`, `pages`, `lessons`, or a custom word of 1–20 characters. `hours` progress = sum of `duration_seconds` / 3600; other units = sum of `practice_entries.amount`.
- The reminder's default time is `21:00`; notification title "Plan tomorrow", body "Tomorrow isn't planned yet.", opens `/plan`.
- Rolled tasks show "from <Weekday>" (e.g. "from Tue") on Today and "left from today" on Plan tomorrow; week list rolled items show "from last week" (the week right before) or "from 12 Oct" (the planned week's first day, older).
- Repeating tasks' checkbox on any day but today is disabled with the title "Only today".
- Every new page gets a layout-shaped Suspense placeholder (M6.1 rule) and passes axe in E2E.
- Never print secrets; VAPID private key is piped straight into `gh secret set` / `vercel env add`.
- Match the surrounding code: comment density, naming, the `act`/`read` adapters, `useMutate` for optimistic UI.
- Node path for commands: `export PATH=/c/Users/Halvadar/AppData/Roaming/fnm/node-versions/v24.22.1/installation:$PATH`.

## Review Focus

1. **Owner time zone at the day boundary:** with time zone `Pacific/Auckland` and `now` 2026-03-10T12:00Z (local 2026-03-11 01:00), "today" is 2026-03-11 for planning, rolling and repeating-due checks. Test in Task 3.
2. **Week-start change after planning:** a task planned in the week starting Monday 2026-03-09 still appears in the week view after the owner switches to Sunday weeks (the week containing 2026-03-09 is now Sun 03-08 … Sat 03-14). Test in Task 3.
3. **Planned task whose achievement is deleted or parked:** a one-off planned today under a deleted achievement never shows (it is soft-deleted with it); one under a backlog achievement still shows (the owner planned it). Test in Task 3.
4. **Undo of compound actions:** undoing a `logProgress` that reached the target restores both the entry and the not-completed task; undoing `deleteGoal` relinks its achievements. Tests in Tasks 6 and 5.
5. **Reminder fires exactly once, only when needed:** not before the time, not when tomorrow has a `day_plans` row or a planned task, not twice the same local evening, and dead subscriptions (404/410) are removed. Test in Task 13.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/server/db/goals.ts` (modify) | new task columns, `goals` table, `achievements.goal_id`, `practice_entries.amount`, `day_plans` |
| `src/server/db/settings.ts` (modify) | `reminder_enabled`, `reminder_time`, `last_reminder_on` |
| `src/server/db/push.ts` (create) | `push_subscriptions` table |
| `drizzle/0007_*.sql` (generated) | migration |
| `src/lib/plan.ts` (create) | pure: sections, rolling, ordering, week labels, target progress maths |
| `src/server/domain/plan.ts` (create) | `planTask`, `placeTask`, `markDayPlanned`, `getDay`, `getWeek`, `getPlanOptions` |
| `src/server/domain/goals.ts` (create) | goal CRUD, link, list/get, `getReview` |
| `src/server/domain/targets.ts` (create) | `logProgress`, `targetProgress` |
| `src/server/domain/reminders.ts` (create) | reminder settings, subscriptions, `dueReminders`, `sendReminders` |
| `src/server/push/send.ts` (create) | `web-push` wrapper (`PushSender` type) |
| `src/server/domain/tasks.ts`, `inbox.ts`, `views.ts`, `create.ts`, `undo.ts`, `integrity.ts`, `history.ts`, `rows.ts`, `export.ts`, `purge.ts` (modify) | plan/target fields, Inbox rule, goal entity |
| `src/server/actions/plan.ts`, `goals.ts`, `reminders.ts` (create) | Server Actions |
| `src/server/mcp/tools.ts` (modify) | new tools |
| `src/components/app/day-list.tsx` (create) | Today/Plan sections with drag, rows, menus |
| `src/components/app/plan-chips.tsx` (create) | `WhenPicker`, `SectionPicker`, `TargetPicker`, `ProgressButton` |
| `src/components/app/pick-list.tsx` (create) | planner's pick list |
| `src/components/app/week-view.tsx` (create) | week grid + week list |
| `src/components/app/goal-*.tsx` (create) | goal cards, goal page parts, link picker, review sections |
| `src/components/app/reminder-settings.tsx` (create) | settings section, subscribe flow |
| `public/sw.js` (create) | push-only service worker |
| `src/app/(app)/today`, `plan`, `week`, `goals`, `goals/[id]`, `review` (create) | pages |
| `scripts/remind.ts`, `.github/workflows/remind.yml` (create) | scheduled sender |
| `e2e/plan.spec.ts`, `e2e/goals.spec.ts` (create), `e2e/a11y.spec.ts` (modify) | E2E |

---

### Task 1: Schema and migration

**Files:**
- Modify: `src/server/db/goals.ts`, `src/server/db/settings.ts`, `src/server/db/schema.ts`
- Create: `src/server/db/push.ts`, `drizzle/0007_*.sql` (via `pnpm db:generate`)
- Test: `src/server/db/goals.db.test.ts`, `src/server/db/migrations.db.test.ts` (existing; extend)

**Interfaces:**
- Produces:
  - `planSection = pgEnum("plan_section", ["work", "spare"])`, `goalStatus = pgEnum("goal_status", ["active", "done"])`
  - `tasks`: `plannedOn: date("planned_on", {mode:"string"})`, `plannedWeek: date("planned_week", {mode:"string"})`, `planSection: planSection("plan_section")`, `planSortKey: sortKey("plan_sort_key")` (nullable), `targetAmount: real("target_amount")`, `targetUnit: text("target_unit")`
  - checks: `tasks_one_plan` (`planned_on is null or planned_week is null`), `tasks_repeat_unplanned` (`recurrence is null or (planned_on is null and planned_week is null)`), `tasks_target_pair` (`(target_amount is null) = (target_unit is null)`), `tasks_target_positive` (`target_amount is null or target_amount > 0`), `tasks_target_once` (`target_amount is null or recurrence is null`)
  - index `on(ownerId, plannedOn)` and `on(ownerId, plannedWeek)`
  - `goals = pgTable("goals", {...base(), title, notes, deadline date, status goalStatus default "active", completedAt, sortKey})`
  - `achievements.goalId: uuid("goal_id").references(() => goals.id)` (nullable) + index `on(ownerId, goalId)`
  - `practiceEntries.amount: real("amount")` (nullable)
  - `dayPlans = pgTable("day_plans", {ownerId, day date, createdAt}, pk(ownerId, day))`
  - settings: `reminderEnabled boolean default false`, `reminderTime text default "21:00"`, `lastReminderOn date`
  - `pushSubscriptions = pgTable("push_subscriptions", {id uuid pk, ownerId, endpoint text unique, p256dh text, auth text, createdAt})`
  - types `Goal`, `GoalStatus`, `PlanSection`, `DayPlan`, `PushSubscriptionRow`

- [ ] **Step 1: Write failing db tests** in `goals.db.test.ts`:
  - `it("refuses a task planned on a day and in a week")` → insert a task row with both `plannedOn` and `plannedWeek` rejects.
  - `it("refuses a plan or a target on a repeating task")` → two inserts reject.
  - `it("refuses a target amount without a unit, or zero")`.
  - `it("links an achievement to a goal")` → insert goal, achievement with `goalId`, select back.
- [ ] **Step 2: Run** `pnpm exec vitest run --project db src/server/db/goals.db.test.ts` → FAIL (unknown columns).
- [ ] **Step 3: Implement the schema**, then `pnpm db:generate` (name accepted as generated). Export new tables from `schema.ts`.
- [ ] **Step 4: Run** the same tests plus `src/server/db/migrations.db.test.ts` and `pnpm db:check` → PASS.
- [ ] **Step 5: Commit** `feat(db): plan, target, goal, day plan and push subscription schema`.

### Task 2: Pure plan functions

**Files:**
- Create: `src/lib/plan.ts`, `src/lib/plan.test.ts`

**Interfaces:**
- Produces:
  - `type Section = "work" | "spare"`; `SECTIONS: Section[] = ["work","spare"]`; `SECTION_LABELS = { work: "Work", spare: "Spare time" }`
  - `rollsInto(plannedOn: string, day: string, today: string): boolean` — true iff `(day === today && plannedOn < today) || (day === addDays(today,1) && plannedOn <= today)`
  - `type Orderable = { id: string; key: string | null; rolledFrom: string | null; createdAt: Date }`; `orderSection<T extends Orderable>(items: T[]): T[]` — rolled first by `rolledFrom` asc then key; then the rest by key (nulls last), ties by `createdAt` then `id`
  - `rolledLabel(plannedOn: string, day: string, today: string): string` — `"left from today"` when `plannedOn === today && day > today`, else `` `from ${weekday short}` `` (`"from Tue"`) for a gap under 7 days, else `` `from ${d MMM}` `` (`"from 3 Mar"`)
  - `weekListLabel(plannedWeek: string, currentStart: string, weekStart: number): string` — `"from last week"` when `weekStartOf(plannedWeek, weekStart) === addDays(currentStart, -7)`, else `` `from ${d MMM}` `` of that week's first day
  - `weekRange(date: string, weekStart: number): { start: string; end: string }`
  - `reviewWeekStart(today: string, weekStart: number): string` — next week's start when `today` is the week's last day, else this week's start
  - `progressOf(unit: string, entries: { amount: number | null; durationSeconds: number | null }[]): number` and `formatProgress(progress: number, amount: number, unit: string): string` → `"34 / 100 times"`, hours shown with one decimal max (`"2.5 / 10 hours"`)

- [ ] **Step 1: Write failing tests** covering: `rollsInto` for today/tomorrow/later/past days; `orderSection` ordering incl. null keys and two rolled items of different days; `rolledLabel` three branches; `weekListLabel` both branches with weekStart 0 and 1; `reviewWeekStart` for a Sunday with weekStart 1 (→ next Monday) and a Wednesday (→ this Monday); `progressOf` for hours (5400s → 1.5) and pages; `formatProgress("hours")` one-decimal.
- [ ] **Step 2: Run** `pnpm exec vitest run --project unit src/lib/plan.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement.** Use `src/lib/dates.ts` helpers; weekday/month names via `Intl.DateTimeFormat("en-GB", { timeZone: "UTC" })` on `${date}T00:00:00Z`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(plan): pure functions for rolling, ordering and labels`.

### Task 3: Planning domain and read models

**Files:**
- Create: `src/server/domain/plan.ts`, `src/server/domain/plan.db.test.ts`
- Modify: `src/server/domain/tasks.ts` (create/createTasks/update accept plan + target), `src/server/domain/inbox.ts` and `views.ts` (`getOverview.inboxCount`) for the Inbox rule

**Interfaces:**
- Consumes: Task 1 columns; Task 2 `rollsInto`, `orderSection`, `rolledLabel`, `weekListLabel`, `weekRange`.
- Produces:
  - `zPlan = z.discriminatedUnion("type", [z.object({type: z.literal("day"), date: zDate, section: z.enum(["work","spare"]).optional()}), z.object({type: z.literal("week"), date: zDate})]).nullable()`; `zTarget = z.object({ amount: z.number().positive().max(1_000_000), unit: z.string().trim().min(1).max(20) }).nullable()`
  - `zTaskFields` gains `plan: zPlan.optional()` and `target: zTarget.optional()`; `updateTask` input gains `target: zTarget.optional()` (plan changes go through `planTask`). Validation: plan or target with a recurrence → `DomainError("invalid_input")`.
  - `planTask = defineAction(z.object({ taskId: z.uuid(), plan: zPlan }), …)` → returns the updated `Task`. Day: sets `plannedOn`, clears `plannedWeek`, keeps the task's section if set else the given/`spare`, appends to the end of that day's section. Week: sets `plannedWeek = weekStartOf(date)`, clears day fields. Null: clears all four plan columns. Repeating task → `invalid_state`.
  - `placeTask = defineAction(z.object({ taskId: z.uuid(), day: zDate, section: z.enum(["work","spare"]), afterId: z.uuid().nullish(), beforeId: z.uuid().nullish() }), …)` → one-off: writes `plannedOn = day`, `plannedWeek = null`, section, key (adopts a rolled task); repeating: must be due on `day` and in day scope, else `invalid_state`; writes its standing section and key. Siblings for `sortKeyFor` = that day's section items from `daySections` (excluding the task), using each item's current key; items with a null key get keys assigned in display order first (one `updateRecorded` each, same batch).
  - `markDayPlanned = defineAction(z.object({ day: zDate }), …)` → upsert into `day_plans`, no history; returns `{ day }`.
  - `type DayItem = { id; title; kind: "once" | "repeat"; section: Section; key: string | null; done: boolean; rolledFrom: string | null; rolledLabel: string | null; achievement: { id; title } | null; area: NavArea | null; effort: number; recurrence: Recurrence | null; target: { amount: number; unit: string; progress: number } | null; createdAt: Date }`
  - `getDay = defineAction(z.object({ day: zDate.optional() }), …)` → `{ day, today, planned: boolean, sections: Record<Section, DayItem[]> }`. Contents for day D (spec + "Settled" §1–3): one-offs live, not under a deleted achievement, with `plannedOn = D`; plus uncompleted one-offs with `rollsInto(plannedOn, D, today)`; plus one-offs completed today whose `plannedOn < today` when `D === today`; plus repeating tasks due on D that are loose or under an active achievement in a live area, `done` = completion with `occurrenceDate = D`. `planned` = a `day_plans` row exists or any one-off has `plannedOn = D`. Each section sorted by `orderSection`. `target.progress` comes from `targetProgress(ctx, taskIds)`, which this task creates in `src/server/domain/targets.ts` (read-only); Task 6 adds `logProgress` to the same file.
  - `getWeek = defineAction(z.object({ start: zDate.optional() }), …)` → `{ start, end, today, days: { day: string; sections: Record<Section, DayItem[]> }[]; list: WeekItem[] }` where `start` is normalised with `weekStartOf`; `WeekItem = { id; title; done; rolledLabel: string | null; achievement; area }`: one-offs with `plannedWeek` between `start` and `end`, plus, when the week contains today, uncompleted ones with `plannedWeek < start` (rolled, labelled by `weekListLabel`), rolled first.
  - `getPlanOptions = defineAction(z.object({ day: zDate }), …)` → `{ week: WeekItem[]; achievements: { area: NavArea; achievement: { id; title }; tasks: { id; title; plannedOn: string | null; plannedWeek: string | null }[] }[] }` — open one-offs of active achievements in live areas that are not planned on `day`, in board order.
  - Inbox rule: loose tasks shown in Inbox and counted in `inboxCount` only when `plannedOn`, `plannedWeek` and `recurrence` are all null (completed loose tasks keep today's behaviour).

- [ ] **Step 1: Write failing tests** in `plan.db.test.ts` (use `runner(db, owner, { now })`; `FIXED_NOW` is 2026-03-10T12:00Z, a Tuesday; seed an area, an active achievement, tasks):
  - `it("plans a task on a day, appends it to the section, and lists it on that day")`
  - `it("moves a week task to a day and back to the week, clearing the other")`
  - `it("refuses to plan a repeating task")`
  - `it("rolls an unfinished task from Monday onto today with 'from Mon', first in its section")`
  - `it("shows today's unfinished tasks on tomorrow as 'left from today'")`
  - `it("does not roll onto a day after tomorrow or onto a past day")`
  - `it("keeps a task done today after rolling, as done")`
  - `it("lists repeating tasks due that day from active achievements and loose tasks, not backlog ones")`
  - `it("places a rolled task into today, adopting it")` → after `placeTask`, `plannedOn` is today and `rolledFrom` null.
  - `it("places a repeating task between two one-offs and keeps that place on other days")`
  - `it("uses the owner's time zone for today")` (Review Focus 1: `timeZone: "Pacific/Auckland"`, today = 2026-03-11)
  - `it("finds a week task after the week start changes")` (Review Focus 2: plan week of 2026-03-09 with weekStart 1, `updateSettings({weekStart: 0})`, `getWeek({start: "2026-03-08"}).list` contains it)
  - `it("hides tasks of a deleted achievement but keeps a planned task of a backlog achievement")` (Review Focus 3)
  - `it("marks a day planned by Done or by any planned task")`
  - `it("keeps planned and repeating loose tasks out of the Inbox")` (calls `listInbox`, `getOverview`)
  - `it("lists week tasks, rolling last week's unfinished ones into the current week")`
  - `it("undoes a plan change")` (`planTask` then `undoBatch` restores `plannedOn: null`)
- [ ] **Step 2: Run** `pnpm exec vitest run --project db src/server/domain/plan.db.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement** `plan.ts` and the `tasks.ts`/`inbox.ts`/`views.ts` changes. Query per day: one select of candidate one-offs (`plannedOn <= D` uncompleted or `plannedOn = D` or completed today), one of repeating tasks with achievements/areas joined, one of completions for D; build `DayItem`s, then `orderSection` per section.
- [ ] **Step 4: Run** the file, then `pnpm exec vitest run --project db` → PASS (existing inbox/views tests still green; adjust none unless they assert the old Inbox rule for planned tasks — they don't exist yet).
- [ ] **Step 5: Commit** `feat(plan): plan tasks on days and weeks, with Today, week and planner read models`.

### Task 4: Create dialog support (domain)

**Files:**
- Modify: `src/server/domain/create.ts`, `src/server/domain/create.db.test.ts`

**Interfaces:**
- Consumes: `zPlan`, `zTarget` (Task 3).
- Produces: `createItem` task branch accepts `plan` and `target` (passed to `createTask`); `getCreateOptions` adds `weekStart: ctx.weekStart`.

- [ ] **Step 1: Failing tests:** `it("creates a loose task planned tomorrow in Work")` → `getDay({day:"2026-03-11"}).sections.work[0].title`; `it("creates a task with a target")`; `it("refuses a target on a repeating task")`.
- [ ] **Step 2: Run** `pnpm exec vitest run --project db src/server/domain/create.db.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(create): plan and target on new tasks`.

### Task 5: Goals domain

**Files:**
- Create: `src/server/domain/goals.ts`, `src/server/domain/goals.db.test.ts`
- Modify: `src/server/domain/history.ts` (`EntityType` + `"goal"`), `rows.ts` (`SoftTable` + `goals`), `undo.ts` (registry `goal: tableEntity(goals, true, { afterApply: rekeyIfTaken })`), `integrity.ts` (`siblingScope` for goals = none; `assertParentsAndChildren`: an achievement linked to a deleted goal → conflict naming the goal), `export.ts` (`goals`), `purge.ts` (purge goals soft-deleted over 90 days, after unlinking nothing — achievements already unlinked on delete), `src/server/domain/export.db.test.ts`, `purge.db.test.ts`

**Interfaces:**
- Produces:
  - `createGoal({ title: 1–200, notes?, deadline? })` → `Goal` (appended last)
  - `updateGoal({ goalId, title?, notes?, deadline?, status? })` → `Goal`; status `done` sets `completedAt`, `active` clears it
  - `moveGoal({ goalId, afterId?, beforeId? })`
  - `deleteGoal({ goalId })` → unlinks every live achievement (`goalId: null`, recorded) then soft-deletes, one batch
  - `linkAchievement({ achievementId, goalId: uuid | null })` → `Achievement` (goal must be live)
  - `type GoalSummary = Goal & { achievementCount; achievementsDone; taskCount; tasksDone; daysLeft: number | null }` (tasks = one-off live tasks of linked live achievements; `daysLeft = daysBetween(today, deadline)`)
  - `listGoals({})` → `{ today, goals: GoalSummary[] }` active first by key, then done
  - `getGoal({ goalId })` → `{ today, goal: GoalSummary, achievements: { id; title; status; area: NavArea | null; taskCount; doneCount }[] }`
  - `listLinkableAchievements({ goalId })` → live achievements not linked to this goal: `{ id; title; area: NavArea | null; goalTitle: string | null }[]`
  - `getReview({ start?: string })` → `{ start, end, today, lastWeek: { done: number; rolled: number }, goals: { goal: GoalSummary; tasks: ReviewTask[] }[], unlinked: { achievement: {id,title}; area: NavArea | null; tasks: ReviewTask[] }[], week: Awaited<ReturnType<getWeek.run>> }` with `ReviewTask = { id; title; achievementTitle; plannedOn; plannedWeek }`: open one-off tasks of the goal's unfinished linked achievements; `start` defaults to `reviewWeekStart(today, weekStart)`; `lastWeek.done` = one-off completions with `occurrenceDate` in the previous week; `rolled` = uncompleted one-offs planned on a day of the previous week or in it.

- [ ] **Step 1: Failing tests:** create/update/status done sets completedAt; `deleteGoal` unlinks then `undoBatch` relinks (Review Focus 4); `linkAchievement` across two areas and progress counts; `getReview` default week on Sunday 2026-03-15 (weekStart 1) is 2026-03-16; `lastWeek` counts; undo of a link restoring a link to a since-deleted goal is refused with conflict; export includes goals; purge removes an old soft-deleted goal.
- [ ] **Step 2: Run** `pnpm exec vitest run --project db src/server/domain/goals.db.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the file plus `history.db.test.ts`, `export.db.test.ts`, `purge.db.test.ts` → PASS.
- [ ] **Step 5: Commit** `feat(goals): goals that link achievements across areas, and the weekly review`.

### Task 6: Targets domain

**Files:**
- Create: `src/server/domain/targets.ts`, `src/server/domain/targets.db.test.ts`
- Modify: `src/server/domain/practice.ts` (`addPracticeEntry` accepts `amount: z.number().positive().optional()`)

**Interfaces:**
- Produces:
  - (`targetProgress(ctx: Ctx, taskIds: string[]): Promise<Map<string, number>>` already exists from Task 3)
  - `logProgress = defineAction(z.object({ taskId: z.uuid(), amount: z.number().positive().max(100_000), note: z.string().max(2000).optional() }), …)` → `{ progress: number; completed: boolean }`. Task must have a target and be uncompleted, else `invalid_state`. Unit `hours`: `amount` is **minutes**, stored as `durationSeconds = round(amount*60)`; else stored as `amount`. When progress ≥ target, `callAction(ctx, completeTask, { taskId })` in the same batch.
  - `getDay`/`getAchievement` fill `target.progress` (and `getAchievement` tasks gain `progress: number | null`).

- [ ] **Step 1: Failing tests:** logs 3 pages → progress 3; hours logs 90 minutes → 1.5; reaching 100/100 completes the task and one `undoBatch` reverts entry and completion (Review Focus 4); refuses on a task without target or already completed.
- [ ] **Step 2: Run** `pnpm exec vitest run --project db src/server/domain/targets.db.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** plus `practice.db.test.ts`, `plan.db.test.ts` → PASS.
- [ ] **Step 5: Commit** `feat(targets): log progress toward a task's target`.

### Task 7: Server Actions and MCP tools

**Files:**
- Create: `src/server/actions/plan.ts` (`planTaskAction`, `placeTaskAction`, `markDayPlannedAction`, `logProgressAction`, `planOptionsAction` (read)), `src/server/actions/goals.ts` (`createGoalAction`, `updateGoalAction`, `moveGoalAction`, `deleteGoalAction`, `linkAchievementAction`, `linkableAchievementsAction` (read))
- Modify: `src/server/actions/actions.sweep.test.ts` (files 10 → 12, actions ≥ 25 → ≥ 36), `src/server/mcp/tools.ts`, `src/server/mcp/tools.db.test.ts`

**Interfaces:**
- MCP tools added: `get_day` (getDay), `get_week` (getWeek), `plan_task` (planTask), `place_task` (placeTask), `log_progress` (logProgress), `list_goals`, `get_goal`, `create_goal`, `update_goal`, `link_achievement_to_goal` (linkAchievement), `delete_item` gains `kind: "goal"` (in `mcp-actions.ts`). `create_tasks` / `update_task` descriptions mention `plan` (`{type:"day",date,section}` or `{type:"week",date}`) and `target` (`{amount, unit}`), and that `achievementId: null` with a plan makes a loose task.

- [ ] **Step 1: Failing tests:** sweep counts; `tools.db.test.ts` `it("plans a task and reads the day through MCP")` and `it("creates a goal and links an achievement through MCP")`.
- [ ] **Step 2: Run** `pnpm exec vitest run src/server/actions/actions.sweep.test.ts src/server/mcp` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(actions): plan, goal and progress actions and MCP tools`.

### Task 8: Plan chips and the create dialog

**Files:**
- Create: `src/components/app/plan-chips.tsx`, `src/components/app/plan-chips.dom.test.tsx`
- Modify: `src/components/app/capture-context.tsx` (`CreatePreset` gains `plan?: { type: "day"; date: string; section: Section } | { type: "week"; date: string }`), `create-dialog.tsx`, `destination-picker.tsx` (label `"No achievement"` when `hasPlan`), `create-dialog.dom.test.tsx`

**Interfaces:**
- Produces:
  - `WhenPicker({ value: Plan, today: string, weekStart: number, onChange(plan: Plan), className? })` with `type Plan = { type: "day"; date: string } | { type: "week"; date: string } | null`; dropdown items "No date", "Today", "Tomorrow", "This week", "Next week", "Pick a day…" (opens a date input); trigger text: `"When"` when null, `"Today"`, `"Tomorrow"`, weekday + date (`"Thu 12 Mar"`), `"This week"`, `"Next week"`, or `"Week of 16 Mar"`; aria-label `` `When: ${text}` ``
  - `SectionPicker({ value: Section, onChange })` — aria-label `` `Section: ${label}` ``
  - `TargetPicker({ value: { amount; unit } | null, onChange, disabled? })` — popover with amount number field and unit select (Times, Hours, Pages, Lessons, Other… → text); trigger `"Target"` / `"Target: 100 times"`
  - `ProgressButton({ taskId, title, unit, progress, amount, onLogged? })` — shows `formatProgress` and a bar; `+` (aria-label `` `Log progress on ${title}` ``) opens a popover with "Amount" (label "Minutes" for hours, default 1 / 30) and "Note", button "Log"; calls `logProgressAction`, toasts `"Logged"` with Undo, or `"Target reached"` with Undo when completed
  - Dialog: task chips row gains `WhenPicker`, `SectionPicker` (only while When is a day), `TargetPicker` (disabled while Repeat is set; Repeat disabled while When or Target is set). Preset `plan` sets When and section.

- [ ] **Step 1: Failing dom tests:** WhenPicker trigger labels for each choice with today "2026-03-10"; dialog with preset `{kind:"task", plan:{type:"day", date:"2026-03-11", section:"work"}}` sends `plan: {type:"day", date:"2026-03-11", section:"work"}` to `createItemAction` (mocked) and the breadcrumb reads "Destination: No achievement"; Target chip sends `target: {amount:100, unit:"times"}`; Repeat chip is disabled while When is set; ProgressButton logs 30 minutes for hours (sends amount 30).
- [ ] **Step 2: Run** `pnpm exec vitest run --project dom src/components/app/plan-chips.dom.test.tsx src/components/app/create-dialog.dom.test.tsx` → FAIL.
- [ ] **Step 3: Implement** with `chipClass` and the existing DropdownMenu/Popover primitives.
- [ ] **Step 4: Run** → PASS (all existing dialog tests still pass).
- [ ] **Step 5: Commit** `feat(create): When, section and target chips`.

### Task 9: Today and Plan tomorrow

**Files:**
- Create: `src/components/app/day-list.tsx`, `day-list.dom.test.tsx`, `src/components/app/pick-list.tsx`, `pick-list.dom.test.tsx`, `src/app/(app)/today/page.tsx`, `src/app/(app)/plan/page.tsx`
- Modify: `src/components/app/page-skeletons.tsx` (`DaySkeleton`, `PlanSkeleton`), `page-skeletons.dom.test.tsx`

**Interfaces:**
- Consumes: `getDay`, `getPlanOptions`, `placeTaskAction`, `planTaskAction`, `markDayPlannedAction`, `completeTaskAction`/`uncompleteTaskAction`, `ProgressButton`, `useCapture().openCreate`.
- Produces: `DayList({ day: string; today: string; weekStart: number; sections: Record<Section, DayItem[]>; mode: "today" | "plan" })` — one `DndContext`, a `SortableContext` per section (`<section aria-label="Work">`, `"Spare time"`), droppable empty sections; drag end → optimistic move then `placeTaskAction` with neighbours in the target section; rows: checkbox (`Complete <title>`; repeating on another day disabled, title "Only today"), title, meta (achievement title link or nothing), rolled badge, `ProgressButton` for targets; row menu (`Task menu <title>`) for one-offs: "Move to tomorrow" (or "Move to the next day"), "Pick a day…", "Move to this week's list", "Remove from plan"; per-section button "Add to Work"/"Add to Spare time" → `openCreate({ kind: "task", plan: { type: "day", date: day, section } })`.
- Today page: `<h1>Today</h1>`, formatted date, links "Plan tomorrow" (`/plan`) and "Week" (`/week`); `DayList mode="today"`; empty state when both sections are empty: "Nothing planned for today" + button "Plan today" (`/plan?day=<today>`).
- Plan page: `?day=` (default tomorrow; invalid → 404 via `read`), header `<h1>Plan <weekday d MMM></h1>` with ‹ › links (aria-labels "Previous day", "Next day"), `DayList mode="plan"`, `PickList({ day, options })` with "This week" and "From your active achievements" (collapsible per achievement, collapsed by default) and per row buttons `Add <title> to Work` / `Add <title> to Spare time` (icon buttons with those aria-labels) calling `planTaskAction({ taskId, plan: { type: "day", date: day, section } })`; footer button "Done planning" → `markDayPlannedAction({ day })` then `router.push("/today")`.

- [ ] **Step 1: Failing dom tests:** DayList renders sections in order with rolled badge "from Mon"; repeating row on a non-today day has disabled checkbox titled "Only today"; "Move to this week's list" calls `planTaskAction` with `{type:"week", date: day}`; keyboard drag between sections calls `placeTaskAction` with `section: "spare"` (use dnd-kit keyboard: focus handle, Space, ArrowDown…, Space); PickList "Add … to Work" calls `planTaskAction`; skeleton tests for the two new skeletons.
- [ ] **Step 2: Run** `pnpm exec vitest run --project dom src/components/app/day-list.dom.test.tsx src/components/app/pick-list.dom.test.tsx src/components/app/page-skeletons.dom.test.tsx` → FAIL.
- [ ] **Step 3: Implement** components and pages (Suspense + skeleton around the async part, as `active/page.tsx` does). `DayList` keyed by `day` so a new day starts from server state.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(today): Today and Plan tomorrow pages`.

### Task 10: Week page

**Files:**
- Create: `src/components/app/week-view.tsx`, `week-view.dom.test.tsx`, `src/app/(app)/week/page.tsx`
- Modify: `page-skeletons.tsx` (`WeekSkeleton`)

**Interfaces:**
- Consumes: `getWeek`, `planTaskAction`, completion actions.
- Produces: `WeekView({ week })`: header `<h1>Week of d MMM</h1>`, ‹ › (aria "Previous week"/"Next week"), links "Goals", "Review"; seven day cards (`<section aria-label="Thu 12 Mar">`) each listing items compactly with checkboxes (same rules) and a link "Plan this day" (`/plan?day=`); "This week's list" section: rows with rolled label, checkbox, a "Give it a day" dropdown (the seven days) calling `planTaskAction({ plan: { type: "day", date } })`, and "Add to this week" button → `openCreate({ kind: "task", plan: { type: "week", date: start } })`. Desktop: days in a 7-column grid (`md:grid-cols-7`, list below); phone: stacked.

- [ ] **Step 1: Failing dom tests:** seven day sections with the right labels; "Give it a day → Thu 12 Mar" calls `planTaskAction`; rolled label shown.
- [ ] **Step 2: Run** `pnpm exec vitest run --project dom src/components/app/week-view.dom.test.tsx` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(week): the week page`.

### Task 11: Goals pages, goal chip and the review page

**Files:**
- Create: `src/components/app/goal-card.tsx`, `goal-detail.tsx`, `goal-link-picker.tsx`, `review-sections.tsx`, `goals.dom.test.tsx`, `src/app/(app)/goals/page.tsx`, `src/app/(app)/goals/[id]/page.tsx`, `src/app/(app)/review/page.tsx`
- Modify: `src/components/app/achievement-header.tsx` (Goal chip), `page-skeletons.tsx` (`GoalsSkeleton`, `ReviewSkeleton`)

**Interfaces:**
- Consumes: Task 5 reads and Task 7 actions; `WeekView` list/day parts for the review's "Your week".
- Produces:
  - Goals page: `<h1>Goals</h1>`, button "New goal" (inline form: title + optional deadline, Enter saves) → `createGoalAction`; `GoalCard`s link to `/goals/<id>`: title, deadline text "Due 15 Mar · 138 days left" (overdue: destructive colour, "overdue by 3 days"), progress "2/5 achievements · 14/40 tasks" with a bar of tasks done; "Done" goals under a "Done" heading.
  - Goal page: `InlineText` title and notes, `DateField` deadline, a status toggle button "Mark done"/"Mark active", delete in a menu (undoable toast); "Feeding this goal" list of linked achievements (area emoji+name, status, `doneCount/taskCount`, link, "Unlink <title>" button); `GoalLinkPicker` (cmdk in a popover, trigger "Link achievement", items show area and, when linked elsewhere, "in <goal>") → `linkAchievementAction`.
  - Achievement header: chip "Goal" / "Goal: <title>" opening a cmdk list of active goals plus "No goal".
  - Review page: `<h1>Plan your week</h1>`, week ‹ ›, "Last week: 12 done, 3 rolled over", one section per goal (`aria-label` = goal title) with deadline/progress line and its `ReviewTask` rows, each with "Add <title> to this week" (icon button, `planTaskAction` week) and a "Pick a day for <title>" dropdown of the seven days; tasks already planned show "Thu 12 Mar" / "This week" instead of the buttons and a small "Change" menu; "Achievements with no goal" collapsed section; "Your week" = the week list and day cards from `getWeek` (read-only reuse of `WeekView` parts).

- [ ] **Step 1: Failing dom tests:** GoalCard text for deadline/progress/overdue; link picker calls `linkAchievementAction` with the right ids; review "Add … to this week" calls `planTaskAction({ plan: { type: "week", date: start } })`.
- [ ] **Step 2: Run** `pnpm exec vitest run --project dom src/components/app/goals.dom.test.tsx` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(goals): goals pages, goal chip and the Sunday review`.

### Task 12: Task row plan and target, navigation, palette, manifest

**Files:**
- Modify: `src/components/app/task-row.tsx` (When chip via `WhenPicker` for one-offs → `planTaskAction`; Target chip → `updateTaskAction({target})`; `ProgressButton` when target), `task-list.tsx` (handlers), `sidebar.tsx`, `tab-bar.tsx`, `command-palette.tsx`, `src/app/manifest.ts` (`start_url: "/today"`), `src/app/(app)/page.tsx` (heading stays "Your areas"; phone-only gear link `aria-label="Settings"`), `src/app/(app)/achievements/[id]/page.tsx` (pass `today`/`weekStart` already there), tests `task-list.dom.test.tsx`, `command-palette.dom.test.tsx`, a new `nav.dom.test.tsx`
- Modify E2E helpers if a tab label changes (`e2e/helpers/app.ts`)

**Interfaces:**
- Sidebar main nav order: Today `/today`, Week `/week`, Goals `/goals`, Review `/review`, Your areas `/`, Active `/active`, Search `/search`, Inbox `/inbox`. Logo links to `/today`.
- Tab bar: Today, Areas, Capture, Week, Search.
- Palette group "Go to": Today, Plan tomorrow, Week, Goals, Review (plus existing).

- [ ] **Step 1: Failing dom tests:** task row When chip calls `planTaskAction`; tab bar has links Today/Areas/Week/Search and the Capture button in that order; palette lists "Plan tomorrow".
- [ ] **Step 2: Run** the three dom files → FAIL.
- [ ] **Step 3: Implement**; update any existing E2E that clicks the "Active" or "Settings" tab on phones to use the new route (search `e2e/` for `name: "Settings"` / `"Active"` within `Tabs`).
- [ ] **Step 4: Run** `pnpm exec vitest run --project dom` → PASS.
- [ ] **Step 5: Commit** `feat(nav): Today first, Week, Goals and Review in navigation`.

### Task 13: Evening reminder

**Files:**
- Create: `src/server/db/push.ts` (Task 1), `src/server/push/send.ts`, `src/server/domain/reminders.ts`, `reminders.db.test.ts`, `src/server/actions/reminders.ts`, `src/components/app/reminder-settings.tsx`, `reminder-settings.dom.test.tsx`, `public/sw.js`, `scripts/remind.ts`, `.github/workflows/remind.yml`
- Modify: `package.json` (`web-push`, `@types/web-push`, script `"remind": "tsx scripts/remind.ts"`), `src/app/(app)/settings/page.tsx`, `src/proxy.ts`/its access rules if `/sw.js` is blocked for signed-out requests (allow it like static icons), `.env.example` (`VAPID_PUBLIC_KEY=`, `VAPID_PRIVATE_KEY=`, `VAPID_SUBJECT=mailto:…`), `actions.sweep.test.ts` (files 12 → 13)

**Interfaces:**
- `type PushMessage = { title: string; body: string; url: string }`; `type PushSender = (sub: { endpoint; p256dh; auth }, msg: PushMessage) => Promise<"ok" | "gone">`; `webPushSender(): PushSender | null` (null when VAPID env is missing) — 404/410 → `"gone"`, other errors throw.
- Domain:
  - `getReminder({})` → `{ enabled: boolean; time: string; devices: number }`
  - `updateReminder({ enabled?: boolean; time?: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/) })` (no history)
  - `savePushSubscription({ endpoint: z.url(), p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) })` upsert by endpoint (owner set), no history; `deletePushSubscription({ endpoint })`
  - `dueReminders(db: Db, now: Date): Promise<{ ownerId: string; tomorrow: string; today: string }[]>` — owners with `reminderEnabled`, local time ≥ `reminderTime`, `lastReminderOn` ≠ local today, and tomorrow not planned (`day_plans` row or a one-off planned on tomorrow).
  - `sendReminders(db: Db, now: Date, send: PushSender): Promise<{ owners: number; sent: number; removed: number }>` — for each due owner: send `{ title: "Plan tomorrow", body: "Tomorrow isn't planned yet.", url: "/plan" }` to each subscription, delete "gone" ones, set `lastReminderOn` = local today (even if there were no subscriptions).
  - `sendTestReminder({})` action → sends `{ title: "Test reminder", body: "Reminders work on this device.", url: "/plan" }` to the owner's subscriptions; `DomainError("invalid_state")` when the sender is not configured or there are no devices.
- Server Actions: `reminderAction` (read), `updateReminderAction`, `savePushSubscriptionAction`, `deletePushSubscriptionAction`, `sendTestReminderAction`.
- `ReminderSettings({ publicKey: string | null, initial })`: switch "Evening reminder", time input "Reminder time", buttons "Send a test"; turning on: `Notification.requestPermission()` → `navigator.serviceWorker.register("/sw.js")` → `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })` → `savePushSubscriptionAction`; unsupported browser text: "This browser can't show notifications. On iPhone, add the app to your Home Screen first."; denied permission text: "Notifications are blocked for this site."
- `public/sw.js`: `push` → `showNotification(title, { body, data: { url }, icon: "/icons/icon-192.png" })`; `notificationclick` → focus an open client and navigate, else `clients.openWindow(url)`.
- `scripts/remind.ts`: like `scripts/purge.ts`; prints counts only; `remind.yml`: `schedule: cron "*/15 * * * *"` + `workflow_dispatch`, `environment: production`, env `MIGRATION_DATABASE_URL`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` from secrets.

- [ ] **Step 1: Failing tests** (`reminders.db.test.ts`, fake `PushSender` recording calls):
  - `it("sends once at or after the reminder time when tomorrow isn't planned")` — at 20:59 local nothing; at 21:05 one send; again at 21:20 nothing.
  - `it("skips an evening when tomorrow is planned by Done or a planned task")`
  - `it("uses the owner's time zone")`
  - `it("removes subscriptions the push service reports gone")`
  - `it("skips owners with the reminder off")`
  - dom: switch on calls `requestPermission`, `register("/sw.js")`, `subscribe`, then `savePushSubscriptionAction` (stub the browser APIs); unsupported message when `PushManager` is missing.
- [ ] **Step 2: Run** `pnpm exec vitest run --project db src/server/domain/reminders.db.test.ts` and the dom file → FAIL.
- [ ] **Step 3: Implement**; `pnpm add web-push` and `pnpm add -D @types/web-push`.
- [ ] **Step 4: Run** → PASS; `pnpm typecheck`.
- [ ] **Step 5: Commit** `feat(reminder): evening push reminder to plan tomorrow`.

### Task 14: E2E, docs, full verification

**Files:**
- Create: `e2e/plan.spec.ts`, `e2e/goals.spec.ts`
- Modify: `e2e/a11y.spec.ts` (Today, Plan, Week, Goals, a goal, Review pages: no axe violations), `e2e/helpers/app.ts` (`planTomorrow(page)` helpers as needed), `docs/ROADMAP.md` (new "M7 — Plan your days" section, all ticked except "Reminder verified on the owner's phone"), `README`/docs only if they list routes

**Tests:**
- `plan.spec.ts`: create a loose task "Buy groceries" from Plan tomorrow's "Add to Spare time"; it shows in Spare time; "Done planning" lands on Today; Today shows repeating task due today from an active achievement; tick a task; move a task to this week's list and see it on Week; Week "Give it a day" puts it on that day. Phone: same flow, sections stacked.
- `goals.spec.ts`: create goal "Write a song" with a deadline; link achievements from two areas via "Link achievement"; goal shows "0/2 achievements"; Review shows the goal's tasks; "Add … to this week" moves it into the week list.
- [ ] **Step 1: Write the specs.**
- [ ] **Step 2: Run** CI-style build then E2E: `APP_ENV=local BETTER_AUTH_URL=build-time-placeholder pnpm build`, `pnpm start` in the background, `E2E_BASE_URL=http://localhost:3000 pnpm exec playwright test` → all pass (stop the server by the PID on port 3000).
- [ ] **Step 3: Full checks:** `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm db:check` → all pass.
- [ ] **Step 4: Commit** `test(e2e): plan your days and goals` and `docs: roadmap M7`.

## Owner steps (after the PR, listed in its description)

- VAPID keys: generated by Claude and stored without printing (GitHub `production` environment secrets `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`; Vercel env `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` for production and preview). Done during Task 13 only if the CLIs are authenticated; otherwise listed for the owner.
- On the phone: add to Home Screen, Settings → Evening reminder on, Send a test.
