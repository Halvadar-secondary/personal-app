"use client";

import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  type DictationAdapter,
  MessagePrimitive,
  ThreadPrimitive,
  type ThreadMessageLike,
  useExternalStoreRuntime,
  WebSpeechDictationAdapter,
} from "@assistant-ui/react";
import { ArrowUp, Mic, Square } from "lucide-react";
import {
  createContext,
  use,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { undoAction } from "@/server/actions/history";
import type { ChatItem } from "@/server/chat/events";
import { perform } from "../use-mutate";
import { modelName, type Tiers } from "./model-picker";
import type { Chat } from "./use-chat";

const SUGGESTIONS: { prompt: string; send: boolean }[] = [
  { prompt: "Plan my day", send: true },
  // Needs the task itself: it waits in the box.
  { prompt: "Add a task", send: false },
  { prompt: "How am I doing this week?", send: true },
];

const COULDNT_HEAR = "Couldn't hear that. Try again.";

/** What the message parts read; assistant-ui renders them, not us. */
const ThreadContext = createContext<{ chat: Chat; tiers: Tiers } | null>(null);
const useThread = () => use(ThreadContext)!;

type Shown = ChatItem | { kind: "streaming"; text: string };

/** Each of our items becomes one assistant-ui message with a data part. */
function convert(item: Shown, i: number): ThreadMessageLike {
  const id = `m${i}`;
  if (item.kind === "user") return { id, role: "user", content: item.text };
  return {
    id,
    role: "assistant",
    content: [{ type: `data-${item.kind}`, data: item }],
  };
}

/**
 * The browser's speech recognition, through assistant-ui's adapter. The
 * adapter only logs a recognition error; this notices it on the session's
 * status, which the composer polls while dictating.
 */
class Dictation implements DictationAdapter {
  private inner = new WebSpeechDictationAdapter();
  constructor(private onError: () => void) {}

  listen(): DictationAdapter.Session {
    const s = this.inner.listen();
    const onError = this.onError;
    let told = false;
    return {
      get status() {
        const status = s.status;
        if (!told && status.type === "ended" && status.reason === "error") {
          told = true;
          queueMicrotask(onError);
        }
        return status;
      },
      stop: () => s.stop(),
      cancel: () => s.cancel(),
      onSpeechStart: (cb) => s.onSpeechStart(cb),
      onSpeechEnd: (cb) => s.onSpeechEnd(cb),
      onSpeech: (cb) => s.onSpeech(cb),
    };
  }
}

const noSubscription = () => () => {};

/** The conversation and the message box, on an assistant-ui external store. */
export function ChatThread({ chat, tiers }: { chat: Chat; tiers: Tiers }) {
  // Never on the server: no browser, no speech recognition.
  const canDictate = useSyncExternalStore(
    noSubscription,
    () => WebSpeechDictationAdapter.isSupported(),
    () => false,
  );
  const [heardNothing, setHeardNothing] = useState(false);
  const dictation = useMemo(
    () => (canDictate ? new Dictation(() => setHeardNothing(true)) : undefined),
    [canDictate],
  );

  const shown: Shown[] = chat.streaming
    ? [...chat.items, { kind: "streaming", text: chat.streaming }]
    : chat.items;
  const runtime = useExternalStoreRuntime<Shown>({
    messages: shown,
    convertMessage: convert,
    isRunning: chat.running,
    isDisabled: chat.loading,
    onNew: async (m) => {
      const text = m.content
        .map((c) => (c.type === "text" ? c.text : ""))
        .join("");
      await chat.send(text);
    },
    adapters: dictation ? { dictation } : {},
  });

  const empty = shown.length === 0 && !chat.running && !chat.loading;
  return (
    <ThreadContext value={{ chat, tiers }}>
      <AssistantRuntimeProvider runtime={runtime}>
        <ThreadPrimitive.Root className="flex min-h-0 flex-1 flex-col">
          <ThreadPrimitive.Viewport className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
            {empty && (
              <div className="m-auto flex flex-col items-center gap-3 text-center">
                <p className="text-sm text-muted-foreground">
                  Ask about your goals, or have Claude change things for you.
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  {SUGGESTIONS.map((s) => (
                    <ThreadPrimitive.Suggestion
                      key={s.prompt}
                      prompt={s.send ? s.prompt : `${s.prompt}: `}
                      send={s.send}
                      className="rounded-full border px-3 py-1 text-sm hover:bg-muted"
                    >
                      {s.prompt}
                    </ThreadPrimitive.Suggestion>
                  ))}
                </div>
              </div>
            )}
            <ThreadPrimitive.Messages>
              {({ message }) => (
                <MessagePrimitive.Root
                  className={cn(
                    "flex flex-col gap-2",
                    message.role === "user" && "items-end",
                  )}
                >
                  {message.role === "user" ? (
                    <div className="max-w-[85%] rounded-2xl bg-primary px-3 py-2 text-sm whitespace-pre-wrap text-primary-foreground">
                      <MessagePrimitive.Parts components={USER_PARTS} />
                    </div>
                  ) : (
                    <MessagePrimitive.Parts components={ASSISTANT_PARTS} />
                  )}
                </MessagePrimitive.Root>
              )}
            </ThreadPrimitive.Messages>
            {chat.loading && (
              <p className="text-sm text-muted-foreground">Loading…</p>
            )}
            {chat.running && !chat.streaming && (
              <p className="text-sm text-muted-foreground" aria-live="polite">
                Thinking…
              </p>
            )}
            {chat.error && (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-lg border border-destructive/40 px-3 py-2 text-sm"
              >
                <span className="flex-1">{chat.error.message}</span>
                {chat.error.retryable && (
                  <Button size="sm" variant="outline" onClick={chat.retry}>
                    Retry
                  </Button>
                )}
              </div>
            )}
          </ThreadPrimitive.Viewport>

          <ComposerPrimitive.Root className="flex flex-col gap-1 border-t px-3 py-2">
            {heardNothing && (
              <p role="status" className="text-xs text-muted-foreground">
                {COULDNT_HEAR}
              </p>
            )}
            <div className="flex items-end gap-2">
              <ComposerPrimitive.Input
                aria-label="Message Claude"
                placeholder="Message Claude"
                rows={1}
                maxRows={6}
                className="min-h-9 flex-1 resize-none rounded-lg border bg-transparent px-3 py-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm"
              />
              {dictation && (
                <>
                  <ComposerPrimitive.If dictation={false}>
                    <ComposerPrimitive.Dictate
                      aria-label="Dictate"
                      onClick={() => setHeardNothing(false)}
                      className="inline-flex size-9 items-center justify-center rounded-lg hover:bg-muted"
                    >
                      <Mic className="size-4" />
                    </ComposerPrimitive.Dictate>
                  </ComposerPrimitive.If>
                  <ComposerPrimitive.If dictation>
                    <ComposerPrimitive.StopDictation
                      aria-label="Stop dictation"
                      className="inline-flex size-9 items-center justify-center rounded-lg bg-destructive/10 text-destructive"
                    >
                      <Square className="size-4" />
                    </ComposerPrimitive.StopDictation>
                  </ComposerPrimitive.If>
                </>
              )}
              <ComposerPrimitive.Send
                aria-label="Send"
                className="inline-flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-50"
              >
                <ArrowUp className="size-4" />
              </ComposerPrimitive.Send>
            </div>
          </ComposerPrimitive.Root>
        </ThreadPrimitive.Root>
      </AssistantRuntimeProvider>
    </ThreadContext>
  );
}

// Stable components: inline ones would remount each part on every render.
const USER_PARTS = { Text: ({ text }: { text: string }) => <>{text}</> };
const ASSISTANT_PARTS = {
  data: {
    by_name: {
      assistant: ({ data }: { data: Shown }) => <Reply item={data} />,
      streaming: ({ data }: { data: Shown }) => <Reply item={data} />,
      tool: ({ data }: { data: Shown }) => <ToolLine item={data} />,
      confirm: ({ data }: { data: Shown }) => <ConfirmCard item={data} />,
    },
  },
};

function Reply({ item }: { item: Shown }) {
  const { tiers } = useThread();
  if (item.kind !== "assistant" && item.kind !== "streaming") return null;
  const model = item.kind === "assistant" ? item.model : null;
  return (
    <div className="flex max-w-[95%] flex-col gap-0.5">
      <p className="text-sm whitespace-pre-wrap">{item.text}</p>
      {model && (
        <span className="text-[11px] text-muted-foreground">
          {modelName(model, tiers)}
        </span>
      )}
    </div>
  );
}

function ToolLine({ item }: { item: Shown }) {
  const [state, setState] = useState<"idle" | "busy" | "undone">("idle");
  if (item.kind !== "tool") return null;
  const { batchId } = item;
  async function undo(id: string) {
    setState("busy");
    const r = await perform(() => undoAction({ batchId: id }), {
      success: "Undone",
    });
    setState(r?.ok ? "undone" : "idle");
  }
  return (
    <ul>
      <li
        className={cn(
          "flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-1.5 text-xs",
          item.error ? "text-destructive" : "text-muted-foreground",
        )}
      >
        <span className="min-w-0 flex-1 break-words">{item.summary}</span>
        {batchId &&
          !item.error &&
          (state === "undone" ? (
            <span>Undone</span>
          ) : (
            <Button
              variant="link"
              size="xs"
              className="h-auto p-0"
              disabled={state === "busy"}
              onClick={() => undo(batchId)}
            >
              Undo
            </Button>
          ))}
      </li>
    </ul>
  );
}

function ConfirmCard({ item }: { item: Shown }) {
  const { chat } = useThread();
  if (item.kind !== "confirm") return null;
  const { toolUseId } = item;
  return (
    <div className="flex flex-col gap-2 rounded-lg border px-3 py-2">
      <p className="text-sm">{item.prompt}</p>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="destructive"
          disabled={chat.running}
          onClick={() => chat.answer(toolUseId, true)}
        >
          Confirm
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={chat.running}
          onClick={() => chat.answer(toolUseId, false)}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
