import { z } from "zod";
import { localDate } from "@/lib/dates";
import type { Effort } from "@/lib/xp";
import {
  createAchievement,
  moveAchievement,
} from "@/server/domain/achievements";
import { createArea } from "@/server/domain/areas";
import { createCategory, setTaskCategories } from "@/server/domain/categories";
import { callAction, type Ctx, defineAction } from "@/server/domain/context";
import { captureItem } from "@/server/domain/inbox";
import { addPracticeEntry } from "@/server/domain/practice";
import { completeTask, createTasks } from "@/server/domain/tasks";

const gradient = (from: string, to: string) => ({
  type: "gradient" as const,
  value: `linear-gradient(135deg, ${from}, ${to})`,
});

type Ladder = [title: string, effort: Effort][];

const SWEEP: Ladder = [
  ["Two-string sweeps at 60 bpm", 1],
  ["Three-string sweeps at 70 bpm", 2],
  ["Five-string arpeggio shapes at 80 bpm", 3],
  ["Clean five-string sweeps at 95 bpm", 4],
  ["Six-string sweeps at 120 bpm", 5],
];

const STRANGERS: Ladder = [
  ["Say good morning to a neighbour", 1],
  ["Ask a shop assistant a question", 1],
  ["Compliment a stranger", 2],
  ["Ask someone for directions", 2],
  ["Make small talk in a queue", 3],
  ["Join a conversation at a meetup", 3],
  ["Introduce yourself to a group", 4],
  ["Start a conversation with a stranger at a café", 4],
  ["Give a two-minute toast", 5],
  ["Host a small gathering", 5],
];

async function ladder(ctx: Ctx, achievementId: string, steps: Ladder) {
  return callAction(ctx, createTasks, {
    achievementId,
    tasks: steps.map(([title, effort]) => ({ title, effort })),
  });
}

/** Realistic sample goals for preview and local databases, as one batch. */
export const seedSampleData = defineAction(z.object({}), async (ctx) => {
  const area = (name: string, emoji: string, from: string, to: string) =>
    callAction(ctx, createArea, { name, emoji, cover: gradient(from, to) });
  const guitar = await area("Guitar", "🎸", "#f97316", "#db2777");
  await area("Singing", "🎤", "#8b5cf6", "#ec4899");
  await area("Irish flute", "🪈", "#10b981", "#0ea5e9");
  await area("DAWs", "🎛️", "#6366f1", "#14b8a6");
  const social = await area("Social confidence", "🗣️", "#f59e0b", "#ef4444");

  const cat = (name: string, color: string) =>
    callAction(ctx, createCategory, { name, color });
  const technique = await cat("Technique", "orange");
  const theory = await cat("Theory", "violet");
  await cat("Repertoire", "emerald");
  const exposure = await cat("Exposure", "amber");

  const sweep = await callAction(ctx, createAchievement, {
    areaId: guitar.id,
    title: "Sweep pick effortlessly",
    status: "active",
  });
  const sweepTasks = await ladder(ctx, sweep.id, SWEEP);
  for (const t of sweepTasks) {
    await callAction(ctx, setTaskCategories, {
      taskId: t.id,
      categoryIds: [technique.id],
    });
  }
  await callAction(ctx, completeTask, { taskId: sweepTasks[0]!.id });
  await callAction(ctx, addPracticeEntry, {
    taskId: sweepTasks[3]!.id,
    durationSeconds: 900,
    metrics: { bpm: 95 },
    note: "Clean on the way up, sloppy coming down.",
  });

  const modes = await callAction(ctx, createAchievement, {
    areaId: guitar.id,
    title: "Spot which mode fits a progression",
  });
  const modeTasks = await ladder(ctx, modes.id, [
    ["Learn the seven mode names and their order", 1],
    ["Hear Dorian vs. Aeolian over a minor vamp", 3],
  ]);
  await callAction(ctx, setTaskCategories, {
    taskId: modeTasks[1]!.id,
    categoryIds: [theory.id],
  });

  const pinch = await callAction(ctx, createAchievement, {
    areaId: guitar.id,
    title: "Pinch harmonics on demand",
    status: "active",
  });
  const pinchTasks = await ladder(ctx, pinch.id, [
    ["Find the sweet spot on the low E", 2],
    ["Pinch harmonics on every string", 3],
    ["Hit them mid-riff without looking", 4],
  ]);
  for (const t of pinchTasks) {
    await callAction(ctx, completeTask, { taskId: t.id });
  }
  await callAction(ctx, moveAchievement, {
    achievementId: pinch.id,
    status: "done",
  });

  const inSixtyDays = new Date(ctx.now().getTime() + 60 * 86_400_000);
  const strangers = await callAction(ctx, createAchievement, {
    areaId: social.id,
    title: "Feel at ease talking to strangers",
    status: "active",
    deadline: localDate(inSixtyDays, ctx.timeZone),
  });
  const steps = await ladder(ctx, strangers.id, STRANGERS);
  await callAction(ctx, setTaskCategories, {
    taskId: steps[0]!.id,
    categoryIds: [exposure.id],
  });
  await callAction(ctx, completeTask, { taskId: steps[0]!.id });

  await callAction(ctx, captureItem, { text: "Buy a capo" });
  await callAction(ctx, captureItem, { text: "! Learn a jig on the flute" });

  return { areas: 5 };
});
