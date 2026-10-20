import { BREW_TOKEN_QUOTE_THRESHOLD } from './brewTokenLogic.ts';

export const ACHIEVEMENT_STORAGE_KEY = '@meisnermethod/achievements_v1';
export const PREMIUM_FLAG_STORAGE_KEY = '@meisnermethod/premium_flag_badge_v1';
export const DEFAULT_FLAG_ID = 'default' as const;

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

export const ACHIEVEMENT_UNLOCKED_FLAGS = [
  { id: 'heritage', name: 'Gadsden', artwork: 'gadsden' },
  { id: 'liberty', name: 'Liberty & Eagle', artwork: 'liberty-eagle' },
  { id: 'founders', name: 'Betsy Ross', artwork: 'betsy-ross' },
  { id: 'midnight', name: 'Red Union', artwork: 'red-union' },
  { id: 'southern-cross', name: 'Southern Cross', artwork: 'southern-cross' },
] as const;

export const PRIDE_FLAG = { id: 'eagle', name: 'Pride', artwork: 'pride' } as const;
export const ALL_PREMIUM_FLAGS = [...ACHIEVEMENT_UNLOCKED_FLAGS, PRIDE_FLAG] as const;

export type PremiumFlagId = (typeof ALL_PREMIUM_FLAGS)[number]['id'];
export type FlagSelectionId = typeof DEFAULT_FLAG_ID | PremiumFlagId;

export function hasUnlockedPrideFlag(quotesViewed: number): boolean {
  return quotesViewed >= BREW_TOKEN_QUOTE_THRESHOLD;
}

export function isPremiumFlagId(value: string | null): value is PremiumFlagId {
  return ALL_PREMIUM_FLAGS.some((flag) => flag.id === value);
}

export function parsePremiumFlagId(raw: string | null): FlagSelectionId | null {
  if (raw === DEFAULT_FLAG_ID) return DEFAULT_FLAG_ID;
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
