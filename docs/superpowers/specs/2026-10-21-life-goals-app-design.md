# Life Goals App — Design

Date: 2026-10-21
Status: Draft, awaiting owner approval

## Intent and the why

A personal app for working toward life goals, owned and used by one person.
The owner wants to build skill across several parts of life (guitar,
singing, Irish flute, learning DAWs) and to work through a ladder of
challenges to overcome social anxiety and build confidence. Today none of
this is tracked anywhere.

The structure borrows from managing a software project in Linear (areas
contain achievements, achievements contain tasks), but this is **not** a
Linear clone: no team, no sprints, no workflow ceremony. Linear was an
analogy for the structure only.

The single biggest risk to the app's success, in the owner's words: they
would abandon it if "transferring my ideas and managing the areas is not
straightforward and painful." Fast, low-friction capture and reorganising is
the top priority, ahead of feature breadth.

This is the first, primary feature of a personal app that may grow into
other personal features later.

## Goals

1. Model life goals as **Areas → Achievements → Tasks**.
2. Make getting ideas in and moving them around fast and painless.
3. Work fully in a desktop browser and on a phone, with full feature parity.
4. Only the owner can access it.
5. Let any AI assistant (Claude, ChatGPT, Cursor, etc.) refine ideas with the
   owner and act on the app, via an MCP server.
6. Leave a clean extension point so future self-built tools (a metronome, a
   chord/arpeggio trainer) can live in the app and log progress against tasks.

## Non-goals (for this version)

- Multiple users, sharing, or teams.
- Offline use. The app requires a connection.
- Native iOS/Android apps or app-store distribution.
- Celebrations/animations on completion. A quiet check mark only, for now.
- A built-in chat panel inside the app. AI interaction goes through MCP from
  the owner's AI app of choice. (May be added later on top of the same
  actions.)
- Building the metronome / chord trainer / other tools themselves. Only the
  extension point they will plug into.

## Anti-goals (would make this a failure even if it technically works)

- Adding or reorganising things takes many clicks, forms, or page loads.
- An AI makes a bad change that can't be easily undone.
- Anyone other than the owner can read or change the data, by any route
  (web UI, API, or MCP).
- The phone experience is a cramped afterthought of the desktop one.

## Constraints

- One owner account. Sign-ups are disabled; there is no way for anyone else
  to create an account.
- The web UI and the MCP server must perform the **same actions** through
  one shared domain layer, so the screens and the AI can never drift apart.
- Hosting should fit comfortably on free tiers for a single user.

## Decided: what the app holds

### Area
Examples: Guitar, Singing, Irish flute, DAWs, Social confidence.

- Name, emoji, cover (color/gradient or image), optional short description.
- A **level** and **XP bar**, driven by XP earned from completed tasks inside
  the area.
- A **streak**: consecutive days on which at least one task in the area was
  completed, including each completion of a repeating task. *(Later,
  practice-log entries from integrated tools could also count.)*
- Trophies: completed achievements are shown as trophies in their area.

### Achievement
A capability the owner wants to have. Examples: "Sweep pick effortlessly",
"Spot which mode fits a progression", "Feel at ease talking to strangers".

- Title, notes.
- Status: **Backlog → Active → Done**.
- **Optional** deadline. Backlog items commonly have none.
- Progress derived from its tasks ("2 of 5").
- Manually orderable within its status column.

### Task
A concrete step. Examples: "3-string arpeggio @ 120 bpm clean", "Ask a
stranger for a recommendation".

- Title, optional notes.
- Done / not done.
- **Optional** deadline.
- **Effort level** on a 1–5 scale: Trivial, Easy, Medium, Hard, Brutal.
  *(Scale and labels are my call.)* Effort determines the XP the task awards
  when completed; higher effort is worth substantially more XP.
- **Categories**: any number of colored tags.
- Manually orderable within its achievement (supports challenge ladders,
  easiest → hardest).

### Repeating tasks
Some tasks are ongoing practice rather than one-off milestones, e.g.
"15 min scales every day" or "one social exposure per week".

- A task can be one-off (default) or **repeating**.
- A repeating task has a cadence (e.g. daily, weekly, specific weekdays)
  and either **repeats indefinitely** or **ends** after a set period or on
  a date (e.g. "every day for one week").
- Each completion is recorded separately and **awards XP each time**, and
  counts toward the area's streak.
- An achievement's progress ("2 of 5") counts only one-off tasks; a
  repeating task shows its own completion record instead. *(My call.)*

### Inbox
Ideas often arrive before the owner knows where they belong.

- Tasks and achievements can be saved with **no parent**, landing in an
  **Inbox**. Capture never forces the owner to pick an area or achievement.
- From the Inbox, items are filed into an area/achievement later by drag
  or a quick "move to…" action (and via MCP).
- Inbox items award no XP to any area until filed. *(My call.)*

### Categories
- One **shared, global pool** of categories (e.g. Technique, Theory,
  Repertoire, Exposure). Any category can be used on any task in any area.
