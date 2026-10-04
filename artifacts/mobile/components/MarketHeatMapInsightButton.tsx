import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Path, Stop } from 'react-native-svg';
import { NEON_GUCCI_DECOR, type ColorScheme } from '@/constants/colors';
import type { MarketBreadthInsight } from '@/lib/marketBreadth';

interface MarketHeatMapInsightButtonProps {
  active: boolean;
  neonActive: boolean;
  colors: ColorScheme;
  breadth: MarketBreadthInsight;
  loading: boolean;
  error: boolean;
  onPress: () => void;
}

function flameColors(active: boolean, neonActive: boolean, tone: MarketBreadthInsight['tone']) {
  if (neonActive) {
    return {
      base: NEON_GUCCI_DECOR.green,
      middle: NEON_GUCCI_DECOR.mint,
      core: NEON_GUCCI_DECOR.cyan,
    };
  }
  if (active) {
    return { base: '#9C7A36', middle: '#E6BD61', core: '#F5F3EB' };
  }
  if (tone === 'HOT') {
    return { base: '#07843F', middle: '#35E86F', core: '#E5FF8C' };
  }
  if (tone === 'COLD') {
    return { base: '#C6212C', middle: '#FF6A32', core: '#FFE19A' };
  }
  return { base: '#9B7427', middle: '#E6BD61', core: '#FFF1C9' };
}

