# In-app chat with Claude: design

Date: 2026-10-31. Status: draft for the owner's review. Decisions quoted from
the owner are theirs; everything marked **my call** is open to change.

## Why

The owner already reaches the app from Claude through the MCP server
(`/api/mcp`), but that conversation lives in the Claude app, not in this one.
They want to talk to Claude from inside the app and have it make changes for
them, in two kinds of conversation:

- **Quick actions:** "Haiku could work to make changes as instructed" — add a
  task, plan tomorrow, log a moment. Short, cheap, fast.
- **Deeper conversations:** reviewing a goal, breaking a big aim into
  achievements, reflecting on a week — "requires a model that's more
  intelligent".

They want to avoid an expensive setup. At the owner's volume the API cost is
small: roughly $0.001 a message on Haiku 5.5 and $0.01–0.02 on Sonnet 5.5,
less with prompt caching (estimate from list prices; tool descriptions are
most of each request).

Success: from any page, one tap opens a chat; "add 'restring guitar' to
Saturday" is done in a few seconds and shows in History with an undo; the
owner can switch the model mid-conversation and come back to any past
conversation later.

## Requirements (the owner's)

1. An easily reachable button that opens a **new conversation** with Claude.
2. The model can be **switched in the open chat**.
3. **Past conversations can be continued.**

## Non-goals (for now)

- Replies read aloud, live voice conversations, file or image attachments.
- Claude starting conversations (reminders, nudges).
- Separate "modes" with different tools or prompts. Quick vs deep is just the
  model choice for now (**my call**: the owner described the flows by model;
  a different system prompt per flow can come later).
- Sharing or exporting conversations.
- Any user but the owner (the app is owner-only).

## Anti-goals

- Claude changing data the owner can't see or undo. Every change goes through
  the same domain actions as the UI and MCP, so it lands in History with undo.
- Surprise bills. Hard caps per turn and per minute; a spend limit on the key.
- A chat that silently loses a conversation, or shows a different history from
  the one the model saw.

## What gets built

### The button and the panel

- A **Claude button** on every app page (**my call**: a floating round button
  bottom-right on desktop; on the phone it sits above the tab bar, clear of the
  home bar). It is also a command-palette entry ("Ask Claude") and the
  shortcut `Ctrl/Cmd+J`.
- It opens a **chat panel**: a right-side sheet on desktop, full screen on the
  phone (**my call**). The panel opens on a new, empty conversation.
- The panel header has: the **model picker**, a **Conversations** button, a
  **New** button, and close.
- **Speaking** (the owner: "I wanna be able to speak in the chat as well"): a
  microphone button in the message box dictates into it using the browser's
  speech recognition (Web Speech API), showing words as they are recognised;
  the owner can edit before sending. Free, no extra service. If it proves
  unreliable on the owner's iPhone home-screen app, swap in a paid
  transcription service (Deepgram, ElevenLabs) behind the same button. Where
  the browser has no speech recognition, the button is hidden.
- **Conversations** lists past conversations, newest activity first, with
  title, model and relative time. Tapping one opens it, and it carries on
  where it stopped. Conversations can be deleted (soft, like everything else).
- A conversation's **title** is its first message, trimmed to 60 characters
  (**my call**: no extra model call).
- The button always opens a new conversation, as asked. A conversation is
  only saved once its first message is sent, so empty ones never pile up in
  the list (**my call**).

### Models

| Label in picker | Model | Effort | Use |
| --- | --- | --- | --- |
| Quick | `claude-haiku-5-5` | low | default for new chats |
| Smart | `claude-sonnet-5-5` | medium | deeper conversations |
| Deepest | `claude-opus-5-5` | high | hardest thinking |

All **my call**: the owner named Haiku for quick actions and "a model that's
more intelligent" for depth; Sonnet 5.5 is the everyday deep choice at a fifth
of Opus's price, and Opus is there when wanted.

