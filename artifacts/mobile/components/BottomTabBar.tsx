import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet, Platform } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';

const SILVER = '#c0c0c0';
const SILVER_DIM = 'rgba(192,192,192,0.38)';
const BG = '#000000';
const BORDER = 'rgba(192,192,192,0.13)';

export function BottomTabBar() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  const isHome = pathname === '/' || pathname === '';
  const isPicks = pathname.startsWith('/picks');
  const isPaper = pathname === '/paper';
  const isPortfolio = pathname === '/portfolio';

  const botPad = Platform.OS === 'web' ? 0 : insets.bottom;

  function go(path: '/' | '/picks' | '/paper' | '/portfolio') {
    router.replace(path);
  }

  return (
    <View style={[styles.bar, { paddingBottom: botPad, borderTopColor: BORDER, backgroundColor: BG }]}>
      <TouchableOpacity style={styles.tab} onPress={() => go('/')} activeOpacity={0.7}>
        <Feather name="search" size={20} color={isHome ? SILVER : SILVER_DIM} />
        <Text style={[styles.label, { color: isHome ? SILVER : SILVER_DIM }]}>ANALYZE</Text>
        {isHome && <View style={styles.dot} />}
      </TouchableOpacity>

      <View style={styles.divider} />

      <TouchableOpacity style={styles.tab} onPress={() => go('/picks')} activeOpacity={0.7}>
        <Feather name="star" size={20} color={isPicks ? SILVER : SILVER_DIM} />
        <Text style={[styles.label, { color: isPicks ? SILVER : SILVER_DIM }]}>TOP PICKS</Text>
        {isPicks && <View style={styles.dot} />}
      </TouchableOpacity>

      <View style={styles.divider} />

      <TouchableOpacity style={styles.tab} onPress={() => go('/paper')} activeOpacity={0.7}>
        <Feather name="activity" size={20} color={isPaper ? SILVER : SILVER_DIM} />
        <Text style={[styles.label, { color: isPaper ? SILVER : SILVER_DIM }]}>PAPER</Text>
        {isPaper && <View style={styles.dot} />}
      </TouchableOpacity>

      <View style={styles.divider} />

      <TouchableOpacity style={styles.tab} onPress={() => go('/portfolio')} activeOpacity={0.7}>
        <Feather name="briefcase" size={20} color={isPortfolio ? SILVER : SILVER_DIM} />
        <Text style={[styles.label, { color: isPortfolio ? SILVER : SILVER_DIM }]}>PORTFOLIO</Text>
        {isPortfolio && <View style={styles.dot} />}
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
    backgroundColor: 'rgba(192,192,192,0.08)',
    marginVertical: 10,
  },
  label: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 7,
    letterSpacing: 0.8,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: SILVER,
    marginTop: 1,
  },
});
