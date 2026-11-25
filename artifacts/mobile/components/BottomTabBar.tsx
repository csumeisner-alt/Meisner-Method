import React, { useContext } from 'react';
import { Image, View, TouchableOpacity, Text, StyleSheet, Platform, useWindowDimensions } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { AmericanModeContext } from '@/contexts/AmericanModeContext';
import { useColors } from '@/hooks/useColors';
import { getMainTabNavigationPlan, type MainTabRoute } from '@/lib/mainTabNavigation';
import { claimMainTabNavigation } from '@/lib/interactionOwnership';

const EVENT_ARENA_TAB_EMBLEMS = {
  default: require('../assets/event-arena-tab/default.png'),
  patriot: require('../assets/event-arena-tab/patriot.png'),
  neonGucci: require('../assets/event-arena-tab/neon-gucci.png'),
};

export function BottomTabBar() {
  const colors = useColors();
  const themeContext = useContext(AmericanModeContext);
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  const eventArenaEmblem = themeContext?.neonGucciActive
    ? EVENT_ARENA_TAB_EMBLEMS.neonGucci
    : themeContext?.isActive
      ? EVENT_ARENA_TAB_EMBLEMS.patriot
      : EVENT_ARENA_TAB_EMBLEMS.default;

  const isHome = pathname === '/' || pathname === '';
  const isPicks = pathname.startsWith('/picks');
  const isPaper = pathname === '/paper';
  const isEventArena = pathname === '/event-arena';
  const isPortfolio = pathname === '/portfolio';

  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;
  function go(path: MainTabRoute) {
    const plan = getMainTabNavigationPlan(pathname, path);
    if (!plan) return;
    if (!claimMainTabNavigation()) return;
    if (plan.action === 'dismiss') {
      router.dismissTo(plan.href);
      return;
    }
    router.navigate(plan.href);
  }

  return (
    <View style={[styles.bar, { paddingBottom: botPad, borderTopColor: colors.border, backgroundColor: colors.background }]}>
      <TouchableOpacity testID="bottom-tab-analyze" style={styles.tab} accessibilityRole="button" accessibilityLabel="Analyze" accessibilityState={{ selected: isHome }} onPress={() => go('/')} activeOpacity={0.7}>
        <Feather name="search" size={22} color={isHome ? colors.heading : colors.mutedForeground} />
        <Text style={[styles.label, { lineHeight: 11 * fontScale, color: isHome ? colors.heading : colors.mutedForeground }]}>ANALYZE</Text>
        {isHome && <View testID="active-bottom-tab-indicator" style={[styles.dot, { backgroundColor: colors.heading }]} />}
      </TouchableOpacity>

      <View style={styles.divider} />

      <TouchableOpacity testID="bottom-tab-top-picks" style={styles.tab} accessibilityRole="button" accessibilityLabel="Top Picks" accessibilityState={{ selected: isPicks }} onPress={() => go('/picks')} activeOpacity={0.7}>
        <Feather name="star" size={22} color={isPicks ? colors.heading : colors.mutedForeground} />
        <Text style={[styles.label, { lineHeight: 11 * fontScale, color: isPicks ? colors.heading : colors.mutedForeground }]}>TOP PICKS</Text>
        {isPicks && <View testID="active-bottom-tab-indicator" style={[styles.dot, { backgroundColor: colors.heading }]} />}
      </TouchableOpacity>

      <View style={styles.divider} />

      <TouchableOpacity testID="bottom-tab-paper" style={styles.tab} accessibilityRole="button" accessibilityLabel="Paper Trading" accessibilityState={{ selected: isPaper }} onPress={() => go('/paper')} activeOpacity={0.7}>
        <Feather name="activity" size={22} color={isPaper ? colors.heading : colors.mutedForeground} />
        <Text style={[styles.label, { lineHeight: 11 * fontScale, color: isPaper ? colors.heading : colors.mutedForeground }]}>PAPER</Text>
        {isPaper && <View testID="active-bottom-tab-indicator" style={[styles.dot, { backgroundColor: colors.heading }]} />}
      </TouchableOpacity>

      <View style={styles.divider} />

      <TouchableOpacity testID="bottom-tab-portfolio" style={styles.tab} accessibilityRole="button" accessibilityLabel="Portfolio" accessibilityState={{ selected: isPortfolio }} onPress={() => go('/portfolio')} activeOpacity={0.7}>
        <Feather name="briefcase" size={22} color={isPortfolio ? colors.heading : colors.mutedForeground} />
        <Text style={[styles.label, { lineHeight: 11 * fontScale, color: isPortfolio ? colors.heading : colors.mutedForeground }]}>PORTFOLIO</Text>
        {isPortfolio && <View testID="active-bottom-tab-indicator" style={[styles.dot, { backgroundColor: colors.heading }]} />}
      </TouchableOpacity>

      <View style={styles.divider} />

      <TouchableOpacity
        testID="bottom-tab-event-arena"
        accessibilityRole="button"
        accessibilityLabel="Event Arena"
        accessibilityState={{ selected: isEventArena }}
        style={styles.tab}
        onPress={() => go('/event-arena')}
        activeOpacity={0.7}
      >
        <Image
          testID="bottom-tab-event-arena-emblem"
          accessible={false}
          source={eventArenaEmblem}
          resizeMode="cover"
          style={{ width: 40, height: 40, borderRadius: 8 }}
        />
        <Text style={[styles.label, styles.eventArenaLabel, { lineHeight: 11 * fontScale, color: isEventArena ? colors.heading : colors.mutedForeground }]}>
          EVENT{"\n"}ARENA
        </Text>
        {isEventArena && <View testID="active-bottom-tab-indicator" style={[styles.dot, { backgroundColor: colors.heading }]} />}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    minHeight: 66,
    borderTopWidth: 1,
  },
  tab: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    gap: 4,
  },
  divider: {
    width: 1,
    backgroundColor: 'rgba(192,192,192,0.1)',
    marginVertical: 8,
  },
  label: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 9,
    letterSpacing: 0.1,
    textAlign: 'center',
    lineHeight: 11,
  },
  eventArenaLabel: { maxWidth: 58 },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 1,
  },
});
