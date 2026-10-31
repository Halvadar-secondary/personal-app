"use server";

import { notFound } from "next/navigation";
import { requireOwner } from "@/server/auth/require-owner";
import { getDb } from "@/server/db/client";
import { toChatItems } from "@/server/chat/items";
import { listModels, resolveTiers, type Tier, TIERS } from "@/server/chat/models";
import { runAction } from "@/server/domain/context";
import {
  deleteConversation,
  getConversation,
  listConversations,
} from "@/server/domain/conversations";
import { DomainError } from "@/server/domain/errors";
import { getChatModelOverrides } from "@/server/domain/settings";
import Anthropic from "@anthropic-ai/sdk";
import { act, read } from "./run";

export async function listChats() {
  return read(listConversations, {});
}

export async function openChat(id: string) {
  const { id: ownerId } = await requireOwner();
  const deps = { db: getDb(), ownerId, actor: "ui" as const };
  try {
    const { conversation, messages } = await runAction(
      deps,
      getConversation,
      { id },
    );
    return { conversation, items: await toChatItems(deps, messages) };
  } catch (e) {
    if (
      e instanceof DomainError &&
      (e.code === "not_found" || e.code === "invalid_input")
    )
      notFound();
    throw e;
  }
}

export async function removeChat(id: string) {
  return act(deleteConversation, { id });
}

export async function chatTiers(): Promise<
  Record<Tier, { id: string; name: string; label: string }>
> {
  const overrides = await read(getChatModelOverrides, {});
  const models = await resolveTiers({
    list: listModels(new Anthropic()),
    overrides,
    now: new Date(),
  });
  const out = {} as Record<Tier, { id: string; name: string; label: string }>;
  for (const tier of Object.keys(TIERS) as Tier[])
    out[tier] = { ...models[tier], label: TIERS[tier].label };
  return out;
}
