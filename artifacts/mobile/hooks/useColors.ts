import { useColorScheme } from 'react-native';
import colors, { ColorScheme } from '@/constants/colors';
import { useContext } from 'react';
import { AmericanModeContext } from '@/contexts/AmericanModeContext';

/**
 * Returns the design tokens for the current color scheme.
 * When Patriot Mode is active, returns the red/white/blue patriotic palette.
 * Falls back gracefully when called outside AmericanModeProvider (e.g. auth screens).
 */
export function useColors(): ColorScheme & { radius: number } {
  const scheme = useColorScheme();
  // Gracefully handle screens outside the AmericanModeProvider
  const ctx = useContext(AmericanModeContext);
  const isAmerican = ctx?.isActive ?? false;

  if (isAmerican) {
    return { ...colors.american, radius: colors.radius };
  }
  const palette = scheme === 'dark' ? colors.dark : colors.light;
  return { ...palette, radius: colors.radius };
}
