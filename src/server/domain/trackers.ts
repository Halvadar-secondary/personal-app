import {
  and,
  asc,
  desc,
  eq,
  gte,
  isNotNull,
  isNull,
  lt,
  ne,
} from "drizzle-orm";
import { z } from "zod";
import { addDays, localDate, weekStartOf } from "@/lib/dates";
import { soFarCounts, weekBuckets } from "@/lib/trackers";
import {
  type Tracker,
  type TrackerMoment,
  trackerMoments,
  trackers,
} from "@/server/db/schema";
import { type Ctx, defineAction } from "./context";
import { DomainError } from "./errors";
import { sortKeyFor, zPosition } from "./position";
import {
  findLive,
  insertRecorded,
  softDeleteRecorded,
  updateRecorded,
} from "./rows";

// Behaviour trackers (spec "Behaviour trackers"): things to watch, never to
// finish. Every change is history, so every change can be undone.

const zName = z.string().trim().min(1).max(60);
const zEmoji = z.string().max(16).nullish();
const zDirection = z.enum(["less", "more"]);
const WEEKS = 8;
const DAY_MS = 86_400_000;

function siblings(ctx: Ctx, exceptId?: string) {
  return ctx.db
    .select({ id: trackers.id, sortKey: trackers.sortKey })
    .from(trackers)
    .where(
      and(
        eq(trackers.ownerId, ctx.ownerId),
        isNull(trackers.deletedAt),
        exceptId ? ne(trackers.id, exceptId) : undefined,
      ),
    )
    .orderBy(asc(trackers.sortKey), asc(trackers.id));
}

export const createTracker = defineAction(
  z.object({
    name: zName,
    emoji: zEmoji,
    direction: zDirection.default("less"),
  }),
  async (ctx, input) =>
    insertRecorded(ctx, "tracker", trackers, {
      ...input,
      sortKey: sortKeyFor(await siblings(ctx), {}),
    }),
);

export const updateTracker = defineAction(
  z.object({
    trackerId: z.uuid(),
    name: zName.optional(),
    emoji: zEmoji,
    direction: zDirection.optional(),
    archived: z.boolean().optional(),
  }),
  async (ctx, { trackerId, archived, ...patch }) => {
    const before = await findLive(ctx, trackers, trackerId);
    const archivedAt =
      archived === undefined || archived === (before.archivedAt !== null)
        ? {}
        : { archivedAt: archived ? ctx.now() : null };
    return updateRecorded(ctx, "tracker", trackers, before, {
      ...patch,
      ...archivedAt,
    });
  },
);

export const moveTracker = defineAction(
  zPosition.extend({ trackerId: z.uuid() }),
  async (ctx, { trackerId, ...pos }) => {
    const before = await findLive(ctx, trackers, trackerId);
    const sortKey = sortKeyFor(await siblings(ctx, trackerId), pos);
    return updateRecorded(ctx, "tracker", trackers, before, { sortKey });
  },
);

function liveMomentsOf(ctx: Ctx, trackerId: string) {
  return ctx.db
    .select()
    .from(trackerMoments)
    .where(
      and(
        eq(trackerMoments.ownerId, ctx.ownerId),
        eq(trackerMoments.trackerId, trackerId),
        isNull(trackerMoments.deletedAt),
      ),
    );
}

/** Soft-deletes the tracker and its moments, in one batch. */
export const deleteTracker = defineAction(
  z.object({ trackerId: z.uuid() }),
  async (ctx, { trackerId }) => {
    const tracker = await findLive(ctx, trackers, trackerId);
    for (const m of await liveMomentsOf(ctx, trackerId)) {
      await softDeleteRecorded(ctx, "tracker_moment", trackerMoments, m);
    }
    await softDeleteRecorded(ctx, "tracker", trackers, tracker);
    return { deleted: 1 as const };
  },
);

/** One time it happened: now, or earlier; never in the future. */
export const logMoment = defineAction(
  z.object({
    trackerId: z.uuid(),
    at: z.iso.datetime({ offset: true }).optional(),
    intensity: z.int().min(1).max(5).nullish(),
    note: z.string().trim().max(1000).nullish(),
  }),
  async (
    ctx,
    { trackerId, at, intensity, note },
  ): Promise<TrackerMoment & { trackerName: string }> => {
    const tracker = await findLive(ctx, trackers, trackerId);
    if (tracker.archivedAt) throw new DomainError("invalid_state");
    const when = at ? new Date(at) : ctx.now();
    if (when.getTime() > ctx.now().getTime()) {
      throw new DomainError("invalid_input", { at: "in the future" });
    }
    const moment = await insertRecorded(ctx, "tracker_moment", trackerMoments, {
      trackerId,
      at: when,
      intensity: intensity ?? null,
      note: note || null,
    });
    return { ...moment, trackerName: tracker.name };
  },
);

/** A note added after a quick log; blank clears it. */
export const noteMoment = defineAction(
  z.object({ momentId: z.uuid(), note: z.string().trim().max(1000) }),
  async (ctx, { momentId, note }) => {
    const before = await findLive(ctx, trackerMoments, momentId);
    return updateRecorded(ctx, "tracker_moment", trackerMoments, before, {
      note: note || null,
    });
  },
);

