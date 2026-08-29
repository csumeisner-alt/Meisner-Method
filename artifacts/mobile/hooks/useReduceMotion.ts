import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Start in the reduced-motion state until the native accessibility preference
 * is available. This prevents a loop from starting during the first frame on
 * a real device before AccessibilityInfo resolves.
 */
export function useReduceMotion() {
  const [reduceMotion, setReduceMotion] = useState(true);

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then(value => {
        if (mounted) setReduceMotion(value);
      })
      .catch(() => {
        if (mounted) setReduceMotion(false);
      });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return reduceMotion;
}