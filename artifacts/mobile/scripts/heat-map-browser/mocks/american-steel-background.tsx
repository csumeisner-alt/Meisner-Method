import React from "react";
import { View } from "react-native";

export function AmericanSteelBackground({ children }: React.PropsWithChildren) {
  return <View style={{ flex: 1, backgroundColor: "#10151C" }}>{children}</View>;
}