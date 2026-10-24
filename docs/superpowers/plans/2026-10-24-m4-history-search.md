# M4 History and Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The owner can see every change as a readable history and undo any batch from it. They can find anything by searching, jump anywhere with `Ctrl+K` / `⌘K`, and download all their data as JSON. Refusals on a stale page now refresh it instead of leaving it wrong.

**Architecture:**
- **No schema changes.** History reads the existing `change_events` table, and undo is M1's `undoBatch`, made safer.
- **Server reads:** three new domain reads: `listHistory` (batches with a plain-English summary built by a pure `summarizeBatch`), `search` (`ILIKE` over live rows) and `exportData`. Each is a `defineAction` with db tests.
- **Pages and the export route:** pages use M2's `read()`. Export is an API route behind `requireOwnerApi`.
- **Command palette:** shadcn's `command` component (cmdk). It's mounted once in the app layout and loads its achievement list on open through one small read action.

**Tech Stack:** as M3. **New:** `cmdk`, via `pnpm dlx shadcn@latest add command` (adds `src/components/ui/command.tsx`).

**Spec:**
- Product design: `docs/superpowers/specs/2026-10-21-life-goals-app-design.md`, sections "Decided: safety net", "Home: overview" (tab bar), "Left to the builder" (command palette).
- Technical design: `docs/superpowers/specs/2026-10-22-life-goals-app-technical-design.md`, §5.5 (history and undo, conflict rule, the History panel example), §8 (routes `/search`, `/history`, tab bar, `⌘K`/`Ctrl+K` via `cmdk`), §9.
- Roadmap: `docs/ROADMAP.md` § M4.
- Folded in: two deferred M3 review items, (a) undo hitting a unique constraint and (b) stale-page refusals.

## Global Constraints

- **M2's and M3's Global Constraints hold:**
  - `act()` / `read()` only; `requireOwner()` first.
  - `<Suspense>` around runtime reads; no `"use cache"` on owner data.
  - The domain boundary rule; the ≥90% line gate.
  - Mockup tokens; the `md` breakpoint; no horizontal scroll at 390px.
  - Existing copy strings.
- **History example (§5.5):** "Claude via MCP created 15 tasks in Social confidence · 2 min ago · Undo". Actor labels: `ui` → "You"; `mcp:<name>` → "<name> via MCP"; `seed` → "Sample data".
- **Undo is itself undoable (§5.5).** An undo batch is listed like any other, summarised "Undid: <summary of the batch it undid>".
- **Conflict rule (§5.5):** undo refuses and lists what changed since.
- **Routes (§8):** `/history` and `/search`.
- **Palette (§8):** `⌘K`/`Ctrl+K` with `cmdk`, for jumping and quick actions.
- **Phone tab bar (spec "Home: overview" and §8):** Areas, Active, Search, Settings, plus M2's Capture. The Inbox is reachable from the overview, through M2's "in Inbox" chip.
- **Copy:** E2E tests depend on these exact strings.
  - Headings "History", "Search".
  - Search field label "Search".
  - History row button `Undo` and tag `Undone`.
  - Palette input placeholder "Jump to…".
  - Settings link "Export all data".
  - Toasts:
    - after an undo from History, "Undone"
    - `invalid_state` message: "This page was out of date. It's been refreshed."
    - conflict with names: "Changed since: {names}. Undo the later change first."

## Review Focus

