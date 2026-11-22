import type { PremiumFlagId } from './achievements';

type NoFlagBorder = { kind: 'none' };
type RainbowFlagBorder = { kind: 'rainbow'; colors: readonly string[] };

export const PREMIUM_FLAG_BORDER_STYLES = {
  heritage: { kind: 'none' },
  liberty: { kind: 'none' },
  founders: { kind: 'none' },
  midnight: { kind: 'none' },
  'southern-cross': { kind: 'none' },
  eagle: {
    kind: 'rainbow',
    colors: ['#FF3B5C', '#FF9B36', '#FFE34D', '#47D983', '#35C8F4', '#7B61FF', '#FF3B5C'],
  },
} as const satisfies Record<PremiumFlagId, NoFlagBorder | RainbowFlagBorder>;
