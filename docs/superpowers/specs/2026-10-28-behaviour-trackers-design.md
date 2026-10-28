# Behaviour trackers: design

Date: 2026-10-28. Status: scoped by Claude on the owner's request ("scope out
the behavior tracking separately and start working on it in a separate PR …
I don't want any back and forth"). Every decision below is **my call** unless
quoted from the owner; the PR lists them for review.

## Why

The owner wants to "monitor/track more general behaviors like negative
thinking patterns / anger management / being kinder" and said "I don't know
how these can play into the app yet". These are not tasks: they never get
finished. The research write-up behind the app
(https://claude.ai/artifact/9Xssb8kAU46tR3BfuJ96Hy) points at two things that
make this useful:

- **Self-monitoring changes behaviour.** Writing down each time a behaviour
  happens is itself one of the better-supported ways to change it (it is the
  core of CBT thought records and habit-reversal training).
- **Slip notes stop spirals.** Writing a slip as a situation ("tired, the
  client email") rather than as a trait ("I'm hopeless") is what keeps a
  lapse from becoming a relapse. A short note with each moment trains that.

Success: logging a moment takes under ten seconds from Today, and on Sunday
the owner sees, per tracker, whether it happened more or less than last week
and what the notes say.

## What gets built

### Trackers

- A **tracker** is a behaviour to watch: name (1–60 chars), optional emoji,
  and a **direction**: *less* (negative thinking, anger: fewer is better) or
  *more* (kindness: more is better). Direction only colours the trend.
- Trackers are ordered by the owner, can be renamed, and **archived** (kept
  with their history, hidden from logging) or deleted (soft, undoable).
- Seed nothing; the empty state suggests "Negative thinking", "Anger",
  "Kindness" as one-tap starters.

### Moments

- A **moment** is one occurrence: tracker, when (defaults to now; editable
  to an earlier time today or a past day), optional **intensity** 1–5, and an
  optional **note** (up to 1,000 chars) with the placeholder "What was
  happening?".
- Logging is one tap plus an optional detail step: on Today, a row of
  tracker chips ("+ 😠 Anger"); tapping one opens a small popover with
  intensity dots and the note field, and **Log** (Enter) saves. Logging
  with no detail is one tap + Log.
- A toast confirms ("Logged anger") with Undo.

### Trackers page (`/trackers`)

- One card per active tracker: this week's count vs last week's (arrow and
  colour by direction), average intensity, and an 8-week bar chart of weekly
  counts (owner's week start, owner's time zone).
- Below, the tracker's recent moments (newest first, 20, "Show more"): time,
  intensity, note; each deletable (undoable).
- Manage: add, rename, change emoji/direction, reorder (up/down menu
  items), archive/unarchive, delete. Archived trackers are listed at the
  bottom, collapsed.

### Sunday review

- A **Patterns** section on `/review` for the reviewed week's previous week:
  each active tracker's count vs the week before, and its notes from that
  week, so the owner can spot triggers while planning.

### Today

- The tracker chips sit in a slim strip under Today's header ("Log a
  moment"), only when at least one active tracker exists. They are the only
  non-task thing on Today; logging is about today, so it fits the "Today is
  only today" rule.

### AI access (MCP)

`list_trackers` (with this/last week counts), `log_moment` (trackerId,
optional at/intensity/note), `get_tracker` (recent moments and weekly
counts), `create_tracker`. Deleting goes through `delete_item` with kind
`tracker`.

### Safety net and data

- Tables `trackers` (standard columns, name, emoji, direction enum
  `less|more`, archived_at, sort_key) and `tracker_moments` (standard
  columns, tracker_id, at timestamptz, intensity smallint 1–5 null, note).
- Every change records history and is undoable (entity types `tracker`,
  `tracker_moment`); deleting a tracker soft-deletes its moments in the same
  batch. Export includes both; purge removes them like other entities.
- Weekly counts are computed in the owner's time zone and week start.

## Settled after the builder check (my calls)

These override the sections above where they differ.

1. **No strip on Today.** The owner said "Today shows only what is to be
   done today"; logging a behaviour isn't. Logging lives in the **Capture
   dialog** instead (one tap from every page, C on a keyboard): its Kind
   switch gains **Moment** beside Task and Achievement. A moment shows
   tracker chips (radio, the last used one preselected), intensity 1–5
   (optional, tap again to clear), the Notes field as "What was
   happening?", a **When** chip ("Now" by default; "Earlier…" opens a
   date-time input that can't be in the future), and **Log moment**
   (Ctrl/⌘+Enter). With no active trackers it says so and links to
   /trackers. "Create more" works for moments too.
2. **Moments aren't edited.** Delete (with Undo) and log again. MCP
    takes an optional The AT command has been deprecated. Please use schtasks.exe instead.

The request is not supported..
3. **Fair trends.** The Trackers page compares **this week so far** with
   **last week up to the same moment** (same weekday and time). The review's
   Patterns compares whole weeks (the week before the one being planned,
   with the week before that), the same week  uses.
4. **Navigation.** Sidebar "Trackers" after Review; a "Trackers" link in
   the Week page header (phones reach Goals and Review the same way);
   command palette entry.
5. Smaller: a trend in the wrong direction is neutral-coloured, never red;
   moments aren't searchable; logging to an archived tracker is refused;
   undoing a tracker delete restores only that batch's moments; integrity
   checks cover tracker → moment.

## Non-goals

- Reminders to log, streaks or XP for trackers (counting a bad behaviour
  must never feel like a game to win or lose).
- Mood tracking or daily ratings (a moment is an event, not a score).
- Charts beyond the 8-week bars.

## Anti-goals

- Logging that takes more than a couple of taps.
- Shaming language: no "failed", no red "streak broken". Trends read
  "3 fewer than last week" / "2 more than last week".
- Trackers crowding Today: one strip, collapsible, nothing else.

## Left to the builder

Component structure, exact layout and colours (existing tokens), query
shapes, loading placeholders (M6.1 rule), copy not quoted here.
