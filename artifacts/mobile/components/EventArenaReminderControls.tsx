import React from 'react';
import {
  ActivityIndicator,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import {
  useEventArenaReminders,
  type EventArenaPermissionStatus,
} from '@/lib/eventArenaReminders';

function permissionLabel(permission: EventArenaPermissionStatus): string {
  switch (permission) {
    case 'granted': return 'Allowed';
    case 'not-granted': return 'Not allowed';
    case 'settings-required': return 'Blocked in device settings';
    case 'unavailable': return 'Available in the mobile app';
    default: return 'Checking';
  }
}

export function EventArenaReminderControls({ compact = false }: { compact?: boolean }) {
  const colors = useColors();
  const reminders = useEventArenaReminders();
  const permissionAction = reminders.permission === 'settings-required'
    ? 'Open device settings'
    : 'Allow notifications';
  const visibleError = [reminders.preferenceError, reminders.error].filter(Boolean).join(' ');
  const remotePushLabel = reminders.remotePushStatus === 'ready'
    ? 'Registered'
    : reminders.remotePushStatus === 'unavailable'
      ? 'Unavailable'
      : reminders.remotePushStatus === 'error'
        ? 'Could not refresh'
        : 'Not checked';

  return (
    <View
      testID="event-arena-reminder-controls"
      style={{
        padding: compact ? 12 : 14,
        borderRadius: 13,
        backgroundColor: compact ? 'transparent' : colors.card,
        borderWidth: compact ? 0 : 1,
        borderColor: colors.border,
        borderTopWidth: compact ? 1 : 1,
        borderBottomWidth: compact ? 1 : 1,
        gap: 10,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{
          width: 34,
          height: 34,
          borderRadius: 11,
          backgroundColor: colors.muted,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <Feather name="bell" size={16} color={colors.primary} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 13 }}>
            Event notifications
          </Text>
          <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 3 }}>
            Event updates and eligible Lightning Round alerts
          </Text>
        </View>
        {reminders.busy ? <ActivityIndicator color={colors.primary} size="small" /> : null}
        <Switch
          testID="paper-event-notifications-toggle"
          accessibilityLabel="Event notifications"
          accessibilityState={{ checked: reminders.enabled, disabled: !reminders.loaded || reminders.busy || !!reminders.preferenceError || reminders.permission === 'unavailable' }}
          value={reminders.enabled}
          onValueChange={(enabled) => { void reminders.setEnabled(enabled); }}
          disabled={!reminders.loaded || reminders.busy || !!reminders.preferenceError || reminders.permission === 'unavailable'}
          trackColor={{ false: colors.muted, true: colors.primary }}
          thumbColor={colors.card}
        />
      </View>

      <View style={{ paddingLeft: 44, gap: 4 }}>
        <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 10 }}>
          Saved preference: <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold' }}>{reminders.enabled ? 'On' : 'Off'}</Text>
        </Text>
        <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 10 }}>
          Device permission: <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold' }}>{permissionLabel(reminders.permission)}</Text>
        </Text>
        <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 10 }}>
          On-device reminders: <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold' }}>
            {reminders.scheduledCount === null ? 'Checking' : `${reminders.scheduledCount} scheduled`}
          </Text>
        </Text>
        <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 10 }}>
          Remote push: <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold' }}>{remotePushLabel}</Text>
        </Text>
      </View>

      {reminders.permission !== 'granted' && reminders.permission !== 'unavailable' && reminders.loaded ? (
        <TouchableOpacity
          testID="event-arena-notification-permission-action"
          accessibilityRole="button"
          disabled={reminders.busy}
          onPress={() => { void reminders.requestPermission(); }}
          style={{ minHeight: 42, alignSelf: 'flex-start', justifyContent: 'center', paddingHorizontal: 44, opacity: reminders.busy ? 0.55 : 1 }}
        >
          <Text style={{ color: colors.primary, fontFamily: 'Inter_700Bold', fontSize: 11 }}>
            {permissionAction}
          </Text>
        </TouchableOpacity>
      ) : null}

      {reminders.pushNotice ? (
        <View style={{ paddingLeft: 44, gap: 2 }}>
          <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 10, lineHeight: 15 }}>
            {reminders.pushNotice}
          </Text>
          {reminders.enabled && reminders.remotePushStatus !== 'ready' ? (
            <TouchableOpacity
              testID="event-arena-push-retry"
              accessibilityRole="button"
              disabled={reminders.busy}
              onPress={() => { void reminders.retry(); }}
              style={{ minHeight: 40, alignSelf: 'flex-start', justifyContent: 'center' }}
            >
              <Text style={{ color: colors.primary, fontFamily: 'Inter_700Bold', fontSize: 10 }}>
                Retry remote setup
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {reminders.permission === 'unavailable' ? (
        <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 10, paddingLeft: 44 }}>
          Notification scheduling is available in the mobile app.
        </Text>
      ) : null}

      {visibleError ? (
        <View style={{ paddingLeft: 44, gap: 4 }}>
          <Text
            testID="event-arena-reminder-error"
            accessibilityRole="alert"
            style={{ color: colors.destructive, fontFamily: 'Inter_500Medium', fontSize: 10, lineHeight: 15 }}
          >
            {visibleError}
          </Text>
          {reminders.retryMode || reminders.preferenceError ? (
            <TouchableOpacity
              testID="event-arena-reminder-retry"
              accessibilityRole="button"
              disabled={reminders.busy}
              onPress={() => { void reminders.retry(); }}
              style={{ minHeight: 40, alignSelf: 'flex-start', justifyContent: 'center' }}
            >
              <Text style={{ color: colors.primary, fontFamily: 'Inter_700Bold', fontSize: 10 }}>
                {reminders.busy ? 'Retrying…' : 'Retry'}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
