# In-app chat with Claude Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Claude button on every page opens a chat that can act on the owner's data through the existing domain actions, with a self-updating model picker, resumable conversations and a profile Claude keeps about the owner (shared with the Claude app through MCP).

**Architecture:** The server runs the tool loop with the Anthropic TypeScript SDK in `src/server/chat/`, calling the same `TOOLS` the MCP server uses through `runAction` with actor `chat`. Conversations and messages are stored as exact API content blocks in Postgres and replayed append-only. A streaming route (`/api/chat`) sends NDJSON events to a client panel in `src/components/app/chat/`. The profile is a normal domain entity (History + undo) exposed as two tools on both the chat and MCP.

**Tech Stack:** Next.js 16.4 (App Router), React 19.3, Drizzle + Postgres (Neon), zod 4, `@anthropic-ai/sdk`, assistant-ui (chat panel and dictation), Vitest (+ PGlite db tests), Playwright, shadcn/radix UI.

**Spec:** `docs/superpowers/specs/2026-10-31-in-app-chat-design.md`

## Global Constraints

- Read the relevant guide in `node_modules/next/dist/docs/` before writing route handlers, streaming responses, server actions or caching code (AGENTS.md).
- Work on a new branch `in-app-chat` from `main`.
- Anthropic calls only through `@anthropic-ai/sdk` on the server; key in `ANTHROPIC_API_KEY`; never imported by client code (`import "server-only"` in every `src/server/chat/*` module).
- Tiers and fallback models: Quick `claude-haiku-5-5` effort `low`; Smart `claude-sonnet-5-5` effort `medium`; Deepest `claude-opus-5-5` effort `high`. Model ids exactly as written, no date suffixes.
- Never send `thinking: {type: "disabled"}`, `budget_tokens`, `temperature`, `top_p`, `top_k`, or `tool_choice` `any`/`tool`. Always send `output_config.effort`.
- Smart and Deepest requests send `fallbacks: "default"` with beta `server-side-fallback-2026-07-01`.
- Per turn: at most 10 tool round-trips; `max_tokens` 8000; 20 chat turns a minute per owner (`hitRateLimit`, key `chat:<ownerId>`).
- Message history is append-only: stored content blocks are sent back byte-for-byte unchanged, never edited or reordered.
- Actor for chat changes: `chat`; History label "Claude in chat".
- Profile sections `about`, `focus`, `planning`, `style`, labelled "About me", "Current focus", "How I plan", "How to talk to me"; each at most 1,000 characters.
- Conversation title: first user message trimmed to 60 characters.
- Domain code must not import from `src/server/chat`, `src/server/mcp`, `src/server/actions` or `src/app` (`eslint.boundaries.mjs`).
- All user-facing copy in sentence case, matching the existing app tone.

## Review Focus

1. **A reply cut off mid-turn** (network drop, closed panel, function timeout): every completed round-trip is already saved; reopening shows the owner's last message with a Retry that resumes without duplicating it.
2. **A new message sent while a delete is waiting for confirmation**: the pending call is answered as declined in the same user turn, so the next request is valid and nothing is deleted.
3. **Switching models in a conversation that has thinking blocks from another model**: history goes out unchanged and the request succeeds.
4. **Claude sends invalid tool input** (unknown id, profile text over 1,000 characters): Claude gets the app's normal error message as an error tool result; the turn continues.
5. **Models API unreachable, or a family missing from it**: the picker still shows all three tiers using the built-in fallback models.

Each has a test in the owning task (Tasks 5, 5, 5, 4, 3).

---

## File Structure

| Path | Responsibility |
| --- | --- |
| `src/server/db/chat.ts` | `profile_sections`, `conversations`, `chat_messages` tables |
| `src/server/domain/profile.ts` | profile read/update actions |
| `src/server/domain/conversations.ts` | conversation list/get/search/delete/append actions |
| `src/server/chat/models.ts` | tier catalogue, Models API lookup, daily cache, overrides |
| `src/server/chat/tools.ts` | Anthropic tool definitions and tool execution for chat |
| `src/server/chat/prompt.ts` | system prompt and profile block |
| `src/server/chat/engine.ts` | the turn loop: request, stream, tools, persistence |
| `src/server/chat/events.ts` | NDJSON event types shared by route and panel (no server-only import) |
| `src/app/api/chat/route.ts` | streaming POST endpoint |
| `src/server/actions/chat.ts` | server actions: list/get/delete conversations, tiers |
| `src/components/app/chat/*` | button, panel, message list, picker, conversation list |
| `src/components/app/profile-form.tsx`, `chat-model-settings.tsx` | Settings sections |

