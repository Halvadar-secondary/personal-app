# M1 Core Data and Domain Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every core action exists in `src/server/domain`, runs in one owner-scoped transaction, records history, and is fully tested against Postgres. Undo works for any batch, refuses on conflict, and can itself be undone. A seed script fills the `seed` database with realistic sample data.

**Architecture:** Each action is `defineAction(zodSchema, run)`. Adapters (M2 server actions, M5 MCP tools, the seed script) call `runAction(deps, action, input)`. That opens a transaction, validates input, builds `Ctx` (owner, actor, batch id, injected clock, owner time zone), runs the action and returns its result. Every mutation calls `recordChange`, which writes a full-row before/after snapshot to `change_events`. `undoBatch` replays `before` snapshots in reverse through a per-entity registry, writing `restore` events in a new batch. No UI in this milestone.

**Tech Stack:** Drizzle ORM 0.45 + drizzle-kit (existing), PGlite for tests (existing), Vitest (existing), **zod** (new, latest 4.x), **fractional-indexing** (new, latest).

**Spec:** `docs/superpowers/specs/2026-10-22-life-goals-app-technical-design.md` §4, §5.1, §5.2 (XP table only), §5.5, §5.6, §9; product design `docs/superpowers/specs/2026-10-21-life-goals-app-design.md` "What the app holds", "Safety net", "Extension point". Roadmap: `docs/ROADMAP.md` § M1.

## Global Constraints

