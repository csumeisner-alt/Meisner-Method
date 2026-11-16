import React, { useEffect, useRef } from 'react';
import { Animated, Image, ImageSourcePropType, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useReduceMotion } from '@/hooks/useReduceMotion';

/** Championship tokens: metallic navy, electric blue, trophy gold. */
export const LIGHTNING_TOKENS = {
  navyDeep: '#050a1c',
  navy: '#0b1736',
  navySteel: '#14254d',
  electric: '#2f8dff',
  electricSoft: '#1d4f9e',
  ice: '#bfe0ff',
  gold: '#f2c14e',
  goldBright: '#ffe39a',
  goldDeep: '#a8740f',
  selectedMetal: '#2a2210',
  silver: '#dfe6f0',
  text: '#f4f7fc',
  textMuted: '#9fb3d6',
} as const;

const T = LIGHTNING_TOKENS;

export const LIGHTNING_EMBLEMS: Record<'overview' | 'leaderboard' | 'trades' | 'past', ImageSourcePropType> = {
  overview: require('../assets/lightning-round-emblems/round.png'),
  leaderboard: require('../assets/lightning-round-emblems/leaderboard.png'),
  trades: require('../assets/lightning-round-emblems/trades.png'),
  past: require('../assets/lightning-round-emblems/past.png'),
};

function Laurel({ flip }: { flip?: boolean }) {
  // Stylised laurel sprig: three tilted gold leaves plus a tapering rule.
  return (
    <View style={[styles.laurel, flip && { transform: [{ scaleX: -1 }] }]} accessible={false} importantForAccessibility="no-hide-descendants">
      <LinearGradient colors={['transparent', T.goldDeep, T.gold]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.laurelRule} />
      {[0, 1, 2].map((i) => (
        <View key={i} style={[styles.leaf, { right: 4 + i * 7, top: i % 2 === 0 ? 1 : 9, transform: [{ rotate: i % 2 === 0 ? '-38deg' : '38deg' }] }]} />
      ))}
      <View style={styles.laurelGem} />
    </View>
  );
}

type HeaderProps = {
  title?: string;
  subtitle: string;
  onBack: () => void;
  onArchive: () => void;
};

export function LightningRoundHeader({ title = 'LIGHTNING ROUND', subtitle, onBack, onArchive }: HeaderProps) {
  return (
    <LinearGradient
      colors={[T.navySteel, T.navy, T.navyDeep]}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={styles.header}
    >
      <LinearGradient colors={['transparent', T.electric, T.gold, T.electric, 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.bottomEdge} />
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Go back" onPress={onBack} style={styles.ctrl} hitSlop={4}>
        <View style={styles.ctrlRing}>
          <Feather name="arrow-left" size={18} color={T.ice} />
        </View>
      </TouchableOpacity>
      <View style={styles.center}>
        <View style={styles.titleRow}>
          <Laurel />
          <Text accessibilityRole="header" numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.75} style={styles.title}>{title}</Text>
          <Laurel flip />
        </View>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open Past Events" onPress={onArchive} style={styles.ctrl} hitSlop={4}>
        <View style={[styles.ctrlRing, styles.ctrlGold]}>
          <Feather name="archive" size={17} color={T.gold} />
        </View>
      </TouchableOpacity>
    </LinearGradient>
  );
}

type TabProps = {
  label: string;
  emblem: ImageSourcePropType;
  selected: boolean;
  onPress: () => void;
  testID: string;
};

