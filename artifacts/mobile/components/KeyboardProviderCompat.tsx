import Constants from 'expo-constants';
import { Platform } from 'react-native';
import React from 'react';

// react-native-keyboard-controller ships a native module that is NOT bundled in
// Expo Go (and does not exist on web). Mounting its <KeyboardProvider> there
// crashes the app on launch (blank/splash screen forever). We skip it on web and
// in Expo Go — the module is only `require`d on the native path, so those
// environments never touch it. Full keyboard handling works in dev-client and
// standalone (APK/AAB) builds.
const SKIP_NATIVE_KEYBOARD =
  Platform.OS === 'web' || Constants.appOwnership === 'expo';

export function KeyboardProviderCompat({
  children,
}: {
  children: React.ReactNode;
}) {
  if (SKIP_NATIVE_KEYBOARD) {
    return <>{children}</>;
  }
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { KeyboardProvider } = require('react-native-keyboard-controller');
  return <KeyboardProvider>{children}</KeyboardProvider>;
}
