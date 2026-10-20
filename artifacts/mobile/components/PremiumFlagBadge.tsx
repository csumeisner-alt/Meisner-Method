import React, { useEffect } from 'react';
import { Image, type ImageSourcePropType, StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { PREMIUM_FLAGS, type PremiumFlagId } from '@/lib/achievements';
import { useColors } from '@/hooks/useColors';

const FLAG_ARTWORK: Record<(typeof PREMIUM_FLAGS)[number]['artwork'], ImageSourcePropType> = {
  gadsden: require('@/assets/images/premium-flags/gadsden.jpg'),
  'liberty-eagle': require('@/assets/images/premium-flags/liberty-eagle.jpg'),
  'betsy-ross': require('@/assets/images/premium-flags/betsy-ross.jpg'),
  'red-union': require('@/assets/images/premium-flags/red-union.jpg'),
  pride: require('@/assets/images/premium-flags/pride.jpg'),
  'southern-cross': require('@/assets/images/premium-flags/southern-cross.jpg'),
};

const SLICE_COUNT = 24;

type WaveSliceProps = {
  index: number;
  width: number;
  height: number;
  progress: SharedValue<number>;
  artwork: ImageSourcePropType;
};

function WaveSlice({ index, width, height, progress, artwork }: WaveSliceProps) {
  const sliceWidth = width / SLICE_COUNT;

  const motionStyle = useAnimatedStyle(() => {
    const distance = index / (SLICE_COUNT - 1);
    const phase = progress.value * Math.PI * 2 - distance * Math.PI * 2;
    const wave = Math.sin(phase);
    const twist = Math.cos(phase);

    return {
      transform: [
        { perspective: 420 },
        { translateY: wave * height * 0.09 * distance },
        { rotateY: `${twist * 13 * distance}deg` },
        { rotateZ: `${twist * 2.2 * distance}deg` },
        { scaleX: 1 - Math.abs(wave) * 0.035 * distance },
      ],
    };
  });

  const foldStyle = useAnimatedStyle(() => {
    const distance = index / (SLICE_COUNT - 1);
    const phase = progress.value * Math.PI * 2 - distance * Math.PI * 2;
    return { opacity: interpolate(Math.cos(phase), [-1, 1], [0.015, 0.2]) };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.waveSlice,
        { left: index * sliceWidth, width: sliceWidth + 1, height },
        motionStyle,
      ]}
    >
      <Image
        source={artwork}
        resizeMode="stretch"
        style={[styles.artwork, { width, height, left: -index * sliceWidth }]}
      />
      <Animated.View style={[styles.foldShade, foldStyle]} />
    </Animated.View>
  );
}

type PremiumFlagBadgeProps = {
  flagId: PremiumFlagId;
  size?: number;
};

export function PremiumFlagBadge({ flagId, size = 48 }: PremiumFlagBadgeProps) {
  const flag = PREMIUM_FLAGS.find((item) => item.id === flagId) ?? PREMIUM_FLAGS[0];
  const colors = useColors();
  const progress = useSharedValue(0);
  const width = size;
  const height = size * 0.625;

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, {
        duration: 2_200,
        easing: Easing.linear,
        reduceMotion: ReduceMotion.Never,
      }),
      -1,
      false,
      undefined,
      ReduceMotion.Never,
    );
    return () => cancelAnimation(progress);
  }, [progress]);

  return (
    <Animated.View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${flag.name} premium flag`}
      style={[
        styles.frame,
        {
          width,
          height,
          borderColor: colors.gold,
          backgroundColor: colors.steelShadow,
          shadowColor: colors.gold,
        },
      ]}
    >
      <View style={styles.flagSurface}>
        {Array.from({ length: SLICE_COUNT }, (_, index) => (
          <WaveSlice
            key={`${flag.artwork}-${index}`}
            index={index}
            width={width - 4}
            height={height - 4}
            progress={progress}
            artwork={FLAG_ARTWORK[flag.artwork]}
          />
        ))}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  frame: {
    padding: 1,
    borderRadius: 8,
    borderWidth: 1,
    shadowOpacity: 0.38,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  flagSurface: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: 5,
    backgroundColor: '#10151D',
  },
  waveSlice: {
    position: 'absolute',
    top: 0,
    overflow: 'hidden',
    backfaceVisibility: 'hidden',
  },
  artwork: {
    position: 'absolute',
    top: 0,
  },
  foldShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
  },
});
