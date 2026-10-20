import React, { useEffect, useId } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, {
  Circle,
  ClipPath,
  Defs,
  G,
  LinearGradient,
  Path,
  Rect,
  Stop,
} from 'react-native-svg';
import { PREMIUM_FLAGS, type PremiumFlagId } from '@/lib/achievements';
import { useReduceMotion } from '@/hooks/useReduceMotion';
import { useColors } from '@/hooks/useColors';

const FLAG_WIDTH = 100;
const FLAG_HEIGHT = 64;
const FLAG_SHAPE = 'M1 5 C18 0 31 9 48 5 C66 0 81 8 99 3 L99 58 C81 62 65 54 48 59 C30 64 16 55 1 60 Z';
const STRIPE_HEIGHT = FLAG_HEIGHT / 13;
const STAR_ROWS = Array.from({ length: 9 }, (_, row) => ({
  y: 3.5 + row * 3.7,
  count: row % 2 === 0 ? 6 : 5,
}));

type PremiumFlagBadgeProps = {
  flagId: PremiumFlagId;
  size?: number;
  animated?: boolean;
};

export function PremiumFlagBadge({ flagId, size = 48, animated = true }: PremiumFlagBadgeProps) {
  const flag = PREMIUM_FLAGS.find((item) => item.id === flagId) ?? PREMIUM_FLAGS[0];
  const colors = useColors();
  const reduceMotion = useReduceMotion();
  const wave = useSharedValue(0);
  const generatedId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const clipId = `flag-clip-${generatedId}`;
  const sheenId = `flag-sheen-${generatedId}`;

  useEffect(() => {
    if (!animated || reduceMotion) {
      cancelAnimation(wave);
      wave.value = 0;
      return;
    }
    wave.value = withRepeat(
      withTiming(1, { duration: 2_600, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
    return () => cancelAnimation(wave);
  }, [animated, reduceMotion, wave]);

  const motionStyle = useAnimatedStyle(() => {
    const sway = interpolate(wave.value, [0, 1], [-1, 1]);
    return {
      transform: [
        { perspective: 420 },
        { rotateY: `${sway * 7}deg` },
        { rotateZ: `${sway * 1.4}deg` },
        { scaleX: 1 - Math.abs(sway) * 0.025 },
      ],
    };
  });

  return (
    <Animated.View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${flag.name} premium American flag`}
      style={[
        styles.frame,
        {
          borderColor: colors.gold,
          backgroundColor: colors.steelShadow,
          shadowColor: colors.gold,
        },
        { width: size, height: size * 0.66 },
        motionStyle,
      ]}
    >
      <View style={styles.flagSurface}>
        <Svg width="100%" height="100%" viewBox={`0 0 ${FLAG_WIDTH} ${FLAG_HEIGHT}`}>
          <Defs>
            <ClipPath id={clipId}>
              <Path d={FLAG_SHAPE} />
            </ClipPath>
            <LinearGradient id={sheenId} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.48" />
              <Stop offset="0.32" stopColor="#FFFFFF" stopOpacity="0.06" />
              <Stop offset="0.7" stopColor="#000000" stopOpacity="0.02" />
              <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0.28" />
            </LinearGradient>
          </Defs>
          <G clipPath={`url(#${clipId})`}>
            {Array.from({ length: 13 }, (_, stripe) => (
              <Rect
                key={`stripe-${stripe}`}
                x="0"
                y={stripe * STRIPE_HEIGHT}
                width={FLAG_WIDTH}
                height={STRIPE_HEIGHT + 0.2}
                fill={stripe % 2 === 0 ? flag.red : flag.white}
              />
            ))}
            <Rect x="0" y="0" width="43" height="35" fill={flag.canton} />
            {STAR_ROWS.map((row, rowIndex) =>
              Array.from({ length: row.count }, (_, column) => (
                <Circle
                  key={`star-${rowIndex}-${column}`}
                  cx={row.count === 6 ? 3.8 + column * 7.1 : 7.35 + column * 7.1}
                  cy={row.y}
                  r="0.9"
                  fill={flag.star}
                />
              )),
            )}
            <Rect x="0" y="0" width={FLAG_WIDTH} height={FLAG_HEIGHT} fill={`url(#${sheenId})`} />
          </G>
          <Path d={FLAG_SHAPE} fill="none" stroke={colors.gold} strokeOpacity="0.9" strokeWidth="1.7" />
          <Path d="M3 7 C17 3 31 11 47 7" fill="none" stroke="#FFFFFF" strokeOpacity="0.25" strokeWidth="1" />
        </Svg>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  frame: {
    padding: 2,
    borderRadius: 8,
    borderWidth: 1,
    shadowOpacity: 0.32,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  flagSurface: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: 5,
    backgroundColor: '#18243B',
  },
});
