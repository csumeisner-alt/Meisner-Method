import { getInstallationId } from './installation.ts';

const API_BASE_URL = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

/** Register this phone's current Expo token when Event Arena reminders are enabled. */
export async function registerEventArenaPushDevice(platform: 'ios' | 'android'): Promise<boolean> {
  const [Notifications, constantsModule] = await Promise.all([
    import('expo-notifications'),
    import('expo-constants'),
  ]);
  const projectId = constantsModule.default.expoConfig?.extra?.eas?.projectId
    ?? constantsModule.default.easConfig?.projectId;
  if (!projectId) return false;

  const tokenResult = await Notifications.getExpoPushTokenAsync({ projectId });
  const expoPushToken = typeof tokenResult.data === 'string' ? tokenResult.data.trim() : '';
  if (!expoPushToken) return false;
  const installationId = await getInstallationId();
  const response = await fetch(`${API_BASE_URL}/api/notifications/device`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      installationId,
      expoPushToken,
      platform,
    }),
  });
  if (!response.ok) throw new Error('This phone could not be registered for push reminders.');
  return true;
}