1. **Search input with `%`, `_` or `\`** matches those characters literally, not as wildcards. Test: Task 4.
2. **Undoing an old batch whose row would collide with a newer one** gives a conflict message, never a raw error. The case: an untick, then a re-tick the same day, then undo of the untick. Test: Task 1.
3. **A History page left open while something else undoes a batch.** Clicking Undo there gets "That was already undone." and the list refreshes. Test: Task 1 (refresh on refusal).
4. **A batch whose entities were all later deleted** still shows a readable summary from its snapshots, never "undefined". Test: Task 2.
5. **Export never includes another owner's rows**, and an unauthenticated request gets 401. Tests: Task 6 and Task 7.

---

### Task 1: Safer refusals: undo collisions, named conflicts, refresh on stale

**Files:**
- Modify:
  - `src/server/domain/undo.ts`
  - `src/server/domain/history.db.test.ts`
  - `src/server/actions/run.ts`
  - `src/server/actions/run.db.test.ts`

**Interfaces:**
- Produces:
  - `undoBatch`'s conflict `details.changed[]` items gain `label: string`. The label is the entity's `title` or `name`, from its current row, else from the batch's last `after`/`before` snapshot, else the entity type.
  - `Result`'s failure shape becomes `{ ok: false; code; message }`, unchanged. Only the message text varies, below.

**Rules:**
- In `undoBatch`, an `apply` that raises a Postgres unique violation (`code === "23505"` on the error or its `cause`) becomes `DomainError("conflict", { changed: [that entity with label] })`.
- `act()` calls `refresh()` after a refusal with any code except `invalid_input`, because the page is stale. It still never refreshes after a thrown non-domain error.
- `MESSAGES.invalid_state` becomes "This page was out of date. It's been refreshed."
- For `conflict` with `details.changed` labels, the message is `Changed since: “A”, “B”. Undo the later change first.` (at most 3 names, then "and N more"). Without labels it stays M2's message.

- [ ] **Step 1: Write the failing tests**

`history.db.test.ts`:
- `"undoing an untick after a same-day re-tick is a conflict, not a crash"`:
  1. A repeating daily task; `completeTask`.
  2. `uncompleteTask` (batch A).
  3. `completeTask` again.
  4. `undoBatch(A)` rejects with `code: "conflict"`, and there's still exactly 1 completion row.
- Extend `"refuses when a later batch changed an entity, naming it"`: `details.changed[0].label === "B"`.

`run.db.test.ts`:
- Change `"returns a domain error as a message and does not refresh"` to `"returns a domain error as a message and refreshes the stale page"`. It's the `not_found` case, and expects `refresh` called once.
- `"does not refresh after invalid input"`: `act(getArea, { areaId: "nope" })` → code `invalid_input`, `refresh` not called.
- `"names what changed in a conflict"`: an action throwing `DomainError("conflict", { changed: [{ label: "Scales" }, { label: "Guitar" }] })` → message `Changed since: “Scales”, “Guitar”. Undo the later change first.`

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm exec vitest run --project db src/server/domain/history src/server/actions/run`
Expected: FAIL on the new and changed cases. The re-tick case fails with a `Failed query` error, not `conflict`.

- [ ] **Step 3: Implement as the rules above say**

- [ ] **Step 4: Run them and watch them pass, then run the dom tests**

