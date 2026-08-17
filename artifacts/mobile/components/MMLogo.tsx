import React, { useEffect, useRef } from 'react';
import { Animated, Image, Platform, View, StyleSheet } from 'react-native';

interface MMLogoProps {
  size?: number;
}

const APP_ICON = require('../assets/images/icon.png');

export function MMLogo({ size = 60 }: MMLogoProps) {
  const width = size;
  const totalHeight = size;
  const corner = size * 0.18;
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
      <Image
        source={APP_ICON}
        style={[styles.logoImage, { width, height: totalHeight, borderRadius: corner }]}
        resizeMode="cover"
        accessible
        accessibilityLabel="Meisner Method"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  logoImage: {
    shadowColor: '#F5C64E',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 5,
    elevation: 4,
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
