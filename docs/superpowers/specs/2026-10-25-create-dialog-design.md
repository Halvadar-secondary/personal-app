# Create dialog: design

Date: 2026-10-25. Status: approved by the owner 2026-10-25 (mockup reviewed in the
visual companion).

## Why

Adding an achievement or a task is a bare text field ("+ Add achievement" on
each board column, "+ Add task" under an achievement's task list). The owner
finds this "way too plain" and does not want a text input there at all. They
want a dialog in the style of Linear's "New issue" dialog. Capture (the
Capture button and the **C** shortcut, a one-line dialog that already files
into the current page's context) becomes that same dialog.

Success: creating anything feels deliberate and rich (title, notes and
properties set in one place) while staying fast for adding several items in
a row.

## What the owner decided

1. **A Linear-style dialog** replaces the inline add fields. Layout, as in the
   approved mockup (`.superpowers/brainstorm/*/content/dialog-direction.html`):
   - top line: a breadcrumb of where the item will go (area › achievement ›
     "New task", or area › "New achievement"), and a close ✕;
   - a large borderless title field, placeholder "Task title" /
     "Achievement title";
   - a borderless notes field under it ("Add notes…");
   - a row of property chips; unset chips are outlined and name the property,
     set chips are tinted (accent background, primary text) and show the value;
   - a footer with a "Create more" toggle and the primary button
     ("Create task" / "Create achievement") showing its shortcut, Ctrl+Enter
     (⌘+Enter on Mac).
2. **Task chips:** Effort, Deadline, Repeat, Categories (one chip per chosen
   category with its colour dot, plus "＋ Category").
   **Achievement chips:** Status (Backlog / Active / Done), Deadline.
3. **The breadcrumb is clickable** and moves the new item elsewhere before it
   is created: a task to another achievement or to the Inbox; an achievement
   to another area or to the Inbox (no area).
4. **"Create more":** when on, saving clears the title and notes, keeps the
   destination and chips, and keeps the dialog open with focus in the title.
   When off, saving closes the dialog.
5. **The plain text inputs disappear.** "+ Add task" and "+ Add achievement"
   become buttons that open the dialog. No inline quick-add field remains.
6. **Capture becomes this dialog.** The Capture button (sidebar, tab bar,
   page headers) and the **C** shortcut open it. A Task / Achievement switch at
   the top chooses the kind. The destination comes from the page you are on,
   as Capture does today:
   - achievement page → Task, in that achievement;
   - area page → Achievement, in that area (tasks always belong to an
     achievement or the Inbox);
   - anywhere else → Task, in the Inbox.
   The "!" prefix that made an achievement in the old Capture field goes away;
   the switch replaces it.

## Calls I made (the owner can overturn any)

- **Board column buttons preset Status** to that column (Backlog, Active,
  Done) and the destination to that area.
- **On phones** the dialog is a full-screen sheet; chips wrap and stay
  tappable; the primary button sits at the bottom within thumb reach.
- **Editing is unchanged.** Existing items keep their edit-in-place behaviour;
  the dialog is for creating only.
- **Chips reuse the existing pickers** (effort, date, recurrence, category)
  so values and wording match the rest of the app.
- **The switch is always shown** (including from "+ New task" and the board
  column buttons, which only preset it). Flipping it recomputes the
  destination with these rules, and the breadcrumb always shows the result
  so nothing is filed out of sight:

  | Page | Task goes to | Achievement goes to |
  |---|---|---|
  | Achievement page | that achievement | its area (as today's "!" capture) |
  | Area page / board column | the Inbox | that area (column's status preset) |
  | Anywhere else | the Inbox | the Inbox (no area) |

  A destination picked by hand in the breadcrumb sticks while the dialog is
  open, unless it can't hold the new kind (a task can't go straight into an
  area), in which case the table applies again.
- **Which kind opens:** the page decides on achievement pages (Task) and area
  pages (Achievement); the buttons decide when used. Only on pages without a
  context (overview, Active, Inbox, search, settings, history) does the
  dialog open with the kind used last. "Create more" is remembered too. Both
  are kept in this browser only (local storage), not synced.
- **Closing with content:** Escape, a click outside, and the ✕ all close
  straight away when the title and notes are empty, and ask "Discard this
  task?" (or achievement) when either has text. Chips alone don't count.
- **Empty title:** the create button is disabled; Ctrl+Enter does nothing.
- **Errors** show inside the dialog (as Capture does today), and the typed
  content stays; success with "Create more" off shows the usual toast.
- **One save, one undo:** a task with categories is created and categorised
  in one recorded batch, so Undo removes it whole.

## Goals

- Every way of creating a task or achievement in the UI goes through this one
  dialog.
- Fast repeat entry: open with C, type, Ctrl+Enter, type, Ctrl+Enter.
- Keyboard-complete: every chip reachable with Tab and operable without a
  mouse; Escape closes (asking first when the title or notes hold text).
- Works in light and dark mode, at phone width, and passes axe.

## Non-goals

- Editing existing items in the dialog.
- New properties (priority, assignee, labels beyond categories).
- Creating areas (the "New area" flow stays as it is).
- Changing what the AI (MCP) tools can do.

## Anti-goals

- Making a single quick task slower to add than today: C → title →
  Ctrl+Enter must be all it takes.
- Losing typed text: on an error, or by closing the dialog with an accidental
  click outside it.
- A dialog that scrolls sideways or hides the create button behind the phone
  keyboard.

## Constraints

- Next 16 / React 19 app; existing dialog, popover and picker components
  (shadcn-style, `src/components/ui`); colour tokens in `globals.css`.
- Server actions already accept every field: `createTask` (title, notes,
  effort, deadline, recurrence), `setTaskCategories`, `createAchievement`
  (area, title, notes, status, deadline). Whether to add a combined
  "create task with categories" action for a single undo batch is the
  builder's call (see "One save, one undo").
- The existing Capture context logic (route → destination) and its
  destination name (`CaptureDestination`) carry over.
- E2E tests that create items through the old fields (`addAchievements`,
  "Add task" in specs) must move to the dialog.

## Left to the builder

- Component structure, file names, and how the dialog state is shared.
- Exact spacing, sizes and animation, within the mockup's look.
- The destination picker's form (a searchable list of areas and
  achievements is the natural fit; the command palette's list is a
  precedent).