- `src/server/domain/**` imports only `@/server/db/**`, `@/lib/**`, `zod`, `drizzle-orm`, `fractional-indexing` (existing lint rule blocks `app`, `actions`, `mcp`).
- Every row carries `owner_id`; **every** query filters on `ctx.ownerId`. An id that belongs to another owner behaves exactly like a missing id: `DomainError("not_found")`.
- Every mutation writes `change_events` rows (one per touched entity, all sharing `ctx.batchId`) **in the same transaction**. A thrown error rolls back the data and its events together.
- Soft delete via `deleted_at` for areas, achievements, tasks, categories and practice entries. Soft-deleted rows are invisible to reads and behave as `not_found` for every action except undo. Deletes cascade within one batch: area → its achievements → their tasks; achievement → its tasks.
- `task_completions` and `task_categories` are hard rows. Un-completing deletes the completion row.
- XP per effort: **1→10, 2→25, 3→50, 4→100, 5→200**, frozen in `task_completions.xp_awarded` at completion. A task with `area_id` null (in the Inbox, or under an Inbox achievement) awards **0**.
- Effort is an integer 1–5 (Trivial, Easy, Medium, Hard, Brutal). Default **2**. *(Builder's call: the spec gives no default.)*
- `sort_key` is a fractional-indexing string. Reordering writes one row.
- Achievement status ∈ `backlog` | `active` | `done`. Entering `done` sets `completed_at = now()`; leaving `done` clears it.
- A task under an achievement has `area_id` = that achievement's `area_id`, kept in sync whenever the achievement moves area. A task with no achievement has both null (Inbox). A task with `area_id` set but no achievement is never valid.
- Dates ("deadline", `occurrence_date`) are `YYYY-MM-DD` strings. "Today" is computed in `settings.time_zone` (default `UTC` when the owner has no settings row).
- `now` is always `ctx.now()`, never `new Date()` inside domain code.
- **Ruling against spec §4:** `owner_id` is `text` referencing `user.id` (Better Auth ids are text, not uuid). Entity ids stay `uuid default gen_random_uuid()`.
- **Ruling, undo conflict (§5.5):** a batch is undoable only if each entity it touched currently equals that batch's last `after` snapshot, ignoring `updated_at`. This is equivalent to "not changed by a later batch", and it also lets undo-of-undo work.
- Coverage gate stays ≥90% lines for `src/lib/**` and `src/server/domain/**`.
- Out of scope (later milestones): level/area XP/streaks and recurrence (M3; the `recurrence` column exists but no input accepts it), history listing and search (M4), MCP (M5), the 90-day hard-delete job (M6).

## Review Focus

1. **Another owner's ids.** Every action given an id owned by someone else must return `not_found` and change nothing. Pinned in Task 9 (`ownership.db.test.ts`, one case per action).
2. **Moving an achievement to another area** must move its tasks' `area_id` with it, or XP and area views drift later. It must also be undoable as one batch. Pinned in Task 5 (`move` to another area) and Task 9 (undo restores the tasks' `area_id`).
3. **Undo after newer work.** Undoing batch A after batch B touched the same entity must refuse and name the entity. Once B is undone, A must undo cleanly. Pinned in Task 9.
4. **Soft-deleted rows.** They must not appear in reads, be used as a parent or as a position neighbour, or be edited. Pinned in Task 4 (`afterId` of a deleted area), Task 5 (create under a deleted area) and Task 6 (update a deleted task).
5. **Completing near midnight in the owner's time zone.** `occurrence_date` must be the owner-local date, not the UTC date. Pinned in Task 6 (`Pacific/Auckland` case).

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/ordering.ts` | `keyBetween`, `keysAfter` over fractional-indexing |
| `src/lib/xp.ts` | `xpForEffort` |
| `src/lib/dates.ts` | `localDate(instant, timeZone)` |
| `src/server/db/goals.ts` | Tables: areas, achievements, tasks, categories, task_categories, task_completions, practice_entries; status enum |
| `src/server/db/history.ts` | Table: change_events; op enum |
| `src/server/db/schema.ts` | Re-export the two new modules |
| `src/server/domain/errors.ts` | `DomainError`, codes |
| `src/server/domain/context.ts` | `Actor`, `Ctx`, `Tx`, `defineAction`, `callAction`, `runAction` |
| `src/server/domain/history.ts` | `recordChange`, entity registry, `undoBatch` |
| `src/server/domain/position.ts` | `zPosition`, `sortKeyFor` |
| `src/server/domain/areas.ts` · `achievements.ts` · `tasks.ts` · `categories.ts` · `inbox.ts` · `practice.ts` | Actions and reads per aggregate |
| `src/test/factories.ts` | `createOwner`, `deps` |
| `scripts/seed.ts`, `scripts/lib/seed-data.ts` | Sample-data seed |

Domain tests sit next to their module as `*.db.test.ts`; pure tests as `*.test.ts`.

---

### Task 1: Pure helpers: ordering, XP, local dates

**Files:**
- Modify: `package.json` (add `zod`, `fractional-indexing` as dependencies)
- Create: `src/lib/ordering.ts`, `src/lib/xp.ts`, `src/lib/dates.ts`
- Test: `src/lib/ordering.test.ts`, `src/lib/xp.test.ts`, `src/lib/dates.test.ts`

**Interfaces:**
- Produces: `keyBetween(a: string | null, b: string | null): string`; `keysAfter(last: string | null, n: number): string[]`; `xpForEffort(effort: 1|2|3|4|5): number`; `type Effort = 1|2|3|4|5`; `localDate(instant: Date, timeZone: string): string`.

- [ ] **Step 1: Install** `pnpm add zod fractional-indexing`.
- [ ] **Step 2: Write the failing tests**

```ts
// ordering.test.ts
it("orders a key between two neighbours", () => { const k = keyBetween("a0", "a1"); expect("a0" < k && k < "a1").toBe(true); });
it("appends and prepends with null bounds", () => { expect(keyBetween("a0", null) > "a0").toBe(true); expect(keyBetween(null, "a0") < "a0").toBe(true); });
it("keysAfter returns n strictly increasing keys after last", () => {
  const ks = keysAfter("a3", 15); expect(ks).toHaveLength(15);
  expect([...ks].sort()).toEqual(ks); expect(ks[0]! > "a3").toBe(true);
});
it("survives 50 inserts at the same spot", () => {
  let lo = "a0"; const hi = "a1";
  for (let i = 0; i < 50; i++) { const k = keyBetween(lo, hi); expect(lo < k && k < hi).toBe(true); lo = k; }
});
it("rejects equal or inverted bounds", () => { expect(() => keyBetween("a1", "a1")).toThrow(); expect(() => keyBetween("a2", "a1")).toThrow(); });
// xp.test.ts
it.each([[1,10],[2,25],[3,50],[4,100],[5,200]])("effort %i → %i xp", (e, xp) => expect(xpForEffort(e as Effort)).toBe(xp));
// dates.test.ts
it("uses the owner's zone, not UTC", () => {
  expect(localDate(new Date("2026-03-10T11:30:00Z"), "Pacific/Auckland")).toBe("2026-03-11");
  expect(localDate(new Date("2026-03-10T11:30:00Z"), "UTC")).toBe("2026-03-10");
  expect(localDate(new Date("2026-03-10T02:00:00Z"), "America/Los_Angeles")).toBe("2026-03-09");
});
```

- [ ] **Step 3: Run** `pnpm vitest run src/lib`. Expected: FAIL, modules not found.
- [ ] **Step 4: Implement.**
  - `ordering.ts` wraps `generateKeyBetween` / `generateNKeysBetween(last, null, n)`.
  - `xp.ts` is a constant lookup.
  - `dates.ts` uses `Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" })`.
- [ ] **Step 5: Run** `pnpm vitest run src/lib`. Expected: PASS.
- [ ] **Step 6: Commit** `feat(lib): fractional ordering, xp per effort, owner-local dates`.

---

### Task 2: Schema and migration

