import React from 'react';
import { View } from 'react-native';

export function LinearGradient({ children, style }: React.PropsWithChildren<{ style?: object }>) {
  return <View style={style}>{children}</View>;
}
