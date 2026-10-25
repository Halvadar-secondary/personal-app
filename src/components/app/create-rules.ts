import type { NavArea } from "@/server/domain/views";

export type Kind = "task" | "achievement";

/** What the area and achievement pages say about where you are. */
export type PageContext = {
  /** Null for an achievement still in the Inbox. */
  area: NavArea | null;
  achievement?: { id: string; title: string };
} | null;

/** Where a new item goes; both null is the Inbox. */
export type Destination = {
  area: NavArea | null;
  achievement: { id: string; title: string } | null;
};

const INBOX: Destination = { area: null, achievement: null };

/**
 * The spec's table: a task goes to the page's achievement, else the Inbox;
 * an achievement goes to the page's area, else the Inbox.
 */
export function defaultDestination(kind: Kind, page: PageContext): Destination {
  if (!page) return INBOX;
  if (kind === "task") {
    return page.achievement
      ? { area: page.area, achievement: page.achievement }
      : INBOX;
  }
  return { area: page.area, achievement: null };
}

/** Can `dest` hold `kind`? A task can't sit in an area, an achievement can't in an achievement. */
function holds(kind: Kind, dest: Destination) {
  return kind === "task"
    ? dest.achievement !== null || dest.area === null
    : dest.achievement === null;
}

/** A hand-picked destination sticks while it can hold the kind. */
export function destinationFor(
  kind: Kind,
  current: Destination,
  picked: boolean,
  page: PageContext,
): Destination {
  return picked && holds(kind, current)
    ? current
    : defaultDestination(kind, page);
}

/** Achievement pages make tasks, area pages achievements; elsewhere the last kind. */
export function kindForPage(page: PageContext, last: Kind): Kind {
  if (page?.achievement) return "task";
  if (page) return "achievement";
  return last;
}

export type Prefs = { kind: Kind; more: boolean };

const KEY = "create-dialog";
const DEFAULTS: Prefs = { kind: "task", more: false };

function browserStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** This browser's last kind and "Create more"; defaults on anything odd. */
export function loadPrefs(
  storage: Pick<Storage, "getItem"> | null = browserStorage(),
): Prefs {
  try {
    const p: unknown = JSON.parse(storage?.getItem(KEY) ?? "null");
    if (
      p &&
      typeof p === "object" &&
      "kind" in p &&
      (p.kind === "task" || p.kind === "achievement") &&
      "more" in p &&
      typeof p.more === "boolean"
    ) {
      return { kind: p.kind, more: p.more };
    }
  } catch {}
  return DEFAULTS;
}

export function savePrefs(
  prefs: Prefs,
  storage: Pick<Storage, "setItem"> | null = browserStorage(),
): void {
  try {
    storage?.setItem(KEY, JSON.stringify(prefs));
  } catch {}
}
