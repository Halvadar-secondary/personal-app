# Create Dialog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One Linear-style "new item" dialog creates every task and achievement in the UI, replacing the inline "+ Add …" fields and the one-line Capture dialog.

**Architecture:** A new domain action `createItem` saves a task (with its categories) or an achievement in one recorded batch; a read `getCreateOptions` feeds the dialog's destination list, categories and the owner's date. The existing capture context grows into the dialog's state (open, preset, page context registered by the area and achievement pages). Pure rules (destination per kind, remembered preferences) live in a small tested module; the dialog itself is one client component mounted once in the app layout, opened by C, the Capture buttons, and the new "Add task" / "Add achievement" buttons.

**Tech Stack:** Next 16.4 (cacheComponents), React 19.3, Tailwind 4, Radix (via `radix-ui`) dialog/popover/dropdown, cmdk (`@/components/ui/command`), Drizzle, Vitest (unit/db/dom projects), Playwright (desktop + phone).

**Spec:** `docs/superpowers/specs/2026-10-25-create-dialog-design.md`

## Global Constraints

- Every way of creating a task or achievement in the UI goes through this one dialog; no inline quick-add field remains.
- C → title → Ctrl+Enter must be all it takes (never slower than today).
- Create button copy: "Create task" / "Create achievement", showing "Ctrl ↵" (⌘ ↵ on Mac).
- Placeholders: "Task title" / "Achievement title"; notes "Add notes…".
- Task chips: Effort, Deadline, Repeat, Categories ("＋ Category" plus one chip per chosen category with its colour dot). Achievement chips: Status (Backlog / Active / Done), Deadline.
- Unset chips outlined and naming the property; set chips tinted (`bg-accent`, `text-primary`, accent border).
- "Create more": on → save clears title and notes, keeps destination and chips, stays open with focus in the title; off → save closes and shows the usual toast.
- Close with text in title or notes asks "Discard this task?" / "Discard this achievement?"; chips alone don't count.
- Empty title: create disabled, Ctrl+Enter does nothing. Errors show inside the dialog; typed content stays.
- Kind and "Create more" remembered in local storage only, wrapped in try/catch (the app must work without it).
- Phones (below `md`): full-screen sheet, chips wrap, create button at the bottom.
- Editing existing items, the MCP tools (`captureItem` stays), and "New area" are unchanged.
- Light and dark mode, phone width with no sideways scroll, axe clean.

## Review Focus

1. Opening on a page whose context hasn't registered yet (the first frame after navigation) — the dialog must still file correctly once registered, never into a stale page's achievement after navigating away.
2. Destination picked by hand, then the kind flipped — kept when it can hold the new kind, otherwise the table applies; the breadcrumb always matches what is saved.
3. Double submit (Ctrl+Enter pressed twice, or Enter then click) — exactly one item is created.
4. Escape while a chip's popover is open — closes the popover only, not the dialog (and never discards typed text).
5. Local storage throwing or holding junk — the dialog opens with defaults.

Each of these has a test in the owning task (Tasks 2, 5).

---

### Task 1: `createItem` and `getCreateOptions`

**Files:**
- Create: `src/server/domain/create.ts`, `src/server/domain/create.db.test.ts`, `src/server/actions/create.ts`

**Interfaces:**
- Produces:
  - `createItem` (defineAction), input a `z.discriminatedUnion("kind", …)`:
    - `{ kind: "task", achievementId: uuid | null, ...zTaskFields, categoryIds: uuid[] (max 20, unique, default []) }`
    - `{ kind: "achievement", areaId: uuid | null, title, notes, status (default "backlog"), deadline }`
    - output `{ kind: "task" | "achievement"; id: string }`. Task: `callAction(createTask)` then, only when `categoryIds` is non-empty, `callAction(setTaskCategories)`. Achievement: `callAction(createAchievement)`.
  - `getCreateOptions` (defineAction), input `{ areaId?: uuid }`, output `{ targets: FilingArea[]; categories: PickerCategory-shaped rows (listCategories output); today: string }` — `targets` from `listFilingTargets`, `categories` from `listCategories({ areaId })`, `today = localDate(ctx.now(), ctx.timeZone)`.
  - `createItemAction(input)` → `act(createItem, input, (o) => o)`; `createOptionsAction(input)` → `read(getCreateOptions, input)` (a read: no refresh), both in `src/server/actions/create.ts` (`"use server"`).