Run: `pnpm exec vitest run --project db src/server && pnpm exec vitest run --project dom`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server && git commit -m "fix(domain): undo collisions are conflicts naming what changed; refusals refresh the page"
```

---

### Task 2: History read model and batch summaries

**Files:**
- Create:
  - `src/server/domain/history-summary.ts` (pure)
  - `src/server/domain/history-summary.test.ts` (unit)
  - `src/server/domain/history-view.ts`
  - `src/server/domain/history-view.db.test.ts`
- Modify: `src/lib/dates.ts`, `src/lib/dates.test.ts`

**Interfaces:**
- Consumes: `EntityType` from `history.ts`; `ChangeEvent` from the schema; `localDate`, `addDays`, `formatDeadline` from `dates.ts`.
- Produces:
  - `dates.ts`: `timeAgo(at: Date, now: Date, timeZone: string): string`
  - `history-summary.ts`:
    - `type SummaryEvent = { entityType: string; op: "create" | "update" | "delete" | "restore"; before: Record<string, unknown> | null; after: Record<string, unknown> | null }`
    - `summarizeBatch(events: SummaryEvent[], taskTitles: ReadonlyMap<string, string>): string`
    - `actorLabel(actor: string): string`
  - `history-view.ts`:
    - `type HistoryBatch = { batchId: string; actor: string; who: string; when: string; summary: string; undone: boolean }`
    - `listHistory` (`{ before?: number; limit?: 1..100, default 30 }` → `{ batches: HistoryBatch[]; nextBefore: number | null }`). Newest first, by each batch's highest `seq`. `before` pages by that `seq`.

**`timeAgo` rules:**
- Under 1 minute: "just now".
- Under 1 hour: "{n} min ago".
- Under 24 hours: "{n} h ago".
- Otherwise "Yesterday" when it was the owner's previous local day, else `formatDeadline(localDate)`.

**`summarizeBatch` rules**, in priority order. The name is `title ?? name` from `after ?? before`.
1. All events are `restore`: return "Undid a change". `listHistory` replaces this with `Undid: {summary of the batch whose events have undone_by_batch = this batch}` when it finds that batch.
2. A `task_completion` create: `Completed “{task}”`. A delete: `Uncompleted “{task}”`. `{task}` comes from `taskTitles` by the completion's `taskId`, falling back to "a task".
3. Deletes. With an area delete: `Deleted area “{name}”`. Else with an achievement delete: `Deleted “{title}”`. Else for tasks: 1 → `Deleted task “{title}”`, n → `Deleted {n} tasks`.
4. Creates. Areas: `Created area “{name}”`. Achievements: 1 → `Added “{title}”`, n → `Added {n} achievements`. Tasks: 1 → `Added task “{title}”`, n → `Added {n} tasks`. Categories: `Created category “{name}”`. Practice entries: `Logged practice on “{task}”`.
5. Updates; the primary one is the first by type rank (area > achievement > task > category):
   - `status` changed → `Moved “{title}” to {Backlog|Active|Done}`
   - `areaId` from null → `Filed “{title}”`
   - `achievementId` from null → `Filed task “{title}”`
   - only `sortKey` changed → `Reordered “{title}”`
   - else `Edited “{title}”`
6. Only `task_categories` events: `Changed categories on “{task}”`.
7. Fallback: `Changed {n} items`.

`actorLabel`: `"ui"` → "You", `"seed"` → "Sample data", `"mcp:Claude"` → "Claude via MCP", anything else → as is.

- [ ] **Step 1: Write the failing tests**

`dates.test.ts`:
- `"timeAgo"` with `now = 2026-10-24T12:00:00Z` in UTC:
  - −30 s → "just now"
  - −5 min → "5 min ago"
  - −3 h → "3 h ago"
  - `2026-10-23T09:00Z` → "Yesterday"
  - `2026-10-03T09:00Z` → "Oct 3"
- In `Pacific/Auckland`, `2026-10-24T10:30Z` with `now = 2026-10-24T11:30Z` → "1 h ago".

`history-summary.test.ts`: one `it` per rule above, built from literal event fixtures. Exact strings:
- "Created area “Guitar”"
- "Added 15 tasks"
- "Added task “Scales”"
- "Moved “Sweep” to Active"
- "Filed “Learn a jig”"
- "Reordered “Sweep”"
- "Edited “Sweep”"
- "Deleted area “Guitar”" (for a cascade: 3 task deletes + 1 achievement + 1 area)
- "Deleted 2 tasks"
- "Completed “Scales”"
- "Uncompleted “a task”" (missing title)
- "Changed categories on “Scales”"
- "Undid a change"
- "Changed 2 items"

Also `actorLabel` for all four cases.

`history-view.db.test.ts`:
- `"lists batches newest first with who, when and summary"`:
  - `createArea` "Guitar", then `createTasks` ×3 under an achievement.
  - First batch → `{ who: "You", summary: "Added 3 tasks", undone: false }`. The area batch is further down, with "Created area “Guitar”".
- `"marks undone batches and summarises the undo"`: undo the tasks batch. The newest is "Undid: Added 3 tasks"; the original has `undone: true`.
- `"names a completion's task even after the task was deleted"`: complete, then delete the task. The completion batch still reads `Completed “{title}”`, taking the title from the task's latest event snapshot.
- `"pages with before"`: limit 2 over 3 batches → 2 + `nextBefore`; the second page has 1 and `nextBefore: null`.
- `"shows only the owner's history"`.

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm exec vitest run --project unit src/lib/dates src/server/domain/history-summary && pnpm exec vitest run --project db src/server/domain/history-view`
Expected: FAIL. The modules don't exist.

- [ ] **Step 3: Implement**

