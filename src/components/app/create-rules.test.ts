import { describe, expect, it } from "vitest";
import {
  type Destination,
  defaultDestination,
  destinationFor,
  kindForPage,
  loadPrefs,
  type PageContext,
  savePrefs,
} from "./create-rules";

const guitar = { id: "g", name: "Guitar", emoji: "🎸" };
const sweep = { id: "s", title: "Sweep" };
const inbox: Destination = { area: null, achievement: null };
const onAchievement: PageContext = { area: guitar, achievement: sweep };
const onArea: PageContext = { area: guitar };

describe("defaultDestination", () => {
  it.each([
    [
      "achievement page",
      onAchievement,
      "task",
      { area: guitar, achievement: sweep },
    ],
    [
      "achievement page",
      onAchievement,
      "achievement",
      { area: guitar, achievement: null },
    ],
    ["area page", onArea, "task", inbox],
    ["area page", onArea, "achievement", { area: guitar, achievement: null }],
    ["no page", null, "task", inbox],
    ["no page", null, "achievement", inbox],
  ] as const)("%s, %s → %o", (_n, page, kind, want) => {
    expect(defaultDestination(kind, page)).toEqual(want);
  });

  it("an Inbox achievement's page files achievements in the Inbox", () => {
    const page: PageContext = { area: null, achievement: sweep };
    expect(defaultDestination("achievement", page)).toEqual(inbox);
    expect(defaultDestination("task", page)).toEqual({
      area: null,
      achievement: sweep,
    });
  });
});

describe("destinationFor", () => {
  const other = { area: guitar, achievement: { id: "o", title: "Other" } };

  it("keeps a picked achievement for a task", () => {
    expect(destinationFor("task", other, true, onArea)).toEqual(other);
  });

  it("keeps a picked area for an achievement", () => {
    const area = { area: guitar, achievement: null };
    expect(destinationFor("achievement", area, true, null)).toEqual(area);
  });

  it("keeps a picked Inbox for either kind", () => {
    expect(destinationFor("achievement", inbox, true, onAchievement)).toEqual(
      inbox,
    );
    expect(destinationFor("task", inbox, true, onAchievement)).toEqual(inbox);
  });

  it("drops a picked achievement when flipping to achievement", () => {
    expect(destinationFor("achievement", other, true, onArea)).toEqual({
      area: guitar,
      achievement: null,
    });
  });

  it("drops a picked area when flipping to task", () => {
    const area = { area: guitar, achievement: null };
    expect(destinationFor("task", area, true, onArea)).toEqual(inbox);
    expect(destinationFor("task", area, true, onAchievement)).toEqual({
      area: guitar,
      achievement: sweep,
    });
  });

  it("an unpicked destination follows the table", () => {
    expect(destinationFor("task", other, false, onArea)).toEqual(inbox);
  });
});

it.each([
  [onAchievement, "achievement", "task"],
  [onArea, "task", "achievement"],
  [null, "achievement", "achievement"],
] as const)("kindForPage(%o, last %s) → %s", (page, last, want) => {
  expect(kindForPage(page, last)).toBe(want);
});

describe("prefs", () => {
  const memory = () => {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
    };
  };
  const holding = (v: string | null) => ({ getItem: () => v });
  const DEFAULTS = { kind: "task", more: false };

  it.each([
    ["nothing stored", holding(null)],
    ["not JSON", holding("not json")],
    ["a bad shape", holding('{"kind":"area"}')],
    [
      "a throwing storage",
      {
        getItem: () => {
          throw new Error("denied");
        },
      },
    ],
  ])("defaults when %s", (_n, storage) => {
    expect(loadPrefs(storage)).toEqual(DEFAULTS);
  });

  it("round-trips", () => {
    const s = memory();
    savePrefs({ kind: "achievement", more: true }, s);
    expect(loadPrefs(s)).toEqual({ kind: "achievement", more: true });
  });

  it("saving to a throwing storage doesn't throw", () => {
    const s = {
      setItem: () => {
        throw new Error("full");
      },
    };
    expect(() => savePrefs({ kind: "task", more: true }, s)).not.toThrow();
  });

  it("no storage at all gives the defaults", () => {
    expect(loadPrefs(null)).toEqual(DEFAULTS);
  });
});
