import AsyncStorage from '@react-native-async-storage/async-storage';

const INSTALLATION_ID_KEY = '@stocksense/installation_id';

let installationIdPromise: Promise<string> | null = null;

function createInstallationId(): string {
  const cryptoApi = globalThis.crypto as Crypto | undefined;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Returns a stable, anonymous identifier for this app installation.
 *
 * It is intentionally not tied to a person or account. It only lets the
 * notification service associate an alert with the phone that created it.
 */
export function getInstallationId(): Promise<string> {
  if (!installationIdPromise) {
    installationIdPromise = AsyncStorage.getItem(INSTALLATION_ID_KEY)
      .then(async (stored) => {
        if (stored) return stored;
        const created = createInstallationId();
        await AsyncStorage.setItem(INSTALLATION_ID_KEY, created);
        return created;
      })
      .catch((error) => {
        installationIdPromise = null;
        throw error;
      });
  }
  return installationIdPromise;
}