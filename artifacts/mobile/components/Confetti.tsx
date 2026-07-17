import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

// A tiny, dependency-free confetti burst built on the Animated API.
// Each piece falls from the top of the given area, drifting and spinning,
// then fades out near the end of its run.

const DEFAULT_COLORS = ['#7C3AED', '#DB2777', '#F59E0B', '#00D632', '#3D95CE', '#22D3EE'];

interface Piece {
  key: number;
  x: number;
  size: number;
  color: string;
  delay: number;
  drift: number;
  rotations: number;
  duration: number;
}

interface ConfettiProps {
  width: number;
  height: number;
  count?: number;
  duration?: number;
  /** Override confetti colors. Defaults to the purple/pink/yellow palette. */
  colors?: string[];
}

export function Confetti({ width, height, count = 90, duration = 2600, colors = DEFAULT_COLORS }: ConfettiProps) {
  const pieces = useMemo<Piece[]>(
    () =>
      Array.from({ length: count }).map((_, i) => ({
        key: i,
        x: Math.random() * width,
        size: 6 + Math.random() * 8,
        color: colors[i % colors.length],
        delay: Math.random() * 500,
        drift: (Math.random() - 0.5) * 140,
        rotations: 2 + Math.random() * 4,
        duration: duration * (0.7 + Math.random() * 0.5),
      })),
    [count, width, duration],
  );

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map((p) => (
        <ConfettiPiece key={p.key} piece={p} height={height} />
      ))}
    </View>
  );
}

function ConfettiPiece({ piece, height }: { piece: Piece; height: number }) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: piece.duration,
      delay: piece.delay,
      easing: Easing.linear,
      useNativeDriver: true,
    }).start();
  }, [piece.duration, piece.delay, progress]);

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-40, height + 40],
  });
  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, piece.drift],
  });
  const rotate = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', `${piece.rotations * 360}deg`],
  });
  const opacity = progress.interpolate({
    inputRange: [0, 0.85, 1],
    outputRange: [1, 1, 0],
  });

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: piece.x,
        top: 0,
        width: piece.size,
        height: piece.size * 0.6,
        borderRadius: 2,
        backgroundColor: piece.color,
        opacity,
        transform: [{ translateY }, { translateX }, { rotate }],
      }}
    />
  );
}
