import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

export function useReduceMotionPreference() {
  const [preference, setPreference] = useState({ reduceMotion: true, ready: false });

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (mounted) setPreference({ reduceMotion: value, ready: true });
      })
      .catch(() => {
        if (mounted) setPreference({ reduceMotion: false, ready: true });
      });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (value) => {
      setPreference({ reduceMotion: value, ready: true });
    });
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return preference;
}

/**
 * Start in the reduced-motion state until the native accessibility preference
 * is available. This prevents a loop from starting during the first frame on
 * a real device before AccessibilityInfo resolves.
 */
export function useReduceMotion() {
  return useReduceMotionPreference().reduceMotion;
}