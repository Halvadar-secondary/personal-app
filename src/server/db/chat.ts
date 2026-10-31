import {
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { PROFILE_SECTIONS } from "@/lib/profile";
import { base, ownerId, timestamptz } from "./columns";

export const profileSection = pgEnum("profile_section", PROFILE_SECTIONS);

/** What the owner tells Claude about themselves: one row per section. */
export const profileSections = pgTable(
  "profile_sections",
  {
    ...base(),
    section: profileSection("section").notNull(),
    text: text("text").notNull(),
  },
  (t) => [
    uniqueIndex("profile_sections_owner_section").on(t.ownerId, t.section),
  ],
);

/** An in-app chat with Claude. Not recorded in History. */
export const conversations = pgTable("conversations", {
  ...base(),
  title: text("title").notNull(),
  model: text("model").notNull(),
});

export const chatRole = pgEnum("chat_role", ["user", "assistant", "system"]);

export type ChatMeta = {
  tools?: Record<
    string,
    { summary: string; batchId: string | null; error?: boolean }
  >;
};

/** One turn, stored as the API content blocks (a string for `system`). */
export const chatMessages = pgTable(
  "chat_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    ownerId: ownerId(),
    seq: integer("seq").notNull(),
    role: chatRole("role").notNull(),
    content: jsonb("content").notNull(),
    model: text("model"),
    usage: jsonb("usage"),
    meta: jsonb("meta").$type<ChatMeta>(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("chat_messages_conversation_seq").on(t.conversationId, t.seq),
  ],
);
