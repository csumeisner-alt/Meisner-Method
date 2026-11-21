import type { PremiumFlagId } from './achievements';

type SolidFlagBorder = { kind: 'solid'; color: string };
type RainbowFlagBorder = { kind: 'rainbow'; colors: readonly string[] };

export const PREMIUM_FLAG_BORDER_STYLES = {
  heritage: { kind: 'solid', color: '#D9AE35' },
  liberty: { kind: 'solid', color: '#4BA8E8' },
  founders: { kind: 'solid', color: '#E9D9B2' },
  midnight: { kind: 'solid', color: '#E64A53' },
  'southern-cross': { kind: 'solid', color: '#B86E36' },
  eagle: {
    kind: 'rainbow',
    colors: ['#FF3B5C', '#FF9B36', '#FFE34D', '#47D983', '#35C8F4', '#7B61FF', '#FF3B5C'],
  },
} as const satisfies Record<PremiumFlagId, SolidFlagBorder | RainbowFlagBorder>;