---

### Task 1: Profile as a domain entity

**Files:**
- Create: `src/server/db/chat.ts` (only `profileSections` in this task), `src/server/domain/profile.ts`, `src/server/domain/profile.db.test.ts`
- Modify: `src/server/db/schema.ts` (export `./chat`), `src/server/domain/history.ts` (`EntityType` += `"profile_section"`), `src/server/domain/undo.ts` (registry + `FALLBACK_LABELS`), `src/server/domain/history-summary.ts`, `src/server/domain/history-summary.test.ts`, `src/server/domain/rows.ts` (`SoftTable` += `typeof profileSections`), `src/server/domain/export.ts`, `src/server/domain/export.db.test.ts`, `src/server/domain/context.ts` (`Actor` += `"chat"`), `actorLabel` in `history-summary.ts`
- Generate: a drizzle migration

**Interfaces:**
- Produces:
  - `profileSections` table: `base()` columns (id, ownerId, createdAt, updatedAt, deletedAt) + `section` pg enum `profile_section` (`about|focus|planning|style`) + `text text not null`; unique index on `(owner_id, section)`.
  - `PROFILE_SECTIONS: readonly ["about","focus","planning","style"]`, `PROFILE_LABELS: Record<ProfileSection, string>` (labels from Global Constraints), `type ProfileSection`.
  - `getProfile`: `Action<{}, { sections: { section: ProfileSection; label: string; text: string }[]; updatedAt: Date | null }>` — always all four sections in order, empty text when no row; `updatedAt` is the newest row's.
  - `updateProfile`: `Action<{ section: ProfileSection; text: string /* trim, max 1000 */ }, { section; label; text }>` — inserts with `insertRecorded` or updates with `updateRecorded` (entity type `profile_section`); same text → no change event.
  - `Actor = "ui" | "seed" | "chat" | \`mcp:${string}\``; `actorLabel("chat") === "Claude in chat"`.

- [ ] **Step 1: Write failing db tests** in `profile.db.test.ts` (use `runner` from `src/test/factories.ts`):
  - `getProfile` on a new owner returns four sections in order with `text: ""` and `updatedAt: null`.
  - `updateProfile({section:"focus", text:"  Barre chords  "})` returns `text: "Barre chords"`; `getProfile` shows it.
  - text of 1,001 characters throws `DomainError` with code `invalid_input`.
  - updating twice then `undoBatch` of the second batch restores the first text; undoing the first batch empties it.
  - an update made with `actor: "chat"` appears in `listHistory` with `who: "Claude in chat"` and summary `Updated your profile: Current focus`.
  - another owner's `getProfile` doesn't see it.
- [ ] **Step 2:** Run `pnpm vitest run src/server/domain/profile.db.test.ts` — expect FAIL (module not found).
- [ ] **Step 3:** Add the table, `pnpm db:generate`, the actions, the undo registry entry `profile_section: tableEntity(profileSections, true)` with fallback label `"your profile"`, the summary line (`Updated your profile: <label>` for any `profile_section` create/update; label from `PROFILE_LABELS` — `history-summary.ts` stays pure, so pass the label map in or duplicate the four labels there), `"chat"` actor, and profile rows in `exportData` (add an export test assertion).
- [ ] **Step 4:** Run `pnpm vitest run src/server/domain` and `pnpm typecheck` — expect PASS.
- [ ] **Step 5:** Commit `feat(profile): owner profile sections with history and undo`.

### Task 2: Profile tools on MCP, and the Settings profile form

**Files:**
- Modify: `src/server/mcp/tools.ts`, `src/server/mcp/server.test.ts` (`SPEC_TOOLS`), `docs/mcp.md`, `src/app/(app)/settings/page.tsx`
- Create: `src/server/actions/profile.ts`, `src/components/app/profile-form.tsx`, `src/components/app/profile-form.dom.test.tsx`

**Interfaces:**
- Consumes: `getProfile`, `updateProfile`, `PROFILE_LABELS` (Task 1).
- Produces: tools `get_profile`, `update_profile` in `TOOLS`; server action `saveProfileSection(section, text): Promise<Result<{ text: string }>>` via `act`.

