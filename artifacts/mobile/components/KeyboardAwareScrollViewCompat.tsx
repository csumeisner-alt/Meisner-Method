import Constants from 'expo-constants';
import { Platform, ScrollView, ScrollViewProps } from 'react-native';
import type { KeyboardAwareScrollViewProps } from 'react-native-keyboard-controller';

type Props = KeyboardAwareScrollViewProps & ScrollViewProps;

// react-native-keyboard-controller's native module is missing on web and in
// Expo Go. Fall back to a plain ScrollView there; use the real keyboard-aware
// view only in native (dev-client / standalone) builds. The `import type` above
// is erased at build time, so Expo Go never loads the native module.
const USE_PLAIN_SCROLL =
  Platform.OS === 'web' || Constants.appOwnership === 'expo';

export function KeyboardAwareScrollViewCompat({
  children,
  keyboardShouldPersistTaps = 'handled',
  ...props
}: Props) {
  if (USE_PLAIN_SCROLL) {
    return (
      <ScrollView
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        {...props}
      >
        {children}
      </ScrollView>
    );
  }
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { KeyboardAwareScrollView } = require('react-native-keyboard-controller');
  return (
    <KeyboardAwareScrollView
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      {...props}
    >
      {children}
    </KeyboardAwareScrollView>
  );
}