**Files:**
- Create: `src/server/db/goals.ts`, `src/server/db/history.ts`
- Modify: `src/server/db/schema.ts` (export both)
- Generated: `drizzle/0002_*.sql` (+ meta)
- Test: `src/server/db/goals.db.test.ts`

**Interfaces:**
- Produces: tables `areas`, `achievements`, `tasks`, `categories`, `taskCategories`, `taskCompletions`, `practiceEntries`, `changeEvents`. Enums `achievementStatus` (`backlog`, `active`, `done`) and `changeOp` (`create`, `update`, `delete`, `restore`). Row types `Area`, `Achievement`, `Task`, `Category`, `TaskCompletion`, `PracticeEntry`, `ChangeEvent` (`$inferSelect`).

Columns follow spec §4 exactly, plus the rulings below. Shared columns:
- `id uuid pk defaultRandom()`
- `ownerId text not null references user.id on delete cascade`
- `createdAt` / `updatedAt` as `timestamptz not null defaultNow()`
- `deletedAt timestamptz` (soft tables only)

Rulings and per-table specifics:
- `areas`: `name text not null`, `emoji text`, `cover jsonb` typed `{ type: "gradient" | "color" | "image"; value: string } | null`, `description text`, `sortKey text not null`.
- `achievements`:
  - `areaId uuid references areas.id`, nullable
  - `title text not null`, `notes text`
  - `status achievement_status not null default 'backlog'`
  - `deadline date (mode "string")`, `completedAt timestamptz`
  - `sortKey text not null`
  - index `(owner_id, area_id, status, sort_key)`
- `tasks`:
  - `achievementId uuid references achievements.id`, `areaId uuid references areas.id`, both nullable
  - `title text not null`, `notes text`
  - `effort smallint not null default 2`, with check `effort between 1 and 5`
  - `deadline date (string)`, `recurrence jsonb`, `completedAt timestamptz`
  - `sortKey text not null`
  - check `achievement_id is not null or area_id is null`
  - index `(owner_id, achievement_id, sort_key)`
- `categories`: `name text not null`, `color text not null`; unique index `(owner_id, lower(name)) where deleted_at is null`.
- `taskCategories`: `taskId`, `categoryId`, `ownerId`; primary key `(task_id, category_id)`; no timestamps.
- `taskCompletions`:
  - `id`, `ownerId`, `taskId uuid not null references tasks.id`
  - `completedAt timestamptz not null`, `occurrenceDate date (string) not null`, `xpAwarded integer not null`
  - unique `(task_id, occurrence_date)`
- `practiceEntries`:
  - `taskId uuid not null references tasks.id`
  - `startedAt timestamptz not null`, `durationSeconds integer`
  - `metrics jsonb` typed `Record<string, number | string> | null`
  - `note text`, `source text not null`
  - plus the shared columns and `deletedAt`
- `changeEvents`:
  - `id`, `seq bigserial not null unique`, `ownerId`, `batchId uuid not null`
  - `actor text not null`, `entityType text not null`, `entityId uuid not null`
  - `op change_op not null`, `before jsonb`, `after jsonb`
  - `createdAt`, `undoneAt timestamptz`, `undoneByBatch uuid`
  - indexes `(owner_id, batch_id)` and `(owner_id, entity_type, entity_id)`

- [ ] **Step 1: Write the failing test** `goals.db.test.ts` using `createTestDb()`, with a user row inserted directly:

```ts
it("creates an area → achievement → task chain", …)          // insert all three; select back by id
it("rejects a task in an area without an achievement", …)     // insert task {areaId, achievementId: null} → rejects
it("rejects effort outside 1–5", …)                           // effort 0 and 6 → rejects
it("rejects a duplicate category name per owner, case-insensitively", …) // "Theory" then "theory" → rejects
it("allows reusing a deleted category's name", …)             // first row deletedAt set → second insert ok
it("allows one completion per task per day", …)               // second (task, date) → rejects
```

- [ ] **Step 2: Run** `pnpm vitest run src/server/db`. Expected: FAIL, the tables are not exported.
- [ ] **Step 3: Implement** the schema modules. Run `pnpm db:generate` (one migration, `0002_*`), then `pnpm db:check`.
- [ ] **Step 4: Run** `pnpm vitest run src/server/db`. Expected: PASS. Also run `pnpm test`: `health.db.test.ts` now expects `schemaVersion: 3`. Update that assertion; it's the only expected break.
- [ ] **Step 5: Commit** `feat(db): goals and history schema`.

---

### Task 3: Domain core: errors, context, recordChange, factories

**Files:**
- Create: `src/server/domain/errors.ts`, `src/server/domain/context.ts`, `src/server/domain/history.ts` (only `recordChange` and the `EntityType` union in this task), `src/test/factories.ts`
- Test: `src/server/domain/context.db.test.ts`