- [ ] **Step 1: Failing tests.** Add both names to `SPEC_TOOLS`. In `profile-form.dom.test.tsx`: renders four labelled textareas with current text; editing "Current focus" and blurring calls `saveProfileSection("focus", <text>)` once; a character counter shows `n/1000`; an `ok:false` result shows its `message`.
- [ ] **Step 2:** `pnpm vitest run src/server/mcp/server.test.ts src/components/app/profile-form.dom.test.tsx` — expect FAIL.
- [ ] **Step 3:** Add the tools. Descriptions (exact):
  - `get_profile`: "The owner's profile: what they've told you about themselves (About me, Current focus, How I plan, How to talk to me). Read it at the start of a conversation if you don't already have it."
  - `update_profile`: "Rewrite one section of the owner's profile (about, focus, planning, style; up to 1,000 characters). Use it only for lasting facts the owner states or confirms, not one-off requests. Merge the new fact into the section's current text instead of appending, and drop anything it makes untrue."
  - summaries: `get_profile` → `Read profile`; `update_profile` → `Updated profile: <label>`.
  Build the form (save on blur, like `settings-form.tsx`) and a "Profile" section in Settings above "Evening reminder". In `docs/mcp.md`, add a paragraph: Claude app users can add "Use my life-goals profile: read it at the start and keep it up to date" to their Claude instructions.
- [ ] **Step 4:** Rerun the tests and `pnpm lint` — expect PASS.
- [ ] **Step 5:** Commit `feat(profile): profile tools for AI apps and a Settings form`.

### Task 3: Model tiers that update themselves

**Files:**
- Create: `src/server/chat/models.ts`, `src/server/chat/models.test.ts`
- Modify: `src/server/db/settings.ts` (nullable `chat_model_quick`, `chat_model_smart`, `chat_model_deep` text columns) + migration, `src/server/domain/settings.ts` (read/update the overrides, validated as `^claude-[a-z0-9-]+$` or null), its db test, `package.json` (`@anthropic-ai/sdk`)

**Interfaces:**
- Produces:
  - `type Tier = "quick" | "smart" | "deep"`; `TIERS: Record<Tier, { label: "Quick" | "Smart" | "Deepest"; family: "haiku" | "sonnet" | "opus"; effort: "low" | "medium" | "high"; fallback: string }>`.
  - `pickNewest(models: { id: string; display_name: string; created_at: string }[], family): { id: string; name: string } | null` — matches ids `claude-<family>-<n>(-<n>)*`, compares the numeric parts as a version, ties broken by `created_at`; ignores ids with an 8-digit date part.
  - `resolveTiers(opts: { list: () => Promise<ModelInfo[]>; overrides: Partial<Record<Tier, string | null>>; now: Date }): Promise<Record<Tier, { id: string; name: string }>>` — override wins; else newest from the list; else the fallback with a name like "Claude Haiku 5.5". Caches the list in module memory for 24 h; a failed list call is cached for 10 min and falls back.
  - `fallbackFor(tier): string`; `tierOf(modelId): Tier | null` (by family).

- [ ] **Step 1: Failing unit tests** (`models.test.ts`, fake `list`):
  - newest wins: `claude-sonnet-5-5`, `claude-sonnet-6`, `claude-sonnet-5` → `claude-sonnet-6`.
  - `claude-haiku-4-5-20251001` is ignored when `claude-haiku-5-5` exists.
  - `list` throws → all three tiers equal the fallbacks (Review Focus 5).
  - list without any opus → `deep` is `claude-opus-5-5`.
  - override `{smart: "claude-opus-5"}` → smart id `claude-opus-5`.
  - two calls within 24 h call `list` once; a call 25 h later calls it again.
- [ ] **Step 2:** `pnpm vitest run src/server/chat/models.test.ts` — expect FAIL.
- [ ] **Step 3:** `pnpm add @anthropic-ai/sdk`; implement; the real `list` is `() => client.models.list()` collected across pages (the SDK auto-paginates).
- [ ] **Step 4:** Rerun plus `pnpm vitest run src/server/domain/settings.db.test.ts` — expect PASS.
- [ ] **Step 5:** Commit `feat(chat): model tiers resolved from the Models API`.

