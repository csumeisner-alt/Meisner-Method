import React from "react";

let focused = true;
const focusListeners = new Set<() => void>();

declare global {
  interface Window {
    __heatMapSetFocused?: (nextFocused: boolean) => void;
    __heatMapRoutePushes?: string[];
  }
}

if (typeof window !== "undefined") {
  window.__heatMapRoutePushes ??= [];
  window.__heatMapSetFocused = (nextFocused) => {
    if (focused === nextFocused) return;
    focused = nextFocused;
    focusListeners.forEach((listener) => listener());
  };
}

export function useRouter() {
  return {
    canGoBack: () => false,
    back: () => undefined,
    replace: () => undefined,
    push: (path: string) => window.__heatMapRoutePushes?.push(path),
  };
}

export function useFocusEffect(effect: () => void | (() => void)) {
  const isFocused = React.useSyncExternalStore(
    (listener) => {
      focusListeners.add(listener);
      return () => focusListeners.delete(listener);
    },
    () => focused,
    () => focused,
  );
  React.useEffect(() => {
    if (!isFocused) return;
    return effect();
  }, [effect, isFocused]);
}