- [ ] **Step 1: Write the failing tests** in `create.db.test.ts` (setup as in `inbox.db.test.ts`: area "Guitar", active achievement "Sweep"):
  - `"a task lands in its achievement with every field"`: run `createItem` `{kind:"task", achievementId: sweep, title:"Sweeps", notes:"slow", effort:3, deadline:"2026-11-01", recurrence: daily}` → the task row has those values and `areaId === guitar`.
  - `"a task with categories is one batch, and undo removes it whole"`: create a category, run with a fixed `batchId` and `categoryIds:[cat]`; the task's categories equal `[cat]`; every history event for the task and `task_categories` shares that batchId; `undoBatch` on it leaves the task deleted (soft) and no live task categories.
  - `"a task with no achievement goes to the Inbox"` → `achievementId` and `areaId` null.
  - `"an achievement takes its area, status and deadline"`: `{kind:"achievement", areaId: guitar, title:"Arpeggios", status:"active", deadline:"2026-12-01"}` → row matches.
  - `"an achievement with no area goes to the Inbox"`.
  - `"a blank title is refused"`: `title:"  "` rejects with DomainError `invalid_input`.
  - `"getCreateOptions lists areas with unfinished achievements, categories and today"`: `targets[0].achievements` contains Sweep; a done achievement is absent; `today` matches `/^\d{4}-\d{2}-\d{2}$/`.

- [ ] **Step 2: Run** `pnpm vitest run --project db src/server/domain/create.db.test.ts` — Expected: FAIL, cannot resolve `./create`.
- [ ] **Step 3: Implement** `create.ts` and `actions/create.ts` per the Interfaces block.
- [ ] **Step 4: Run** the same command — Expected: 7 passed.
- [ ] **Step 5: Commit** `feat(domain): createItem saves a task with its categories, or an achievement, in one batch`

### Task 2: Destination rules and remembered preferences

**Files:**
- Create: `src/components/app/create-rules.ts`, `src/components/app/create-rules.test.ts`

**Interfaces:**
- Produces:
  - `type Kind = "task" | "achievement"`
  - `type PageContext = { area: NavArea | null; achievement?: { id: string; title: string } } | null` (`NavArea` from `@/server/domain/views`; `area` is null for an achievement still in the Inbox)
  - `type Destination = { area: NavArea | null; achievement: { id: string; title: string } | null }` — both null is the Inbox.
  - `defaultDestination(kind: Kind, page: PageContext): Destination` — the spec's table: achievement page → task: that achievement (and its area); achievement: its area (the Inbox when it has none). Area page → task: Inbox; achievement: that area. No page → Inbox.
  - `destinationFor(kind: Kind, current: Destination, picked: boolean, page: PageContext): Destination` — a hand-picked destination is kept if it can hold `kind` (task: Inbox or an achievement; achievement: Inbox or an area with no achievement); otherwise `defaultDestination`. When the kept destination is a task's achievement and `kind` becomes "achievement", it is not kept (table applies).
  - `kindForPage(page: PageContext, last: Kind): Kind` — achievement page → "task"; area page → "achievement"; none → `last`.
  - `loadPrefs(storage?: Pick<Storage, "getItem">): { kind: Kind; more: boolean }` and `savePrefs(p, storage?)`, key `"create-dialog"`, defaults `{ kind: "task", more: false }`; default argument `globalThis.localStorage`; any throw or invalid JSON/shape → defaults (save swallows errors).

