"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { openChat } from "@/server/actions/chat";
import type { ChatEvent, ChatItem } from "@/server/chat/events";

export type Tier = "quick" | "smart" | "deep";
export type ChatError = { message: string; retryable: boolean };

/** What `/api/chat` takes: one of text, confirm or retry. */
type TurnBody = {
  conversationId?: string;
  tier?: Tier;
  text?: string;
  confirm?: { toolUseId: string; approve: boolean };
  retry?: boolean;
};

const FAMILIES: [string, Tier][] = [
  ["claude-haiku-", "quick"],
  ["claude-sonnet-", "smart"],
  ["claude-opus-", "deep"],
];

/** The tier a stored model id belongs to, as the server reads it. */
export function tierOf(model: string): Tier | null {
  return FAMILIES.find(([prefix]) => model.startsWith(prefix))?.[1] ?? null;
}

const FAILED: ChatError = {
  message: "Claude couldn't answer. Try again.",
  retryable: true,
};

const UNANSWERED: ChatError = {
  message: "Claude didn't answer this. Try again.",
  retryable: true,
};

function failureFor(status: number): ChatError {
  if (status === 429)
    return {
      message: "That's a lot of messages. Wait a minute and try again.",
      retryable: true,
    };
  if (status === 401)
    return {
      message: "You're signed out. Reload the page to sign in.",
      retryable: false,
    };
  // The same message would be refused again.
  if (status === 400)
    return { message: "Claude couldn't take that message.", retryable: false };
  return FAILED;
}

/**
 * One conversation with Claude: its items, the reply streaming in, and the
 * calls that send to `/api/chat`. A new hook state is a new, unsaved
 * conversation; the server creates it with the first message.
 */