`listHistory` runs four queries:
1. The page of batch ids: `group by batch_id`, `max(seq)`, `max(created_at)`, `min(actor)`, `bool_and(undone_at is not null)`, `having max(seq) < before`, `limit + 1`.
2. Those batches' events, in `seq` order.
3. Task titles for referenced task ids, taken from the latest `task` event of each, so deleted tasks still have names.
4. For undo batches, the events of the batches they undid.

- [ ] **Step 4: Run them and watch them pass**

Run: `pnpm exec vitest run --project unit src/lib src/server/domain && pnpm exec vitest run --project db src/server/domain/history-view`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src && git commit -m "feat(domain): history read model with readable batch summaries"
```

---

### Task 3: History page

**Files:**
- Create:
  - `src/app/(app)/history/page.tsx`
  - `src/components/app/history-list.tsx`
  - `src/components/app/history-list.dom.test.tsx`
- Modify:
  - `src/components/app/sidebar.tsx`: a "History" link under Settings.
  - `src/app/(app)/settings/page.tsx`: a "History" link, for phones.

**Interfaces:**
- Consumes: `listHistory` and `HistoryBatch` (Task 2); `undoAction` (M2); `perform` (M2).
- Produces: `HistoryList({ batches }: { batches: HistoryBatch[] })`, a client component.

**Contents:**
- Heading "History".
- One row per batch: the summary; `{who} · {when}` in muted text; an `Undo` button, or an `Undone` tag when undone.
- Undo calls `perform(() => undoAction({ batchId }), { success: "Undone" })`. A conflict shows Task 1's named message.
- While a request is in flight, that row's button is disabled, so a double click sends one undo.
- "Show older" links to `/history?before={nextBefore}` when there's more.
- Empty: "Nothing yet. Changes you make show up here."
- The page reads `searchParams.before` inside `<Suspense>`. A non-numeric value is ignored.

- [ ] **Step 1: Write the failing test**

`history-list.dom.test.tsx`, with `@/server/actions/history` mocked:
- `"undo sends the batch once and says Undone"`:
  - Two quick clicks on `Undo` for batch b1 → `undoAction` called once with `{ batchId: "b1" }`.
- `"an undone batch shows the tag, not the button"`.

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm exec vitest run --project dom src/components/app/history-list`
Expected: FAIL.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Verify**

Run: `pnpm exec vitest run --project dom && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src && git commit -m "feat(ui): History page with undo per batch"
```

---

### Task 4: Search

**Files:**
- Create:
  - `src/server/domain/search.ts`
  - `src/server/domain/search.db.test.ts`
  - `src/app/(app)/search/page.tsx`
  - `src/components/app/search-box.tsx`
- Modify: `src/components/app/tab-bar.tsx`, `src/components/app/sidebar.tsx`

**Interfaces:**
- Consumes: `NavArea` (M3 `views.ts`).
- Produces:
  - `search` (`{ q: string }`, trimmed, 1–100 chars) → `{ areas: NavArea[]; achievements: { id; title; status; area: NavArea | null }[]; tasks: { id; title; achievementId: string | null; achievementTitle: string | null; area: NavArea | null }[] }`
  - `SearchBox({ initial }: { initial: string })`

**Rules:**
- Case-insensitive `ILIKE '%q%'` with `%`, `_` and `\` escaped (`ESCAPE '\'`).
- Matches areas on name and description, achievements on title and notes, tasks on title and notes.
- Live rows only, including the Inbox (null parents).
- At most 20 per kind, ordered by title.

**Contents:**
- **`/search`:**
  - Heading "Search".
  - `SearchBox`: an input labelled "Search", autofocused. It updates `?q=` with `router.replace` 200ms after typing stops.
  - Results grouped "Areas", "Achievements", "Tasks", each row linking:
    - area → `/areas/{id}`
    - achievement → `/achievements/{id}`
    - task → `/achievements/{achievementId}`, or `/inbox` when unfiled
  - Each row shows the area as "{emoji} {name}", or "Inbox".
  - Empty `q`: "Type to search areas, achievements, tasks and the Inbox."
  - No hits: `Nothing matches “{q}”.`
