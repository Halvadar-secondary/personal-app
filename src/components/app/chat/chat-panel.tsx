"use client";

import { ArrowLeft, History, SquarePen, XIcon } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { createContext, use, useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { chatTiers } from "@/server/actions/chat";
import { ChatThread } from "./chat-messages";
import { ConversationList } from "./conversation-list";
import { FALLBACK_TIERS, ModelPicker, type Tiers } from "./model-picker";
import { type Chat, useChat } from "./use-chat";

type ChatPanelControls = {
  /** Opens the panel: on that conversation, or on a new, empty one. */
  openChat: (conversationId?: string) => void;
};

const ChatPanelContext = createContext<ChatPanelControls>({
  openChat: () => {},
});

export function useChatPanel(): ChatPanelControls {
  return use(ChatPanelContext);
}

/** Holds the chat panel and its conversation, so any control can open it. */
export function ChatProvider({ children }: { children: React.ReactNode }) {
  const chat = useChat();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"chat" | "list">("chat");
  const [tiers, setTiers] = useState<Tiers | null>(null);
  const { reset, load } = chat;

  const openChat = useCallback(
    (conversationId?: string) => {
      if (conversationId) void load(conversationId);
      else reset();
      setView("chat");
      setOpen(true);
    },
    [load, reset],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        if (open) setOpen(false);
        else openChat();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, openChat]);

  // The tiers' current models, once; without an API key (local, CI) the
  // server can't say, and the built-in names stand in.
  useEffect(() => {
    if (!open || tiers) return;
    let live = true;
    chatTiers()
      .then((t) => live && setTiers(t))
      .catch(() => live && setTiers(FALLBACK_TIERS));
    return () => {
      live = false;
    };
  }, [open, tiers]);

  return (
    <ChatPanelContext value={{ openChat }}>
      {children}
      <ChatPanel
        open={open}
        onOpenChange={setOpen}
        chat={chat}
        tiers={tiers ?? FALLBACK_TIERS}
        view={view}
        setView={setView}
      />
    </ChatPanelContext>
  );
}

function ChatPanel({
  open,
  onOpenChange,
  chat,
  tiers,
  view,
  setView,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chat: Chat;
  tiers: Tiers;
  view: "chat" | "list";
  setView: (view: "chat" | "list") => void;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 hidden bg-black/10 md:block" />
        <DialogPrimitive.Content
          // Full screen on the phone, a right-hand sheet from md up.
          className="fixed inset-0 z-50 flex flex-col bg-background pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] outline-none md:left-auto md:w-[28rem] md:border-l md:pt-0 md:pb-0 md:shadow-xl"
        >
          <DialogPrimitive.Title className="sr-only">
            Claude
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Chat with Claude about your goals, or ask it to change things.
          </DialogPrimitive.Description>
          <header className="flex items-center gap-1 border-b px-2 py-1.5">
            {view === "list" ? (
              <Button variant="ghost" size="sm" onClick={() => setView("chat")}>
                <ArrowLeft /> Back
              </Button>
            ) : (
              <ModelPicker
                tiers={tiers}
                value={chat.tier}
                onChange={chat.setTier}
              />
            )}
            <span className="flex-1" />
            {view === "chat" && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Conversations"
                onClick={() => setView("list")}
              >
                <History />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="New conversation"
              onClick={() => {
                chat.reset();
                setView("chat");
              }}
            >
              <SquarePen />
            </Button>
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Close">
                <XIcon />
              </Button>
            </DialogPrimitive.Close>
          </header>
          {view === "list" ? (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <ConversationList
                tiers={tiers}
                onOpen={(id) => {
                  void chat.load(id);
                  setView("chat");
                }}
                onDeleted={(id) => {
                  if (id === chat.conversationId) chat.reset();
                }}
              />
            </div>
          ) : (
            <ChatThread chat={chat} tiers={tiers} />
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
