import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Rect, Polygon } from 'react-native-svg';
import type { ColorScheme } from '@/constants/colors';

interface AmericanAnalyzeButtonProps {
  active: boolean;
  disabled: boolean;
  hasQuery: boolean;
  colors: ColorScheme;
  onPress: () => void;
}

function starPoints(cx: number, cy: number, outerRadius: number): string {
  const points: string[] = [];
  const innerRadius = outerRadius * 0.42;

  for (let index = 0; index < 10; index += 1) {
    const angle = -Math.PI / 2 + (index * Math.PI) / 5;
    const radius = index % 2 === 0 ? outerRadius : innerRadius;
    points.push(`${cx + Math.cos(angle) * radius},${cy + Math.sin(angle) * radius}`);
  }

  return points.join(' ');
}

function GoldenFlag() {
  const stripeHeight = 52 / 7;
  const stars = [
    [12, 8], [28, 8], [44, 8],
    [20, 17], [36, 17],
    [12, 26], [28, 26], [44, 26],
  ] as const;

  return (
    <Svg width="100%" height="100%" viewBox="0 0 300 52" preserveAspectRatio="none">
      <Rect width="300" height="52" fill="#C9952E" />
      {Array.from({ length: 7 }, (_, index) => (
        <Rect
          key={index}
          x="0"
          y={index * stripeHeight}
          width="300"
          height={stripeHeight / 2}
          fill={index % 2 === 0 ? '#F1D477' : '#805114'}
          opacity={index % 2 === 0 ? 0.76 : 0.68}
        />
      ))}
      <Rect width="58" height="31" fill="#4C3112" opacity={0.94} />
      {stars.map(([x, y]) => (
        <Polygon
          key={`${x}-${y}`}
          points={starPoints(x, y, 3.1)}
          fill="#FFE8A1"
          opacity={0.95}
        />
      ))}
      <Rect width="300" height="52" fill="#3B260E" opacity={0.18} />
    </Svg>
  );
}

export function AmericanAnalyzeButton({
  active,
  disabled,
  hasQuery,
  colors,
  onPress,
}: AmericanAnalyzeButtonProps) {
  const pulse = useRef(new Animated.Value(0)).current;
  const nativeDriver = Platform.OS !== 'web';

  useEffect(() => {
    pulse.stopAnimation();
    pulse.setValue(0);

    if (!active) return;

    const animation = Animated.loop(
      Animated.sequence([
        Animated.delay(30_000),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 650,
          useNativeDriver: nativeDriver,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 650,
          useNativeDriver: nativeDriver,
        }),
      ]),
    );

    animation.start();
    return () => animation.stop();
  }, [active, nativeDriver, pulse]);

  const flagOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.9],
  });
  const pulseTextOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  return (
    <TouchableOpacity
      style={[
        styles.button,
        {
          backgroundColor: hasQuery ? colors.primary : colors.muted,
          borderColor: hasQuery ? colors.primary : colors.border,
        },
      ]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
    >
      {active && (
        <Animated.View
          style={[StyleSheet.absoluteFillObject, styles.flagLayer, { opacity: flagOpacity }]}
        >
          <GoldenFlag />
        </Animated.View>
      )}
      <Text
        style={[
          styles.label,
          {
            color: hasQuery ? colors.primaryForeground : colors.mutedForeground,
            fontFamily: 'Inter_700Bold',
          },
        ]}
      >
        ANALYZE
      </Text>
      {active && (
        <Animated.Text
          style={[
            styles.label,
            styles.pulseLabel,
            {
              opacity: pulseTextOpacity,
              fontFamily: 'Inter_700Bold',
            },
          ]}
        >
          ANALYZE
        </Animated.Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 52,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  flagLayer: {
    pointerEvents: 'none',
  },
  label: {
    fontSize: 14,
    letterSpacing: 1,
  },
  pulseLabel: {
    position: 'absolute',
    color: '#1B1206',
    textShadowColor: '#FFE39A',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
});