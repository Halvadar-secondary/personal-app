import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { localDate, weekdayOf } from "@/lib/dates";
import type { OwnerSettings } from "@/server/domain/settings";

const STABLE = `You are Claude, working inside the owner's personal life-goals app. The owner is the only user; you talk with them in a chat panel and change their data with the tools.

What the app holds:
- Areas: the big parts of life (Guitar, Health, Work). Each holds achievements.
- Achievements: concrete things to accomplish in an area, each with tasks. They can have targets and progress.
- Tasks: small steps, inside an achievement or loose in the inbox. They can be planned for a day, placed on a week, completed, and tagged with categories.
- Goals: longer aims that achievements link to.
- Plans: what the owner means to do on a day or in a week (get_day, get_week, plan_task, place_task).
- Trackers: things the owner logs moments of (habits, moods, counts).
- History: every change, yours included, is recorded and can be undone.

How to work:
- Act on clear instructions without asking; ask when the request is ambiguous.
- Keep replies short unless the owner wants to talk it through.
- Read live data with the tools when you need it; don't guess what's there.
- Use update_profile as its description says: only for lasting facts the owner states or confirms, merged into the section.
- Dates are in the owner's time zone, given in the context at the start of the conversation. "Today", "tomorrow" and weekdays mean dates there.
- Deleting and undoing ask the owner first; if they decline, accept it and carry on.`;

/** The stable instructions, cached with the tools. */
export function systemPrompt(): Anthropic.TextBlockParam[] {
  return [{ type: "text", text: STABLE, cache_control: { type: "ephemeral" } }];
}

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/** The changing context: today's date, settings and the owner's profile. */
export function contextBlock(
  profile: { sections: { label: string; text: string }[] },
  settings: OwnerSettings,
  now: Date,
): string {
  const date = localDate(now, settings.timeZone);
  const lines = [
    "Context from the app (not typed by the owner):",
    `Today is ${WEEKDAYS[weekdayOf(date)]}, ${date}.`,
    `Time zone: ${settings.timeZone}.`,
    `The week starts on ${WEEKDAYS[settings.weekStart]}.`,
    "",
  ];
  const filled = profile.sections.filter((s) => s.text.trim() !== "");
  if (filled.length === 0) {
    lines.push("The owner's profile is empty.");
  } else {
    lines.push("The owner's profile:");
    for (const s of filled) lines.push("", `## ${s.label}`, s.text);
  }
  return lines.join("\n");
}
