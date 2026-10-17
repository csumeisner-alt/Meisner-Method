export const ACHIEVEMENT_STORAGE_KEY = '@meisnermethod/achievements_v1';

export const ACHIEVEMENTS = [
  {
    id: 'first-quote',
    title: 'Signal Seeker',
    description: 'Viewed your first Training Tape quote.',
    icon: 'radio',
  },
  {
    id: 'first-paper-order',
    title: 'Paper Trader',
    description: 'Placed your first paper trade.',
    icon: 'activity',
  },
  {
    id: 'first-custom-instrument',
    title: 'Map Maker',
    description: 'Added your first instrument to a Custom map.',
    icon: 'grid',
  },
] as const;

export type AchievementId = (typeof ACHIEVEMENTS)[number]['id'];
export type Achievement = (typeof ACHIEVEMENTS)[number];

const achievementIds = new Set<string>(ACHIEVEMENTS.map((achievement) => achievement.id));

export function parseEarnedAchievementIds(raw: string | null): AchievementId[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.filter(
      (id): id is AchievementId => typeof id === 'string' && achievementIds.has(id),
    ))];
  } catch {
    return [];
  }
}

export function claimAchievement(
  earnedIds: readonly AchievementId[],
  id: string,
): { earnedIds: AchievementId[]; achievement: Achievement } | null {
  const achievement = ACHIEVEMENTS.find((candidate) => candidate.id === id);
  if (!achievement || earnedIds.includes(achievement.id)) return null;
  return {
    earnedIds: [...earnedIds, achievement.id],
    achievement,
  };
}
