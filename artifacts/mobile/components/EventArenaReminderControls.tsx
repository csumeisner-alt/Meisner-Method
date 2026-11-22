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
} from '@/lib/eventArenaReminders';

export function EventArenaReminderControls({ compact = false }: { compact?: boolean }) {
  const colors = useColors();
  const reminders = useEventArenaReminders();
  const visibleError = [reminders.preferenceError, reminders.error].filter(Boolean).join(' ');

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
        marginTop: compact ? 0 : 12,
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
          <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 3 }}>
            Three reminders per event and eligible Lightning Round
          </Text>
        </View>
        {reminders.busy ? <ActivityIndicator color={colors.primary} size="small" /> : null}
        <Switch
          testID="paper-event-notifications-toggle"
          accessibilityLabel="Event notifications"
          accessibilityState={{ checked: reminders.enabled, disabled: !reminders.loaded || reminders.busy || reminders.permission === 'unavailable' }}
          value={reminders.enabled}
          onValueChange={(enabled) => {
            if (enabled && reminders.permission === 'settings-required') {
              void reminders.openSettings();
              return;
            }
            void reminders.setEnabled(enabled);
          }}
          disabled={!reminders.loaded || reminders.busy || reminders.permission === 'unavailable'}
          style={{ transform: [{ scaleX: 1.15 }, { scaleY: 1.15 }] }}
          trackColor={{ false: colors.mutedForeground, true: colors.primary }}
          thumbColor={reminders.enabled ? colors.primaryForeground : colors.foreground}
          ios_backgroundColor={colors.mutedForeground}
        />
      </View>

      {reminders.permission === 'unavailable' ? (
        <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 10, paddingLeft: 44 }}>
          Turn notifications on in the mobile app.
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
