// What the chat engine tells the panel during a turn. Types only, so the
// client can import it: no server-only code here.

export type ChatEvent =
  | { type: "conversation"; id: string; title: string; model: string }
  /** The owner's message (or answer) is stored: from here, Retry asks for `retry`. */
  | { type: "saved" }
  | { type: "text"; delta: string }
  | {
      type: "tool";
      id: string;
      name: string;
      summary: string;
      batchId: string | null;
      error: boolean;
    }
  | { type: "confirm"; toolUseId: string; name: string; prompt: string }
  | { type: "done"; model: string; changed: boolean }
  | { type: "error"; message: string; retryable: boolean };

/** What the panel shows for stored messages (context, system rows and thinking are hidden). */
export type ChatItem =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string; model: string | null }
  | { kind: "tool"; summary: string; batchId: string | null; error: boolean }
  | { kind: "confirm"; toolUseId: string; prompt: string };
