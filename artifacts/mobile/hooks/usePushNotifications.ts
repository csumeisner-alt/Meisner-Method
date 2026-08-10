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
import { AppState, Platform, Linking } from 'react-native';
import Constants from 'expo-constants';
import { useApi } from './useApi';
import { getInstallationId } from '@/lib/installation';

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
  const [registrationError, setRegistrationError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  const obtainToken = useCallback(async (Notifications: NotificationsModule): Promise<boolean> => {
    try {
      setRegistrationError(null);
      const projectId =
        Constants.expoConfig?.extra?.eas?.projectId ??
        Constants.easConfig?.projectId;
      if (!projectId) {
        throw new Error('This build is missing its Expo notification project configuration.');
      }
      const tokenData = await Notifications.getExpoPushTokenAsync(
        { projectId },
      );
      const expoPushToken = typeof tokenData.data === 'string' ? tokenData.data.trim() : '';
      if (!expoPushToken) {
        throw new Error('Android granted permission but did not return a push token.');
      }
      const installationId = await getInstallationId();
      if (cancelledRef.current) return true;
      const response = await apiFetch<{ ok?: boolean }>('/api/notifications/device', {
        method: 'POST',
        body: JSON.stringify({
          installationId,
          expoPushToken,
          platform: Platform.OS,
        }),
      });
      if (response?.ok !== true) {
        throw new Error('The notification service did not confirm this phone.');
      }
      if (!cancelledRef.current) {
        setPushToken(expoPushToken);
        setRegistrationError(null);
      }
      return true;
    } catch (error) {
      // Requires a real device + EAS build to get a production token
      if (!cancelledRef.current) {
        setRegistrationError(
          error instanceof Error && error.message
            ? error.message
            : 'Could not register this phone for price alerts.',
        );
      }
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
        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('price-alerts', {
            name: 'Price alerts',
            description: 'Notifications when a watched stock reaches your target price.',
            importance: Notifications.AndroidImportance.HIGH,
            sound: 'default',
            vibrationPattern: [0, 250, 150, 250],
            lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
          });
        }

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

  // Android users who previously denied permission are sent to system
  // settings. Re-check as soon as they return so the alert flow updates
  // without requiring a restart.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const subscription = AppState.addEventListener('change', async (nextState) => {
      if (nextState !== 'active' || cancelledRef.current) return;
      try {
        const Notifications = await getNativeNotifications();
        if (!Notifications) return;
        const permission = await Notifications.getPermissionsAsync();
        const granted: boolean = permission.granted ?? permission.status === 'granted';
        if (granted) {
          setStatus('granted');
          await obtainToken(Notifications);
        } else {
          setStatus(permission.canAskAgain === false ? 'denied' : 'unknown');
          setPushToken(null);
        }
      } catch {
        // Keep the existing state if the settings handoff was interrupted.
      }
    });
    return () => subscription.remove();
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
    registrationError,
    requestPermission,
    openNotificationSettings,
    // Back-compat convenience flags
    permissionDenied: status === 'denied',
    notAvailable: status === 'unavailable',
  };
}