function rgbaColor(hexColor: string, opacity: number): string {
  const match = /^#([0-9a-f]{6})$/i.exec(hexColor);
  if (!match) return hexColor;
  const value = Number.parseInt(match[1], 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return `rgba(${red}, ${green}, ${blue}, ${opacity})`;
}

export function MarketHeatMapInsightButton({
  active,
  neonActive,
  colors,
  breadth,
  loading,
  error,
  onPress,
}: MarketHeatMapInsightButtonProps) {
  const fire = useRef(new Animated.Value(0)).current;
  const flagSweep = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);
  const nativeDriver = Platform.OS !== 'web';
  const hasBreadth = breadth.quoted > 0;
  const directional = hasBreadth && breadth.tone !== 'NEUTRAL';
  const isHot = hasBreadth && breadth.tone === 'HOT';
  const isCold = hasBreadth && breadth.tone === 'COLD';
  const signalColor = isHot
    ? colors.buyColor
    : isCold
      ? (neonActive ? '#FF6972' : '#FF593D')
      : active || neonActive
        ? colors.gold
        : colors.holdColor;
  const glowColor = isHot
    ? colors.buyColor
    : isCold
      ? (neonActive ? '#FF6972' : '#FF593D')
      : colors.gold;
  const fireColors = flameColors(active, neonActive, hasBreadth ? breadth.tone : 'NEUTRAL');
  const headline = hasBreadth
    ? isHot ? 'MARKET HOT' : isCold ? 'MARKET COLD' : 'MARKET MIXED'
    : loading ? 'READING MARKET' : error ? 'MARKET SIGNAL PAUSED' : 'MARKET UNAVAILABLE';
  const detail = hasBreadth
    ? isHot
      ? `${breadth.greenPercent}% OF STOCKS GREEN`
      : isCold
        ? `${breadth.redPercent}% OF STOCKS RED`
        : `${breadth.greenPercent}% GREEN  ·  ${breadth.redPercent}% RED`
    : loading
      ? 'Checking live stock breadth…'
      : error
        ? 'Stock breadth is temporarily unavailable'
        : 'Waiting for fresh stock quotes';
  const accessibilityLabel = hasBreadth
    ? `Open market heat map. ${headline.toLowerCase()}, ${breadth.greenPercent} percent green and ${breadth.redPercent} percent red across ${breadth.quoted} stocks.`
    : `Open market heat map. ${headline.toLowerCase()}. ${detail}.`;

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => { if (mounted) setReduceMotion(enabled); })
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    fire.stopAnimation();
    fire.setValue(0);
    if (reduceMotion) return;
    const step = directional ? 145 : 225;
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(fire, { toValue: 1, duration: step, useNativeDriver: nativeDriver }),
      Animated.timing(fire, { toValue: -0.82, duration: step * 0.8, useNativeDriver: nativeDriver }),
      Animated.timing(fire, { toValue: 0.3, duration: step * 0.7, useNativeDriver: nativeDriver }),
      Animated.timing(fire, { toValue: 0, duration: step * 0.75, useNativeDriver: nativeDriver }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [directional, fire, nativeDriver, reduceMotion]);

  useEffect(() => {
    flagSweep.stopAnimation();
    flagSweep.setValue(0);
    if (!active || reduceMotion) return;
    const animation = Animated.sequence([
      Animated.timing(flagSweep, { toValue: 1, duration: 640, useNativeDriver: nativeDriver }),
      Animated.timing(flagSweep, { toValue: 0, duration: 440, useNativeDriver: nativeDriver }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [active, flagSweep, nativeDriver, reduceMotion]);

  const fireRotate = fire.interpolate({ inputRange: [-1, 1], outputRange: ['-3.6deg', '3deg'] });
  const fireScaleX = fire.interpolate({ inputRange: [-1, 1], outputRange: [0.94, directional ? 1.08 : 1.04] });
  const fireScaleY = fire.interpolate({ inputRange: [-1, 1], outputRange: [directional ? 0.82 : 0.91, directional ? 1.13 : 1.06] });
  const auraOpacity = reduceMotion
    ? directional ? 0.83 : hasBreadth ? 0.46 : 0.24
    : fire.interpolate({ inputRange: [-1, 1], outputRange: [directional ? 0.3 : 0.13, directional ? 0.92 : 0.57] });
  const auraScale = reduceMotion
    ? 1
    : fire.interpolate({ inputRange: [-1, 1], outputRange: [0.88, directional ? 1.22 : 1.1] });
  const flashOpacity = flagSweep.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0.88, 0] });
  const flashX = flagSweep.interpolate({ inputRange: [0, 1], outputRange: [-34, 34] });
  const frameShadow = Platform.OS === 'web'
    ? { boxShadow: `0 0 13px 1px ${rgbaColor(glowColor, 0.22)}` }
    : { elevation: 4 };
  const auraShadow = Platform.OS === 'web'
    ? { boxShadow: `0 0 18px 3px ${rgbaColor(glowColor, directional ? 0.72 : 0.42)}` }
    : { elevation: 11 };

  return (
    <TouchableOpacity
      testID="open-heat-map"
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      activeOpacity={0.9}
      style={[styles.goldFrame, frameShadow, { borderColor: colors.gold }]}
    >
      <View style={[styles.silverFrame, { backgroundColor: colors.card }]}>
        <View style={styles.contentRow}>
          <View style={styles.flameStage}>
            <Animated.View
              style={[
                styles.flameAura,
                auraShadow,
                {
                  backgroundColor: glowColor,
                  opacity: auraOpacity,
                  transform: [{ scale: auraScale }],
                },
              ]}
            />
            <Animated.View style={[styles.flameArtwork, { transform: [{ rotate: fireRotate }, { scaleX: fireScaleX }, { scaleY: fireScaleY }] }]}>
              <View style={styles.flameWindow}>
                <Svg width="43" height="49" viewBox="0 0 100 100">
                  <Defs>
                    <SvgLinearGradient id="marketPulseFlame" x1="0%" y1="100%" x2="0%" y2="0%">
                      <Stop offset="0%" stopColor={fireColors.base} />
                      <Stop offset="64%" stopColor={fireColors.middle} />
                      <Stop offset="100%" stopColor={fireColors.core} />
                    </SvgLinearGradient>
                    <SvgLinearGradient id="marketPulseCore" x1="0%" y1="100%" x2="0%" y2="0%">
                      <Stop offset="0%" stopColor={fireColors.middle} />
                      <Stop offset="100%" stopColor={fireColors.core} />
                    </SvgLinearGradient>
                  </Defs>
                  {neonActive && <>
                    <Path d="M18 34L21 41L29 44L21 47L18 55L15 47L7 44L15 41Z" fill={NEON_GUCCI_DECOR.cyan} />
                    <Path d="M82 53L84 58L90 60L84 62L82 68L80 62L74 60L80 58Z" fill={NEON_GUCCI_DECOR.gold} />
                    <Circle cx="25" cy="68" r="2.5" fill={NEON_GUCCI_DECOR.mint} />
                  </>}
                  <Path
                    d="M52 96C34 92 22 79 22 61C22 45 32 36 40 24C40 36 46 42 50 46C52 31 59 18 68 5C67 27 80 35 84 51C89 72 75 92 56 96Z"
                    fill="url(#marketPulseFlame)"
                  />
                  <Path
                    d="M51 87C42 83 37 76 39 66C41 57 49 51 52 42C60 53 63 61 59 68C66 65 69 59 67 52C78 66 71 82 60 87Z"
                    fill="url(#marketPulseCore)"
                  />
                  <Path
                    d="M51 83C46 80 47 74 51 68C53 73 56 75 55 79C59 77 60 72 59 69C66 77 60 83 54 85Z"
                    fill="#FFF8DC"
                    opacity={active ? 0.82 : 0.96}
                  />
                </Svg>
              </View>
            </Animated.View>
            {active && !reduceMotion && (
              <Animated.View style={[styles.flagSweep, { opacity: flashOpacity, transform: [{ translateX: flashX }, { rotate: '22deg' }] }]}>
                <LinearGradient
                  colors={['#2A5CAA', '#FFFFFF', '#C83445']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 0, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
              </Animated.View>
            )}
          </View>
          <View style={styles.insightCopy}>
            <Text style={[styles.eyebrow, { color: colors.mutedForeground }]}>MARKET HEAT MAP</Text>
            <Text numberOfLines={1} style={[styles.headline, { color: signalColor }]}>{headline}</Text>
            <Text numberOfLines={1} style={[styles.detail, { color: colors.foreground }]}>{detail}</Text>
          </View>
          <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  goldFrame: {
    minHeight: 78,
    borderWidth: 1.6,
    borderRadius: 17,
    padding: 3,
  },
  silverFrame: {
    flex: 1,
    minHeight: 68,
    borderWidth: 1,
    borderColor: '#C4CDD7',
    borderRadius: 12,
    paddingHorizontal: 11,
    paddingVertical: 8,
    justifyContent: 'center',
  },
  contentRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  flameStage: { width: 48, height: 50, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  flameAura: {
    position: 'absolute',
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  flameArtwork: { width: 43, height: 49, alignItems: 'center', justifyContent: 'center' },
  flameWindow: { width: 43, height: 49, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  flagSweep: { position: 'absolute', left: 16, top: 2, bottom: 2, width: 7, overflow: 'hidden', borderRadius: 4 },
  insightCopy: { flex: 1, minWidth: 0, gap: 2 },
  eyebrow: { fontFamily: 'Inter_700Bold', fontSize: 7, letterSpacing: 1.2 },
  headline: { fontFamily: 'Inter_700Bold', fontSize: 15, letterSpacing: 0.25 },
  detail: { fontFamily: 'Inter_600SemiBold', fontSize: 9, letterSpacing: 0.25 },
});