**Interfaces:**
- Produces:
  - `type DomainErrorCode = "invalid_input" | "not_found" | "invalid_state" | "conflict" | "already_undone"`
  - `class DomainError extends Error { code; details?: unknown }`
  - `type Actor = "ui" | "seed" | \`mcp:${string}\``
  - `type Tx` (the Drizzle transaction type over `Db`)
  - `type Ctx = { db: Tx; ownerId: string; actor: Actor; batchId: string; now: () => Date; timeZone: string }`
  - `defineAction<S extends z.ZodType, O>(input: S, run: (ctx: Ctx, input: z.output<S>) => Promise<O>): Action<S, O>`
  - `callAction(ctx, action, input: z.input<S>): Promise<O>`: parses, then runs inside the **same** ctx and batch. This is the composition primitive.
  - `runAction(deps: { db: Db; ownerId: string; actor: Actor; now?: () => Date }, action, input: z.input<S>): Promise<O>`
  - `type EntityType = "area" | "achievement" | "task" | "category" | "task_categories" | "task_completion" | "practice_entry"`
  - `recordChange(ctx, c: { entityType: EntityType; entityId: string; op: "create" | "update" | "delete" | "restore"; before: object | null; after: object | null }): Promise<void>`
  - Test helpers: `createOwner(db, opts?: { email?: string; timeZone?: string }): Promise<string>` inserts a `user` row (emailVerified true) and, when `timeZone` is given, a `settings` row. `deps(db, ownerId, now?: Date)` returns `runAction` deps with actor `"ui"` and a fixed clock.

`runAction` behaviour:
1. Validate with `safeParse`. On failure throw `DomainError("invalid_input", { issues })` **before** opening a transaction.
2. Open `db.transaction`, generate `batchId = crypto.randomUUID()`, read `settings.time_zone` for the owner (default `"UTC"`), build `Ctx`, run.
3. Any throw rolls back the transaction.

- [ ] **Step 1: Write the failing tests** with a throwaway action defined inside the test file. That action inserts an area row directly and calls `recordChange`.

```ts
it("rejects invalid input with invalid_input and touches nothing", …)       // code === "invalid_input"; areas count 0
it("commits data and its events together, sharing one batch id", …)        // two recordChange calls → 2 events, same batchId, actor "ui"
it("rolls back data and events when the action throws", …)                  // insert + recordChange then throw → 0 areas, 0 events
it("injects the clock and the owner's time zone", …)                       // createOwner tz "Pacific/Auckland"; action returns ctx.now(), ctx.timeZone
it("defaults the time zone to UTC without a settings row", …)
it("callAction runs a nested action in the same batch", …)                  // outer + inner each record one event → same batchId
```

- [ ] **Step 2: Run** `pnpm vitest run src/server/domain`. Expected: FAIL, modules not found.
- [ ] **Step 3: Implement** the four files. `recordChange` stores snapshots as given (Drizzle row objects; jsonb serialises `Date` to ISO).
- [ ] **Step 4: Run** `pnpm vitest run src/server/domain`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(domain): runAction, ctx, domain errors, change recording`.

---

### Task 4: Areas, plus the shared position helper

**Files:**
- Create: `src/server/domain/position.ts`, `src/server/domain/areas.ts`
- Test: `src/server/domain/areas.db.test.ts`

**Interfaces:**
- Consumes: Task 1 `keyBetween`; Task 3 `defineAction`, `recordChange`, `DomainError`.
- Produces:
  - `zPosition = z.object({ afterId: z.uuid().nullish(), beforeId: z.uuid().nullish() })`
  - `sortKeyFor(siblings: { id: string; sortKey: string }[], pos: Position): string`
    - `siblings` is ordered and excludes the moving item.
    - `afterId` → the key between that sibling and the next one.
    - `beforeId` → the key between the previous sibling and that one.
    - Both → the key between them; throws `invalid_input` unless after < before.
    - Neither → after the last sibling.
    - An id not in `siblings` → `invalid_input`.
  - Area actions:
    - `createArea({ name: string(1..80, trimmed), emoji?, cover?, description? }) → Area` (appended last)
    - `updateArea({ areaId, name?, emoji?, cover?, description? }) → Area`
    - `reorderArea({ areaId } & Position) → Area`
    - `deleteArea({ areaId }) → { deleted: number }` soft-deletes the area, its achievements and their tasks, one event each.
  - Reads: `listAreas({}) → Area[]` (sort order); `getArea({ areaId }) → Area`.

Every mutation records one event per row touched: `op` create / update / delete, `before`/`after` = full rows.

- [ ] **Step 1: Write the failing tests**

```ts
it("creates areas in append order and lists them sorted", …)          // Guitar, Singing → listAreas names in that order
it("records a create event with before null and after the row", …)
it("updates fields and records before/after", …)                       // updateArea name → event.before.name old, event.after.name new
it("reorders with afterId / beforeId", …)                              // A,B,C; reorderArea(C, {afterId: A}) → A,C,B; (A, {beforeId: null… }) etc.
it("rejects a position neighbour that is soft-deleted", …)             // delete B; reorderArea(C, {afterId: B}) → invalid_input
it("delete hides the area and cascades to achievements and tasks in one batch", …) // seed rows via direct inserts; events count = 1 + n + m, one batchId; listAreas excludes it
it("update or get a deleted area is not_found", …)
it("rejects a blank name", …)                                          // "   " → invalid_input
```
Also add `position.test.ts` (unit) covering each branch of `sortKeyFor`, including both bounds inverted → `invalid_input`.

- [ ] **Step 2: Run** `pnpm vitest run src/server/domain/areas src/server/domain/position`. Expected: FAIL.
- [ ] **Step 3: Implement.** Load siblings with `ownerId` and `deletedAt is null` filters, ordered by `sortKey`.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(domain): areas and positions`.

