import React, { useEffect } from 'react';
import { type ImageResizeMode, type ImageSourcePropType, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  cancelAnimation,
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { ALL_PREMIUM_FLAGS, type PremiumFlagId } from '@/lib/achievements';
import { PREMIUM_FLAG_BORDER_STYLES } from '@/lib/premiumFlagBorders';

const FLAG_ARTWORK: Record<(typeof ALL_PREMIUM_FLAGS)[number]['artwork'], ImageSourcePropType> = {
  gadsden: require('@/assets/images/premium-flags/gadsden.png'),
  'liberty-eagle': require('@/assets/images/premium-flags/liberty-eagle.jpg'),
  'betsy-ross': require('@/assets/images/premium-flags/betsy-ross.jpg'),
  'red-union': require('@/assets/images/premium-flags/red-union.jpg'),
  pride: require('@/assets/images/premium-flags/pride.jpg'),
  'southern-cross': require('@/assets/images/premium-flags/southern-cross.jpg'),
};

type PremiumFlagBadgeProps = {
  flagId: PremiumFlagId;
  size?: number;
};

export function PremiumFlagBadge({ flagId, size = 48 }: PremiumFlagBadgeProps) {
  const flag = ALL_PREMIUM_FLAGS.find((item) => item.id === flagId) ?? ALL_PREMIUM_FLAGS[0];
  const border = PREMIUM_FLAG_BORDER_STYLES[flagId];
  const progress = useSharedValue(0);
  const width = size;
  const height = size * 0.625;
  const borderWidth = Math.max(0.75, size * 0.012);

  const motionStyle = useAnimatedStyle(() => {
    const breeze = Math.sin(progress.value * Math.PI * 2);
    return {
      transform: [
        { perspective: 900 },
        { rotateY: `${breeze * 2}deg` },
        { rotateZ: `${breeze * 0.35}deg` },
        { translateY: breeze * height * 0.012 },
      ],
    };
  }, [height]);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, {
        duration: 5_600,
        easing: Easing.inOut(Easing.sin),
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
        },
        motionStyle,
      ]}
    >
      {border.kind === 'rainbow' ? (
        <LinearGradient
          colors={border.colors}
          style={[styles.rainbowBorder, { padding: borderWidth }]}
        >
          <FlagArtwork artwork={FLAG_ARTWORK[flag.artwork]} resizeMode="stretch" />
        </LinearGradient>
      ) : (
        <FlagArtwork artwork={FLAG_ARTWORK[flag.artwork]} />
      )}
    </Animated.View>
  );
}

function FlagArtwork({
  artwork,
  resizeMode = 'contain',
}: {
  artwork: ImageSourcePropType;
  resizeMode?: ImageResizeMode;
}) {
  return <Animated.Image source={artwork} resizeMode={resizeMode} style={styles.flagArtwork} />;
}

const styles = StyleSheet.create({
  frame: {
    overflow: 'hidden',
    borderRadius: 8,
  },
  rainbowBorder: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: 6,
  },
  flagArtwork: {
    width: '100%',
    height: '100%',
    borderRadius: 6,
  },
});
