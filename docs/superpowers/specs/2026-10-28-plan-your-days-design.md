# Plan your days: design

Date: 2026-10-28. Status: described by the owner in conversation 2026-10-28;
the owner then asked for no further questions ("write a plan and start working
on it … I don't want any back and forth"). Everything marked **(my call)** was
decided by Claude on the owner's behalf and is listed in the PR for review.

## Why

The owner has no routine. They want every day to be intentional, so there is
no empty time for scrolling to fill, and they want their big life goals (write
and record a full song; ask the neighbour out) to move forward week by week.
Today the app only knows areas, achievements and tasks with deadlines: it can
say what exists, but not what to do today, this week, or in service of which
life goal.

The research write-up behind this (sleep, focus, habits, self-sabotage) is at
https://claude.ai/artifact/9Xssb8kAU46tR3BfuJ96Hy. The parts that shape this
design: plans made in advance ("implementation intentions") work; a plan for
the evening before removes the morning decision; slips should roll forward
rather than vanish or shame.

Success: the owner plans tomorrow the night before in a few minutes, opens
Today and works down two ordered lists, and on Sunday sees each life goal's
progress and plans the coming week from it.

## The kinds of task (owner's list)

| # | Kind | Example | In this design |
|---|---|---|---|
| 1 | Repeats | gym every day / every other day | existing repeat rules (interval already supports "every 2 days") |
| 2 | Once, on a day | buy groceries, message the client | a task planned **on a day** |
| 3 | Once, in a week | call grandma, dentist, collect a parcel | a task planned **in a week** |
| 4 | Life goal with a deadline | write a full song, ask the girl out | a **goal** linking achievements from any area |
| 5 | Fixed amount | 100 conversations, 10 hours of arpeggios, a 400-page book, a course | a task with a **target** |
| 6 | Behaviours to watch | negative thinking, anger, kindness | **out of scope here**: a separate PR (trackers) |

## What the owner decided

1. **Today shows only what is to be done today.** No goals, no deadlines.
2. **Today is planned the night before**, in two parts: **Work** and **Spare
   time**. Each part is an ordered list. Order is enough; no clock times.
3. While planning tomorrow the owner can **pick from the week's tasks** or
   **write a new task straight into tomorrow**.
4. **Unfinished tasks come first** when planning the next day (already added;
   the owner can take them out or move them).
5. Work vs Spare time is **where the task is put that day**, not a property
   of the task.
6. Planning tomorrow is **its own view** ("Plan tomorrow"), reached from Today.
7. **The app reminds the owner to plan** in the evening.
8. **No stand-up summary.**
9. **Goals** are broad things with a deadline that **achievements from other
   areas feed** (song ← guitar arpeggios, flute, Ableton). They are looked at
   **on Sunday**, where the owner **picks tasks for the coming week**.
10. A week task is picked into a week; it **can also be given a day**.

## The design

### 1. When to do a task ("plan") vs its deadline

- A one-off task gains an optional **plan**: either a **day** or a **week**.
  It is separate from the deadline: "dentist this week" is a plan, "song by
  15 March" is a deadline.
- Columns on `tasks`: `planned_on date` (a day), `planned_week date` (the
  first day of a week, in the owner's week start at the time it was set), and
  for a day plan `plan_section` (`work` | `spare`) and `plan_sort_key`
  (fractional key, ordering within the day's section). At most one of
  `planned_on` / `planned_week` is set (check constraint). Giving a week task
  a day replaces its week with the day.
- A week is always read as "the week containing `planned_week`", so changing
  the week-start setting later never loses a task. **(my call)**
- Repeating tasks are never planned: they appear on every day they are due
  by their rule. Each repeating task has its own standing `plan_section` and
  `plan_sort_key`, used on every day it appears; moving the gym on one day
  moves it on all days. Repeating tasks cannot be taken off a single day.
  **(my call: a routine's order is stable, and per-day rows for every
  occurrence would be a lot of machinery for little gain)**
- The default section is **Spare time**, used when nothing says otherwise
  (a repeating task never placed, an MCP call without a section). Adding from
  a section's button uses that section. **(my call)**

### 2. Tasks without an achievement ("loose" tasks)

- A task may stand alone, with no achievement, once it has a plan (groceries,
  message the client). The database already allows `achievement_id` null.
- The **Inbox** becomes "loose and unplanned": loose tasks with no plan and
  not completed, plus unfiled achievements (unchanged).
- Loose tasks earn no XP (existing rule: XP belongs to an area).
- The create dialog gets a **When** chip for tasks (None / Today / Tomorrow /
  a day / this week / next week), and a **section** chip (Work / Spare time)
  while When is a day. The existing Inbox destination is what a loose task
  uses: with a When it is labelled "No achievement" in the breadcrumb; with
  none it is "Inbox", as before. **(my call: one dialog, no new concept)**

### 3. Rolling forward

- An unfinished one-off task planned on a day before today **appears on
  today**, at the top of its section, marked "from Tue" (its planned day).
  No row is rewritten; the roll is computed. **(my call: nothing silently
  changes in the database, and undo stays simple)**
- An unfinished task planned in a week before the current week appears in
  the current week's list, marked "from last week" / "from 12 Oct".
- Rolled tasks are what the owner meant by "unfinished first".

### 4. Today (`/today`)

- Header: "Today", the date, and links: **Plan tomorrow**, Week.
- Two sections, **Work** then **Spare time**. Each lists, in order: rolled
  tasks first (oldest planned day first), then the day's items by
  `plan_sort_key`. Items are one-off tasks planned today, and repeating tasks
  due today.
- Each row: checkbox, title, a small muted line naming its achievement (or
  nothing for a loose task) and "from Tue" when rolled. Target tasks show
  their progress and a log button instead of only a checkbox (§8).
- Ticking a task completes it (existing completion actions; XP as now).
  Completed items stay in place, struck through, so the day's progress shows.
- Drag to reorder within a section and between sections (desktop and phone
  with a handle; keyboard via the existing dnd-kit keyboard sensor). A row
  menu: Move to another day, Move to this week's list, Remove from plan
  (back to the Inbox for a loose task, back to just its achievement for a
  filed task).
- "Add" button per section opens the create dialog with When = today and
  that section preset.
- Empty state: "Nothing planned for today", with a Plan today button that
  opens the planner for today. **(my call: the owner may not have planned
  the night before)**
- Today is what the app opens to: the installed app's start URL becomes
  `/today`, Today is first in the sidebar and tab bar, and the "Life Goals"
  logo links to it. The overview stays at `/` (so existing links keep
  working) and is labelled "Areas". **(my call)**

### 5. Plan tomorrow (`/plan?day=YYYY-MM-DD`, default tomorrow)

- The same two sections as Today, for the chosen day, editable the same way.
  Rolled tasks (today's unfinished ones count, since tomorrow they will roll)
  are shown first and marked "left from today".
- A **pick list** beside the plan (below it on phones): this week's list for
  the week containing the day (week tasks not yet given a day, rolled ones
  first), then open tasks of active achievements, grouped by area and
  achievement, collapsed by default. **(my call: the owner said "pick out
  from the week's tasks"; active achievements are a useful second source)**
  Each row has "Add to Work" / "Add to Spare time" buttons.
- "New task" per section opens the create dialog with When = that day and
  that section.
- A **Done planning** button marks the day as planned (a `day_plans` row) and
  returns to Today. The reminder skips planned days. Adding or moving any
  item into the day also counts as planning it. **(my call)**
- A day switcher (‹ day ›) lets the owner plan any day.

### 6. Week (`/week?start=YYYY-MM-DD`, default this week)

- Seven day columns on desktop (a list of days on phones), each showing that
  day's items as on Today (read-mostly: tick, open the day in the planner).
- **This week's list**: week tasks without a day, rolled ones first, each
  with "Give it a day" (a day menu) and "Add" (create dialog with When = this
  week).
- ‹ previous / next › week.

### 7. Goals and the Sunday review

- New `goals` table: title, notes, `deadline` (optional date), `status`
  (`active` | `done`), `sort_key`, standard columns (owner, soft delete).
  `achievements.goal_id` (nullable) links an achievement to at most one goal.
  **(my call: one goal per achievement keeps progress unambiguous)**
- **Goals page** (`/goals`): active goals in the owner's order, then done.
  Each card: title, deadline with days left (coloured as deadlines are now),
  and progress: achievements done / linked, and tasks done / total across
  them.
- **Goal page** (`/goals/[id]`): title and notes (inline edit), deadline,
  status, delete; its linked achievements, each with its area, status and
  task progress, linking to the achievement; **Link achievement** (a search
  list of all live achievements across areas) and unlink. An achievement's
  header gains a **Goal** chip to link it from that side.
- **Sunday review** (`/review`): "Plan your week".
  - Which week: the coming week when today is the last day of the owner's
    week, otherwise the current week; ‹ › to change. **(my call)**
  - Last week in one line: tasks done, tasks rolled over.
  - Each active goal, by the owner's order: deadline and days left,
    progress, and the open one-off tasks of its linked unfinished
    achievements with **Add to week** and a day menu. Tasks already planned
    show where.
  - The chosen week's list and days, as on Week, so the owner sees the
    result.
- On the review page, "Achievements with no goal" is a collapsed section at
  the end with the same picking, so nothing is unreachable. **(my call)**

### 8. Targets ("fixed amount" tasks)

- A one-off task may have a **target**: `target_amount` (positive number) and
  `target_unit` (`times` | `hours` | `pages` | `lessons`, or a custom word up
  to 20 characters). **(my call: a short fixed list plus free text)**
- Progress is the sum of the task's practice entries: `hours` sums
  `duration_seconds`; any other unit sums a new `practice_entries.amount`
  column.
- **Log progress**: on Today, the planner and the achievement's task list, a
  target task shows "34 / 100 times" with a progress bar and a **+** button.
  `+` opens a small popover: an amount (default 1; for hours, minutes) and an
  optional note. It records a practice entry. When progress reaches the
  target, the same action completes the task (one undo step undoes both).
- The create dialog and the task row gain a **Target** chip.
- Targets cannot be combined with a repeat rule.

### 9. Evening reminder

- Settings → **Evening reminder**: on/off and a time (default 21:00).
  Turning it on asks for notification permission and subscribes this device
  with Web Push. Several devices may subscribe. A "Send a test" button.
- A push-only service worker (`/sw.js`) shows the notification ("Plan
  tomorrow" / "Tomorrow isn't planned yet.") and opens `/plan` when tapped.
  There is still no offline mode.
- Sending: a scheduled job every 15 minutes (GitHub Actions, as the purge
  and backup jobs already are) runs a script against production. For each
  owner with the reminder on, when their local time is at or past the
  reminder time (and before midnight), tomorrow has no `day_plans` row, and
  no reminder was sent today: send to every subscription, record the send
  date, and delete subscriptions the push service reports gone (404/410).
  **(my call: Vercel's Hobby cron runs once a day; Actions already holds the
  production secrets. Delivery can lag by up to ~15–30 minutes.)**
- VAPID keys: generated once, the private key stored only as a GitHub
  production secret, the public key as a Vercel environment variable read on
  the server. Neither is printed.
- On iPhone, Web Push works only for the app added to the Home Screen
  (iOS 16.4+). The owner verifies this on their phone; that also completes
  the open PWA roadmap item.

### 10. Navigation

- Sidebar main links: **Today**, Week, Goals, Review, Areas (the overview),
  Active, Search, Inbox; the area list; Settings and History at the bottom,
  as now.
- Phone tab bar: **Today**, Areas, Capture, Week, Search. Settings moves to
  a gear button in the Areas page header on phones; Goals and Review are
  links in the Week page header. **(my call)**
- The command palette gains jumps to Today, Plan tomorrow, Week, Goals,
  Review and to each goal.

### 11. AI access (MCP)

New or extended tools, each one domain action as now: `get_day` (a day's
plan with rolled items), `get_week`, `plan_task` (set a task's day/week,
section and position, or clear it), `create_tasks`/`update_task` accept plan
and target fields and `achievementId: null` with a plan for loose tasks,
`log_progress`, `list_goals`, `get_goal`, `create_goal`, `update_goal`,
`link_achievement_to_goal`.

### 12. Safety net and data

- Every mutation records history and is undoable, as now: plan changes are
  task updates; goals are a new entity type (`goal`). Deleting a goal unlinks
  its achievements in the same batch, so undo relinks them.
- `day_plans` (owner, day, unique) is bookkeeping for the reminder, not the
  owner's content: no history. Reminder settings and push subscriptions are
  not undoable either. **(my call)**
- Export includes goals, `day_plans` is left out; the purge job purges
  soft-deleted goals like other entities.
- Migration: additive columns and tables only.

## Settled after the builder check (my calls)

1. **Which repeating tasks a day shows:** live repeating tasks due that day
   (by `isDueOn`, which also respects the end) that are either **loose** (no
   achievement) or under an **active** achievement in a live area, the same
   rule the Active page uses. Backlog and done achievements' routines stay
   off Today. A loose repeating task is never in the Inbox (its rule is its
   "when"). The Inbox is: loose, no plan, no repeat rule, not completed.
2. **Moving a rolled task adopts it:** dragging it, or moving it to a
   section, writes `planned_on` to the day shown (and the new section and
   key); it loses its "from Tue" mark. Until moved, rolled tasks sit at the
   top of their section, oldest planned day first, then by their own key.
   "Done planning" writes only the `day_plans` row.
3. **Ticking on other days:** one-off tasks can be ticked on any day's list
   (completing them is not tied to a date). Repeating tasks can only be
   ticked on today's list; on other days their checkbox is disabled with
   "Only today". The completion actions stay as they are.
4. **Ordering:** a repeating task's standing key and the day's one-off keys
   share one key space per section; moving either writes a key between its
   new neighbours.
5. **Undo** never touches `day_plans`.

## Non-goals

- Clock times or calendar slots; reminders other than the evening one.
- Behaviour trackers (separate PR, next).
- Per-day exceptions for repeating tasks (skip just Tuesday).
- A "never miss twice" streak rule and minimum versions of habits (from the
  research write-up; later).
- Offline support.

## Anti-goals

- Today showing goals, deadlines or anything that is not for today.
- Planning taking more than a few minutes.
- Tasks silently disappearing: an unfinished task must always be findable
  (rolled forward, in a week list, under its achievement or in the Inbox).
- A reminder that fires when tomorrow is already planned, or more than once
  an evening.

## Left to the builder

Component structure, exact copy beyond what is quoted, query shapes, loading
placeholders (follow M6.1: every new page gets a layout-shaped placeholder),
and the exact look, which follows the existing visual style and the create
dialog's chips.