---

### Task 5: Achievements

**Files:**
- Create: `src/server/domain/achievements.ts`
- Test: `src/server/domain/achievements.db.test.ts`

**Interfaces:**
- Consumes: `zPosition`, `sortKeyFor` (Task 4); `getArea` semantics (an area must exist and not be deleted).
- Produces:
  - `zDate = z.iso.date()` (exported from `achievements.ts`, reused by tasks)
  - `createAchievement({ areaId: uuid | null, title: string(1..200, trimmed), notes?, status? = "backlog", deadline?: zDate | null }) → Achievement`: appended last in (area, status). `areaId: null` = Inbox.
  - `updateAchievement({ achievementId, title?, notes?, deadline? }) → Achievement`
  - `moveAchievement({ achievementId, status?, areaId?: uuid | null } & Position) → Achievement`
    - The target is (areaId ?? current area, status ?? current status); siblings come from that target.
    - Entering `done` sets `completedAt = ctx.now()`; leaving it clears it.
    - When the area changes, every non-deleted task under it gets the new `areaId`, with one `update` event per task.
  - `deleteAchievement({ achievementId }) → { deleted: number }` cascades to its tasks.
  - Reads:
    - `listAchievements({ areaId: uuid | null, status? }) → Achievement[]` (areaId null = Inbox), ordered by status then sortKey.
    - `getAchievement({ achievementId }) → { achievement: Achievement; tasks: (Task & { categoryIds: string[] })[] }`, tasks in sortKey order. Category ids are filled once Task 7 exists; until then return `[]`.

- [ ] **Step 1: Write the failing tests**

```ts
it("creates in backlog by default, appended within (area, status)", …)
it("creates in the Inbox with areaId null", …)
it("rejects a deleted or foreign area as parent", …)                   // not_found
it("moves Backlog → Active between two cards", …)                      // sortKey between neighbours of the Active column
it("entering done stamps completedAt; leaving clears it", …)           // ctx clock fixed; move done → completedAt == now; move active → null
it("moving to another area moves its tasks' areaId in the same batch", …) // insert 2 tasks; move area → both tasks.areaId = new; events: 1 achievement + 2 task updates, one batchId
it("moving to the Inbox (areaId null) clears its tasks' areaId", …)
it("rejects deadline that is not YYYY-MM-DD", …)                       // "2026-13-01" and "tomorrow" → invalid_input
it("delete cascades to tasks and hides from listAchievements", …)
```

- [ ] **Step 2: Run** `pnpm vitest run src/server/domain/achievements`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** it again. Expected: PASS.
- [ ] **Step 5: Commit** `feat(domain): achievements with status moves and area sync`.

---

### Task 6: Tasks and completions

**Files:**
- Create: `src/server/domain/tasks.ts`
- Test: `src/server/domain/tasks.db.test.ts`

**Interfaces:**
- Consumes: `zPosition`, `sortKeyFor`, `zDate`; Task 1 `keysAfter`, `xpForEffort`, `localDate`.
- Produces:
  - `zEffort = z.int().min(1).max(5)`
  - `zTaskFields = { title: string(1..300, trimmed), notes?: string | null, effort?: zEffort (default 2), deadline?: zDate | null }`
  - `createTask({ achievementId: uuid | null } & zTaskFields) → Task`: `areaId` copied from the achievement; null achievement = Inbox.
  - `createTasks({ achievementId: uuid | null, tasks: zTaskFields[] (1..50) }) → Task[]`: one batch, in input order, appended after existing tasks via `keysAfter`.
  - `updateTask({ taskId } & partial zTaskFields) → Task`
  - `moveTask({ taskId, achievementId?: uuid | null } & Position) → Task`: reorders within the achievement or moves to another one (area resynced). `achievementId: null` = Inbox.
  - `completeTask({ taskId }) → { task: Task; completion: TaskCompletion }`
    - Sets `completedAt = now`.
    - Inserts a completion with `occurrenceDate = localDate(now, ctx.timeZone)` and `xpAwarded = task.areaId ? xpForEffort(effort) : 0`.
    - Records two events: a task update and a task_completion create.
    - Already completed → `invalid_state`.
  - `uncompleteTask({ taskId }) → Task`: clears `completedAt`, hard-deletes the completion row, and records a task update plus a task_completion delete (`after: null`). Not completed → `invalid_state`.
  - `deleteTask({ taskId }) → { deleted: 1 }`

