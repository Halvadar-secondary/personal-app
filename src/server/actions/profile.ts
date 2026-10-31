"use server";

import type { ProfileSection } from "@/lib/profile";
import { updateProfile } from "@/server/domain/profile";
import { act, type Result } from "./run";

export async function saveProfileSection(
  section: ProfileSection,
  text: string,
): Promise<Result<{ text: string }>> {
  return act(updateProfile, { section, text }, (o) => ({ text: o.text }));
}
