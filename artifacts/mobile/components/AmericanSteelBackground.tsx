import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Platform, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useColors } from '@/hooks/useColors';
import { useAmericanMode } from '@/contexts/AmericanModeContext';
import { NEON_GUCCI_DECOR } from '@/constants/colors';

interface Props {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * Premium Patriot Mode surface: a dark brushed-steel field with restrained
 * diagonal grain. Normal mode stays a plain view so existing screens remain
 * visually unchanged.
 */
export function AmericanSteelBackground({ children, style }: Props) {
  const colors = useColors();
  const { isActive, neonGucciActive } = useAmericanMode();
  const neonOpacity = useRef(new Animated.Value(neonGucciActive ? 1 : 0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const animation = Animated.timing(neonOpacity, {
      toValue: neonGucciActive ? 1 : 0,
      duration: reduceMotion ? 0 : 1700,
      useNativeDriver: Platform.OS !== 'web',
    });
    animation.start();
    return () => animation.stop();
  }, [neonGucciActive, neonOpacity, reduceMotion]);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }, style]}>
      {isActive && !neonGucciActive && (
        <>
          <LinearGradient
            colors={[colors.steelShadow, colors.background, colors.steelHighlight, colors.background, colors.steelShadow]}
            locations={[0, 0.22, 0.48, 0.7, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <View style={styles.grain} pointerEvents="none">
            {Array.from({ length: 18 }, (_, index) => (
              <View
                key={index}
                style={[
                  styles.brush,
                  {
                    top: `${index * 6.5}%`,
                    backgroundColor: index % 3 === 0 ? '#ffffff' : '#000000',
                    opacity: index % 3 === 0 ? 0.035 : 0.05,
                  },
                ]}
              />
            ))}
          </View>
        </>
      )}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFillObject, { opacity: neonOpacity }]}
      >
        <LinearGradient
          colors={['#3d2d25', '#211817', '#100e12']}
          locations={[0, 0.58, 1]}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.monogramField}>
          {Array.from({ length: 56 }, (_, index) => (
            <Text
              key={index}
              style={[
                styles.monogram,
                {
                  color: index % 4 === 0 ? NEON_GUCCI_DECOR.gold : NEON_GUCCI_DECOR.beige,
                  transform: [{ rotate: index % 2 === 0 ? '-18deg' : '18deg' }],
                },
              ]}
            >
              GG
            </Text>
          ))}
        </View>
        <View style={styles.headerStripe}>
          <View style={[styles.stripeEdge, { backgroundColor: NEON_GUCCI_DECOR.gold }]} />
          <View style={[styles.stripeWide, { backgroundColor: NEON_GUCCI_DECOR.green }]} />
          <View style={[styles.stripeNarrow, { backgroundColor: NEON_GUCCI_DECOR.red }]} />
          <View style={[styles.stripeWide, { backgroundColor: NEON_GUCCI_DECOR.green }]} />
          <View style={[styles.stripeEdge, { backgroundColor: NEON_GUCCI_DECOR.gold }]} />
        </View>
        <LinearGradient
          colors={['rgba(85,236,255,0.16)', 'transparent', 'rgba(239,200,110,0.12)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <View style={[styles.content, neonGucciActive && styles.neonContentContrast]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden' },
  content: { flex: 1 },
  neonContentContrast: { backgroundColor: 'rgba(16,14,18,0.09)' },
  grain: { ...StyleSheet.absoluteFillObject, transform: [{ rotate: '-8deg' }, { scale: 1.2 }] },
  brush: { position: 'absolute', left: -40, right: -40, height: 1 },
  monogramField: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignContent: 'space-around',
    justifyContent: 'space-around',
    paddingHorizontal: 4,
    opacity: 0.16,
  },
  monogram: { width: '14%', fontSize: 13, fontWeight: '900', letterSpacing: -2 },
  headerStripe: {
    position: 'absolute',
    top: 58,
    left: 0,
    right: 0,
    height: 10,
    flexDirection: 'row',
    shadowColor: NEON_GUCCI_DECOR.cyan,
    shadowOpacity: 0.45,
    shadowRadius: 9,
  },
  stripeEdge: { flex: 0.08 },
  stripeWide: { flex: 1 },
  stripeNarrow: { flex: 0.58 },
});