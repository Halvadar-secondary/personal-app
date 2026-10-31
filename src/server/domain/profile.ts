import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import {
  PROFILE_LABELS,
  PROFILE_MAX_CHARS,
  PROFILE_SECTIONS,
  type ProfileSection,
} from "@/lib/profile";
import { profileSections } from "@/server/db/schema";
import { defineAction } from "./context";
import { insertRecorded, updateRecorded } from "./rows";

export { PROFILE_LABELS, PROFILE_SECTIONS, type ProfileSection };

// What the owner tells Claude about themselves (spec "What Claude knows about
// the owner"). Every edit is history, so every edit can be undone.

export const getProfile = defineAction(z.object({}), async (ctx) => {
  const rows = await ctx.db
    .select()
    .from(profileSections)
    .where(
      and(
        eq(profileSections.ownerId, ctx.ownerId),
        isNull(profileSections.deletedAt),
      ),
    );
  const updatedAt = rows.reduce<Date | null>(
    (latest, r) => (latest && latest > r.updatedAt ? latest : r.updatedAt),
    null,
  );
  return {
    sections: PROFILE_SECTIONS.map((section) => ({
      section,
      label: PROFILE_LABELS[section],
      text: rows.find((r) => r.section === section)?.text ?? "",
    })),
    updatedAt,
  };
});

export const updateProfile = defineAction(
  z.object({
    section: z.enum(PROFILE_SECTIONS),
    text: z.string().trim().max(PROFILE_MAX_CHARS),
  }),
  async (ctx, { section, text }) => {
    const [before] = await ctx.db
      .select()
      .from(profileSections)
      .where(
        and(
          eq(profileSections.ownerId, ctx.ownerId),
          eq(profileSections.section, section),
        ),
      );
    if (!before) {
      await insertRecorded(ctx, "profile_section", profileSections, {
        section,
        text,
      });
    } else if (before.text !== text || before.deletedAt) {
      // Undoing the first save soft-deletes the row; the next save revives it.
      await updateRecorded(ctx, "profile_section", profileSections, before, {
        text,
        deletedAt: null,
      });
    }
    return { section, label: PROFILE_LABELS[section], text };
  },
);
