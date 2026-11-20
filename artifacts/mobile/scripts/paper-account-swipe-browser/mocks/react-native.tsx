// @ts-nocheck -- The browser test bundle resolves React Native exports from react-native-web.
import React from 'react';
import * as ReactNativeWeb from 'react-native-web';

export * from 'react-native-web';

const testWindow = globalThis as typeof globalThis & { __paperFontScale?: number };

export function useWindowDimensions() {
  return {
    ...ReactNativeWeb.useWindowDimensions(),
    fontScale: testWindow.__paperFontScale ?? 1,
  };
}

export const Text = React.forwardRef<unknown, React.ComponentProps<typeof ReactNativeWeb.Text>>(
  (props, ref) => {
    const fontScale = testWindow.__paperFontScale ?? 1;
    const style = ReactNativeWeb.StyleSheet.flatten(props.style);
    const scaledStyle = props.allowFontScaling === false
      ? props.style
      : [props.style, { fontSize: (style?.fontSize ?? 14) * fontScale }];
    return React.createElement(ReactNativeWeb.Text, { ...props, ref, style: scaledStyle });
  },
);