- **Tab bar:** Areas, Active, Capture, Search, Settings. Inbox leaves the tab bar and stays reachable from the overview chip.
- **Sidebar:** a "Search" link under Active.

- [ ] **Step 1: Write the failing tests** (`search.db.test.ts`)
- `"finds titles and notes across kinds, case-insensitively"`:
  - area "Guitar"; achievement "Sweep picking" with notes "metronome at 120"; task "Practise arpeggios"; Inbox task "Buy guitar strings".
  - `q: "GUITAR"` → the area and the Inbox task.
  - `q: "metronome"` → the achievement.
- `"treats % _ and \\ literally"`:
  - tasks "100% clean", "snake_case", "back\\slash", and "1000 clean".
  - `q: "%"` → only "100% clean".
  - `q: "_"` → only "snake_case".
  - `q: "\\"` → only "back\\slash".
- `"leaves out deleted rows and other owners' rows"`.
- `"rejects an empty or too long query"` → `invalid_input`.

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm exec vitest run --project db src/server/domain/search`
Expected: FAIL.

- [ ] **Step 3: Implement the domain read, the page, the search box and the navigation changes**

- [ ] **Step 4: Verify**

Run: `pnpm exec vitest run --project db src/server/domain/search && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src && git commit -m "feat: search across areas, achievements, tasks and the Inbox"
```

---

### Task 5: Command palette

**Files:**
- Create:
  - `src/components/ui/command.tsx`, via `pnpm dlx shadcn@latest add command`. If it asks to overwrite `dialog.tsx`, answer no.
  - `src/components/app/command-palette.tsx`
  - `src/components/app/command-palette.dom.test.tsx`
  - `src/server/actions/palette.ts`
- Modify:
  - `src/server/domain/views.ts`: `listJumpTargets`.
  - `src/server/domain/views.db.test.ts`
  - `src/app/(app)/layout.tsx`: mount the palette next to `Capture`, inside the same `<Suspense>`.
  - `src/server/actions/actions.sweep.test.ts`: 8 files, ≥22 actions.

**Interfaces:**
- Produces:
  - `listJumpTargets` (`z.object({})` → `{ id; title; status; area: NavArea }[]`). Live achievements in live areas; area order, then status, then `sortKey`.
  - `jumpTargetsAction()` → `Promise<JumpTarget[]>`. It calls `read(listJumpTargets, {})`, so the owner is checked and nothing is refreshed.
  - `CommandPalette({ areas }: { areas: NavData["areas"] })`

**Behaviour:**
- **Opening:** `Ctrl+K` or `⌘K` anywhere, including inside inputs, toggles the palette. `preventDefault` stops the browser's own shortcut.
- **"Go to":** Your areas, Active, Inbox, Search, History, Settings.
- **"Areas":** one entry per area.
- **"Achievements":** loaded on first open; entries read "{title}" with "{emoji} {area}" beside them.
- **"Actions":** "Capture…" opens M2's capture. When the query is non-empty, `Search for “{query}”` goes to `/search?q=`.
- Choosing an entry navigates with `router.push` and closes the palette.

- [ ] **Step 1: Write the failing tests**

`command-palette.dom.test.tsx`, with `next/navigation` and `@/server/actions/palette` mocked:
- `"Ctrl+K opens it and choosing an area navigates"`:
  1. Press `Control+k`, and the dialog appears.
  2. Type "gui" and press Enter.
  3. `push` is called with `/areas/a1` (area "Guitar").
- `"offers searching for the typed text"`: type "zzz" and choose `Search for “zzz”` → `push("/search?q=zzz")`.
- `"loads achievements when opened"`: `jumpTargetsAction` is called once; "Sweep picking" is listed.

`views.db.test.ts`: `"listJumpTargets lists live achievements with their area"`.

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm exec vitest run --project dom src/components/app/command-palette && pnpm exec vitest run --project db src/server/domain/views`
Expected: FAIL.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Verify**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: PASS. The sweep finds 8 files.

- [ ] **Step 5: Commit**

```bash
git add src package.json pnpm-lock.yaml && git commit -m "feat(ui): Ctrl+K command palette"
```

