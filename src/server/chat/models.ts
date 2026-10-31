import "server-only";
import type Anthropic from "@anthropic-ai/sdk";

export type Tier = "quick" | "smart" | "deep";
type Family = "haiku" | "sonnet" | "opus";

export const TIERS: Record<
  Tier,
  {
    label: "Quick" | "Smart" | "Deepest";
    family: Family;
    effort: "low" | "medium" | "high";
    fallback: string;
  }
> = {
  quick: {
    label: "Quick",
    family: "haiku",
    effort: "low",
    fallback: "claude-haiku-5-5",
  },
  smart: {
    label: "Smart",
    family: "sonnet",
    effort: "medium",
    fallback: "claude-sonnet-5-5",
  },
  deep: {
    label: "Deepest",
    family: "opus",
    effort: "high",
    fallback: "claude-opus-5-5",
  },
};

export type ModelInfo = {
  id: string;
  display_name: string;
  created_at: string;
};
export type Resolved = { id: string; name: string };

const FAMILY_NAMES: Record<Family, string> = {
  haiku: "Haiku",
  sonnet: "Sonnet",
  opus: "Opus",
};

export function fallbackFor(tier: Tier): string {
  return TIERS[tier].fallback;
}

export function tierOf(modelId: string): Tier | null {
  for (const tier of Object.keys(TIERS) as Tier[]) {
    if (modelId.startsWith(`claude-${TIERS[tier].family}-`)) return tier;
  }
  return null;
}

function versionOf(id: string, family: Family): number[] | null {
  const m = new RegExp(`^claude-${family}-([0-9]+(?:-[0-9]+)*)$`).exec(id);
  if (!m) return null;
  const parts = m[1]!.split("-");
  if (parts.some((p) => p.length === 8)) return null; // dated snapshot
  return parts.map(Number);
}

function compareVersions(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

export function pickNewest(
  models: ModelInfo[],
  family: Family,
): Resolved | null {
  let best: { model: ModelInfo; version: number[] } | null = null;
  for (const model of models) {
    const version = versionOf(model.id, family);
    if (!version) continue;
    if (
      !best ||
      compareVersions(version, best.version) > 0 ||
      (compareVersions(version, best.version) === 0 &&
        Date.parse(model.created_at) > Date.parse(best.model.created_at))
    ) {
      best = { model, version };
    }
  }
  return best ? { id: best.model.id, name: best.model.display_name } : null;
}

function fallbackName(tier: Tier): string {
  const [, family, ...ver] = fallbackFor(tier).split("-");
  return `Claude ${FAMILY_NAMES[family as Family]} ${ver.join(".")}`;
}

const DAY = 24 * 3600e3;
const FAILURE_TTL = 10 * 60e3;

let cache: { models: ModelInfo[] | null; expires: number } | null = null;

/** Test-only: forget the cached model list. */
export function resetModelCache(): void {
  cache = null;
}

export async function resolveTiers(opts: {
  list: () => Promise<ModelInfo[]>;
  overrides: Partial<Record<Tier, string | null>>;
  now: Date;
}): Promise<Record<Tier, Resolved>> {
  const now = opts.now.getTime();
  if (!cache || now >= cache.expires) {
    try {
      cache = { models: await opts.list(), expires: now + DAY };
    } catch {
      cache = { models: null, expires: now + FAILURE_TTL };
    }
  }
  const models = cache.models ?? [];
  const out = {} as Record<Tier, Resolved>;
  for (const tier of Object.keys(TIERS) as Tier[]) {
    const override = opts.overrides[tier];
    if (override) {
      const known = models.find((m) => m.id === override);
      out[tier] = { id: override, name: known?.display_name ?? override };
    } else {
      out[tier] = pickNewest(models, TIERS[tier].family) ?? {
        id: fallbackFor(tier),
        name: fallbackName(tier),
      };
    }
  }
  return out;
}

/** The real list: every page of the Models API. */
export function listModels(client: Anthropic): () => Promise<ModelInfo[]> {
  return async () => {
    const all: ModelInfo[] = [];
    for await (const m of client.models.list()) {
      all.push({
        id: m.id,
        display_name: m.display_name,
        created_at: m.created_at,
      });
    }
    return all;
  };
}