- [ ] **Step 1: Write the failing tests** in `create-rules.test.ts`: one `it.each` over the six cells of the spec's table for `defaultDestination`; `destinationFor` keeps a picked achievement for a task, keeps a picked area for an achievement, drops a picked achievement when flipping to achievement (→ its default), drops a picked area when flipping to task (→ Inbox or the page's achievement); `kindForPage` three cases; `loadPrefs` returns defaults for: a storage whose `getItem` throws, `"not json"`, `'{"kind":"area"}'`, null; round-trip `savePrefs({kind:"achievement", more:true})` → `loadPrefs` equals it; `savePrefs` with a throwing `setItem` doesn't throw.
- [ ] **Step 2: Run** `pnpm vitest run --project unit src/components/app/create-rules.test.ts` — Expected: FAIL, cannot resolve module.
- [ ] **Step 3: Implement** `create-rules.ts`.
- [ ] **Step 4: Run** — Expected: all pass.
- [ ] **Step 5: Commit** `feat(create): destination rules and remembered kind`

### Task 3: Capture context carries the page and a preset

**Files:**
- Modify: `src/components/app/capture-context.tsx`, `src/app/(app)/areas/[id]/page.tsx:28`, `src/app/(app)/achievements/[id]/page.tsx:36`
- Test: `src/components/app/capture-context.dom.test.tsx` (create)

**Interfaces:**
- Consumes: `PageContext`, `Kind` from Task 2.
- Produces (replacing `destination`/`setDestination`; `useCapture` keeps its name so sidebar, tab bar, palette and `CaptureButton`, which call `setOpen(true)`, keep working):
  - `type CreatePreset = { kind?: Kind; status?: "backlog" | "active" | "done" }`
  - `useCapture(): { open: boolean; setOpen(open: boolean): void; preset: CreatePreset; openCreate(preset?: CreatePreset): void; page: PageContext; setPage(page: PageContext): void }` — `setOpen(true)` opens with an empty preset; `openCreate(p)` opens with `p`.
  - `CaptureDestination({ area, achievement? })` — registers `{ area, achievement }` as the page context in an effect, clears to `null` on unmount. Area page passes `area={{ id, name, emoji }}` from `board.area`; achievement page passes `area` = the entry of the `listAreas` result it already reads whose id is `achievement.areaId` (or `null`), and `achievement={{ id, title }}`.

- [ ] **Step 1: Write the failing test** `"a page registers its context and clears it when it goes"`: render a probe showing `JSON.stringify(useCapture().page)` inside `CaptureProvider` with `<CaptureDestination area={…} achievement={…}/>`; assert the probe text contains the achievement id; unmount the destination (rerender without it) → probe shows `null`. And `"openCreate opens with its preset; setOpen(true) clears it"`.
- [ ] **Step 2: Run** `pnpm vitest run --project dom src/components/app/capture-context.dom.test.tsx` — Expected: FAIL (no `page` / `openCreate`).
- [ ] **Step 3: Implement**; update both pages.
- [ ] **Step 4: Run** it, then `pnpm typecheck` — Expected: test passes; typecheck reports only `capture.tsx` (still reading `destination`), fixed in Task 5. If it reports anything else, fix it here.
- [ ] **Step 5: Commit** `feat(create): pages register where new items go`

### Task 4: Pickers as dialog chips

**Files:**
- Create: `src/components/app/chip.ts`
- Modify: `effort-picker.tsx`, `recurrence-picker.tsx`, `category-picker.tsx`; tests in their existing `*.dom.test.tsx`

