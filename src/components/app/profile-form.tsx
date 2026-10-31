"use client";

import { useState } from "react";
import { PROFILE_MAX_CHARS, type ProfileSection } from "@/lib/profile";
import { saveProfileSection } from "@/server/actions/profile";
import { perform } from "./use-mutate";

type Section = { section: ProfileSection; label: string; text: string };

/** What Claude knows about the owner; each section saves when you leave it. */
export function ProfileForm({ initial }: { initial: Section[] }) {
  const [saved, setSaved] = useState(
    () => new Map(initial.map((s) => [s.section, s.text])),
  );
  const [errors, setErrors] = useState(new Map<ProfileSection, string>());
  const [drafts, setDrafts] = useState(
    () => new Map(initial.map((s) => [s.section, s.text])),
  );

  async function save(section: ProfileSection) {
    const text = (drafts.get(section) ?? "").trim();
    if (text === saved.get(section)) return;
    const r = await perform(() => saveProfileSection(section, text), {
      success: "Saved",
    });
    setErrors((m) => new Map(m).set(section, r && !r.ok ? r.message : ""));
    if (r?.ok) {
      setSaved((m) => new Map(m).set(section, r.data.text));
      setDrafts((m) => new Map(m).set(section, r.data.text));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">
        Claude reads this at the start of a conversation. Keep it to what stays
        true.
      </p>
      {initial.map(({ section, label }) => {
        const value = drafts.get(section) ?? "";
        return (
          <div key={section} className="flex flex-col gap-1">
            <label
              htmlFor={`profile-${section}`}
              className="text-sm font-medium"
            >
              {label}
            </label>
            <textarea
              id={`profile-${section}`}
              value={value}
              maxLength={PROFILE_MAX_CHARS}
              rows={3}
              onChange={(e) =>
                setDrafts((m) => new Map(m).set(section, e.target.value))
              }
              onBlur={() => save(section)}
              className="rounded-md border bg-card px-2 py-1.5 text-sm"
            />
            <span className="self-end text-xs text-muted-foreground">
              {value.length}/{PROFILE_MAX_CHARS}
            </span>
            {errors.get(section) ? (
              <p role="alert" className="text-xs text-destructive">
                {errors.get(section)}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
