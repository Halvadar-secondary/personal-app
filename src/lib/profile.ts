// What the owner tells Claude about themselves. Pure, so the database schema,
// the domain and the History summaries can all share it.

export const PROFILE_SECTIONS = [
  "about",
  "focus",
  "planning",
  "style",
] as const;

export type ProfileSection = (typeof PROFILE_SECTIONS)[number];

export const PROFILE_LABELS: Record<ProfileSection, string> = {
  about: "About me",
  focus: "Current focus",
  planning: "How I plan",
  style: "How to talk to me",
};

export const PROFILE_MAX_CHARS = 1000;
