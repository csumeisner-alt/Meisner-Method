import React, { useEffect, useRef } from 'react';
import { Animated, Platform, View, StyleSheet } from 'react-native';
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';

interface MMLogoProps {
  size?: number;
}

export function MMLogo({ size = 60 }: MMLogoProps) {
  const breathing = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(breathing, {
          toValue: 1,
          duration: 2200,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(breathing, {
          toValue: 0,
          duration: 2200,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [breathing]);

  const glowOpacity = breathing.interpolate({
    inputRange: [0, 1],
    outputRange: [0.06, 0.18],
  });
  const glowScale = breathing.interpolate({
    inputRange: [0, 1],
    outputRange: [0.92, 1.08],
  });

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Animated.View
        style={[
          styles.glow,
          {
            width: size * 0.68,
            height: size * 0.68,
            borderRadius: size * 0.34,
            opacity: glowOpacity,
            transform: [{ scale: glowScale }],
          },
        ]}
      />
      <Svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        accessibilityLabel="Meisner Method"
      >
        <Defs>
          <RadialGradient id="mmBackdrop" cx="50%" cy="36%" r="72%">
            <Stop offset="0%" stopColor="#201707" />
            <Stop offset="52%" stopColor="#0b0804" />
            <Stop offset="100%" stopColor="#020202" />
          </RadialGradient>
          <LinearGradient id="mmGold" x1="18%" y1="6%" x2="82%" y2="94%">
            <Stop offset="0%" stopColor="#fff4bb" />
            <Stop offset="24%" stopColor="#e3b34d" />
            <Stop offset="48%" stopColor="#fff0a0" />
            <Stop offset="72%" stopColor="#b87517" />
            <Stop offset="100%" stopColor="#f2c95f" />
          </LinearGradient>
          <RadialGradient id="mmInnerGlow" cx="50%" cy="48%" r="58%">
            <Stop offset="0%" stopColor="#f6cf69" stopOpacity="0.28" />
            <Stop offset="55%" stopColor="#c58a28" stopOpacity="0.08" />
            <Stop offset="100%" stopColor="#000000" stopOpacity="0" />
          </RadialGradient>
        </Defs>

        {/* The mark is intentionally circular so the launcher, header, and paper
            trading screen all share the same balanced silhouette. */}
        <Rect width="100" height="100" rx="28" fill="url(#mmBackdrop)" />
        <Circle cx="50" cy="50" r="42.5" fill="none" stroke="#5c390c" strokeWidth="3.8" />
        <Circle cx="50" cy="50" r="40.35" fill="none" stroke="url(#mmGold)" strokeWidth="1.2" />
        <Circle cx="50" cy="50" r="35.6" fill="url(#mmInnerGlow)" />
        <Circle cx="50" cy="50" r="34.4" fill="none" stroke="#9a6817" strokeWidth="0.55" opacity="0.72" />
        <Circle cx="50" cy="50" r="31.9" fill="none" stroke="#fff0a0" strokeWidth="0.3" opacity="0.24" />

        {/* Two identical, mirrored-in-their-own-axis M paths keep the monogram
            crisp at small sizes without relying on platform font rendering. */}
        <Path
          d="M35 27H41L50 39L59 27H65V45H59V36.7L53 45H47L41 36.7V45H35V27Z"
          fill="url(#mmGold)"
          stroke="#6c410b"
          strokeWidth="0.65"
          strokeLinejoin="round"
        />
        <Path
          d="M35 53H41L50 65L59 53H65V71H59V62.7L53 71H47L41 62.7V71H35V53Z"
          fill="url(#mmGold)"
          stroke="#6c410b"
          strokeWidth="0.65"
          strokeLinejoin="round"
        />
        <Circle cx="50" cy="50" r="0.8" fill="#fff5bd" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  glow: {
    position: 'absolute',
    alignSelf: 'center',
    pointerEvents: 'none',
    backgroundColor: '#D6AD54',
    shadowColor: '#F5C64E',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 12,
    elevation: 8,
  },
});
