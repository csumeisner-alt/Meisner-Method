import React from 'react';
import { View } from 'react-native';

export function KeyboardAvoidingView({ children, ...props }: React.ComponentProps<typeof View>) {
  return <View {...props}>{children}</View>;
}
