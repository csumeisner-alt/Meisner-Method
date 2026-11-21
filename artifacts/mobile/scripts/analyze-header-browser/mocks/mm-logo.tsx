import React from 'react';
import { View } from 'react-native';

export function MMLogo({ size = 44 }: { size?: number }) {
  return <View testID="analyze-brand-logo" style={{ width: size, height: size }} />;
}
