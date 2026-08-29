import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { NEON_GUCCI_DECOR } from '@/constants/colors';
import { useReduceMotion } from '@/hooks/useReduceMotion';

export function NeonAnalysisLoader({ symbol, stage = 'Reading the tape' }: { symbol: string; stage?: string }) {
  const nativeDriver = Platform.OS !== 'web';
  const reduceMotion = useReduceMotion();

  const spin = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduceMotion) {
      spin.stopAnimation();
      pulse.stopAnimation();
      spin.setValue(0);
      pulse.setValue(0.35);
      return;
    }
    const spinAnimation = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 4200,
        easing: Easing.linear,
        useNativeDriver: nativeDriver,
      }),
    );
    const pulseAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 950, useNativeDriver: nativeDriver }),
        Animated.timing(pulse, { toValue: 0, duration: 950, useNativeDriver: nativeDriver }),
      ]),
    );
    spinAnimation.start();
    pulseAnimation.start();
    return () => {
      spinAnimation.stop();
      pulseAnimation.stop();
    };
  }, [nativeDriver, pulse, reduceMotion, spin]);

  return (
    <View style={styles.stage} accessibilityLabel={`Analyzing ${symbol}`}>
      <Animated.View
        style={[
          styles.halo,
          {
            opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.22, 0.68] }),
            transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.08] }) }],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.orbit,
          {
            transform: [{
              rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }),
            }],
          },
        ]}
      >
        <View style={[styles.orb, styles.orbTop]} />
        <View style={[styles.orb, styles.orbBottom]} />
      </Animated.View>
      <LinearGradient
        colors={[NEON_GUCCI_DECOR.green, NEON_GUCCI_DECOR.mint, NEON_GUCCI_DECOR.gold]}
        style={styles.core}
      >
        <Text style={styles.monogram}>GG</Text>
        <Text style={styles.symbol}>{symbol}</Text>
      </LinearGradient>
      <View style={styles.stripe}>
        <View style={[styles.stripePart, { backgroundColor: NEON_GUCCI_DECOR.green }]} />
        <View style={[styles.stripePart, { backgroundColor: NEON_GUCCI_DECOR.red }]} />
        <View style={[styles.stripePart, { backgroundColor: NEON_GUCCI_DECOR.green }]} />
      </View>
      <Text style={styles.stageLabel}>{stage.toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { width: 164, height: 164, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  halo: {
    position: 'absolute',
    width: 146,
    height: 146,
    borderRadius: 73,
    backgroundColor: NEON_GUCCI_DECOR.cyan,
    shadowColor: NEON_GUCCI_DECOR.cyan,
    shadowOpacity: 0.95,
    shadowRadius: 28,
  },
  orbit: {
    position: 'absolute',
    width: 150,
    height: 150,
    borderRadius: 75,
    borderWidth: 1,
    borderColor: NEON_GUCCI_DECOR.gold,
  },
  orb: {
    position: 'absolute',
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: NEON_GUCCI_DECOR.cyan,
    shadowColor: NEON_GUCCI_DECOR.cyan,
    shadowOpacity: 1,
    shadowRadius: 8,
  },
  orbTop: { top: -5, left: 69 },
  orbBottom: { bottom: -5, left: 69, backgroundColor: NEON_GUCCI_DECOR.gold },
  core: {
    width: 112,
    height: 112,
    borderRadius: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: NEON_GUCCI_DECOR.gold,
  },
  monogram: { color: NEON_GUCCI_DECOR.ink, fontSize: 30, fontWeight: '900', letterSpacing: -4 },
  symbol: { color: NEON_GUCCI_DECOR.ink, fontSize: 11, fontWeight: '800', letterSpacing: 2, marginTop: 3 },
  stripe: {
    position: 'absolute',
    bottom: 22,
    width: 82,
    height: 5,
    borderRadius: 3,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  stripePart: { flex: 1 },
  stageLabel: { position: 'absolute', bottom: -22, color: NEON_GUCCI_DECOR.mint, fontSize: 9, letterSpacing: 1, fontWeight: '700' },
});