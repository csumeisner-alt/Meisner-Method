export const ACHIEVEMENT_STORAGE_KEY = '@meisnermethod/achievements_v1';

export const ACHIEVEMENTS = [
  {
    id: 'first-quote',
    title: 'Signal Seeker',
    description: 'Viewed your first Training Tape quote.',
    icon: 'radio',
  },
  { id: 'quote-10', title: 'Tape Collector', description: 'Viewed 10 Training Tape quotes.', icon: 'bookmark' },
  { id: 'quote-25', title: 'Signal Tracker', description: 'Viewed 25 Training Tape quotes.', icon: 'activity' },
  { id: 'quote-50', title: 'Market Scholar', description: 'Viewed 50 Training Tape quotes.', icon: 'book-open' },
  { id: 'quote-100', title: 'Oracle', description: 'Viewed 100 Training Tape quotes.', icon: 'eye' },
  {
    id: 'first-paper-order',
    title: 'Paper Trader',
    description: 'Placed your first paper trade.',
    icon: 'activity',
  },
  { id: 'first-paper-limit', title: 'Price Planner', description: 'Placed your first non-market paper order.', icon: 'sliders' },
  { id: 'first-paper-sell', title: 'Exit Strategist', description: 'Placed your first paper sell order.', icon: 'log-out' },
  {
    id: 'first-custom-instrument',
    title: 'Map Maker',
    description: 'Added your first instrument to a Custom map.',
    icon: 'grid',
  },
  { id: 'custom-map-5', title: 'Cartographer', description: 'Added five instruments to a Custom map.', icon: 'map' },
  { id: 'custom-map-10', title: 'Master Mapper', description: 'Added ten instruments to a Custom map.', icon: 'layers' },
  { id: 'first-watchlist', title: 'Watchlist Curator', description: 'Saved your first ticker to the watchlist.', icon: 'star' },
  { id: 'watchlist-5', title: 'Market Scout', description: 'Saved five tickers to the watchlist.', icon: 'compass' },
  { id: 'first-price-alert', title: 'Bell Ringer', description: 'Set your first price alert.', icon: 'bell' },
  { id: 'first-analysis', title: 'Deep Dive', description: 'Opened your first ticker analysis.', icon: 'search' },
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
