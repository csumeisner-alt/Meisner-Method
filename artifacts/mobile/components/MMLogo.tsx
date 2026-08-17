import React, { useEffect, useRef } from 'react';
import { Animated, Platform, View, StyleSheet } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop, Text as SvgText, Rect } from 'react-native-svg';

interface MMLogoProps {
  size?: number;
}

export function MMLogo({ size = 60 }: MMLogoProps) {
  const width = size;
  const totalHeight = size;
  const inset = size * 0.08;
  const corner = size * 0.18;
  const monogramX = width * 0.47;
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
    <View style={[styles.container, { width, height: totalHeight }]}>
      <Animated.View
        style={[
          styles.glow,
          {
            width: width * 0.78,
            height: totalHeight * 0.78,
            borderRadius: corner,
            opacity: glowOpacity,
            transform: [{ scale: glowScale }],
          },
        ]}
      />
      <Svg
        width={width}
        height={totalHeight}
        viewBox={`0 0 ${width} ${totalHeight}`}
        accessibilityLabel="Meisner Method"
      >
        <Defs>
          <LinearGradient id="goldMain" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor="#fff1a8" />
            <Stop offset="22%" stopColor="#d99a22" />
            <Stop offset="48%" stopColor="#fff0a1" />
            <Stop offset="68%" stopColor="#a85f0b" />
            <Stop offset="100%" stopColor="#f5c64e" />
          </LinearGradient>
          <LinearGradient id="goldShadow" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor="#b86b0d" />
            <Stop offset="42%" stopColor="#ffe889" />
            <Stop offset="70%" stopColor="#8b4c08" />
            <Stop offset="100%" stopColor="#e6a92c" />
          </LinearGradient>
        </Defs>

        {/* Deep black plaque and double gold frame from the earlier mark. */}
        <Rect x="0" y="0" width={width} height={totalHeight} rx={corner} fill="#050403" />
        <Rect
          x={inset}
          y={inset}
          width={width - inset * 2}
          height={totalHeight - inset * 2}
          rx={corner * 0.72}
          fill="none"
          stroke="#8b5009"
          strokeWidth={size * 0.055}
        />
        <Rect
          x={inset + size * 0.018}
          y={inset + size * 0.018}
          width={width - (inset + size * 0.018) * 2}
          height={totalHeight - (inset + size * 0.018) * 2}
          rx={corner * 0.62}
          fill="none"
          stroke="url(#goldMain)"
          strokeWidth={size * 0.018}
        />

        {/* Stacked Ms are shifted slightly left to center their visible glyphs
            inside the framed plaque. */}
        <SvgText
          x={monogramX}
          y={totalHeight * 0.76}
          textAnchor="middle"
          fontSize={size * 0.48}
          fontWeight="900"
          fontFamily="Georgia, Times New Roman, serif"
          fill="url(#goldShadow)"
          stroke="#6d3e07"
          strokeWidth={size * 0.008}
          letterSpacing={-size * 0.04}
        >
          M
        </SvgText>
        <SvgText
          x={monogramX}
          y={totalHeight * 0.51}
          textAnchor="middle"
          fontSize={size * 0.42}
          fontWeight="900"
          fontFamily="Georgia, Times New Roman, serif"
          fill="url(#goldMain)"
          stroke="#7a4307"
          strokeWidth={size * 0.007}
          letterSpacing={-size * 0.04}
        >
          M
        </SvgText>
        <Circle
          cx={monogramX}
          cy={totalHeight * 0.62}
          r={size * 0.025}
          fill="#fff2a2"
        />
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
    backgroundColor: '#D99A22',
    shadowColor: '#F5C64E',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 12,
    elevation: 8,
  },
});