- [ ] **Step 1: Write the failing tests**

```ts
it("creates under an achievement with its areaId and default effort 2", …)
it("creates an Inbox task with both parents null", …)
it("createTasks makes 15 ordered tasks in one batch", …)              // titles 1..15 in order; 15 events, one batchId
it("createTasks with an invalid item creates nothing", …)              // item 3 has effort 9 → invalid_input; task count 0
it("reorders within an achievement and moves to another achievement", …) // area follows the new achievement
it("completes: completedAt, completion row, xp frozen from effort", …)  // effort 4 → xpAwarded 100; later updateTask effort 1 → completion still 100
it("an Inbox task completes with 0 xp", …)
it("occurrenceDate uses the owner's time zone", …)                     // owner tz Pacific/Auckland, now 2026-03-10T11:30Z → "2026-03-11"
it("completing twice is invalid_state; uncompleting an open task is invalid_state", …)
it("uncomplete removes the completion row and its xp", …)              // count(task_completions) 0
it("update of a deleted task is not_found", …)
```

- [ ] **Step 2: Run** `pnpm vitest run src/server/domain/tasks`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** it again. Expected: PASS.
- [ ] **Step 5: Commit** `feat(domain): tasks, batch create, completions with frozen xp`.

---

### Task 7: Categories

**Files:**
- Create: `src/server/domain/categories.ts`
- Modify: `src/server/domain/achievements.ts` (`getAchievement` fills `categoryIds`, excluding deleted categories)
- Test: `src/server/domain/categories.db.test.ts`

**Interfaces:**
- Produces:
  - `createCategory({ name: string(1..40, trimmed), color: string(1..32) }) → Category`: a duplicate name (case-insensitive, among non-deleted) → `conflict`.
  - `updateCategory({ categoryId, name?, color? }) → Category`
  - `deleteCategory({ categoryId }) → { deleted: 1 }` (soft; join rows stay and are filtered out on read).
  - `setTaskCategories({ taskId, categoryIds: uuid[] (0..20, unique) }) → { categoryIds: string[] }`
    - Replaces the set.
    - Records one `task_categories` event with `entityId = taskId`, and `before` / `after` = `{ categoryIds: string[] }` sorted.
    - Unknown, deleted or foreign category → `not_found`.
  - `listCategories({ areaId?: uuid }) → (Category & { usedInArea: number })[]`. Order: `usedInArea` desc (count of non-deleted tasks in that area carrying it), then name asc. Without `areaId`, `usedInArea` is 0 and the order is by name.

- [ ] **Step 1: Write the failing tests**

```ts
it("creates and rejects a case-insensitive duplicate with conflict", …)
it("sets, replaces and clears a task's categories with one event each", …) // [a,b] → [b,c] → []; event.before/after categoryIds
it("rejects a deleted category on a task", …)
it("lists categories used in this area first", …)                       // Guitar tasks use Technique×2, Theory×1; Exposure unused → Technique, Theory, Exposure
it("getAchievement shows categoryIds and hides deleted categories", …)
```

- [ ] **Step 2: Run** `pnpm vitest run src/server/domain/categories src/server/domain/achievements`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** it again. Expected: PASS.
- [ ] **Step 5: Commit** `feat(domain): global categories with per-area suggestions`.

---

### Task 8: Inbox capture and filing, practice log

**Files:**
- Create: `src/server/domain/inbox.ts`, `src/server/domain/practice.ts`
- Test: `src/server/domain/inbox.db.test.ts`, `src/server/domain/practice.db.test.ts`

