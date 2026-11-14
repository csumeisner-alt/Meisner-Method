import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet, Platform } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';

export function BottomTabBar() {
  const colors = useColors();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  const isHome = pathname === '/' || pathname === '';
  const isPicks = pathname.startsWith('/picks');
  const isPaper = pathname === '/paper';
  const isEventArena = pathname === '/event-arena';
  const isPortfolio = pathname === '/portfolio';

  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;
  const tabOrder = ['/', '/picks', '/paper', '/portfolio', '/event-arena'] as const;

  function go(path: '/' | '/picks' | '/paper' | '/portfolio' | '/event-arena') {
    const currentTab = pathname.startsWith('/picks')
      ? '/picks'
      : pathname === '/paper'
        ? '/paper'
        : pathname === '/portfolio'
          ? '/portfolio'
          : pathname === '/event-arena'
            ? '/event-arena'
          : '/';
    const currentIndex = tabOrder.indexOf(currentTab);
    const targetIndex = tabOrder.indexOf(path);
    const transition = targetIndex < currentIndex ? 'left' : 'right';
    router.replace({ pathname: path, params: { transition } });
  }

  return (
    <View style={[styles.bar, { paddingBottom: botPad, borderTopColor: colors.border, backgroundColor: colors.background }]}>
      <TouchableOpacity style={styles.tab} accessibilityRole="button" accessibilityLabel="Analyze" onPress={() => go('/')} activeOpacity={0.7}>
        <Feather name="search" size={22} color={isHome ? colors.heading : colors.mutedForeground} />
        <Text numberOfLines={1} style={[styles.label, { color: isHome ? colors.heading : colors.mutedForeground }]}>ANALYZE</Text>
        {isHome && <View style={[styles.dot, { backgroundColor: colors.heading }]} />}
      </TouchableOpacity>

      <View style={styles.divider} />

      <TouchableOpacity style={styles.tab} accessibilityRole="button" accessibilityLabel="Top Picks" onPress={() => go('/picks')} activeOpacity={0.7}>
        <Feather name="star" size={22} color={isPicks ? colors.heading : colors.mutedForeground} />
        <Text numberOfLines={1} style={[styles.label, { color: isPicks ? colors.heading : colors.mutedForeground }]}>TOP PICKS</Text>
        {isPicks && <View style={[styles.dot, { backgroundColor: colors.heading }]} />}
      </TouchableOpacity>

      <View style={styles.divider} />

      <TouchableOpacity style={styles.tab} accessibilityRole="button" accessibilityLabel="Paper Trading" onPress={() => go('/paper')} activeOpacity={0.7}>
        <Feather name="activity" size={22} color={isPaper ? colors.heading : colors.mutedForeground} />
        <Text numberOfLines={1} style={[styles.label, { color: isPaper ? colors.heading : colors.mutedForeground }]}>PAPER</Text>
        {isPaper && <View style={[styles.dot, { backgroundColor: colors.heading }]} />}
      </TouchableOpacity>

      <View style={styles.divider} />

      <TouchableOpacity style={styles.tab} accessibilityRole="button" accessibilityLabel="Portfolio" onPress={() => go('/portfolio')} activeOpacity={0.7}>
        <Feather name="briefcase" size={22} color={isPortfolio ? colors.heading : colors.mutedForeground} />
        <Text numberOfLines={1} style={[styles.label, { color: isPortfolio ? colors.heading : colors.mutedForeground }]}>PORTFOLIO</Text>
        {isPortfolio && <View style={[styles.dot, { backgroundColor: colors.heading }]} />}
      </TouchableOpacity>

      <View style={styles.divider} />

      <TouchableOpacity
        testID="bottom-tab-event-arena"
        accessibilityRole="button"
        accessibilityLabel="Event Arena"
        style={styles.tab}
        onPress={() => go('/event-arena')}
        activeOpacity={0.7}
      >
        <Feather name="award" size={21} color={isEventArena ? colors.heading : colors.mutedForeground} />
        <Text style={[styles.label, styles.eventArenaLabel, { color: isEventArena ? colors.heading : colors.mutedForeground }]}>
          EVENT{"\n"}ARENA
        </Text>
        {isEventArena && <View style={[styles.dot, { backgroundColor: colors.heading }]} />}
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
