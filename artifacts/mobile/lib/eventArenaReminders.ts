import { createContext, createElement, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { AppState, Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  getGetEventArenaReminderPreferenceQueryOptions,
  setEventArenaReminderPreference,
} from '@workspace/api-client-react';
import { getInstallationId } from './installation.ts';
import { getPaperChallengeReminders } from './paperChallenge.ts';
import {
  replaceEventArenaReminderSchedule,
  type ExistingEventArenaReminder,
} from './eventArenaReminderSchedule.ts';
import { registerEventArenaPushDevice } from './eventArenaPushRegistration.ts';

const PREFERENCE_KEY = '@stocksense/paper_events_notifications_v1';
const SCHEDULED_IDS_KEY = '@stocksense/paper_events_notification_id_v1';
const EVENT_ARENA_REMINDER_TYPES = new Set([
  'event-start',
  'event-midweek',
  'event-trade-reminder',
  'lightning-round-start',
]);

export type EventArenaPermissionStatus =
  | 'checking'
  | 'granted'
  | 'not-granted'
  | 'settings-required'
  | 'unavailable';

type RetryMode = 'refresh' | 'enable' | 'disable' | 'cleanup' | null;

export type EventArenaReminderState = {
  loaded: boolean;
  enabled: boolean;
  busy: boolean;
  permission: EventArenaPermissionStatus;
  permissionCanAskAgain: boolean;
  scheduledCount: number | null;
  error: string;
  preferenceError: string;
  retryMode: RetryMode;
  remotePushStatus: 'unchecked' | 'ready' | 'unavailable' | 'error';
  pushNotice: string;
};

type EventArenaReminderContextValue = EventArenaReminderState & {
  setEnabled: typeof setEventArenaRemindersEnabled;
  requestPermission: typeof requestEventArenaNotificationPermission;
  openSettings: typeof openEventArenaNotificationSettings;
  retry: () => Promise<void>;
};

const initialState: EventArenaReminderState = {
  loaded: false,
  enabled: false,
  busy: false,
  permission: Platform.OS === 'web' ? 'unavailable' : 'checking',
  permissionCanAskAgain: true,
  scheduledCount: null,
  error: '',
  preferenceError: '',
  retryMode: null,
  remotePushStatus: 'unchecked',
  pushNotice: '',
};

let state = initialState;
let initializationPromise: Promise<void> | null = null;
let refreshPromise: Promise<void> | null = null;
let mutationPromise: Promise<void> | null = null;
let permissionRequestPromise: Promise<void> | null = null;
let mutationRevision = 0;
const listeners = new Set<() => void>();
const EventArenaReminderContext = createContext<EventArenaReminderContextValue | null>(null);

function publish(update: Partial<EventArenaReminderState>) {
  state = { ...state, ...update };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return state;
}

function errorText(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message.trim()
    : String(error || 'Unknown error');
}

async function getSavedIds(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(SCHEDULED_IDS_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [raw];
  } catch {
    return [raw];
  }
}

async function getInstallationHeaders(): Promise<Record<string, string>> {
  return {
    'X-Event-Arena-Installation-Id': await getInstallationId(),
  };
}

async function withPreferenceTimeout<T>(
  request: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 12_000);
  try {
    return await request(controller.signal);
  } catch (error) {
    if (timedOut) throw new Error('The reminder settings server did not respond within 12 seconds.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function getServerPreference(queryClient: QueryClient): Promise<{ enabled: boolean; configured: boolean }> {
  const installationId = await getInstallationId();
  const options = getGetEventArenaReminderPreferenceQueryOptions({
    query: {
      queryKey: ['/api/event-arena/reminder-preference', installationId],
      staleTime: 0,
      retry: 1,
    },
    request: {
      headers: { 'X-Event-Arena-Installation-Id': installationId },
    },
  });
  const generatedQuery = options.queryFn;
  if (typeof generatedQuery !== 'function') {
    throw new Error('The saved reminder preference query is not configured.');
  }
  return queryClient.fetchQuery({
    ...options,
    queryFn: (context) => withPreferenceTimeout((signal) =>
      Promise.resolve(generatedQuery({ ...context, signal })),
    ),
  });
}

async function syncServerPreference(enabled: boolean): Promise<void> {
  const payload = await withPreferenceTimeout(async (signal) =>
    setEventArenaReminderPreference(
      { enabled },
      {
        signal,
        headers: await getInstallationHeaders(),
      },
    ),
  );
  if (payload.enabled !== enabled) {
    throw new Error('The server did not confirm the saved reminder preference.');
  }
}

function getPermissionFields(permission: {
  granted: boolean;
  canAskAgain: boolean;
}): Pick<EventArenaReminderState, 'permission' | 'permissionCanAskAgain'> {
  return {
    permission: permission.granted
      ? 'granted'
      : permission.canAskAgain ? 'not-granted' : 'settings-required',
    permissionCanAskAgain: permission.canAskAgain,
  };
}

async function readNotificationPermission(request = false) {
  if (Platform.OS === 'web') {
    publish({ permission: 'unavailable' });
    return { granted: false, canAskAgain: false };
  }
  const Notifications = await import('expo-notifications');
  let permission = await Notifications.getPermissionsAsync();
  if (request && !permission.granted && permission.canAskAgain) {
    permission = await Notifications.requestPermissionsAsync();
  }
  publish(getPermissionFields(permission));
  return permission;
}

type ScheduledNotificationShape = {
  identifier: string;
  content?: {
    data?: Record<string, unknown> | null;
  };
};

function eventArenaNotifications(
  notifications: ScheduledNotificationShape[],
): ExistingEventArenaReminder[] {
  return notifications.flatMap((notification) => {
    const data = notification.content?.data;
    if (
      typeof notification.identifier !== 'string'
      || !data
      || typeof data.type !== 'string'
      || !EVENT_ARENA_REMINDER_TYPES.has(data.type)
      || typeof data.eventId !== 'string'
      || typeof data.scheduledAtMs !== 'number'
      || !Number.isFinite(data.scheduledAtMs)
    ) return [];
    return [{
      id: notification.identifier,
      eventId: data.eventId,
      kind: data.type,
      scheduledAtMs: data.scheduledAtMs,
      title: '',
      body: '',
    }];
  });
}

function eventArenaNotificationIds(notifications: ScheduledNotificationShape[]): string[] {
  return notifications.flatMap((notification) => {
    const type = notification.content?.data?.type;
    return typeof notification.identifier === 'string'
      && typeof type === 'string'
      && EVENT_ARENA_REMINDER_TYPES.has(type)
      ? [notification.identifier]
      : [];
  });
}

async function scheduledReminderCount(): Promise<number> {
  if (Platform.OS === 'web') return 0;
  const Notifications = await import('expo-notifications');
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  return eventArenaNotificationIds(scheduled as ScheduledNotificationShape[]).length;
}

async function replaceLocalSchedule(): Promise<{ count: number; cleanupFailures: number }> {
  const Notifications = await import('expo-notifications');
  if (Platform.OS === 'android') {
    try {
      await Notifications.setNotificationChannelAsync('paper-event-reminders', {
        name: 'Paper event reminders',
        description: 'Reminders when a new paper event starts.',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    } catch (error) {
      throw new Error(`Could not prepare the Android reminder channel: ${errorText(error)}`);
    }
  }

  const [scheduled, legacyIds] = await Promise.all([
    Notifications.getAllScheduledNotificationsAsync(),
    getSavedIds(),
  ]);
  const currentIds = new Set(
    (scheduled as ScheduledNotificationShape[]).map((notification) => notification.identifier),
  );
  const result = await replaceEventArenaReminderSchedule({
    existing: eventArenaNotifications(scheduled as ScheduledNotificationShape[]),
    legacyIds: [
      ...legacyIds.filter((id) => currentIds.has(id)),
      ...eventArenaNotificationIds(scheduled as ScheduledNotificationShape[]),
    ],
    desired: getPaperChallengeReminders(),
    schedule: async (reminder) => Notifications.scheduleNotificationAsync({
      content: {
        title: reminder.title,
        body: reminder.body,
        data: {
          type: reminder.kind,
          eventId: reminder.eventId,
          scheduledAtMs: reminder.scheduledAtMs,
        },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(reminder.scheduledAtMs),
        ...(Platform.OS === 'android' ? { channelId: 'paper-event-reminders' } : {}),
      },
    }),
    persistIds: (ids) => AsyncStorage.setItem(SCHEDULED_IDS_KEY, JSON.stringify(ids)),
    cancel: (id) => Notifications.cancelScheduledNotificationAsync(id),
  });
  const count = await scheduledReminderCount().catch(() => result.ids.length);
  return { count, cleanupFailures: result.cleanupFailures };
}

async function cancelLocalSchedule(): Promise<{ count: number; failures: number }> {
  if (Platform.OS === 'web') return { count: 0, failures: 0 };
  const Notifications = await import('expo-notifications');
  const [scheduled, savedIds] = await Promise.all([
    Notifications.getAllScheduledNotificationsAsync(),
    getSavedIds(),
  ]);
  const currentIds = new Set(
    (scheduled as ScheduledNotificationShape[]).map((notification) => notification.identifier),
  );
  const ids = new Set([
    ...savedIds.filter((id) => currentIds.has(id)),
    ...eventArenaNotificationIds(scheduled as ScheduledNotificationShape[]),
  ]);
  const results = await Promise.all([...ids].map((id) =>
    Notifications.cancelScheduledNotificationAsync(id).then(() => true, () => false),
  ));
  const remaining = await scheduledReminderCount().catch(() => 0);
  await AsyncStorage.setItem(SCHEDULED_IDS_KEY, JSON.stringify([]));
  return {
    count: remaining,
    failures: results.filter((success) => !success).length,
  };
}

async function refreshInternal(): Promise<void> {
  if (Platform.OS === 'web') {
    publish({ permission: 'unavailable', scheduledCount: 0, error: '' });
    return;
  }
  const generation = mutationRevision;
  publish({ error: '', retryMode: null });
  try {
    const permission = await readNotificationPermission();
    if (generation !== mutationRevision) return;
    const currentCount = await scheduledReminderCount();
    if (generation !== mutationRevision) return;
    if (!state.enabled) {
      const cancellation = await cancelLocalSchedule();
      publish({
        scheduledCount: cancellation.count,
        error: cancellation.failures > 0
          ? `Preference is off, but ${cancellation.failures} on-device reminder(s) could not be cancelled. Retry to clean up.`
          : '',
        retryMode: cancellation.failures > 0 ? 'cleanup' : null,
      });
      return;
    }
    if (!permission.granted) {
      publish({ scheduledCount: currentCount });
      return;
    }

    try {
      const registered = await registerEventArenaPushDevice(
        Platform.OS === 'ios' ? 'ios' : 'android',
      );
      publish({
        remotePushStatus: registered ? 'ready' : 'unavailable',
        pushNotice: registered
          ? ''
          : 'Remote push is unavailable in this build; scheduled on-device reminders remain separate.',
      });
    } catch (error) {
      publish({
        remotePushStatus: 'error',
        pushNotice: `Remote push could not be refreshed: ${errorText(error)} On-device reminders are handled separately.`,
      });
    }
    const result = await replaceLocalSchedule();
    if (generation !== mutationRevision) return;
    publish({
      scheduledCount: result.count,
      ...(result.cleanupFailures > 0
        ? {
            error: `Scheduled ${result.count} reminders, but could not remove ${result.cleanupFailures} outdated reminder(s). Retry to clean up.`,
            retryMode: 'refresh' as const,
          }
        : {}),
    });
  } catch (error) {
    if (generation !== mutationRevision) return;
    publish({
      error: `Could not refresh Event Arena reminders: ${errorText(error)}`,
      retryMode: 'refresh',
    });
  }
}

export async function refreshEventArenaReminders(): Promise<void> {
  if (!state.loaded) return;
  if (refreshPromise) return refreshPromise;
  if (state.busy) return;
  refreshPromise = refreshInternal().finally(() => { refreshPromise = null; });
  return refreshPromise;
}

async function initialize(queryClient: QueryClient): Promise<void> {
  if (initializationPromise) return initializationPromise;
  initializationPromise = (async () => {
    let localPreference: string | null = null;
    try {
      localPreference = await AsyncStorage.getItem(PREFERENCE_KEY);
      publish({
        enabled: localPreference === 'true',
        loaded: false,
        error: '',
        preferenceError: '',
        retryMode: null,
      });
      if (Platform.OS === 'web') {
        publish({ permission: 'unavailable', scheduledCount: 0 });
        return;
      }
      const permission = await readNotificationPermission();
      const granted = permission.granted;
      const count = await scheduledReminderCount();
      publish({ scheduledCount: count });

      const initialRevision = mutationRevision;
      try {
        const remote = await getServerPreference(queryClient);
        if (initialRevision !== mutationRevision) return;
        publish({ preferenceError: '' });
        if (remote.configured) {
          if (localPreference !== String(remote.enabled)) {
            await AsyncStorage.setItem(PREFERENCE_KEY, String(remote.enabled));
          }
          publish({ enabled: remote.enabled });
        } else if (localPreference !== null) {
          await syncServerPreference(localPreference === 'true');
        }
      } catch (error) {
        if (initialRevision === mutationRevision) {
          publish({
            preferenceError: `Could not check the saved Event Arena preference: ${errorText(error)} Using this phone’s saved choice.`,
          });
        }
      }

      if (!state.enabled) {
        try {
          const cancellation = await cancelLocalSchedule();
          publish({
            scheduledCount: cancellation.count,
            error: cancellation.failures > 0
              ? `Preference is off, but ${cancellation.failures} on-device reminder(s) could not be cancelled. Retry to clean up.`
              : '',
            retryMode: cancellation.failures > 0 ? 'cleanup' : null,
          });
        } catch (error) {
          publish({
            error: `Could not clean up disabled Event Arena reminders: ${errorText(error)}`,
            retryMode: 'cleanup',
          });
        }
      }

      publish({ loaded: true });
      if (state.enabled && granted) await refreshEventArenaReminders();
    } catch (error) {
      publish({
        loaded: true,
        error: `Could not load Event Arena reminder settings: ${errorText(error)}`,
        retryMode: 'refresh',
      });
    }
  })().finally(() => {
    publish({ loaded: true });
    initializationPromise = null;
  });
  return initializationPromise;
}

export async function setEventArenaRemindersEnabled(enabled: boolean): Promise<void> {
  if (!state.loaded || state.preferenceError || mutationPromise || state.busy) return;
  if (refreshPromise) await refreshPromise;
  if (mutationPromise || state.busy || state.enabled === enabled) return;
  mutationRevision += 1;
  const revision = mutationRevision;
  publish({ busy: true, error: '', retryMode: enabled ? 'enable' : 'disable' });
  mutationPromise = (async () => {
    try {
      if (enabled) {
        const permission = await readNotificationPermission(true);
        if (!permission.granted) {
          publish({
            error: !permission.canAskAgain
              ? 'Notifications are blocked. Open device settings to allow Event Arena reminders.'
              : 'Allow notifications on this phone to enable Event Arena reminders.',
            retryMode: 'enable',
          });
          return;
        }

        try {
          const registered = await registerEventArenaPushDevice(
            Platform.OS === 'ios' ? 'ios' : 'android',
          );
          publish({
            remotePushStatus: registered ? 'ready' : 'unavailable',
            pushNotice: registered
              ? ''
              : 'Remote push is unavailable in this build; on-device reminders can still be scheduled.',
          });
        } catch (error) {
          publish({
            remotePushStatus: 'error',
            pushNotice: `Remote push registration failed: ${errorText(error)} On-device reminders are handled separately.`,
          });
        }

        const schedule = await replaceLocalSchedule();
        await syncServerPreference(true);
        try {
          await AsyncStorage.setItem(PREFERENCE_KEY, 'true');
        } catch (error) {
          await syncServerPreference(false).catch(() => {});
          await cancelLocalSchedule().catch(() => {});
          throw new Error(`The reminder preference could not be saved on this phone: ${errorText(error)}`);
        }
        if (revision !== mutationRevision) return;
        publish({
          enabled: true,
          scheduledCount: schedule.count,
          preferenceError: '',
          error: schedule.cleanupFailures > 0
            ? `Enabled and scheduled ${schedule.count} reminders, but ${schedule.cleanupFailures} outdated reminder(s) could not be removed.`
            : '',
          retryMode: schedule.cleanupFailures > 0 ? 'refresh' : null,
        });
      } else {
        await syncServerPreference(false);
        try {
          await AsyncStorage.setItem(PREFERENCE_KEY, 'false');
        } catch (error) {
          await syncServerPreference(true).catch(() => {});
          throw new Error(`The reminder preference could not be saved on this phone: ${errorText(error)}`);
        }
        if (revision !== mutationRevision) return;
        publish({ enabled: false, preferenceError: '' });
        const cancellation = await cancelLocalSchedule();
        publish({
          scheduledCount: cancellation.count,
          error: cancellation.failures > 0
            ? `Preference is off, but ${cancellation.failures} on-device reminder(s) could not be cancelled. Retry to clean up.`
            : '',
          retryMode: cancellation.failures > 0 ? 'cleanup' : null,
        });
      }
    } catch (error) {
      if (revision === mutationRevision) {
        if (enabled) {
          await syncServerPreference(false).catch(() => {});
          await AsyncStorage.setItem(PREFERENCE_KEY, 'false').catch(() => {});
          await cancelLocalSchedule().catch(() => {});
        } else if (state.enabled) {
          await syncServerPreference(true).catch(() => {});
        }
        publish({
          error: `Could not ${enabled ? 'enable' : 'disable'} Event Arena reminders: ${errorText(error)}`,
          retryMode: !enabled && !state.enabled ? 'cleanup' : enabled ? 'enable' : 'disable',
        });
      }
    } finally {
      publish({ busy: false });
      mutationPromise = null;
    }
  })();
  return mutationPromise;
}

export async function runEventArenaReminderRetry(queryClient: QueryClient): Promise<void> {
  if (state.busy) return;
  if (state.preferenceError) {
    return initialize(queryClient);
  }
  if (state.retryMode === 'enable') return setEventArenaRemindersEnabled(true);
  if (state.retryMode === 'disable') return setEventArenaRemindersEnabled(false);
  if (state.retryMode === 'cleanup') {
    if (mutationPromise) return mutationPromise;
    mutationPromise = (async () => {
      publish({ busy: true });
      try {
        const result = await cancelLocalSchedule();
        publish({
          scheduledCount: result.count,
          error: result.failures > 0
            ? `Preference is off, but ${result.failures} on-device reminder(s) could not be cancelled. Retry to clean up.`
            : '',
          retryMode: result.failures > 0 ? 'cleanup' : null,
        });
      } catch (error) {
        publish({
          error: `Could not cancel on-device reminders: ${errorText(error)}`,
          retryMode: 'cleanup',
        });
      } finally {
        publish({ busy: false });
        mutationPromise = null;
      }
    })();
    return mutationPromise;
  }
  return refreshEventArenaReminders();
}

export async function requestEventArenaNotificationPermission(): Promise<void> {
  if (Platform.OS === 'web') return;
  if (state.busy) return;
  if (refreshPromise) await refreshPromise;
  if (state.busy) return;
  if (permissionRequestPromise) return permissionRequestPromise;
  if (state.permission === 'settings-required') {
    await openEventArenaNotificationSettings();
    return;
  }
  permissionRequestPromise = (async () => {
    publish({ busy: true });
    try {
      const permission = await readNotificationPermission(true);
      if (permission.granted && state.enabled) await refreshInternal();
      else if (!permission.granted) {
        publish({
          error: !permission.canAskAgain
            ? 'Notifications remain blocked. Open device settings to allow Event Arena reminders.'
            : 'Notification permission was not granted. You can try again or open device settings.',
        });
      } else {
        publish({ error: '' });
      }
    } catch (error) {
      publish({ error: `Could not check notification permission: ${errorText(error)}` });
    } finally {
      publish({ busy: false });
      permissionRequestPromise = null;
    }
  })();
  return permissionRequestPromise;
}

export async function openEventArenaNotificationSettings(): Promise<void> {
  try {
    await Linking.openSettings();
  } catch (error) {
    publish({ error: `Could not open device settings: ${errorText(error)}` });
  }
}

function useEventArenaReminderController(): EventArenaReminderContextValue {
  const queryClient = useQueryClient();
  const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  useEffect(() => {
    void initialize(queryClient);
    const appState = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') void refreshEventArenaReminders();
    });
    return () => appState.remove();
  }, [queryClient]);
  return {
    ...current,
    setEnabled: setEventArenaRemindersEnabled,
    requestPermission: requestEventArenaNotificationPermission,
    openSettings: openEventArenaNotificationSettings,
    retry: () => runEventArenaReminderRetry(queryClient),
  };
}

export function EventArenaRemindersProvider({ children }: { children: ReactNode }) {
  const value = useEventArenaReminderController();
  return createElement(EventArenaReminderContext.Provider, { value }, children);
}

export function useEventArenaReminders(): EventArenaReminderContextValue {
  const context = useContext(EventArenaReminderContext);
  if (!context) {
    throw new Error('useEventArenaReminders must be used within EventArenaRemindersProvider');
  }
  return context;
}