- **The tiers update themselves** (the owner: "without us needing to update
  the app every time there's a more suitable model"). Each tier is a model
  family: Quick is the newest Haiku, Smart the newest Sonnet, Deepest the
  newest Opus. The server reads the Models API (`client.models.list()`) at
  most once a day, caches the result, picks the newest model per family and
  shows its `display_name`. The table above is the built-in fallback when the
  list can't be read.
- A conversation keeps the exact model id it is on; a newer model only applies
  to new conversations or when the owner switches.
- Requests send only settings every current model accepts (no thinking
  switch, no forced tool choice, effort always explicit). If a request to a
  newly picked model is rejected as invalid (400), the turn is retried once on
  that tier's fallback model and the error goes to Sentry.
- Settings gets a per-tier override to pin a specific model id (**my call**).
- New conversations start on Quick (**my call**).
- Switching applies from the next message. The conversation stores its current
  model; each assistant message stores the model that wrote it, and the chat
  shows it in small text under the message.
- Sonnet and Opus requests use the API's server-side refusal fallback
  (`fallbacks: "default"`), so a rare safety false-positive is retried on
  another model instead of failing.

### What Claude can do

- The same tools as the MCP server (37 today, plus the profile tools below), from `src/server/mcp/tools.ts`, with
  the same descriptions. Their zod input schemas become JSON Schema
  (`z.toJSONSchema`).
- Tools run through `runAction` as the signed-in owner, so validation,
  transactions and History work unchanged.
- **Actor** `chat` (a new actor kind). History shows it as **"Claude in chat"**.
- **Destructive tools** (`delete_item`, `undo_batch`) **ask first**: the chat
  shows a card ("Delete achievement 'Learn barre chords'?") with Confirm and
  Cancel. Nothing runs until the owner confirms; Cancel tells Claude it was
  declined. (**my call**; all other changes are undoable from History.)
- Each tool call shows in the chat as a compact line using the tool's existing
  `summary` ("Added task 'Restring guitar'"), with an **Undo** link for write
  tools, using the batch id.
- After a turn that changed anything, the page behind the panel refreshes
  (`router.refresh()`), so the change is visible straight away.

### The conversation with the model

- System prompt: what the app is (areas, achievements, tasks, goals, plans,
  trackers), today's date and the owner's time zone and week start, "act on
  clear instructions without asking; ask when the request is ambiguous; keep
  replies short unless the owner wants to talk it through". The date line sits
  after the cached part so caching still works.
- Prompt caching on the tools and the stable system prompt.
- Thinking is adaptive (the default on these models); its text is not shown
  (**my call**).
- Replies stream into the panel as they're written.
- The full message history is stored exactly as sent and received (content
  blocks, including tool calls, tool results and thinking blocks) and sent
  back unchanged, append-only. This keeps conversations resumable and keeps
  them valid across model switches (the API drops thinking blocks a model
  can't read, at no charge).
- Long conversations: server-side compaction (beta) when history grows large
  (**my call**; matters mostly for deep chats).

### What Claude knows about the owner

The owner asked for "a summary about me that's not strictly derived from the
app state but from the conversations I have in the app chat / Claude app chat
that's updated every time AI determines it needs updating", and turned down
building an app-state snapshot at the start of every conversation as
inefficient. They chose to build it in the app rather than use Letta, Mem0 or
a similar service. The pattern follows Letta's core memory blocks: a small,
labelled profile that is always in context and that the model edits itself.

- **The profile** has four sections, each plain text up to 1,000 characters
  (**my call** on names and limits):
  - *About me*: life, work, routines, constraints.
  - *Current focus*: what matters right now and why.
  - *How I plan*: how the owner likes tasks and days shaped.
  - *How to talk to me*: tone and length.
- **Always sent** at the start of every in-app conversation, in the first user
  turn after the cached instructions. When a conversation is resumed and the
  profile has changed since its last message, the new profile is added as a
  mid-conversation system message before the owner's next message.
- **Claude edits it during the chat** with `update_profile`: it rewrites one
  section, merging the new fact into what is there instead of appending, so
  the profile stays short. The tool description tells Claude to update only
  for lasting facts the owner states or confirms, not for one-off requests.
- Every edit is a normal domain action: it shows in History ("Claude in chat
  updated your profile: Current focus") and can be undone. In the chat it
  shows as a line "Updated profile: Current focus" with Undo.
- **Settings → Profile** shows the four sections, editable by the owner.
- **Shared with the Claude app**: `get_profile` and `update_profile` are added
  to the tool list, so the MCP server offers them too. Claude in the Claude
  app can read and update the same profile; docs/mcp.md suggests adding "use
  my life-goals profile" to the Claude app instructions so it does so
  reliably. Claude's own memory in the Claude app stays separate.
- **No snapshot of app state.** Claude reads live data with the existing tools
  (`get_overview`, `get_day`, …) when it needs it.
- **Past conversations are searched, not loaded**: a chat-only tool
  `search_conversations` finds earlier in-app conversations whose title or
  text contains the words, returning title, date, id and matching snippets;
  `get_conversation` returns one conversation's text (no tool blocks). Not on
  the MCP server (**my call**: the Claude app has its own chat history).
- **Later, not now:** a background tidy-up of the profile with Haiku after a
  conversation ends.

### Limits and cost guards

- Per turn: at most 10 tool round-trips, then Claude is told to stop and
  summarise (**my call**).
- `max_tokens` 8,000 per response (**my call**).
- Rate limit: 20 chat turns a minute, using the existing `hitRateLimit`
  (**my call**).
- The owner sets a monthly spend limit on the API key in the Claude Console
  (setup step, not code).
- Each assistant message stores its token usage, so cost can be shown later.

### Errors

- API down or rate-limited: the message shows "Claude couldn't answer. Try
  again." with a Retry button; the owner's message is kept.
- A tool's `DomainError` goes back to Claude as the same user-facing message
  the MCP server sends; unexpected errors go to Sentry and Claude hears only
  "Something went wrong".
- A refusal that survives fallback shows "Claude declined to answer this one."

## Data

Three new tables (**my call** on shape). `profiles`: ownerId, section,
text, updatedAt (one row per section; edits are versioned through the normal
change-event History). And:

- `conversations`: id, ownerId, title, model, createdAt, updatedAt, deletedAt.
- `chat_messages`: id, conversationId, seq (order), role (`user` /
  `assistant`), content (jsonb: the exact content blocks), model (assistant
  only), usage (jsonb, assistant only), createdAt.

Conversations are owner-scoped like everything else and included in the data
export.

## Constraints

- Next.js 16.4 (read `node_modules/next/dist/docs/` before writing route or
  streaming code, per AGENTS.md).
- Official Anthropic TypeScript SDK (`@anthropic-ai/sdk`) on the server; the
  key is `ANTHROPIC_API_KEY` in Vercel env and GitHub secrets, never sent to
  the browser.
- Vercel Hobby function time limits: a deep turn with several tool calls must
  fit; set the route's `maxDuration` to the plan's maximum.
- Server-only boundary rules in `eslint.boundaries.mjs` apply: the chat engine
  lives in `src/server/chat/`, the UI in `src/components/app/chat/`.

## Left to the builder

- The panel is built with **assistant-ui** (the owner agreed), driven by the
  app's own streaming route through a custom runtime, using its dictation
  support (`WebSpeechDictationAdapter`) for the microphone. If it can't be
  made to work with React 19.3 and the app's Tailwind 4/shadcn setup, fall
  back to the existing UI components and the Web Speech API directly, and say
  so in the PR.
- The streaming format between the route and the panel.
- Exact panel layout, empty state and suggestion chips.
- Whether to share a tool-running helper with `createLifeGoalsServer` or keep
  a small chat-side adapter.
