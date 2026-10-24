/** 1 Trivial · 2 Easy · 3 Medium · 4 Hard · 5 Brutal */
export type Effort = 1 | 2 | 3 | 4 | 5;

export const EFFORT_LABELS: Record<Effort, string> = {
  1: "Trivial",
  2: "Easy",
  3: "Medium",
  4: "Hard",
  5: "Brutal",
};

const XP: Record<Effort, number> = { 1: 10, 2: 25, 3: 50, 4: 100, 5: 200 };

export function xpForEffort(effort: Effort): number {
  return XP[effort];
}
