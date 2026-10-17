import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet, Platform } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { ACHIEVEMENTS } from '@/lib/achievements';
import { useAchievements } from '@/contexts/AchievementsContext';

export function BottomTabBar() {
  const colors = useColors();
  const { earnedIds, openGallery } = useAchievements();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  const isHome = pathname === '/' || pathname === '';
  const isPicks = pathname.startsWith('/picks');
  const isPaper = pathname === '/paper';
  const isPortfolio = pathname === '/portfolio';

  const botPad = Platform.OS === 'web' ? 0 : insets.bottom;
  const tabOrder = ['/', '/picks', '/paper', '/portfolio'] as const;

  function go(path: '/' | '/picks' | '/paper' | '/portfolio') {
    const currentTab = pathname.startsWith('/picks')
      ? '/picks'
      : pathname === '/paper'
        ? '/paper'
        : pathname === '/portfolio'
          ? '/portfolio'
          : '/';
    const currentIndex = tabOrder.indexOf(currentTab);
    const targetIndex = tabOrder.indexOf(path);
    const transition = targetIndex < currentIndex ? 'left' : 'right';
    router.replace({ pathname: path, params: { transition } });
  }

  return (
    <View style={[styles.bar, { paddingBottom: botPad, borderTopColor: colors.border, backgroundColor: colors.background }]}>
      <TouchableOpacity style={styles.tab} onPress={() => go('/')} activeOpacity={0.7}>
        <Feather name="search" size={24} color={isHome ? colors.heading : colors.mutedForeground} />
        <Text style={[styles.label, { color: isHome ? colors.heading : colors.mutedForeground }]}>ANALYZE</Text>
        {isHome && <View style={[styles.dot, { backgroundColor: colors.heading }]} />}
      </TouchableOpacity>

      <View style={styles.divider} />

      <TouchableOpacity style={styles.tab} onPress={() => go('/picks')} activeOpacity={0.7}>
        <Feather name="star" size={24} color={isPicks ? colors.heading : colors.mutedForeground} />
        <Text style={[styles.label, { color: isPicks ? colors.heading : colors.mutedForeground }]}>TOP PICKS</Text>
        {isPicks && <View style={[styles.dot, { backgroundColor: colors.heading }]} />}
      </TouchableOpacity>

      <View style={styles.divider} />

      <TouchableOpacity style={styles.tab} onPress={() => go('/paper')} activeOpacity={0.7}>
        <Feather name="activity" size={24} color={isPaper ? colors.heading : colors.mutedForeground} />
        <Text style={[styles.label, { color: isPaper ? colors.heading : colors.mutedForeground }]}>PAPER</Text>
        {isPaper && <View style={[styles.dot, { backgroundColor: colors.heading }]} />}
      </TouchableOpacity>

      <View style={styles.divider} />

      <TouchableOpacity style={styles.tab} onPress={() => go('/portfolio')} activeOpacity={0.7}>
        <Feather name="briefcase" size={24} color={isPortfolio ? colors.heading : colors.mutedForeground} />
        <Text style={[styles.label, { color: isPortfolio ? colors.heading : colors.mutedForeground }]}>PORTFOLIO</Text>
        {isPortfolio && <View style={[styles.dot, { backgroundColor: colors.heading }]} />}
      </TouchableOpacity>

      <View style={styles.divider} />

      <TouchableOpacity
        style={styles.tab}
        onPress={openGallery}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`Achievements, ${earnedIds.length} of ${ACHIEVEMENTS.length} earned`}
      >
        <View>
          <Feather name="award" size={24} color={colors.gold} />
          {earnedIds.length > 0 && (
            <View style={[styles.achievementBadge, { backgroundColor: colors.gold }]}>
              <Text style={[styles.achievementBadgeText, { color: colors.background }]}>{earnedIds.length}</Text>
            </View>
          )}
        </View>
        <Text style={[styles.label, { color: colors.gold }]}>AWARDS</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopWidth: 1,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    gap: 4,
  },
  divider: {
    width: 1,
    backgroundColor: 'rgba(192,192,192,0.1)',
    marginVertical: 8,
  },
  label: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 8,
    letterSpacing: 0.8,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 1,
  },
  achievementBadge: {
    position: 'absolute',
    top: -4,
    right: -7,
    minWidth: 14,
    height: 14,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  achievementBadgeText: { fontSize: 8, fontFamily: 'Inter_700Bold' },
});