### Task 4: Conversation storage and chat tools

**Files:**
- Modify: `src/server/db/chat.ts` (+ migration), `src/server/domain/export.ts`
- Create: `src/server/domain/conversations.ts`, `src/server/domain/conversations.db.test.ts`, `src/server/chat/tools.ts`, `src/server/chat/tools.db.test.ts`

**Interfaces:**
- Consumes: `TOOLS`, `ToolDef` (`src/server/mcp/tools.ts`), `runAction`, `DomainError`, `messageFor`.
- Produces:
  - Tables: `conversations` (`base()` + `title text not null`, `model text not null`); `chat_messages` (`id uuid pk`, `conversationId` fk, `ownerId`, `seq integer not null`, `role` enum `chat_role` (`user|assistant|system`), `content jsonb not null` (array of API content blocks, or a string for `system`), `model text`, `usage jsonb`, `meta jsonb` (`{ tools?: Record<toolUseId, { summary: string; batchId: string | null; error?: boolean }> }`), `createdAt`); unique `(conversation_id, seq)`.
  - Actions in `conversations.ts` (not recorded in History; my call, the spec doesn't ask for undo of chats): `createConversation({title, model}) → Conversation`; `setConversationModel({id, model})`; `appendMessages({conversationId, messages: NewChatMessage[]}) → ChatMessage[]` (assigns next seqs, bumps `updatedAt`); `listConversations({}) → {id,title,model,updatedAt}[]` newest first, live only; `getConversation({id}) → {conversation, messages}`; `deleteConversation({id})` soft; `searchConversations({query, limit≤10}) → {id,title,updatedAt,snippets: string[]}[]` (ILIKE over title and the `text` of user/assistant text blocks, snippets ≤160 chars around the match).
  - `chat/tools.ts`:
    - `chatToolDefs(): Anthropic.Tool[]` — every `TOOLS` entry (`input_schema: z.toJSONSchema(action.input, { io: "input" })`) plus `search_conversations` and `get_conversation`; `cache_control: {type:"ephemeral"}` on the last tool.
    - `isDestructive(name): boolean` (from `ToolDef.destructive`).
    - `runChatTool(deps: { db; ownerId }, block: { id; name; input }): Promise<{ result: Anthropic.ToolResultBlockParam; summary: string; batchId: string | null }>` — runs with actor `chat` and a fresh batch id; `batchId` is non-null only when change events with that id exist; `DomainError` → `is_error: true` with `messageFor(code, details)`; other errors → Sentry + "Something went wrong. Try again."; unknown tool name → error result.
    - `describeDestructive(deps, name, input): Promise<string>` — `delete_item` → `Delete <kind> “<title>”?`; `undo_batch` → `Undo “<that batch's summary>”?`.

- [ ] **Step 1: Failing db tests.**
  - conversations: append assigns seqs 1..n in order; `listConversations` orders by latest append; deleted ones vanish; `searchConversations({query:"barre"})` finds a conversation by an assistant text block and returns a snippet containing "barre"; another owner can't get or search it.
  - tools: `chatToolDefs()` has `TOOLS.length + 2` tools, each `input_schema.type === "object"`; `runChatTool` with `create_area {name:"Guitar"}` returns summary `Added area “Guitar”`, a non-null `batchId`, and `listHistory` shows `who: "Claude in chat"`; `get_overview` returns `batchId: null`; `update_task` with an unknown uuid returns `is_error: true` and the `not_found` message (Review Focus 4); `update_profile` with 1,001 characters returns `is_error: true`; `describeDestructive("delete_item", {kind:"achievement", id})` → `Delete achievement “Learn barre chords”?`.
- [ ] **Step 2:** `pnpm vitest run src/server/domain/conversations.db.test.ts src/server/chat/tools.db.test.ts` — expect FAIL.
- [ ] **Step 3:** Implement; `pnpm db:generate`; include conversations and messages in `exportData`.
- [ ] **Step 4:** Rerun; `pnpm typecheck` — expect PASS.
- [ ] **Step 5:** Commit `feat(chat): conversation storage and chat tool adapter`.

### Task 5: The chat engine

**Files:**
- Create: `src/server/chat/events.ts`, `src/server/chat/prompt.ts`, `src/server/chat/engine.ts`, `src/server/chat/engine.db.test.ts`

**Interfaces:**
- Consumes: Tasks 1, 3, 4.
- Produces:
  - `events.ts` (client-safe): `type ChatEvent = {type:"conversation"; id; title; model} | {type:"text"; delta} | {type:"tool"; id; name; summary; batchId: string | null; error: boolean} | {type:"confirm"; toolUseId; name; prompt: string} | {type:"done"; model; changed: boolean} | {type:"error"; message; retryable: boolean}`.
  - `prompt.ts`: `systemPrompt(): Anthropic.TextBlockParam[]` (stable text, `cache_control` ephemeral) and `contextBlock(profile, settings, now): string` (date `YYYY-MM-DD` and weekday in the owner's time zone, time zone, week start, then the four profile sections, empty ones omitted). The stable text covers: what the app's entities are; "act on clear instructions without asking; ask when the request is ambiguous"; "keep replies short unless the owner wants to talk it through"; use `update_profile` per its description; dates in the owner's time zone.
  - `engine.ts`: `type TurnInput = { conversationId?: string; tier?: Tier; text?: string; confirm?: { toolUseId: string; approve: boolean }; retry?: boolean }`; `runTurn(deps: { db; ownerId; client: ChatClient; now: () => Date; models: Record<Tier, {id; name}> }, input: TurnInput, emit: (e: ChatEvent) => void): Promise<void>`. `ChatClient` is the minimal slice of the SDK the engine calls (`beta.messages.stream`), so tests pass a fake.

Turn rules (the algorithm the tests pin):
1. No `conversationId` → create a conversation (title = trimmed first 60 chars of `text`, model = chosen tier's id) and emit `conversation`. A `tier` on an existing conversation → `setConversationModel`.
2. New user message content: if the last stored assistant message ends in an unanswered destructive `tool_use`, first a `tool_result` "The owner declined." for it (Review Focus 2), then: on the conversation's first message, a text block with `contextBlock(...)`; then the owner's text. Persist it before calling the API. If the conversation's last message is older than the profile's `updatedAt`, append a `system` message with the new `contextBlock` after this user message.
3. `confirm`: approve → `runChatTool`; decline → `tool_result` "The owner declined."; persist as a user message, then continue the loop.
4. `retry`: don't add a message; history must end with a user message.
5. Loop (max 10 requests): `client.beta.messages.stream({ model, max_tokens: 8000, system: systemPrompt(), tools: chatToolDefs(), messages: <stored, unchanged>, output_config: {effort}, context_management: {edits:[{type:"compact_20260112"}]}, betas: ["compact-2026-01-12", ...(tier !== "quick" ? ["server-side-fallback-2026-07-01"] : [])], ...(tier !== "quick" ? {fallbacks:"default"} : {}) })`; forward text deltas as `text`; persist the final assistant `content` exactly (with `model`, `usage`). Stop reasons: `end_turn` → done; `refusal` → emit `error` "Claude declined to answer this one." (not retryable); `max_tokens` → done; `tool_use` → run each non-destructive tool (emit `tool`), return all results in one user message (persist with `meta.tools`); if any call is destructive, run the others, emit `confirm` for the first destructive one and end the turn (its result comes from step 3). On the 10th request still wanting tools, append a user text "Stop using tools now and summarise what you did." and make one last request without tools.
6. A 400 on a model that isn't the tier's fallback → Sentry, retry the request once on `fallbackFor(tier)`. Other API errors → emit `error` "Claude couldn't answer. Try again." with `retryable: true`; everything persisted so far stays.
7. `done.changed` is true when any tool in the turn returned a `batchId`.

- [ ] **Step 1: Failing tests** (`engine.db.test.ts`, a fake `ChatClient` returning scripted final messages and recording request bodies):
  - first message creates a conversation titled from the text, sends one user message whose first block contains the profile's "Current focus" text, and stores the assistant reply.
  - a `tool_use` for `create_area` runs it, emits `tool` with a `batchId`, sends back one user message with the `tool_result`, and `done.changed === true`.
  - a `delete_item` call emits `confirm` with `Delete achievement “…”?` and deletes nothing; `confirm {approve:true}` deletes it and continues; `{approve:false}` sends "The owner declined.".
  - sending text while a delete is pending: the next request's last user message starts with a declined `tool_result` for that id (Review Focus 2).
  - switching tier mid-conversation: the second request's `messages` deep-equal the stored history, including a `thinking` block from the first model (Review Focus 3).
  - the fake throws after the first tool round: the user message, assistant tool call and tool results are stored; `retry` sends exactly that history again and no duplicate user message (Review Focus 1).
  - 11 consecutive tool calls → at most 11 requests, the last without `tools`.
  - Smart requests carry `fallbacks: "default"` and the `server-side-fallback-2026-07-01` beta; Quick ones don't; no request has `thinking`, `temperature` or `tool_choice`.
  - a 400 from `claude-sonnet-6` retries once on `claude-sonnet-5-5`.
  - profile edited after the last message → the next request ends with a `system` message containing the new text.
- [ ] **Step 2:** `pnpm vitest run src/server/chat/engine.db.test.ts` — expect FAIL.
- [ ] **Step 3:** Implement `prompt.ts` and `engine.ts`. Check the SDK's `beta.messages.stream` types for `fallbacks`, `context_management` and `output_config`; fetch the SDK repo if a field is missing from the installed types rather than guessing.
- [ ] **Step 4:** Rerun; `pnpm typecheck && pnpm lint` — expect PASS.
- [ ] **Step 5:** Commit `feat(chat): the chat turn loop`.

### Task 6: Route and server actions

**Files:**
- Create: `src/app/api/chat/route.ts`, `src/app/api/chat/route.db.test.ts`, `src/server/actions/chat.ts`
- Modify: `.env.example` (`ANTHROPIC_API_KEY=`), `src/server/auth/paths.ts` if API paths need listing (check `paths.test.ts`)

**Interfaces:**
- Consumes: `runTurn`, `resolveTiers`, conversation actions.
- Produces:
  - `POST /api/chat` body = `TurnInput` (zod-validated) → `200` `application/x-ndjson` stream of `ChatEvent`, one JSON per line; `401` when not the owner (`requireOwnerApi`); `429` with `retry-after` over 20 turns a minute; `400` on bad input. `export const maxDuration` = the Vercel Hobby maximum (check the current limit in Vercel's docs).
  - Server actions: `listChats(): Promise<ConversationSummary[]>`, `openChat(id): Promise<{conversation; items: ChatItem[]}>`, `removeChat(id): Promise<Result>`, `chatTiers(): Promise<Record<Tier, {id; name; label}>>`.
  - `ChatItem` (in `events.ts`): `{kind:"user"; text} | {kind:"assistant"; text; model} | {kind:"tool"; summary; batchId; error} | {kind:"confirm"; toolUseId; prompt}` — the panel's view of stored messages: context blocks, `system` messages and thinking are hidden; tool lines come from `meta.tools`; a trailing unanswered destructive call becomes `confirm`.

- [ ] **Step 1: Failing tests:** route with a stubbed engine — non-owner gets 401; the 21st turn in a minute gets 429; a valid body streams lines that parse as `ChatEvent`s in order. `openChat` maps a stored conversation with a context block, a thinking block, a tool round and a pending delete into `[user, tool, assistant, confirm]` items.
- [ ] **Step 2:** Run — expect FAIL.
- [ ] **Step 3:** Implement (read `node_modules/next/dist/docs/` on route handlers and streaming first). Build the real Anthropic client once per request; `runTurn` writes events into a `ReadableStream`.
- [ ] **Step 4:** Run; `pnpm typecheck` — expect PASS.
- [ ] **Step 5:** Commit `feat(chat): streaming chat route and chat server actions`.

### Task 7: The chat panel

**Files:**
- Create: `src/components/app/chat/chat-button.tsx`, `chat-panel.tsx`, `chat-messages.tsx`, `model-picker.tsx`, `conversation-list.tsx`, `use-chat.ts`, `chat-panel.dom.test.tsx`, `use-chat.dom.test.tsx`; `e2e/chat.spec.ts`
- Modify: `src/app/(app)/layout.tsx`, `src/components/app/command-palette.tsx` (+ its test)

**Interfaces:**
- Consumes: `ChatEvent`, `ChatItem`, the server actions and route (Task 6), `undoBatch` server action from `src/server/actions/history.ts`.
- Produces: `<ChatButton />` mounted once in the app layout; a `ChatProvider` context with `openChat(conversationId?: string)` used by the palette.

- [ ] **Step 1: Install assistant-ui and check fit.** The owner chose assistant-ui. Install it (`pnpm add` the packages its docs name for a custom runtime and dictation; read its docs for the current names), wire a custom runtime fed by `use-chat`'s NDJSON events, and confirm it builds with React 19.3 and Tailwind 4/shadcn and can render our `tool` and `confirm` items as custom message parts. If it can't, fall back to the existing `components/ui` parts and the Web Speech API directly, and say why in the PR.
- [ ] **Step 2: Failing tests.**
  - `use-chat`: feeding events `conversation → text×2 → tool → done{changed:true}` yields items `[user, tool, assistant]` and calls `router.refresh()` once; an `error{retryable:true}` shows Retry, which posts `{conversationId, retry:true}`.
  - panel: the button opens a new, empty conversation every time (the panel is reset); the picker shows Quick, Smart and Deepest with each tier's model name and defaults to Quick; choosing Smart sends `tier:"smart"` with the next message; Conversations lists `listChats()` results and opening one renders its items; a `confirm` item shows Confirm/Cancel that post `confirm`; a tool line with a `batchId` shows Undo that calls the undo action; `Ctrl+J`/`Cmd+J` opens it.
  - dictation (stub `window.SpeechRecognition`/`webkitSpeechRecognition`): the microphone button starts recognition; interim results show in the message box and the final result stays there editable, not sent; pressing it again stops; with neither constructor present the button isn't rendered; a recognition `error` event shows "Couldn't hear that. Try again." and leaves typed text intact.
  - palette: "Ask Claude" opens the panel.
- [ ] **Step 3:** Run — expect FAIL.
- [ ] **Step 4:** Implement. Layout: floating round button bottom-right on desktop; on the phone above the tab bar, clear of `env(safe-area-inset-bottom)`; right sheet on desktop (`md:` and up), full screen on the phone. Header: model picker, Conversations, New, close. Each assistant message shows its model name in small muted text. Empty state: three suggestion chips (my call: "Plan my day", "Add a task", "How am I doing this week?"). Microphone: assistant-ui's `WebSpeechDictationAdapter` in the composer, language from `navigator.language`.
- [ ] **Step 5:** E2E `e2e/chat.spec.ts`: intercept `/api/chat` with `page.route` returning scripted NDJSON; open with the button, send "Add guitar area", see the streamed reply and an Undo line; reload, open Conversations, reopen it and see the same items. Run `pnpm vitest run src/components/app/chat` and `pnpm e2e e2e/chat.spec.ts` — expect PASS. Run the axe check the other e2e specs use.
- [ ] **Step 6:** Commit `feat(chat): chat panel with model picker and past conversations`.

### Task 8: Settings for models, ops and docs

**Files:**
- Create: `src/components/app/chat-model-settings.tsx`, its dom test
- Modify: `src/app/(app)/settings/page.tsx`, `src/server/actions/settings.ts`, `.github/workflows/deploy.yml` (pass `ANTHROPIC_API_KEY` if the workflow sets env), `docs/operations.md`, `docs/ROADMAP.md`

**Interfaces:**
- Consumes: settings overrides (Task 3), `chatTiers()` (Task 6).

- [ ] **Step 1: Failing dom test:** "Claude in chat" section lists the three tiers with the current model name and an "Automatic (newest)" option plus a text field to pin a model id; pinning calls the settings action with `{ chatModelSmart: "claude-opus-5" }`; an invalid id shows the validation message.
- [ ] **Step 2:** Run — expect FAIL.
- [ ] **Step 3:** Implement. `docs/operations.md`: add `ANTHROPIC_API_KEY` (Vercel env for Production/Preview, GitHub secret if used), and "set a monthly spend limit for the key in the Claude Console". `docs/ROADMAP.md`: add the in-app chat item.
- [ ] **Step 4:** Full check: `pnpm lint && pnpm typecheck && pnpm test && pnpm e2e` — expect PASS.
- [ ] **Step 5:** Commit `feat(chat): model overrides in Settings; ops docs`.
- [ ] **Step 6:** Ask the owner to create the API key, set the spend limit and add the env var before merging; after deploy, one real smoke: Quick "add a task called test chat to my inbox", then undo it from the chat. Then ask the owner to try the microphone in the iPhone home-screen app; if dictation fails there, note it for a follow-up that adds a paid transcription adapter.
