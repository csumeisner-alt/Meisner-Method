import React from "react";

export function useRouter() {
  return {
    canGoBack: () => false,
    back: () => undefined,
    replace: () => undefined,
  };
}

export function useFocusEffect(effect: () => void | (() => void)) {
  React.useEffect(effect, [effect]);
}