export const deleteMoment = defineAction(
  z.object({ momentId: z.uuid() }),
  async (ctx, { momentId }) => {
    const before = await findLive(ctx, trackerMoments, momentId);
    await softDeleteRecorded(ctx, "tracker_moment", trackerMoments, before);
    return { deleted: 1 as const };
  },
);

/** Live moments since `from`, for the counted trackers. */
function momentsSince(ctx: Ctx, from: Date) {
  return ctx.db
    .select({
      trackerId: trackerMoments.trackerId,
      at: trackerMoments.at,
      intensity: trackerMoments.intensity,
      note: trackerMoments.note,
    })
    .from(trackerMoments)
    .where(
      and(
        eq(trackerMoments.ownerId, ctx.ownerId),
        isNull(trackerMoments.deletedAt),
        gte(trackerMoments.at, from),
      ),
    )
    .orderBy(desc(trackerMoments.at));
}

function liveTrackers(ctx: Ctx, activeOnly = false) {
  return ctx.db
    .select()
    .from(trackers)
    .where(
      and(
        eq(trackers.ownerId, ctx.ownerId),
        isNull(trackers.deletedAt),
        activeOnly ? isNull(trackers.archivedAt) : undefined,
      ),
    )
    .orderBy(
      // Active first, then archived; each in the owner's order.
      asc(isNotNull(trackers.archivedAt)),
      asc(trackers.sortKey),
      asc(trackers.id),
    );
}

export type TrackerSummary = Tracker & {
  today: number;
  thisWeek: number;
  lastWeek: number;
  avgIntensity: number | null;
  weeks: { start: string; count: number }[];
};

/** Every live tracker with this week so far, last week to the same moment, and 8 weeks. */
export const listTrackers = defineAction(
  z.object({}),
  async (ctx): Promise<{ trackers: TrackerSummary[] }> => {
    const now = ctx.now();
    const thisStart = weekStartOf(localDate(now, ctx.timeZone), ctx.weekStart);
    const todayLocal = localDate(now, ctx.timeZone);
    // A day of slack covers any time zone's week edge.
    const from = new Date(now.getTime() - (WEEKS * 7 + 1) * DAY_MS);
    const rows = await momentsSince(ctx, from);
    return {
      trackers: (await liveTrackers(ctx)).map((t) => {
        const mine = rows.filter((r) => r.trackerId === t.id);
        const at = mine.map((m) => m.at);
        const counts = soFarCounts(at, now, ctx.timeZone, ctx.weekStart);
        const thisWeek = mine.filter(
          (m) =>
            weekStartOf(localDate(m.at, ctx.timeZone), ctx.weekStart) ===
              thisStart && m.intensity !== null,
        );
        return {
          ...t,
          ...counts,
          today: at.filter((a) => localDate(a, ctx.timeZone) === todayLocal)
            .length,
          avgIntensity: thisWeek.length
            ? thisWeek.reduce((s, m) => s + m.intensity!, 0) / thisWeek.length
            : null,
          weeks: weekBuckets(at, ctx.timeZone, ctx.weekStart, thisStart, WEEKS),
        };
      }),
    };
  },
);

/** A tracker's moments, newest first, a page at a time. */
export const listMoments = defineAction(
  z.object({
    trackerId: z.uuid(),
    limit: z.int().min(1).max(100).default(20),
    before: z.iso.datetime({ offset: true }).optional(),
  }),
  async (ctx, { trackerId, limit, before }) => {
    await findLive(ctx, trackers, trackerId);
    return ctx.db
      .select()
      .from(trackerMoments)
      .where(
        and(
          eq(trackerMoments.ownerId, ctx.ownerId),
          eq(trackerMoments.trackerId, trackerId),
          isNull(trackerMoments.deletedAt),
          before ? lt(trackerMoments.at, new Date(before)) : undefined,
        ),
      )
      .orderBy(desc(trackerMoments.at), desc(trackerMoments.id))
      .limit(limit);
  },
);

/** The review's patterns: the week before `start`, against the week before that. */
export const getPatterns = defineAction(
  z.object({ start: z.iso.date() }),
  async (ctx, { start }) => {
    const from = addDays(start, -7);
    const to = addDays(start, -1);
    const prevFrom = addDays(start, -14);
    const rows = await momentsSince(
      ctx,
      new Date(new Date(`${prevFrom}T00:00:00Z`).getTime() - DAY_MS),
    );
    const dayOf = (m: { at: Date }) => localDate(m.at, ctx.timeZone);
    return {
      from,
      to,
      trackers: (await liveTrackers(ctx, true)).map((t) => {
        const mine = rows.filter((r) => r.trackerId === t.id);
        const week = mine.filter((m) => dayOf(m) >= from && dayOf(m) <= to);
        return {
          id: t.id,
          name: t.name,
          emoji: t.emoji,
          direction: t.direction,
          count: week.length,
          previous: mine.filter((m) => dayOf(m) >= prevFrom && dayOf(m) < from)
            .length,
          notes: week
            .filter((m) => m.note)
            .slice(0, 10)
            .map((m) => ({ at: m.at, intensity: m.intensity, note: m.note! })),
        };
      }),
    };
  },
);
