import React from 'react';
import { View } from 'react-native';

export default function ViewShot({ children, ...props }: React.ComponentProps<typeof View>) {
  return <View {...props}>{children}</View>;
}