---

### Task 6: Export all data as JSON

**Files:**
- Create:
  - `src/server/domain/export.ts`
  - `src/server/domain/export.db.test.ts`
  - `src/app/api/export/route.ts`
- Modify: `src/app/(app)/settings/page.tsx`

**Interfaces:**
- Produces:
  - `exportData` (`z.object({})`) returns:
    - `{ version: 1; exportedAt: string; settings: OwnerSettings }`
    - plus the owner's full rows from `areas`, `achievements`, `tasks`, `categories`, `taskCategories`, `taskCompletions` and `practiceEntries`.
  - `GET /api/export`:
    - `requireOwnerApi(req)` first, then `await connection()`.
    - Runs `exportData` with actor `ui`.
    - Responds with the JSON, `Content-Disposition: attachment; filename="life-goals-{localDate}.json"` and `Cache-Control: no-store`.

**Decided here:** soft-deleted rows are included, each with its `deletedAt`, because they are still the owner's data within the 90-day window. `change_events` are not included: they're derived history and large. That means the export is the data, not its history.

**Settings:** an "Export all data" link-button to `/api/export`, plus the "History" link from Task 3.

- [ ] **Step 1: Write the failing test** (`export.db.test.ts`)
- `"exports every table's rows for the owner, deleted ones included"`:
  - Create an area, an achievement, a task, a category, a completion and a deleted task.
  - Expect `version: 1`, every array with the right lengths, and the deleted task present with `deletedAt` set.
- `"never includes another owner's rows"`.
- `"has no change history"`: no `changeEvents` key.

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm exec vitest run --project db src/server/domain/export`
Expected: FAIL.

- [ ] **Step 3: Implement the read, the route and the Settings link**

- [ ] **Step 4: Verify**

Run: `pnpm exec vitest run --project db src/server/domain/export && pnpm typecheck && pnpm lint && pnpm build`
Expected: PASS. The build lists `ƒ /api/export`.

- [ ] **Step 5: Commit**

```bash
git add src && git commit -m "feat: export all data as JSON from Settings"
```

---

### Task 7: E2E golden paths, roadmap

**Files:**
- Create: `e2e/history-search.spec.ts`
- Modify:
  - `e2e/auth.spec.ts`: an unauthenticated `GET /api/export` → 401.
  - `e2e/goals.spec.ts`: add `/search` and `/history` to the phone no-sideways-scroll loop.
  - `docs/ROADMAP.md`: tick M4.

**Interfaces:**
- Consumes: M2/M3 helpers, including `saved()` (wait for the Server Action answer before reload or navigation) and every copy string above.

- [ ] **Step 1: Write the tests** (both projects unless noted)
- **`"undo a change from History"`:**
  1. Create an area (unique name). Go to `/history`.
  2. The first row reads `Created area “{name}”` with `You`.
  3. `saved(page, () => click its Undo)`. Expect the toast "Undone" and the row's `Undone` tag.
  4. Go to `/`. The area is gone.
- **`"search finds an achievement and opens it"`:**
  1. Create an area and the achievement `uniqueName("Needle")`.
  2. Go to `/search` and type its unique suffix into "Search".
  3. Click the result. The achievement's page opens.
- **`"Ctrl+K jumps to an area"`** (desktop only):
  1. Create an area. Go to `/`.
  2. Press `Control+k`, type the area's unique suffix, and press Enter.
  3. The area's heading is visible.
- **`"export downloads my data"`:** `page.request.get("/api/export")` → 200, a JSON body whose `areas` contains a name created in the test, and a `content-disposition` header containing `attachment`.

- [ ] **Step 2: Run them**

Run: `pnpm e2e`
Expected: all pass on desktop and phone; M2 and M3 tests still green.

- [ ] **Step 3: Tick the M4 items in `docs/ROADMAP.md`, then run the full gate**

Run: `pnpm test && pnpm lint && pnpm typecheck && pnpm format:check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add e2e docs/ROADMAP.md && git commit -m "test(e2e): M4 golden paths; tick M4"
```

Push, PR and merge are owner-approved steps. At merge, set the M4 cards on GitHub Project #2 to Done.
