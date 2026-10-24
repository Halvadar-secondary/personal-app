/** XP needed to reach `level`: 50·n·(n−1). Level 1 starts at 0. */
export function xpToReach(level: number): number {
  return 50 * level * (level - 1);
}

/** Where an XP total sits: its level, XP into that level, and the level's size. */
export type LevelProgress = { level: number; into: number; span: number };

export function levelOf(xp: number): LevelProgress {
  let level = 1;
  while (xpToReach(level + 1) <= xp) level++;
  return {
    level,
    into: xp - xpToReach(level),
    span: xpToReach(level + 1) - xpToReach(level),
  };
}
