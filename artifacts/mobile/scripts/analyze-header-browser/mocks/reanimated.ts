import { useRef } from 'react';
import { Image, View } from 'react-native';

const Animated = { View, Image };
export default Animated;

export const Easing = {
  sin: (value: number) => value,
  inOut: (easing: (value: number) => number) => easing,
};
export const ReduceMotion = { Never: 0 };
export function cancelAnimation() {}
export function useAnimatedStyle(getStyle: () => object) { return getStyle(); }
export function useSharedValue(value: number) { return useRef({ value }).current; }
export function withRepeat(animation: number) { return animation; }
export function withTiming(value: number) { return value; }