export function LightningRoundTabButton({ label, emblem, selected, onPress, testID }: TabProps) {
  const reduceMotion = useReduceMotion();
  const lift = useRef(new Animated.Value(selected ? 1 : 0)).current;
  useEffect(() => {
    if (reduceMotion) {
      lift.setValue(selected ? 1 : 0);
      return;
    }
    const animation = Animated.spring(lift, { toValue: selected ? 1 : 0, useNativeDriver: Platform.OS !== 'web', friction: 7, tension: 120 });
    animation.start();
    return () => animation.stop();
  }, [selected, lift, reduceMotion]);
  const scale = lift.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.08] });

  return (
    <TouchableOpacity
      testID={testID}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      aria-selected={selected}
      onPress={onPress}
      activeOpacity={0.85}
      style={[styles.tab, selected ? styles.tabSelected : styles.tabIdle]}
    >
      <LinearGradient
        colors={selected ? [T.selectedMetal, T.navySteel, T.navyDeep] : [T.navySteel, T.navy, T.navyDeep]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {selected && (
        <LinearGradient colors={['transparent', T.goldBright, 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.tabSheen} />
      )}
      <Animated.View style={[styles.emblemWrap, { transform: [{ scale }] }]}>
        {selected && <View style={styles.halo} />}
        <Image source={emblem} style={[styles.emblem, !selected && { opacity: 0.82 }]} resizeMode="contain" accessible={false} />
      </Animated.View>
      <Text style={[styles.tabLabel, selected ? styles.tabLabelSelected : null]}>{label}</Text>
      {selected && <View style={styles.selectBar} />}
    </TouchableOpacity>
  );
}

export function LightningRoundTabStrip({ children }: { children: React.ReactNode }) {
  return <View style={styles.strip}>{children}</View>;
}

const styles = StyleSheet.create({
  header: {
    minHeight: 64,
    paddingHorizontal: 8,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    overflow: 'hidden',
  },
  bottomEdge: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 1.5, opacity: 0.85 },
  ctrl: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  ctrlRing: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(5,10,28,0.7)',
    borderWidth: 1,
    borderColor: T.electricSoft,
  },
  ctrlGold: { borderColor: T.goldDeep },
  center: { flex: 1, minWidth: 0, alignItems: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, maxWidth: '100%' },
  title: {
    flexShrink: 1,
    color: T.silver,
    fontFamily: 'Inter_700Bold',
    fontSize: 17,
    letterSpacing: 1.6,
    textAlign: 'center',
    textShadowColor: T.electric,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 5,
  },
  subtitle: {
    color: T.textMuted,
    fontFamily: 'Inter_500Medium',
    fontSize: 10.5,
    letterSpacing: 0.6,
    marginTop: 3,
    textAlign: 'center',
  },
  laurel: { width: 26, height: 20, justifyContent: 'center' },
  laurelRule: { position: 'absolute', left: 0, right: 2, height: 1.5, top: 9.5, borderRadius: 1 },
  leaf: {
    position: 'absolute',
    width: 7,
    height: 4,
    borderTopLeftRadius: 6,
    borderBottomRightRadius: 6,
    backgroundColor: T.gold,
  },
  laurelGem: { position: 'absolute', right: 0, top: 7.5, width: 5, height: 5, borderRadius: 1, backgroundColor: T.goldBright, transform: [{ rotate: '45deg' }] },
  strip: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 8,
    paddingTop: 10,
    paddingBottom: 8,
    backgroundColor: T.navyDeep,
  },
  tab: {
    flex: 1,
    minWidth: 0,
    minHeight: 84,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 6,
    paddingBottom: 8,
    paddingHorizontal: 3,
    overflow: 'hidden',
  },
  tabIdle: { borderWidth: 1, borderColor: T.electricSoft },
  tabSelected: { borderWidth: 1.5, borderColor: T.gold },
  tabSheen: { position: 'absolute', top: 0, left: 8, right: 8, height: 1.5 },
  emblemWrap: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  halo: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(242,193,78,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,227,154,0.35)',
  },
  emblem: { width: 40, height: 40 },
  tabLabel: {
    marginTop: 4,
    color: T.silver,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10.5,
    lineHeight: 13,
    textAlign: 'center',
  },
  tabLabelSelected: { color: T.goldBright, fontFamily: 'Inter_700Bold' },
  selectBar: { position: 'absolute', bottom: 3, width: 22, height: 3, borderRadius: 2, backgroundColor: T.gold },
});
