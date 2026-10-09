import { useRef } from "react";
import { View } from "react-native";

export default { View };

export function useReducedMotion() {
  return true;
}

export function useSharedValue(value: number) {
  return useRef({ value }).current;
}

export function useAnimatedStyle(getStyle: () => object) {
  return getStyle();
}

export function cancelAnimation() {}

export function withDelay(_delayMs: number, animation: number) {
  return animation;
}

export function withTiming(value: number) {
  return value;
}

export function withSequence(...animations: number[]) {
  return animations.length ? animations[animations.length - 1] : 0;
}

export function withRepeat(animation: number, _repetitions: number, _reverse?: boolean) {
  return animation;
}

export const Easing = {
  cubic: (value: number) => value,
  out: (easing: (value: number) => number) => easing,
  inOut: (easing: (value: number) => number) => easing,
};