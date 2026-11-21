import React, { useEffect } from 'react';
import { Image, type ImageSourcePropType, StyleSheet, View } from 'react-native';
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
import { useColors } from '@/hooks/useColors';

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
  const colors = useColors();
  const progress = useSharedValue(0);
  const width = size;
  const height = size * 0.625;

  const motionStyle = useAnimatedStyle(() => {
    const breeze = Math.sin(progress.value * Math.PI * 2);
    return {
      transform: [
        { perspective: 900 },
        { scale: 1.045 },
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
          borderColor: colors.gold,
          backgroundColor: colors.steelShadow,
          shadowColor: colors.gold,
        },
      ]}
    >
      <View style={styles.flagSurface}>
        <Animated.Image
          source={FLAG_ARTWORK[flag.artwork]}
          resizeMode="contain"
          style={[styles.flagArtwork, motionStyle]}
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  frame: {
    padding: 0,
    overflow: 'hidden',
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  flagArtwork: {
    width: '92%',
    height: '88%',
  },
});
