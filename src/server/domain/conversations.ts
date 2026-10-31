import { and, desc, eq, isNull, max, sql } from "drizzle-orm";
import { z } from "zod";
import { CONTEXT_MARKER } from "@/lib/chat-context";
import { type ChatMeta, chatMessages, conversations } from "@/server/db/schema";
import { type Ctx, defineAction } from "./context";
import { found } from "./errors";

// Chats are not recorded in History: there's nothing to undo about them.

export type Conversation = typeof conversations.$inferSelect;
export type ChatMessage = typeof chatMessages.$inferSelect;

const NewChatMessage = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.union([z.string(), z.array(z.looseObject({ type: z.string() }))]),
  model: z.string().nullish(),
  usage: z.record(z.string(), z.unknown()).nullish(),
  meta: z.custom<ChatMeta>().nullish(),
});
export type NewChatMessage = z.input<typeof NewChatMessage>;

const mine = (ownerId: string) =>
  and(eq(conversations.ownerId, ownerId), isNull(conversations.deletedAt));

async function liveConversation(ctx: Ctx, id: string): Promise<Conversation> {
  const [row] = await ctx.db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, id), mine(ctx.ownerId)));
  return found(row);
}

export const createConversation = defineAction(
  z.object({
    title: z.string().trim().min(1).max(200),
    model: z.string().min(1),
  }),
  async (ctx, { title, model }) => {
    const [row] = await ctx.db
      .insert(conversations)
      .values({
        ownerId: ctx.ownerId,
        title,
        model,
        createdAt: ctx.now(),
        updatedAt: ctx.now(),
      })
      .returning();
    return row!;
  },
);

export const setConversationModel = defineAction(
  z.object({ id: z.uuid(), model: z.string().min(1) }),
  async (ctx, { id, model }) => {
    await liveConversation(ctx, id);
    await ctx.db
      .update(conversations)
      .set({ model, updatedAt: ctx.now() })
      .where(eq(conversations.id, id));
  },
);

export const appendMessages = defineAction(
  z.object({
    conversationId: z.uuid(),
    messages: z.array(NewChatMessage).min(1),
  }),
  async (ctx, { conversationId, messages }) => {
    await liveConversation(ctx, conversationId);
    // Serialize appenders on the conversation row so seqs stay gap-free.
    await ctx.db.execute(
      sql`select 1 from ${conversations} where ${conversations.id} = ${conversationId} for update`,
    );
    const [row] = await ctx.db
      .select({ last: max(chatMessages.seq) })
      .from(chatMessages)
      .where(eq(chatMessages.conversationId, conversationId));
    const last = row?.last ?? 0;
    const rows = await ctx.db
      .insert(chatMessages)
      .values(
        messages.map((m, i) => ({
          conversationId,
          ownerId: ctx.ownerId,
          seq: last + i + 1,
          role: m.role,
          content: m.content,
          model: m.model ?? null,
          usage: m.usage ?? null,
          meta: m.meta ?? null,
          createdAt: ctx.now(),
        })),
      )
      .returning();
    await ctx.db
      .update(conversations)
      .set({ updatedAt: ctx.now() })
      .where(eq(conversations.id, conversationId));
    return rows;
  },
);

export const listConversations = defineAction(z.object({}), async (ctx) =>
  ctx.db
    .select({
      id: conversations.id,
      title: conversations.title,
      model: conversations.model,
      updatedAt: conversations.updatedAt,
    })
    .from(conversations)
    .where(mine(ctx.ownerId))
    .orderBy(desc(conversations.updatedAt), desc(conversations.createdAt)),
);

export const getConversation = defineAction(
  z.object({ id: z.uuid() }),
  async (ctx, { id }) => {
    const conversation = await liveConversation(ctx, id);
    const messages = await ctx.db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.conversationId, id))
      .orderBy(chatMessages.seq);
    return { conversation, messages };
  },
);

export const deleteConversation = defineAction(
  z.object({ id: z.uuid() }),
  async (ctx, { id }) => {
    await liveConversation(ctx, id);
    await ctx.db
      .update(conversations)
      .set({ deletedAt: ctx.now() })
      .where(eq(conversations.id, id));
  },
);

const SNIPPET = 160;

function snippetAround(text: string, needle: string): string {
  if (text.length <= SNIPPET) return text;
  const at = text.toLowerCase().indexOf(needle);
  const start = Math.max(0, at - Math.floor((SNIPPET - needle.length) / 2));
  return text.slice(start, start + SNIPPET);
}

/** Title or the text of user/assistant text blocks; never tool inputs, thinking or the app's context. */
export const searchConversations = defineAction(
  z.object({
    query: z.string().trim().min(1).max(200),
    limit: z.int().min(1).max(10).default(5),
  }),
  async (ctx, { query, limit }) => {
    const needle = query.toLowerCase();
    const convs = await ctx.db
      .select()
      .from(conversations)
      .where(mine(ctx.ownerId))
      .orderBy(desc(conversations.updatedAt));
    const msgs = await ctx.db
      .select({
        conversationId: chatMessages.conversationId,
        role: chatMessages.role,
        content: chatMessages.content,
      })
      .from(chatMessages)
      .where(eq(chatMessages.ownerId, ctx.ownerId))
      .orderBy(chatMessages.seq);
    const byConv = Map.groupBy(msgs, (m) => m.conversationId);
    const out: {
      id: string;
      title: string;
      updatedAt: Date;
      snippets: string[];
    }[] = [];
    for (const c of convs) {
      const snippets: string[] = [];
      for (const m of byConv.get(c.id) ?? []) {
        if (m.role === "system" || !Array.isArray(m.content)) continue;
        for (const b of m.content as { type?: string; text?: unknown }[]) {
          if (
            b.type === "text" &&
            typeof b.text === "string" &&
            // The app's context block, not something either side said.
            !b.text.startsWith(CONTEXT_MARKER) &&
            b.text.toLowerCase().includes(needle)
          )
            snippets.push(snippetAround(b.text, needle));
        }
      }
      if (!c.title.toLowerCase().includes(needle) && snippets.length === 0)
        continue;
      out.push({
        id: c.id,
        title: c.title,
        updatedAt: c.updatedAt,
        snippets: snippets.slice(0, 3),
      });
      if (out.length >= limit) break;
    }
    return out;
  },
);
