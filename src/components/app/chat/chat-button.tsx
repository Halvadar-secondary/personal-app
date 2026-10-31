"use client";

import { Sparkles } from "lucide-react";
import { useChatPanel } from "./chat-panel";

/**
 * The floating Claude button: bottom-right on desktop; on the phone above
 * the tab bar, clear of the home bar. Always starts a new conversation.
 */
export function ChatButton() {
  const { openChat } = useChatPanel();
  return (
    <button
      type="button"
      aria-label="Ask Claude"
      title="Ask Claude (Ctrl+J)"
      onClick={() => openChat()}
      className="fixed right-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-40 inline-flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:right-6 md:bottom-6"
    >
      <Sparkles className="size-5" />
    </button>
  );
}
