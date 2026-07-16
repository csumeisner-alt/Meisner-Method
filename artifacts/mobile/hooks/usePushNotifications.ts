/**
 * Registers the device for Expo push notifications and posts the token to the
 * API server. On web or when permissions are denied the hook no-ops gracefully.
 */
import { useState, useEffect } from 'react';
import { Platform } from 'react-native';
import { useApi } from './useApi';

// Lazily import expo-notifications only on native to avoid web crashes
async function getNativeNotifications() {
  if (Platform.OS === 'web') return null;
  return import('expo-notifications');
}

export function usePushNotifications() {
  const { apiFetch } = useApi();
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [notAvailable, setNotAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'web') { setNotAvailable(true); return; }

    let cancelled = false;
    (async () => {
      try {
        const Notifications = await getNativeNotifications();
        if (!Notifications) { setNotAvailable(true); return; }

        // Configure foreground notification handling
        Notifications.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowAlert: true,
            shouldPlaySound: true,
            shouldSetBadge: false,
            shouldShowBanner: true,
            shouldShowList: true,
          }),
        });

        // Request permission (cast because pnpm type resolution flattens PermissionResponse)
        const existingPerm = (await Notifications.getPermissionsAsync()) as any;
        let permGranted: boolean = existingPerm.granted ?? existingPerm.status === 'granted';
        if (!permGranted) {
          const newPerm = (await Notifications.requestPermissionsAsync()) as any;
          permGranted = newPerm.granted ?? newPerm.status === 'granted';
        }
        if (!permGranted) {
          if (!cancelled) setPermissionDenied(true);
          return;
        }

        // Get Expo push token
        let tokenData: { data: string };
        try {
          tokenData = await Notifications.getExpoPushTokenAsync();
        } catch {
          // Requires a real device + EAS build to get a production token
          if (!cancelled) setNotAvailable(true);
          return;
        }

        const token = tokenData.data;
        if (!cancelled) setPushToken(token);

        // Register with server (non-critical)
        apiFetch('/api/user/push-token', {
          method: 'POST',
          body: JSON.stringify({ token }),
        }).catch(() => {});
      } catch {
        if (!cancelled) setNotAvailable(true);
      }
    })();

    return () => { cancelled = true; };
  }, [apiFetch]);

  return { pushToken, permissionDenied, notAvailable };
}
