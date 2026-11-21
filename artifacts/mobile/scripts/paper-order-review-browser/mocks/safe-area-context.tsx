import React, { type PropsWithChildren } from 'react';

export function SafeAreaProvider({ children }: PropsWithChildren) {
  return <>{children}</>;
}

export function useSafeAreaInsets() {
  return { top: 0, bottom: 0, left: 0, right: 0 };
}
