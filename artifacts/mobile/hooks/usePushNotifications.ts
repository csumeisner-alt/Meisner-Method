/**
 * Push notification permission + token management.
 *
 * On launch this hook only checks the existing permission SILENTLY — it never
 * shows the system pop-up. If permission is already granted it registers the
 * Expo push token. The native permission dialog is only triggered explicitly
 * via `requestPermission()`, called from the alert flow so the user sees the
 * prompt in context (right when they set a price alert).
 *
 * On web (or in Expo Go where remote push is unsupported) the hook no-ops.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { Platform, Linking } from 'react-native';
import { useApi } from './useApi';

export type PushPermissionStatus =
  | 'unknown'     // not yet determined — we may show the system pop-up
  | 'granted'     // permission granted (token may still be pending)
  | 'denied'      // user denied and the OS won't re-show the pop-up
  | 'unavailable'; // web / simulator / no push support

// Lazily import expo-notifications only on native to avoid web crashes
async function getNativeNotifications() {
  if (Platform.OS === 'web') return null;
  return import('expo-notifications');
}

type NotificationsModule = NonNullable<Awaited<ReturnType<typeof getNativeNotifications>>>;

export function usePushNotifications() {
  const { apiFetch } = useApi();
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [status, setStatus] = useState<PushPermissionStatus>(
    Platform.OS === 'web' ? 'unavailable' : 'unknown',
  );
  const cancelledRef = useRef(false);

  const obtainToken = useCallback(async (Notifications: NotificationsModule): Promise<boolean> => {
    try {
      const tokenData = await Notifications.getExpoPushTokenAsync();
      if (cancelledRef.current) return true;
      setPushToken(tokenData.data);
      // Register with server (non-critical)
      apiFetch('/api/user/push-token', {
        method: 'POST',
        body: JSON.stringify({ token: tokenData.data }),
      }).catch(() => {});
      return true;
    } catch {
      // Requires a real device + EAS build to get a production token
      if (!cancelledRef.current) setStatus('unavailable');
      return false;
    }
  }, [apiFetch]);

  // Silent launch check — NEVER prompts.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    cancelledRef.current = false;

    (async () => {
      try {
        const Notifications = await getNativeNotifications();
        if (!Notifications) { setStatus('unavailable'); return; }

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

        const perm = await Notifications.getPermissionsAsync();
        if (cancelledRef.current) return;
        const granted: boolean = perm.granted ?? perm.status === 'granted';
        if (granted) {
          setStatus('granted');
          await obtainToken(Notifications);
        } else if (perm.canAskAgain === false) {
          // Previously denied — OS won't re-show the dialog.
          setStatus('denied');
        } else {
          setStatus('unknown'); // we can still ask, in context
        }
      } catch {
        if (!cancelledRef.current) setStatus('unavailable');
      }
    })();

    return () => { cancelledRef.current = true; };
  }, [obtainToken]);

  /**
   * Shows the native permission pop-up (Android 13+ POST_NOTIFICATIONS / iOS
   * alert). Call from a user action — e.g. tapping "Enable notifications" in
   * the price-alert modal. Resolves true when permission is granted AND a
   * push token was obtained.
   */
  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (Platform.OS === 'web') return false;
    try {
      const Notifications = await getNativeNotifications();
      if (!Notifications) { setStatus('unavailable'); return false; }
      const perm = await Notifications.requestPermissionsAsync();
      const granted: boolean = perm.granted ?? perm.status === 'granted';
      if (!granted) {
        setStatus(perm.canAskAgain === false ? 'denied' : 'unknown');
        return false;
      }
      setStatus('granted');
      return obtainToken(Notifications);
    } catch {
      setStatus('unavailable');
      return false;
    }
  }, [obtainToken]);

  /** Deep-link to the app's notification settings (for the denied state). */
  const openNotificationSettings = useCallback(() => {
    Linking.openSettings().catch(() => {});
  }, []);

  return {
    pushToken,
    status,
    requestPermission,
    openNotificationSettings,
    // Back-compat convenience flags
    permissionDenied: status === 'denied',
    notAvailable: status === 'unavailable',
  };
}