- In practice they will mostly be used within one area, so when picking
  categories the UI suggests ones already used in the current area first.

## Decided: screens and feel

### Visual style
A blend of two directions the owner picked:

- **Notion/Trello personality:** each area has a cover, emoji, and colored
  tags/status chips, so each area feels distinct.
- **Duolingo/Habitica game-style progress:** levels, XP bars, streaks,
  trophies.

Light, friendly palette (the approved overview mockup uses a soft lavender
background, white rounded cards, purple accent). Dark mode is a builder's
call.

### Home: overview of all areas (approved mockup)
- **Desktop:** a summary strip (active achievements count, due this week,
  best streak), then a grid of area cards. Each card: cover + emoji, name,
  level badge, XP bar, counts (active / backlog / trophies / streak), and
  the "up next" task with its deadline if any. A "+ New area" tile.
- **Phone:** the same areas as a compact list (emoji tile, name, level, XP
  bar, key stats), with a bottom tab bar: Areas, Active, Search, Settings.
- A **+ Capture** button available everywhere for quick entry. Captures go
  to the current area/achievement if the owner is inside one, otherwise to
  the Inbox. *(My call.)*
- The Inbox is reachable from the overview (with an unsorted-count badge)
  on both desktop and phone. *(Placement is the builder's call.)*

### Area view
- **Desktop:** a board with Backlog / Active / Done columns. Achievements
  are cards (title, task progress, deadline, categories); drag between
  columns and reorder within them.
- **Phone:** a list grouped by status (Active, Backlog, Done), each row
  showing title, progress, deadline.
- Either view may be switchable on either device; the defaults above are
  what the owner asked for.
- Opening an achievement shows its tasks as a checklist with inline add,
  reorder, effort, categories, and deadline.

### "Active" tab (phone) / equivalent on desktop
Everything currently Active or due soon across all areas. *(Exact contents
are the builder's call; the mockup's tab bar implies it.)*

### Completing a task
A quiet check mark. XP, level, streak and progress update without fanfare.

## Decided: AI access (MCP)

- The app exposes an **MCP server** that any MCP-capable AI client can
  connect to (Claude apps, ChatGPT, Cursor, etc.).
- Its tools are the app's actions: list/read areas, achievements and tasks;
  create, edit, reorder, move between statuses, complete, delete; manage
  categories. The intended use: the owner brainstorms with an AI ("help me
  build a ladder of 15 social challenges, easiest first"), then has the AI
  put the result into the app.
- **Only the owner can connect.** Connecting an AI client sends the owner
  through a login to their app (OAuth, per the MCP authorization spec);
  nobody else can authorise a connection even if they know the URL.
- MCP is built **after** the core app, on top of the same domain actions
  the UI uses.

## Decided: safety net

- Every change is recorded in a **history**: what changed, when, and
  whether it came from the owner in the UI or from an AI via MCP (and which
  client).
- Changes can be **undone** from the history. A bad AI edit should be a
  two-second fix.

## Decided: extension point for future tools

Future in-app tools (metronome, arpeggio/chord trainer, …) will help with a
specific task and **log what was done against it**, e.g. "practiced
sweeping 20 min, reached 95 bpm". This version must include a place for
such entries to attach to a task (a practice/activity log), even if the
only way to add an entry now is manually or via MCP, so tools can plug in
later without reworking the data model.

## How it gets made (my calls; the owner had no stack preference)

Full detail (stack, data model, testing, CI/CD, deployment, updates) is in
[2026-10-22-life-goals-app-technical-design.md](2026-10-22-life-goals-app-technical-design.md);
progress is tracked in [docs/ROADMAP.md](../../ROADMAP.md). Summary:

- **One web app**, responsive, installable to the phone's home screen
  (PWA). One codebase for desktop and phone.
- **Next.js + TypeScript.**
- **Supabase** for Postgres database and authentication. Owner signs in with
  email and/or Google; public sign-ups disabled; data access locked to the
  owner at the database level as well as in the app.
- **Vercel** for hosting.
- **MCP server** hosted as part of the same app, using the official MCP
  TypeScript SDK, with OAuth tied to the same owner login.

## Left to the builder

- Data model details, IDs, and schema.
- XP values per effort level and the level curve.
- Exact streak rules (time zone, what counts).
- How undo is implemented (event log vs. snapshots), and how far back.
- Keyboard shortcuts, command palette, and other capture accelerators,
  in service of the "fast and painless" goal.
- Whether the capture button defaults to a task, an achievement, or asks.
- Exact repeat-cadence options and how missed occurrences are shown.
- Dark mode, exact palette, typography, icons.
- Drag-and-drop library, UI component library, state management.
- Testing strategy and CI.
- How the MCP OAuth flow is implemented (e.g. Supabase's OAuth server
  support vs. a small custom authorization server), as long as only the
  owner can authorise a client.
