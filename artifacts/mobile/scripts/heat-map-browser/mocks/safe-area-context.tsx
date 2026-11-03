import React from "react";
import { View } from "react-native";

export function useSafeAreaInsets() {
  return { top: 0, right: 0, bottom: 0, left: 0 };
}

export function SafeAreaProvider({ children }: React.PropsWithChildren) {
  return <View style={{ flex: 1 }}>{children}</View>;
}