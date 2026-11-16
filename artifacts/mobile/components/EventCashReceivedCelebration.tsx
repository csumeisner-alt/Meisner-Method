import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  AppState,
  DeviceEventEmitter,
  Modal,
  Platform,
  Pressable,
  Text,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { applyEventCashTransfer } from '@/lib/eventArenaTransfers';
import { getInstallationId } from '@/lib/installation';
import {
  createEventArenaDeviceSyncSender,
  EVENT_ARENA_DEVICE_TOKEN_KEY,
  getEventArenaParticipantId,
  syncStoredEventArenaDeviceSnapshot,
} from '@/lib/eventArenaDeviceSync';
import { getPaperChallengeWindow, loadPaperChallengeStore } from '@/lib/paperChallenge';

const PAPER_CACHE_KEY = '@stocksense/paper_v2';
const BASE_URL = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

type CashNotification = {
  id: string;
  eventId: string;
  senderAlias: string;
  amount: number;
  createdAt: string;
  readAt: string | null;
};

type Receipt = {
  eventId: string;
  notifications: CashNotification[];
};

export function EventCashReceivedCelebration() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const requestInFlightRef = useRef(false);
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.92)).current;

  const checkForReceipts = useCallback(async () => {
    if (requestInFlightRef.current || receipt) return;
    requestInFlightRef.current = true;
    try {
      const store = await loadPaperChallengeStore({
        getItem: (key) => AsyncStorage.getItem(key),
      });
      const enrollment = store.enrollment;
      const event = getPaperChallengeWindow(Date.now());
      if (!enrollment || enrollment.eventId !== event.id) return;

      const installationId = await getEventArenaParticipantId(AsyncStorage, getInstallationId);
      const response = await fetch(`${BASE_URL}/api/event-arena/${encodeURIComponent(event.id)}/transfers`, {
        headers: {
          'X-Event-Arena-Installation-Id': installationId,
          'X-Event-Arena-Mark-Read': 'false',
        },
      });
      if (!response.ok) return;
      const result = await response.json() as { notifications?: CashNotification[] };
      const notifications = Array.isArray(result.notifications)
        ? result.notifications.filter((item) =>
          item
          && item.eventId === event.id
          && typeof item.id === 'string'
          && typeof item.senderAlias === 'string'
          && Number.isFinite(item.amount)
          && item.amount > 0,
        )
        : [];

      let accountChanged = false;
      for (const notification of notifications) {
        const applied = await applyEventCashTransfer({
          accountId: enrollment.accountId,
          transferId: notification.id,
          amount: notification.amount,
          direction: 'received',
        }, {
          getItem: (key) => AsyncStorage.getItem(key),
          setItem: (key, value) => AsyncStorage.setItem(key, value),
        });
        accountChanged ||= applied.applied;
      }
      if (accountChanged) {
        if (await AsyncStorage.getItem(EVENT_ARENA_DEVICE_TOKEN_KEY)) {
          try {
            await syncStoredEventArenaDeviceSnapshot(
              AsyncStorage,
              createEventArenaDeviceSyncSender(BASE_URL),
            );
          } catch {
            setError('The transfer was applied locally, but the shared account did not sync.');
          }
        }
        DeviceEventEmitter.emit('eventArenaCashReceived', { eventId: event.id, accountId: enrollment.accountId });
      }

      const unread = notifications.filter((item) => !item.readAt);
      if (unread.length > 0) setReceipt({ eventId: event.id, notifications: unread });
    } catch {
      // Keep app startup unobstructed; the unread receipt remains available on the next check.
    } finally {
      requestInFlightRef.current = false;
    }
  }, [receipt]);

  useEffect(() => {
    void checkForReceipts();
    let previousState = AppState.currentState;
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (previousState !== 'active' && nextState === 'active') void checkForReceipts();
      previousState = nextState;
    });
    return () => subscription.remove();
  }, [checkForReceipts]);

  useEffect(() => {
    if (!receipt) {
      opacity.setValue(0);
      scale.setValue(0.92);
      return;
    }
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, speed: 16, bounciness: 7, useNativeDriver: true }),
    ]).start();
  }, [opacity, receipt, scale]);

  const acknowledge = async () => {
    if (!receipt || saving) return;
    setSaving(true);
    setError('');
    try {
      const installationId = await getEventArenaParticipantId(AsyncStorage, getInstallationId);
      const response = await fetch(
        `${BASE_URL}/api/event-arena/${encodeURIComponent(receipt.eventId)}/transfers/read`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'X-Event-Arena-Installation-Id': installationId,
          },
          body: JSON.stringify({ transferIds: receipt.notifications.map((item) => item.id) }),
        },
      );
      if (!response.ok) throw new Error('Could not save this receipt. Try again.');
      setReceipt(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save this receipt. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const money = receipt?.notifications.reduce((sum, item) => sum + item.amount, 0) ?? 0;
  const senders = [...new Set(receipt?.notifications.map((item) => item.senderAlias) ?? [])];
  const senderLine = senders.length === 1
    ? `From ${senders[0]}`
    : senders.length > 1
      ? `From ${senders.slice(0, 3).join(', ')}${senders.length > 3 ? ` +${senders.length - 3}` : ''}`
      : '';

  return (
    <Modal
      visible={!!receipt}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => { void acknowledge(); }}
    >
      <View
        testID="event-cash-received-celebration"
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 24,
          paddingTop: Platform.OS === 'web' ? 67 : insets.top,
          paddingBottom: Platform.OS === 'web' ? 34 : insets.bottom,
          backgroundColor: 'rgba(5, 11, 18, 0.82)',
        }}
      >
        <Animated.View
          accessibilityViewIsModal
          style={{
            width: '100%',
            maxWidth: 390,
            alignItems: 'center',
            overflow: 'hidden',
            paddingHorizontal: 24,
            paddingTop: 30,
            paddingBottom: 24,
            borderRadius: 26,
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.gold,
            opacity,
            transform: [{ scale }],
          }}
        >
          <View
            style={{
              width: 76,
              height: 76,
              borderRadius: 38,
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 18,
              backgroundColor: `${colors.gold}22`,
              borderWidth: 1,
              borderColor: `${colors.gold}77`,
            }}
          >
            <Feather name="gift" size={35} color={colors.gold} />
          </View>
          <Text style={{ color: colors.gold, fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 1.5 }}>
            A CASH BOOST
          </Text>
          <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 24, textAlign: 'center', marginTop: 8 }}>
            Someone backed your run
          </Text>
          <Text
            accessibilityLiveRegion="polite"
            testID="event-cash-received-amount"
            style={{ color: colors.primary, fontFamily: 'Inter_700Bold', fontSize: 42, marginTop: 18 }}
          >
            +${money.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </Text>
          <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold', fontSize: 14, marginTop: 5 }}>
            {senderLine}
          </Text>
          <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12, textAlign: 'center', lineHeight: 18, marginTop: 12 }}>
            Added to your Event Arena cash. Put it to work.
          </Text>
          {error ? (
            <Text testID="event-cash-receipt-error" accessibilityRole="alert" style={{ color: colors.destructive, fontFamily: 'Inter_500Medium', fontSize: 12, textAlign: 'center', marginTop: 12 }}>
              {error}
            </Text>
          ) : null}
          <Pressable
            testID="event-cash-receipt-acknowledge"
            accessibilityRole="button"
            accessibilityLabel="Celebrate cash received"
            disabled={saving}
            onPress={() => { void acknowledge(); }}
            style={({ pressed }) => ({
              minHeight: 52,
              alignSelf: 'stretch',
              alignItems: 'center',
              justifyContent: 'center',
              marginTop: 22,
              borderRadius: 16,
              backgroundColor: colors.primary,
              opacity: pressed || saving ? 0.72 : 1,
            })}
          >
            <Text style={{ color: colors.primaryForeground, fontFamily: 'Inter_700Bold', fontSize: 15 }}>
              {saving ? 'SAVING…' : 'LET’S GO'}
            </Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}
