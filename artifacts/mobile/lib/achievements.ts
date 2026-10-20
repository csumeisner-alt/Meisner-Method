export const ACHIEVEMENT_STORAGE_KEY = '@meisnermethod/achievements_v1';
export const PREMIUM_FLAG_STORAGE_KEY = '@meisnermethod/premium_flag_badge_v1';

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

export function hasCompletedAllAchievements(earnedIds: readonly AchievementId[]): boolean {
  const earned = new Set(earnedIds);
  return ACHIEVEMENTS.every((achievement) => earned.has(achievement.id));
}

export const PREMIUM_FLAGS = [
  { id: 'heritage', name: 'Heritage', canton: '#14284B', red: '#B8323D', white: '#F4F0E5', star: '#F1D28A' },
  { id: 'liberty', name: 'Liberty', canton: '#0E3550', red: '#C43B42', white: '#F8F5EF', star: '#F7E6B5' },
  { id: 'founders', name: 'Founders', canton: '#24364A', red: '#9F3A3F', white: '#E8DFC8', star: '#D8B568' },
  { id: 'midnight', name: 'Midnight', canton: '#111D36', red: '#8D2E3D', white: '#D9DDE4', star: '#D8BE83' },
  { id: 'eagle', name: 'Eagle', canton: '#172D4E', red: '#B5443F', white: '#FFF9EB', star: '#E8C66F' },
] as const;

export type PremiumFlagId = (typeof PREMIUM_FLAGS)[number]['id'];

export function isPremiumFlagId(value: string | null): value is PremiumFlagId {
  return PREMIUM_FLAGS.some((flag) => flag.id === value);
}

export function parsePremiumFlagId(raw: string | null): PremiumFlagId | null {
  return isPremiumFlagId(raw) ? raw : null;
}

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
