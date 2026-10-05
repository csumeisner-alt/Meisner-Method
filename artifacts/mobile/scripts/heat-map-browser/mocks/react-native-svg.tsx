import React from "react";
import { View } from "react-native";

export default function Svg({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) {
  return <View {...props}>{children}</View>;
}

export function Polygon() {
  return null;
}