**Interfaces:**
- Produces:
  - `chipClass(set: boolean): string` in `chip.ts` — the mockup's chip: `inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring`, set → `border-primary/30 bg-accent text-primary`, unset → `border-border text-muted-foreground hover:text-foreground`.
  - `EffortPicker` gains `className?: string` (replaces the trigger's classes via `cn`) and shows "Effort: <label>" when given `className` — simplest: add `prefix?: string` rendered before the label. Aria-label unchanged.
  - `RecurrencePicker` gains `className?: string` and `emptyLabel?: string` (trigger text when there is no rule, e.g. "Repeat").
  - `CategoryPicker` gains `trigger?: React.ReactNode` (rendered via `PopoverTrigger asChild` in place of the tag icon button).
  - Deadline in the dialog is a `DateField` inside a chip (`<label className={chipClass(!!deadline)}>` with a calendar icon, the text "Deadline" when empty) — no change to `DateField`.

- [ ] **Step 1: Write the failing tests**: effort `"with a prefix the chip reads 'Effort: Medium'"`; recurrence `"with no rule the trigger shows its empty label"` (`emptyLabel="Repeat"` → button text "Repeat"); category `"a custom trigger opens the picker"` (render with `trigger={<button>＋ Category</button>}`, click it, the "Find or create" box shows).
- [ ] **Step 2: Run** `pnpm vitest run --project dom src/components/app/effort-picker.dom.test.tsx src/components/app/recurrence-picker.dom.test.tsx src/components/app/category-picker.dom.test.tsx` — Expected: the 3 new tests FAIL, existing ones pass.
- [ ] **Step 3: Implement** the props; existing call sites unchanged.
- [ ] **Step 4: Run** — Expected: all pass.
- [ ] **Step 5: Commit** `feat(pickers): chip triggers for the create dialog`

### Task 5: The create dialog

**Files:**
- Create: `src/components/app/create-dialog.tsx`, `src/components/app/destination-picker.tsx`, `src/components/app/create-dialog.dom.test.tsx`
- Delete: `src/components/app/capture.tsx`, `src/components/app/capture.dom.test.tsx` (its C-key and typing-guard cases move into the new test)
- Modify: `src/app/(app)/layout.tsx` (mount `<CreateDialog />` where `<Capture />` was, same Suspense boundary)

**Interfaces:**
- Consumes: Tasks 1–4 (`createItemAction`, `createOptionsAction`, `create-rules`, `useCapture`, `chipClass`, pickers).
- Produces: `CreateDialog()` (no props).

Behaviour, in the order the test checks it:
- C (no modifier, not typing — keep `isTyping` from `capture.tsx`) and `setOpen(true)` open it. On open: kind = `preset.kind ?? kindForPage(page, prefs.kind)`; destination = `defaultDestination(kind, page)`; status = `preset.status ?? "backlog"`; effort 2; everything else empty; focus in the title; `createOptionsAction({ areaId: destination.area?.id })` starts (chips that need it — Repeat, Categories, the destination list — are disabled until it resolves; title and Create work at once). If the page context changes while the dialog is open and nothing was hand-picked, the destination recomputes.
- Accessible structure: dialog named by a `sr-only` `DialogTitle` "New task" / "New achievement"; a `role="group" aria-label="Kind"` with two `aria-pressed` buttons "Task" / "Achievement"; the breadcrumb button (`DestinationPicker`) whose name is "Destination: <crumbs>" (crumbs: "Inbox", "🎸 Guitar", "🎸 Guitar › Sweep"); title input `aria-label="Title"`, single-line, maxLength 300 (200 for achievements); notes `Textarea` `aria-label="Notes"`, auto-growing; chips; footer `role="switch"` "Create more" (`aria-checked`) and the create button. Use `DialogContent showCloseButton` (✕ named "Close").
- Kind switch: `destinationFor(newKind, dest, picked, page)`; saves prefs `{kind, more}` via `savePrefs`.
- `DestinationPicker({ kind, value, targets, onChange })`: a Popover with a `Command` list — "Inbox" first, then for an achievement each area, for a task each area's unfinished achievements grouped under the area heading. Choosing sets `picked = true`.
- Save (Create button, Ctrl/⌘+Enter anywhere in the dialog, or Enter in the title — plain Enter in the one-line title keeps today's Capture speed; in notes it is a newline): no-op when the trimmed title is empty or a save is in flight (a ref, not only state — Review Focus 3). Calls `createItemAction` directly (not `perform`): a thrown call → message "Couldn't save. Reload the page and try again."; `!ok` → `r.message`; both shown in a `role="alert"` line in the dialog, text kept. Success with Create more on: clear title and notes, keep the rest, focus the title, show "Created “<title>”" in a `role="status"` line. Success with Create more off: close, then `toast("Task created" | "Achievement created", { action: { label: "Undo", onClick: () => undoAction({ batchId }) } })` — reuse the undo path in `use-mutate.ts` by exporting its `undo(batchId)`.
- Close (Escape, outside click, ✕): via `onOpenChange(false)`. When title or notes have text, don't close; show an inline `role="alertdialog"`-free confirm row: "Discard this task?" with buttons "Discard" (closes and resets) and "Keep editing" (focused; returns to the title). Escape inside an open chip popover closes only the popover (Radix does this when the popover handles Escape first — the test pins it).
- Phone sheet: below `md`, `DialogContent` is full-screen (`max-md:inset-0 max-md:h-dvh max-md:max-w-none max-md:translate-none max-md:rounded-none`, flex column, footer `mt-auto` so the button sits at the bottom); `md` and up, `sm:max-w-[620px]`, `top-[15%] translate-y-0`.

- [ ] **Step 1: Write the failing tests** in `create-dialog.dom.test.tsx` (mock `@/server/actions/create`, `@/server/actions/history`, `next/navigation` as the old capture test did; render inside `CaptureProvider` with an optional `CaptureDestination`; a `memoryStorage` helper installed on `globalThis.localStorage` per test):
  - `"C opens a new task bound for the Inbox, title focused"` — dialog "New task", "Destination: Inbox", Title focused; C typed in another input doesn't open it.
  - `"on an achievement page it opens a task there; flipping to Achievement files it in the area"` — "Destination: 🎸 Guitar › Sweep" → click "Achievement" → "Destination: 🎸 Guitar".
  - `"on an area page it opens an achievement in that area"`.
  - `"a preset status from a board column is what gets saved"` — `openCreate({kind:"achievement", status:"active"})` via a probe button, type a title, Ctrl+Enter → `createItemAction` called with `{kind:"achievement", areaId, title, status:"active", …}`.
  - `"Ctrl+Enter with an empty title does nothing; Create is disabled"`.
  - `"Ctrl+Enter twice creates once"` (action resolves on a deferred promise).
  - `"a task sends its effort, deadline, repeat and categories"` — set Effort to Medium, pick a category from the options; saved input contains `effort: 3` and `categoryIds: [id]`.
  - `"with Create more on, saving clears title and notes and keeps the chips"`; `"with it off, saving closes and toasts with Undo"` (mock `sonner`'s `toast`, assert the Undo action calls `undoAction({ batchId })`).
  - `"an error shows in the dialog and keeps the text"` (both `{ok:false,message}` and a rejected call).
  - `"Escape with text asks before discarding; Keep editing keeps it, Discard closes"`; `"Escape with only chips set closes straight away"`; `"Escape in an open picker closes the picker, not the dialog"`.
  - `"a hand-picked achievement survives a flip to task and back only while it can hold the kind"` — pick "Inbox" for a task, flip to achievement → still "Destination: Inbox".
  - `"the kind and Create more are remembered"` — on no page, flip to Achievement, toggle Create more, close; reopen → "New achievement", switch checked. With a throwing storage, it still opens as "New task".
- [ ] **Step 2: Run** `pnpm vitest run --project dom src/components/app/create-dialog.dom.test.tsx` — Expected: FAIL, cannot resolve `./create-dialog`.
- [ ] **Step 3: Implement** `create-dialog.tsx`, `destination-picker.tsx`; swap the layout mount; delete `capture.tsx` and its test.
- [ ] **Step 4: Run** the test, then `pnpm typecheck && pnpm lint` — Expected: all pass, no errors.
- [ ] **Step 5: Commit** `feat(create): the Linear-style create dialog replaces Capture`

### Task 6: Add buttons replace the inline fields

**Files:**
- Modify: `task-list.tsx` (drop the Input, `draftTask`, the `add` op and `createTaskAction` import), `board.tsx`, `status-list.tsx`, `area-board.tsx` (drop `add`/`draftCard` use and `onAdd` props), `board-state.ts` (drop the `add` op and `draftCard` if nothing else uses them)
- Delete: `add-achievement.tsx`
- Test: `task-list.dom.test.tsx`, `board.dom.test.tsx`

**Interfaces:**
- Consumes: `useCapture().openCreate` (Task 3).
- Produces: buttons — under the task list, `Button variant="ghost"` "Add task" (Plus icon) → `openCreate({ kind: "task" })`; in each board column, "Add achievement" with `aria-label="Add achievement to <Backlog|Active|Done>"` → `openCreate({ kind: "achievement", status })`; above the phone status list, "Add achievement" → `openCreate({ kind: "achievement", status: "backlog" })`. Destination comes from the page context the pages already register.

- [ ] **Step 1: Write the failing tests**: task list `"Add task opens the create dialog as a task"` (render inside `CaptureProvider` with a probe of `useCapture()`; click button "Add task" → probe shows open and kind "task"; no textbox named "Add task" exists); board `"a column's Add achievement presets its status"` (click "Add achievement to Active" → preset `{kind:"achievement", status:"active"}`).
- [ ] **Step 2: Run** `pnpm vitest run --project dom src/components/app/task-list.dom.test.tsx src/components/app/board.dom.test.tsx` — Expected: the new tests FAIL.
- [ ] **Step 3: Implement**; delete `add-achievement.tsx`.
- [ ] **Step 4: Run** them, then `pnpm test && pnpm typecheck && pnpm lint` — Expected: all green.
- [ ] **Step 5: Commit** `feat(create): Add task and Add achievement open the dialog`

### Task 7: End-to-end, accessibility and docs

**Files:**
- Modify: `e2e/helpers/app.ts` (`addAchievements`), `e2e/goals.spec.ts`, `e2e/a11y.spec.ts`, `e2e/progress.spec.ts`, `e2e/loading.spec.ts`, `e2e/history-search.spec.ts` (every `getByLabel("Add task")`, "Capture text", dialog "Capture", and "Add achievement" use), `docs/ROADMAP.md`
- Create: `e2e/create-dialog.spec.ts`

**Interfaces:**
- Produces: `addTask(page, title, opts?)` helper in `e2e/helpers/app.ts` (click "Add task", fill Title, Ctrl+Enter, wait for the task row) and `addAchievements` reworked to click the first visible button whose name starts with "Add achievement", fill Title, press `Control+Enter`, wait for the link.

- [ ] **Step 1: Write the failing E2E** `e2e/create-dialog.spec.ts`:
  - `"C, a title and Ctrl+Enter files a task in the Inbox"` — on `/`, press c, type, Control+Enter; the Inbox page lists it.
  - `"a task made in the dialog keeps its notes, effort, repeat and category"` — from an achievement page, fill all, create; the task row shows the category chip and repeat text; reload keeps them.
  - `"Create more adds a run of achievements to a column"` — click "Add achievement to Active", toggle Create more, add three; the Active column lists all three; dialog still open.
  - `"undo removes a task with its categories"` — create with a category, click Undo in the toast; the row is gone.
  - phone project only: `"on a phone the dialog fills the screen and Create stays visible with the keyboard up"` — dialog bounding box equals the viewport width; after focusing Title, the create button is in the viewport.
  - in `a11y.spec.ts`, replace the Capture dialog checks with axe on the open create dialog (task and achievement, light and dark).
- [ ] **Step 2: Run** (build, `pnpm start` in the background, then) `E2E_BASE_URL=http://localhost:3000 pnpm exec playwright test` — Expected: the new spec passes if Tasks 5–6 are right; every spec that still uses the old fields FAILS. Then migrate those specs and the helpers.
- [ ] **Step 3: Run** the full Playwright suite again — Expected: all pass on desktop and phone. Stop the server by its port-3000 PID.
- [ ] **Step 4: Docs** — `docs/ROADMAP.md`: add an "M6.2 — Create dialog" section (the dialog, Capture merged into it, inline fields gone) linking the spec.
- [ ] **Step 5: Commit** `test(e2e): create through the dialog` and `docs: roadmap M6.2 create dialog`
