import { useCallback, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  ScrollView,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

const retainedOffsets = new Map<string, number>();

export function useRetainedTabScroll(key: string, active = true) {
  const scrollRef = useRef<ScrollView | null>(null);
  const offsetRef = useRef(retainedOffsets.get(key) ?? 0);
  const focusedRef = useRef(false);

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!focusedRef.current) return;
    const offset = Math.max(0, event.nativeEvent.contentOffset.y);
    offsetRef.current = offset;
    retainedOffsets.set(key, offset);
  }, [key]);

  useFocusEffect(useCallback(() => {
    if (!active) {
      focusedRef.current = false;
      return undefined;
    }

    focusedRef.current = true;
    const restore = () => {
      scrollRef.current?.scrollTo({ y: offsetRef.current, animated: false });
    };
    const frame = requestAnimationFrame(restore);
    const timeout = setTimeout(restore, 200);
    return () => {
      focusedRef.current = false;
      cancelAnimationFrame(frame);
      clearTimeout(timeout);
    };
  }, [active]));

  return { ref: scrollRef, onScroll, scrollEventThrottle: 16 };
}
