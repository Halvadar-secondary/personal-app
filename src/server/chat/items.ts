import "server-only";
import type { ChatMessage } from "@/server/domain/conversations";
import { STOP_TOOLS, unanswered } from "./engine";
import type { ChatItem } from "./events";
import { CONTEXT_MARKER } from "@/lib/chat-context";
import { describeDestructive, isDestructive } from "./tools";

type Block = { type: string; [key: string]: unknown };
type Deps = Parameters<typeof describeDestructive>[0];

const blocksOf = (m: ChatMessage): Block[] =>
  Array.isArray(m.content)
    ? (m.content as Block[])
    : [{ type: "text", text: String(m.content) }];

const textOf = (blocks: Block[], hide: (t: string) => boolean): string =>
  blocks
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .filter((t) => !hide(t))
    .join("\n\n")
    .trim();

/**
 * The owner's last message has no reply and nothing waits on them: the turn
 * failed or was cut off, and `retry` can answer it. Same test as the engine's.
 */
export function awaitingReply(messages: ChatMessage[]): boolean {
  const last = messages.findLast((m) => m.role !== "system");
  return last?.role === "user" && unanswered(messages).length === 0;
}

/** The panel's view of a stored conversation, with a trailing pending delete as `confirm`. */
export async function toChatItems(
  deps: Deps,
  messages: ChatMessage[],
): Promise<ChatItem[]> {
  const items: ChatItem[] = [];
  for (const m of messages) {
    if (m.role === "system") continue;
    const blocks = blocksOf(m);
    if (m.role === "assistant") {
      const text = textOf(blocks, () => false);
      if (text) items.push({ kind: "assistant", text, model: m.model });
      continue;
    }
    for (const t of Object.values(m.meta?.tools ?? {}))
      items.push({
        kind: "tool",
        summary: t.summary,
        batchId: t.batchId,
        error: t.error === true,
      });
    const hasResult = blocks.some((b) => b.type === "tool_result");
    const text = textOf(
      blocks,
      (t) => t.startsWith(CONTEXT_MARKER) || (hasResult && t === STOP_TOOLS),
    );
    if (text) items.push({ kind: "user", text });
  }

  // Same rule as the engine: calls in the last assistant message that no later reply answers.
  const at = messages.findLastIndex((m) => m.role === "assistant");
  if (at >= 0) {
    const answered = new Set(
      messages
        .slice(at + 1)
        .filter((m) => m.role === "user")
        .flatMap(blocksOf)
        .filter((b) => b.type === "tool_result")
        .map((b) => b.tool_use_id),
    );
    const pending = blocksOf(messages[at]!).find(
      (b) =>
        b.type === "tool_use" &&
        !answered.has(b.id) &&
        isDestructive(b.name as string),
    );
    if (pending)
      items.push({
        kind: "confirm",
        toolUseId: pending.id as string,
        prompt: await describeDestructive(
          deps,
          pending.name as string,
          pending.input,
        ),
      });
  }
  return items;
}
