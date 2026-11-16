import React from 'react';
import { Text } from 'react-native';

export function Feather({ name }: { name: string }) {
  return <Text accessibilityElementsHidden>{name}</Text>;
}
