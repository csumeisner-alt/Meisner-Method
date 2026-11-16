import React from 'react';
import { View } from 'react-native';

const ViewShot = React.forwardRef<View, React.ComponentProps<typeof View>>(
  (props, ref) => <View {...props} ref={ref} />,
);

export default ViewShot;
