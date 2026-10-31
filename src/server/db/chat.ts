import { pgEnum, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { PROFILE_SECTIONS } from "@/lib/profile";
import { base } from "./columns";

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
