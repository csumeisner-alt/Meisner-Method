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

export const Easing = {
  cubic: (value: number) => value,
  out: (easing: (value: number) => number) => easing,
};