export function useChat() {
  const router = useRouter();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [items, setItems] = useState<ChatItem[]>([]);
  const [streaming, setStreaming] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<ChatError | null>(null);
  const [tier, setTierState] = useState<Tier>("quick");
  const [loading, setLoading] = useState(false);

  // Read by the async turn loop, which outlives the render that started it.
  const live = useRef({
    conversationId: null as string | null,
    tier: "quick" as Tier,
    /** The picker changed since the last message: the next one carries it. */
    tierChanged: false,
    /** Bumped by reset and load: a turn from an older generation is ignored. */
    generation: 0,
    abort: null as AbortController | null,
    /** A stored conversation is on its way in: nothing can be sent yet. */
    loading: false,
    /** What Retry sends: the turn again, or `retry` once the server has it. */
    retry: null as TurnBody | null,
  });

  const setTier = useCallback((t: Tier) => {
    live.current.tier = t;
    live.current.tierChanged = true;
    setTierState(t);
  }, []);

  const startOver = useCallback(
    (id: string | null, next: ChatItem[], t: Tier) => {
      const l = live.current;
      l.generation++;
      l.abort?.abort();
      l.abort = null;
      l.conversationId = id;
      l.tier = t;
      l.tierChanged = false;
      l.retry = null;
      l.loading = false;
      setLoading(false);
      setConversationId(id);
      setItems(next);
      setStreaming("");
      setRunning(false);
      setError(null);
      setTierState(t);
    },
    [],
  );

  const reset = useCallback(() => startOver(null, [], "quick"), [startOver]);

  const load = useCallback(
    async (id: string) => {
      startOver(id, [], live.current.tier);
      live.current.loading = true;
      setLoading(true);
      const generation = live.current.generation;
      try {
        const { conversation, items, pending } = await openChat(id);
        if (generation !== live.current.generation) return;
        startOver(id, items, tierOf(conversation.model) ?? "quick");
        // The last turn failed or was cut off: the server has the message.
        if (pending) {
          live.current.retry = { conversationId: id, retry: true };
          setError(UNANSWERED);
        }
      } catch {
        if (generation !== live.current.generation) return;
        startOver(null, [], "quick");
        setError({
          message: "Couldn't open that conversation.",
          retryable: false,
        });
      }
    },
    [startOver],
  );

  /** Posts one turn and applies its events as they stream in. */
  const run = useCallback(
    async (body: TurnBody) => {
      const l = live.current;
      const generation = l.generation;
      const current = () => generation === l.generation;
      const abort = new AbortController();
      l.abort = abort;
      l.retry = body;
      setRunning(true);
      setError(null);
      setStreaming("");

      // The reply so far; it becomes an item when a tool line, a confirm or
      // the end of the turn closes it.
      let text = "";
      let model: string | null = null;
      // Assistant items this turn added: `done` names their model.
      const added = new Set<ChatItem>();
      let heard = false;
      // The server stored the message (or answer): sending it again would
      // add it twice.
      let saved = false;
      let finished = false;
      let failed = false;
      const flush = () => {
        if (!text.trim()) return;
        const item: ChatItem = { kind: "assistant", text, model };
        text = "";
        added.add(item);
        setItems((xs) => [...xs, item]);
        setStreaming("");
      };
      const fail = (e: ChatError) => {
        finished = true;
        failed = true;
        text = "";
        setStreaming("");
        setError(e);
        // Once the server has the turn, Retry asks it to answer again.
        if (saved && l.conversationId && e.retryable)
          l.retry = { conversationId: l.conversationId, retry: true };
      };

      const apply = (e: ChatEvent) => {
        // The server has the turn, and with it any tier it carried; a tier
        // picked since still goes with the next message.
        if (!heard && body.tier === l.tier) l.tierChanged = false;
        heard = true;
        switch (e.type) {
          case "saved":
            saved = true;
            break;
          case "conversation":
            l.conversationId = e.id;
            model = e.model;
            setConversationId(e.id);
            break;
          case "text":
            text += e.delta;
            setStreaming(text);
            break;
          case "tool":
            flush();
            setItems((xs) => [
              ...xs,
              {
                kind: "tool",
                summary: e.summary,
                batchId: e.batchId,
                error: e.error,
              },
            ]);
            break;
          case "confirm":
            flush();
            setItems((xs) => [
              ...xs,
              { kind: "confirm", toolUseId: e.toolUseId, prompt: e.prompt },
            ]);
            break;
          case "done": {
            finished = true;
            model = e.model;
            flush();
            setItems((xs) =>
              xs.map((x) => (added.has(x) ? { ...x, model: e.model } : x)),
            );
            if (e.changed) router.refresh();
            break;
          }
          case "error":
            fail({ message: e.message, retryable: e.retryable });
            break;
        }
      };

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
          signal: abort.signal,
        });
        if (!current()) return;
        if (!res.ok || !res.body) {
          fail(failureFor(res.status));
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (!current()) return;
          buffer += decoder.decode(value, { stream: !done });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines)
            if (line.trim()) apply(JSON.parse(line) as ChatEvent);
          if (done) break;
        }
        if (buffer.trim()) apply(JSON.parse(buffer) as ChatEvent);
        // The stream ended without a word on how the turn went.
        if (!finished) fail(FAILED);
      } catch {
        if (current()) fail(FAILED);
      } finally {
        if (current()) {
          setRunning(false);
          l.abort = null;
          if (!failed) l.retry = null;
        }
      }
    },
    [router],
  );

  const busy = () => live.current.abort !== null || live.current.loading;

  const target = () => {
    const l = live.current;
    const body: TurnBody = {};
    if (l.conversationId) body.conversationId = l.conversationId;
    if (!l.conversationId || l.tierChanged) body.tier = l.tier;
    return body;
  };

  const send = useCallback(
    async (text: string) => {
      if (!text.trim() || busy()) return;
      // Typing instead of answering declines a waiting delete, as the
      // conversation shows when reopened.
      setItems((xs) => [
        ...xs.map((x): ChatItem =>
          x.kind === "confirm"
            ? {
                kind: "tool",
                summary: "Cancelled",
                batchId: null,
                error: false,
              }
            : x,
        ),
        { kind: "user", text },
      ]);
      await run({ ...target(), text });
    },
    [run],
  );

  const answer = useCallback(
    async (toolUseId: string, approve: boolean) => {
      if (busy()) return;
      setItems((xs) =>
        xs.filter((x) => !(x.kind === "confirm" && x.toolUseId === toolUseId)),
      );
      await run({ ...target(), confirm: { toolUseId, approve } });
    },
    [run],
  );

  const retry = useCallback(async () => {
    const body = live.current.retry;
    if (!body || busy()) return;
    // A message the server never took goes again as it was, now into the
    // conversation if one was made meanwhile.
    const again =
      body.retry || !live.current.conversationId
        ? body
        : { ...body, conversationId: live.current.conversationId };
    await run(again);
  }, [run]);

  return {
    conversationId,
    items,
    streaming,
    running,
    loading,
    error,
    tier,
    setTier,
    send,
    answer,
    retry,
    reset,
    load,
  };
}

export type Chat = ReturnType<typeof useChat>;