**Interfaces:**
- Consumes: `callAction` with `createTask`, `createAchievement`, `moveTask`, `moveAchievement`.
- Produces:
  - `captureItem({ text: string, context?: { areaId?: uuid; achievementId?: uuid } }) → { kind: "task" | "achievement"; id: string }`. *(Spec §5.6 is the builder's call; this table is the call.)*

    | Trimmed text | Context | Creates |
    |---|---|---|
    | no leading `!` | none | Inbox task |
    | leading `!` | none | Inbox achievement |
    | either | `areaId` | backlog achievement in that area (a task can't sit directly in an area) |
    | no leading `!` | `achievementId` | task in that achievement |
    | leading `!` | `achievementId` | backlog achievement in that achievement's area |

    The `!` and surrounding whitespace are stripped. An empty result → `invalid_input`.
  - `fileAchievement({ achievementId, areaId }) → Achievement` = moveAchievement to that area, backlog, appended.
  - `fileTask({ taskId, achievementId }) → Task` = moveTask, appended.
  - `listInbox({}) → { achievements: Achievement[]; tasks: Task[] }`: Inbox achievements and tasks with no achievement, newest first.
  - `addPracticeEntry({ taskId, startedAt?: z.iso.datetime() (default now), durationSeconds?: int ≥ 0, metrics?: record<string, number | string>, note?: string(..2000) }) → PracticeEntry`. `source = actor === "ui" ? "manual" : actor`.
  - `listPracticeEntries({ taskId }) → PracticeEntry[]`, newest `startedAt` first.

- [ ] **Step 1: Write the failing tests**

```ts
it.each([
  ["Buy a capo", undefined, "task", "inbox"],
  ["! Learn Dorian", undefined, "achievement", "inbox"],
  ["Sweep 3 strings", { areaId: "guitar" }, "achievement", "guitar/backlog"],
  ["Sweep 3 strings", { achievementId: "sweep" }, "task", "sweep"],
])("capture %j with %j makes a %s in %s", …)
it("rejects whitespace-only and a bare '!'", …)                  // "   ", " ! " → invalid_input
it("files an Inbox achievement into an area's backlog and its tasks follow", …)
it("files an Inbox task into an achievement and gains its areaId", …)
it("listInbox shows only unfiled, undeleted items, newest first", …)
it("logs practice with metrics and source manual; mcp actor is kept", …) // deps actor "mcp:claude" → source "mcp:claude"
it("lists practice entries newest first and records events", …)
```

- [ ] **Step 2: Run** `pnpm vitest run src/server/domain/inbox src/server/domain/practice`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** it again. Expected: PASS.
- [ ] **Step 5: Commit** `feat(domain): inbox capture and filing, practice log`.

---

### Task 9: Undo, and the ownership sweep

**Files:**
- Modify: `src/server/domain/history.ts` (registry + `undoBatch`)
- Test: `src/server/domain/history.db.test.ts`, `src/server/domain/ownership.db.test.ts`

**Interfaces:**
- Produces: `undoBatch({ batchId: uuid }) → { batchId: string; restored: number }`. The returned `batchId` is the new restore batch.

Algorithm (the part the tests don't determine):

```
events  = change_events where owner & batchId & undone_at is null, order by seq
if none: batch exists but all undone → already_undone; batch unknown → not_found
per entity (type,id): first = earliest event, last = latest event
conflicts = entities where normalise(read(type,id)) != normalise(last.after)
            (normalise: drop updatedAt; read returns null when the row is absent;
             task_categories read = { categoryIds sorted })
if conflicts: throw conflict { changed: [{ entityType, entityId }] }
for entities in reverse order of last.seq:
    current = read(type,id)
    apply(type, id, first.before)   // null on a soft table → set deletedAt = now;
                                    // null on a hard table → delete row;
                                    // object → upsert row from snapshot (hydrate timestamp columns from ISO)
    recordChange(ctx, { type, id, op: "restore", before: current, after: read(type,id) })
mark the batch's events undone_at = now, undone_by_batch = ctx.batchId
```

The registry maps each `EntityType` to `{ read, apply }`. The table-backed types share one generic implementation over their Drizzle table; it hydrates columns whose `dataType` is `"date"`. `task_categories` has its own read/apply, which replaces the join rows.

- [ ] **Step 1: Write the failing tests** `history.db.test.ts`

```ts
it("undoes an area update", …)                        // name back; a restore event exists in a new batch
it("undoes a create (row soft-deleted) and a delete cascade (all rows back)", …)
it("undoes createTasks ×15 as one step", …)
it("undoes a cross-area achievement move, restoring the tasks' areaId", …)
it("undoes complete (completion row gone) and uncomplete (row back with the same xp)", …)
it("undoes setTaskCategories", …)
it("refuses when a later batch changed an entity, naming it", …) // A: rename; B: rename again; undo A → conflict, details.changed has the area
it("allows it once the later batch is undone", …)                 // undo B, then undo A → ok, original name
it("undo of the undo re-applies the change", …)                   // undo A (batch U); undo U → name is A's value again
it("undoing the same batch twice is already_undone; unknown batch is not_found", …)
it("a failing undo leaves no partial restore", …)                // conflict on one of two entities → neither changed, no restore events
```

`ownership.db.test.ts`:
- Owners A and B; B creates one of everything.
- `it.each` over every mutation and read action from Tasks 4–9, called as A with B's ids. Each must throw `not_found`, and B's rows and the event count must be unchanged afterwards.
- `undoBatch` with B's batchId → `not_found`.

- [ ] **Step 2: Run** `pnpm vitest run src/server/domain/history src/server/domain/ownership`. Expected: FAIL (undoBatch missing). Any ownership case that passes before the fix is fine. Note it in the commit message if one *fails* for a reason other than "not_found expected".
- [ ] **Step 3: Implement** the registry and `undoBatch`.
- [ ] **Step 4: Run** `pnpm test`. Expected: all green, coverage ≥90% on `src/lib` and `src/server/domain`.
- [ ] **Step 5: Commit** `feat(domain): undo batches with conflict refusal and undo-of-undo; ownership sweep`.

---

### Task 10: Seed script, run on `seed`, tick the roadmap

**Files:**
- Create: `scripts/lib/seed-data.ts`, `scripts/seed.ts`, `scripts/lib/seed-guard.ts`
- Modify: `package.json` (script `"db:seed": "tsx --env-file-if-exists=.env.local scripts/seed.ts"`), `docs/ROADMAP.md`
- Test: `scripts/lib/seed-guard.test.ts`, `scripts/lib/seed-data.db.test.ts`

**Interfaces:**
- Consumes: every action through `runAction` with actor `"seed"`.
- Produces:
  - `assertSeedable(ownerEmail: string | undefined, env: { APP_ENV?: string; VERCEL_ENV?: string }): void`. Throws unless `ownerEmail` ends with `@e2e.test` and neither env is `production`. This means the seed can never write into the real owner's account.
  - `seedSampleData(ctx)`, a `defineAction(z.object({}), …)` that creates everything in **one batch**:
    - Areas Guitar 🎸, Singing 🎤, Irish flute 🪈, DAWs 🎛️ and Social confidence 🗣️, with gradient covers.
    - Categories Technique, Theory, Repertoire, Exposure.
    - In Guitar: achievements "Sweep pick effortlessly" (active, a 5-task ladder with increasing effort), "Spot which mode fits a progression" (backlog) and "Pinch harmonics on demand" (done, all tasks completed).
    - In Social confidence: "Feel at ease talking to strangers" (active, a 10-step ladder from effort 1 to 5).
    - At least one deadline and one practice entry with `{ bpm: 95 }`.
    - Two Inbox items.
  - CLI `pnpm db:seed`:
    - Reads `MIGRATION_DATABASE_URL` and `E2E_OWNER_EMAIL`, then runs `assertSeedable`.
    - Finds the user by email; if there's none, exits 1 with "run pnpm e2e:users first".
    - If the owner already has areas, prints "already seeded" and exits 0.

- [ ] **Step 1: Write the failing tests.**
  - `seed-guard.test.ts`: `owner@e2e.test` + `local` → ok; `levan@gmail.com` → throws; `owner@e2e.test` + `APP_ENV=production` → throws; `owner@e2e.test` + `VERCEL_ENV=production` → throws; `undefined` → throws.
  - `seed-data.db.test.ts`: `runAction` of `seedSampleData` produces 5 areas, 4 categories, and exactly one distinct `batchId` in `change_events`; the done achievement has `completedAt`; `listInbox` has 2 items.
- [ ] **Step 2: Run** `pnpm vitest run scripts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Add `scripts/lib/**` to coverage `include` only if it's needed to meet the gate; it isn't required.
- [ ] **Step 4: Run** `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm format:check`. Expected: all pass. Then run it locally:
  1. `pnpm db:migrate`, `pnpm e2e:users`, then `pnpm db:seed`. Expected: "seeded 5 areas".
  2. Run `pnpm db:seed` again. Expected: "already seeded".
- [ ] **Step 5: Owner-approved:** seed the Neon `seed` branch so every PR database starts with sample data. With `MIGRATION_DATABASE_URL` = the seed branch's direct URL:
  1. `pnpm db:migrate`
  2. `E2E_OWNER_EMAIL=owner@e2e.test E2E_OWNER_PASSWORD=<any> E2E_INTRUDER_EMAIL=intruder@e2e.test E2E_INTRUDER_PASSWORD=<any> APP_ENV=preview pnpm e2e:users`
  3. `pnpm db:seed`

  Expected: "seeded 5 areas". The preview workflow's reset + `e2e:users` keeps the owner's id, so the data stays attached.
- [ ] **Step 6: Tick** every M1 item in `docs/ROADMAP.md`.
- [ ] **Step 7: Commit** `feat: sample-data seed; tick M1`. Push the branch and open a PR (owner-approved). Wait for `checks` + `playwright` to be green, then merge (owner-approved). Production deploys automatically. The deploy smoke's `--schema` now expects 3.
