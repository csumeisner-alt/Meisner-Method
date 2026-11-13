import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  ScrollView,
  Share,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import ViewShot from 'react-native-view-shot';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { PaperEventShareCard } from '@/components/PaperEventShareCard';
import { PaperChallengeMilestoneBadges } from '@/components/PaperChallengeMilestoneBadges';
import {
  getPaperChallengeMilestones,
  getPaperChallengeReminders,
  getPaperChallengeWindow,
  loadPaperChallengeStore,
  PAPER_CHALLENGE_STARTING_BALANCE,
  sortPaperChallengeHistory,
  PAPER_CHALLENGE_MILESTONE_LABELS,
  type PaperChallengeStore,
  type PaperChallengeSummary,
  updatePaperChallengeStore,
  withdrawUpcomingPaperChallenge,
} from '@/lib/paperChallenge';

const NOTIFICATIONS_KEY = '@stocksense/paper_events_notifications_v1';
const NOTIFICATION_ID_KEY = '@stocksense/paper_events_notification_id_v1';
const PAPER_CACHE_KEY = '@stocksense/paper_v2';
const DAY_MS = 24 * 60 * 60 * 1000;
const BASE_URL = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;
type Props = { visible: boolean; onCloseSettings: () => void };

const money = (value: number) => `${value < 0 ? '−' : ''}$${Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateRange = (start: number, end: number) => {
  const left = new Date(start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const right = new Date(end).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${left}–${right}`;
};
const eventAccountId = (eventId: string) => `paper-event:${eventId}`;

async function readScheduledIds() {
  const saved = await AsyncStorage.getItem(NOTIFICATION_ID_KEY);
  if (!saved) return [];
  try {
    const parsed = JSON.parse(saved) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [saved];
  } catch {
    return [saved];
  }
}

async function scheduleUpcomingEventReminders() {
  const Notifications = await import('expo-notifications');
  const oldIds = await readScheduledIds();
  await Promise.all(oldIds.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})));
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('paper-event-reminders', {
      name: 'Paper event reminders',
      description: 'Reminders when a new paper event starts.',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  const ids: string[] = [];
  for (const reminder of getPaperChallengeReminders()) {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: reminder.title,
        body: reminder.body,
        data: { type: reminder.kind, eventId: reminder.eventId },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(reminder.scheduledAtMs),
        ...(Platform.OS === 'android' ? { channelId: 'paper-event-reminders' } : {}),
      },
    });
    ids.push(id);
  }
  await AsyncStorage.setItem(NOTIFICATION_ID_KEY, JSON.stringify(ids));
}

export function PaperChallengeHistory({ visible, onCloseSettings }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [eventsOpen, setEventsOpen] = useState(false);
  const [store, setStore] = useState<PaperChallengeStore>({ enrollment: null, history: [] });
  const [storeLoadState, setStoreLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [imageShareEvent, setImageShareEvent] = useState<PaperChallengeSummary | null>(null);
  const [sharingImage, setSharingImage] = useState(false);
  const imageRef = useRef<ViewShot | null>(null);
  const [now, setNow] = useState(Date.now());
  const [saving, setSaving] = useState(false);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const [sortMode, setSortMode] = useState<'date' | 'top'>('date');
  const [positionValue, setPositionValue] = useState<{ equity: number; profit: number; returnPercent: number; usedFallbackPrice: boolean } | null>(null);
  const [positionLoading, setPositionLoading] = useState(false);
  const currentWindow = getPaperChallengeWindow(now);
  const hasCurrentEnrollment = store.enrollment?.eventId === currentWindow.id;
  const sortedHistory = sortPaperChallengeHistory(store.history, sortMode);
  const midweekAt = currentWindow.startAtMs + 2 * DAY_MS + 2.5 * 60 * 60 * 1000;

  const readStore = useCallback(async (isCurrent: () => boolean = () => true) => {
    setStoreLoadState('loading');
    try {
      const latest = await loadPaperChallengeStore({
        getItem: (key) => AsyncStorage.getItem(key),
      });
      if (isCurrent()) {
        setStore(latest);
        setStoreLoadState('ready');
      }
    } catch {
      if (isCurrent()) setStoreLoadState('error');
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    void readStore(() => !cancelled);
    void AsyncStorage.getItem(NOTIFICATIONS_KEY)
      .then((notificationValue) => {
        if (!cancelled) setNotificationsEnabled(notificationValue === 'true');
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [visible, eventsOpen, readStore]);

  useEffect(() => {
    if (!visible || !notificationsEnabled || Platform.OS === 'web') return;
    let cancelled = false;
    void (async () => {
      const Notifications = await import('expo-notifications');
      const permission = await Notifications.getPermissionsAsync();
      if (permission.granted && !cancelled) await scheduleUpcomingEventReminders();
    })().catch(() => {
      if (!cancelled) Alert.alert('Could not refresh event reminders', 'You can try again from Event Arena settings.');
    });
    return () => { cancelled = true; };
  }, [visible, notificationsEnabled]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const optIn = async () => {
    const eventWindow = getPaperChallengeWindow(Date.now());
    if (saving || storeLoadState !== 'ready' || eventWindow.phase === 'ended' || store.enrollment) return;
    setSaving(true);
    const enrollment = {
      eventId: eventWindow.id,
      eventStartAtMs: eventWindow.startAtMs,
      eventEndAtMs: eventWindow.endAtMs,
      joinedAtMs: eventWindow.phase === 'upcoming' ? eventWindow.startAtMs : Date.now(),
      accountId: eventAccountId(eventWindow.id),
      accountName: 'Event Portfolio',
      startEquity: eventWindow.phase === 'upcoming' ? null : PAPER_CHALLENGE_STARTING_BALANCE,
    };
    try {
      const next = await updatePaperChallengeStore((current) => {
        if (eventWindow.phase === 'ended' || current.enrollment) return current;
        return { ...current, enrollment };
      }, {
        getItem: (key) => AsyncStorage.getItem(key),
        setItem: (key, value) => AsyncStorage.setItem(key, value),
      });
      setStore(next);
      if (next.enrollment?.eventId !== enrollment.eventId) return;
      setEventsOpen(false);
      onCloseSettings();
      Alert.alert('You’re in', 'Your separate event portfolio starts at $100,000. Open Paper Trading to place event trades.');
    } catch {
      Alert.alert('Could not join', 'Your event enrollment was not saved. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const withdrawUpcomingSignup = async () => {
    if (saving || storeLoadState !== 'ready') return;
    const nowMs = Date.now();
    const next = withdrawUpcomingPaperChallenge(store, currentWindow.id, nowMs);
    if (next === store) {
      setNow(nowMs);
      setConfirmWithdraw(false);
      return;
    }

    setSaving(true);
    try {
      const updated = await updatePaperChallengeStore(
        (current) => withdrawUpcomingPaperChallenge(current, currentWindow.id, nowMs),
        {
          getItem: (key) => AsyncStorage.getItem(key),
          setItem: (key, value) => AsyncStorage.setItem(key, value),
        },
      );
      setStore(updated);
      setConfirmWithdraw(false);
    } catch {
      Alert.alert('Could not withdraw', 'Your event signup is unchanged. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const shareSummary = async (event: PaperChallengeSummary) => {
    const symbols = event.symbolsTraded?.length ? event.symbolsTraded.join(', ') : 'No trades';
    const milestones = getPaperChallengeMilestones(event, store.history);
    const text = [
      'Meisner Method · Paper Event Results',
      dateRange(event.eventStartAtMs, event.eventEndAtMs),
      `Starting balance: ${money(PAPER_CHALLENGE_STARTING_BALANCE)}`,
      `Ending balance: ${money(event.endEquity)}`,
      `Return: ${event.returnPercent >= 0 ? '+' : ''}${event.returnPercent.toFixed(2)}% (${money(event.netProfit)})`,
      `Trades: ${event.buyCount ?? 0} buys, ${event.sellCount ?? 0} sells`,
      `Realized P&L: ${money(event.realizedPnL)}`,
      `Symbols: ${symbols}`,
      ...(milestones.length > 0
        ? [`Milestones: ${milestones.map((milestone) => PAPER_CHALLENGE_MILESTONE_LABELS[milestone]).join(', ')}`]
        : []),
    ].join('\n');
    try {
      await Share.share({ title: 'Paper Event Results', message: text });
    } catch {
      Alert.alert('Could not share', 'The device share sheet is unavailable right now.');
    }
  };

  const shareSummaryImage = async () => {
    const viewShot = imageRef.current;
    if (!viewShot || sharingImage) return;
    setSharingImage(true);
    try {
      const uri = await viewShot.capture?.();
      if (!uri) throw new Error('The result card could not be rendered.');
      const Sharing = await import('expo-sharing');
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('Sharing unavailable', 'Your device cannot share an image right now.');
        return;
      }
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        UTI: 'public.png',
        dialogTitle: 'Meisner Method Event Results',
      });
    } catch {
      Alert.alert('Could not share image', 'Please try again or share the text summary instead.');
    } finally {
      setSharingImage(false);
    }
  };

  const refreshEventPosition = useCallback(async () => {
    const enrollment = store.enrollment;
    if (!enrollment || enrollment.eventId !== currentWindow.id) return;
    setPositionLoading(true);
    try {
      const raw = await AsyncStorage.getItem(PAPER_CACHE_KEY);
      if (!raw) {
        setPositionValue(null);
        return;
      }
      const cache = JSON.parse(raw) as {
        accounts?: Array<{ id: string; cash: number; unsettledCash?: number }>;
        positions?: Array<{ accountId: string; symbol: string; shares: number; avgCost: number }>;
      };
      const account = cache.accounts?.find((item) => item.id === enrollment.accountId);
      if (!account) {
        setPositionValue(null);
        return;
      }
      const positions = (cache.positions ?? []).filter((item) => item.accountId === enrollment.accountId);
      const symbols = [...new Set(positions.map((item) => item.symbol))];
      const quoteResults = await Promise.allSettled(symbols.map(async (symbol) => {
        const response = await fetch(`${BASE_URL}/api/stocks/quote/${encodeURIComponent(symbol)}`);
        if (!response.ok) throw new Error(`Quote unavailable for ${symbol}`);
        const data = await response.json();
        return [symbol, Number(data.currentPrice)] as const;
      }));
      const quotes = new Map<string, number>();
      for (const result of quoteResults) {
        if (result.status === 'fulfilled' && Number.isFinite(result.value[1]) && result.value[1] > 0) {
          quotes.set(result.value[0], result.value[1]);
        }
      }
      const equity = account.cash
        + (account.unsettledCash ?? 0)
        + positions.reduce((sum, position) => sum + position.shares * (quotes.get(position.symbol) ?? position.avgCost), 0);
      const startingBalance = enrollment.startEquity ?? PAPER_CHALLENGE_STARTING_BALANCE;
      const profit = equity - startingBalance;
      setPositionValue({
        equity,
        profit,
        returnPercent: startingBalance > 0 ? profit / startingBalance * 100 : 0,
        usedFallbackPrice: quotes.size < symbols.length,
      });
    } catch {
      setPositionValue(null);
    } finally {
      setPositionLoading(false);
    }
  }, [currentWindow.id, store.enrollment]);

  useEffect(() => {
    if (!eventsOpen || !hasCurrentEnrollment || currentWindow.phase !== 'active') return;
    void refreshEventPosition();
  }, [currentWindow.phase, eventsOpen, hasCurrentEnrollment, refreshEventPosition]);

  const setEventNotifications = async (enabled: boolean) => {
    if (Platform.OS === 'web') {
      Alert.alert('Mobile notifications only', 'Enable event notifications from the mobile app.');
      return;
    }
    try {
      const Notifications = await import('expo-notifications');
      if (!enabled) {
        const savedIds = await readScheduledIds();
        await Promise.all(savedIds.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})));
        await AsyncStorage.multiRemove([NOTIFICATIONS_KEY, NOTIFICATION_ID_KEY]);
        setNotificationsEnabled(false);
        return;
      }
      let permission = await Notifications.getPermissionsAsync();
      if (!permission.granted) permission = await Notifications.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Notifications are off', 'Allow notifications in your device settings to receive event reminders.');
        return;
      }
      await AsyncStorage.setItem(NOTIFICATIONS_KEY, 'true');
      setNotificationsEnabled(true);
    } catch {
      Alert.alert('Could not update notifications', 'Please try again from Event Arena settings.');
    }
  };

  return (
    <View style={{ marginBottom: 18 }}>
      <TouchableOpacity
        testID="settings-events-button"
        accessibilityRole="button"
        accessibilityLabel="Event Arena"
        onPress={() => setEventsOpen(true)}
        style={{
          minHeight: 50,
          paddingHorizontal: 14,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 12,
          backgroundColor: colors.card,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <Feather name="award" size={18} color={colors.primary} />
        <Text style={{ flex: 1, color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 14 }}>
          Event Arena
        </Text>
        <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
      </TouchableOpacity>

      <Modal visible={eventsOpen} animationType="slide" onRequestClose={() => setEventsOpen(false)}>
        <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: Platform.OS === 'web' ? 24 : insets.top + 8 }}>
          <View style={{ paddingHorizontal: 18, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ flex: 1, color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 20 }}>Event Arena</Text>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close events" onPress={() => setEventsOpen(false)} hitSlop={10}>
              <Feather name="x" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
          <View style={{ flex: 1, padding: 18, paddingBottom: Platform.OS === 'web' ? 24 : insets.bottom + 18 }}>
            <View style={{ padding: 16, borderRadius: 14, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
              {storeLoadState === 'error' && (
                <View style={{ marginBottom: 14, padding: 12, borderRadius: 10, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.destructive }}>
                  <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 12, lineHeight: 18 }}>
                    Could not load your saved event history. Joining and withdrawing are paused to protect your past results.
                  </Text>
                  <TouchableOpacity
                    testID="retry-paper-challenge-history"
                    accessibilityRole="button"
                    accessibilityLabel="Retry loading saved event history"
                    onPress={() => { void readStore(); }}
                    style={{ alignSelf: 'flex-start', marginTop: 10, paddingVertical: 7, paddingHorizontal: 10, borderRadius: 8, backgroundColor: colors.primary }}
                  >
                    <Text style={{ color: colors.primaryForeground, fontFamily: 'Inter_700Bold', fontSize: 11 }}>RETRY</Text>
                  </TouchableOpacity>
                </View>
              )}
              {storeLoadState === 'loading' && (
                <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12, marginBottom: 12 }}>
                  Loading your saved event history…
                </Text>
              )}
              <Text style={{ color: colors.primary, fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 0.7 }}>
                {hasCurrentEnrollment ? 'YOUR EVENT PORTFOLIO' : currentWindow.phase === 'active' ? 'LIVE THIS WEEK' : 'NEXT PAPER EVENT'}
              </Text>
              <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 18, marginTop: 8 }}>
                Grow your event balance.
              </Text>
              <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19, marginTop: 6 }}>
                {hasCurrentEnrollment
                  ? currentWindow.phase === 'active'
                    ? store.enrollment?.startEquity === null
                      ? 'Your goal is to grow a separate $100,000 paper portfolio as much as possible. Event trades close Friday at 4:00 p.m. ET.'
                      : 'Your goal is to grow your separate $100,000 paper portfolio as much as possible. Event trades close Friday at 4:00 p.m. ET.'
                    : currentWindow.phase === 'upcoming'
                      ? 'Your goal is to grow a separate $100,000 paper portfolio as much as possible. It will be ready at Monday’s market open.'
                      : 'This event has ended. Open Paper Trading to save its final results.'
                  : `${dateRange(currentWindow.startAtMs, currentWindow.endAtMs)} · Goal: grow your separate $100,000 paper portfolio as much as possible · U.S. market hours`}
              </Text>
              {store.enrollment && !hasCurrentEnrollment && (
                <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 10 }}>
                  {now >= store.enrollment.eventEndAtMs
                    ? 'Your event results are waiting to finish. Open Paper Trading and tap Retry; your enrollment stays saved until the summary is written.'
                    : 'Finish your previous event summary in Paper Trading before joining another.'}
                </Text>
              )}
              {!hasCurrentEnrollment && (currentWindow.phase === 'active' || currentWindow.phase === 'upcoming') && (
                <TouchableOpacity
                  testID="join-paper-challenge"
                  accessibilityRole="button"
                  disabled={saving || storeLoadState !== 'ready' || !!store.enrollment}
                  onPress={() => { void optIn(); }}
                  style={{ marginTop: 14, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 10, backgroundColor: saving || storeLoadState !== 'ready' || store.enrollment ? colors.muted : colors.primary, alignItems: 'center' }}
                >
                  <Text style={{ color: colors.primaryForeground, fontFamily: 'Inter_700Bold', fontSize: 12 }}>
                    {saving ? 'JOINING…' : currentWindow.phase === 'upcoming' ? 'OPT IN FOR NEXT EVENT' : 'JOIN THIS EVENT'}
                  </Text>
                </TouchableOpacity>
              )}
              {hasCurrentEnrollment && currentWindow.phase === 'active' && (
                <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold', fontSize: 12, marginTop: 12 }}>
                  Open Paper Trading to trade your event portfolio.
                </Text>
              )}
              {hasCurrentEnrollment && currentWindow.phase === 'upcoming' && store.enrollment?.startEquity === null && (
                confirmWithdraw ? (
                  <View style={{ marginTop: 14, padding: 12, borderRadius: 10, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border }}>
                    <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 12, lineHeight: 18 }}>
                      Withdraw this signup? Your fresh event account will not be created when the event starts.
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                      <TouchableOpacity
                        accessibilityRole="button"
                        disabled={saving || storeLoadState !== 'ready'}
                        onPress={() => setConfirmWithdraw(false)}
                        style={{ flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: colors.card, alignItems: 'center', opacity: saving || storeLoadState !== 'ready' ? 0.6 : 1 }}
                      >
                        <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 11 }}>KEEP SIGNUP</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        testID="confirm-withdraw-paper-challenge"
                        accessibilityRole="button"
                        disabled={saving || storeLoadState !== 'ready'}
                        onPress={() => { void withdrawUpcomingSignup(); }}
                        style={{ flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: colors.destructive, alignItems: 'center', opacity: saving || storeLoadState !== 'ready' ? 0.6 : 1 }}
                      >
                        <Text style={{ color: colors.primaryForeground, fontFamily: 'Inter_700Bold', fontSize: 11 }}>
                          {saving ? 'WITHDRAWING…' : 'WITHDRAW'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity
                    testID="withdraw-paper-challenge"
                    accessibilityRole="button"
                    accessibilityLabel="Withdraw from the upcoming paper event"
                    disabled={saving || storeLoadState !== 'ready'}
                    onPress={() => setConfirmWithdraw(true)}
                    style={{ marginTop: 12, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 9, borderWidth: 1, borderColor: colors.destructive, alignItems: 'center', opacity: saving || storeLoadState !== 'ready' ? 0.6 : 1 }}
                  >
                    <Text style={{ color: colors.destructive, fontFamily: 'Inter_700Bold', fontSize: 11 }}>
                      {saving ? 'SAVING…' : 'WITHDRAW FROM EVENT'}
                    </Text>
                  </TouchableOpacity>
                )
              )}
              {hasCurrentEnrollment && currentWindow.phase === 'ended' && (
                <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold', fontSize: 12, marginTop: 12 }}>
                  Open Paper Trading to finalize this event.
                </Text>
              )}
            </View>

            {hasCurrentEnrollment && currentWindow.phase === 'active' && now >= midweekAt && (
              <View style={{ marginTop: 12, padding: 14, borderRadius: 12, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ flex: 1, color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 14 }}>Midweek position</Text>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Refresh midweek position"
                    onPress={() => { void refreshEventPosition(); }}
                    hitSlop={8}
                  >
                    <Feather name="refresh-cw" size={16} color={colors.primary} />
                  </TouchableOpacity>
                </View>
                {positionLoading ? (
                  <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 7 }}>Updating from latest quotes…</Text>
                ) : positionValue ? (
                  <View>
                    <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 7 }}>
                      Overall {money(positionValue.equity)} · {positionValue.profit >= 0 ? '+' : ''}{money(positionValue.profit)} ({positionValue.returnPercent >= 0 ? '+' : ''}{positionValue.returnPercent.toFixed(2)}%)
                    </Text>
                    {positionValue.usedFallbackPrice && (
                      <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 3 }}>
                        Some holdings use average cost because a current quote was unavailable.
                      </Text>
                    )}
                  </View>
                ) : (
                  <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 7 }}>
                    Open Paper Trading to place a trade, then refresh this position.
                  </Text>
                )}
              </View>
            )}

            <View style={{ marginTop: 18, paddingVertical: 12, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 14 }}>Event notifications</Text>
                <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 3 }}>Up to three gentle reminders per event</Text>
              </View>
              <Switch
                testID="paper-event-notifications-toggle"
                value={notificationsEnabled}
                onValueChange={(value) => { void setEventNotifications(value); }}
                trackColor={{ false: colors.muted, true: colors.primary }}
                thumbColor={colors.card}
              />
            </View>

            <View style={{ marginTop: 18, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ flex: 1, color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 16 }}>Your past events</Text>
              {([
                { key: 'date' as const, label: 'Date' },
                { key: 'top' as const, label: 'Top weeks' },
              ]).map((option) => (
                <TouchableOpacity
                  key={option.key}
                  accessibilityRole="button"
                  accessibilityState={{ selected: sortMode === option.key }}
                  onPress={() => setSortMode(option.key)}
                  style={{ paddingVertical: 6, paddingHorizontal: 9, borderRadius: 8, backgroundColor: sortMode === option.key ? colors.primary : colors.card }}
                >
                  <Text style={{ color: sortMode === option.key ? colors.primaryForeground : colors.mutedForeground, fontFamily: 'Inter_600SemiBold', fontSize: 10 }}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
              {sortedHistory.length === 0 ? (
                <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 13, paddingVertical: 12 }}>
                  {storeLoadState === 'ready'
                    ? 'Events you join and their summaries will appear here.'
                    : storeLoadState === 'loading'
                      ? 'Loading saved event history…'
                      : 'Saved event history is unavailable until it can be loaded.'}
                </Text>
              ) : sortedHistory.map((event, index) => (
                <View key={event.eventId} style={{ paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.border }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>
                        {sortMode === 'top' ? `#${index + 1} · ` : ''}{dateRange(event.eventStartAtMs, event.eventEndAtMs)}
                      </Text>
                      <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 3 }}>
                        $100,000 start · {event.buyCount ?? 0} buys · {event.sellCount ?? 0} sells
                      </Text>
                    </View>
                    <Text style={{ color: event.netProfit >= 0 ? colors.primary : colors.destructive, fontFamily: 'Inter_700Bold', fontSize: 14 }}>
                      {money(event.netProfit)}
                    </Text>
                    <TouchableOpacity
                      testID={`share-paper-event-${event.eventId}`}
                      accessibilityRole="button"
                      accessibilityLabel={`Share ${dateRange(event.eventStartAtMs, event.eventEndAtMs)} event summary`}
                      onPress={() => { void shareSummary(event); }}
                      hitSlop={8}
                      style={{ padding: 6 }}
                    >
                      <Feather name="share" size={17} color={colors.primary} />
                    </TouchableOpacity>
                    {Platform.OS !== 'web' && (
                      <TouchableOpacity
                        testID={`share-paper-event-image-${event.eventId}`}
                        accessibilityRole="button"
                        accessibilityLabel={`Preview ${dateRange(event.eventStartAtMs, event.eventEndAtMs)} event result image`}
                        onPress={() => setImageShareEvent(event)}
                        hitSlop={8}
                        style={{ padding: 6 }}
                      >
                        <Feather name="image" size={17} color={colors.primary} />
                      </TouchableOpacity>
                    )}
                  </View>
                  <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 5 }}>
                    End {money(event.endEquity)} · {event.returnPercent >= 0 ? '+' : ''}{event.returnPercent.toFixed(2)}% · realized {money(event.realizedPnL)}
                  </Text>
                  <PaperChallengeMilestoneBadges milestones={getPaperChallengeMilestones(event, store.history)} compact />
                  {(event.symbolsTraded ?? []).length > 0 && (
                    <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 3 }}>
                      Traded: {(event.symbolsTraded ?? []).join(', ')}
                    </Text>
                  )}
                  <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 3 }}>
                    Finalized {new Date(event.completedAtMs).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} using latest available quotes
                  </Text>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={imageShareEvent !== null}
        animationType="slide"
        onRequestClose={() => setImageShareEvent(null)}
      >
        <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: Platform.OS === 'web' ? 24 : insets.top + 8 }}>
          <View style={{ paddingHorizontal: 18, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ flex: 1, color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 20 }}>Share result image</Text>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Close image preview"
              onPress={() => setImageShareEvent(null)}
              hitSlop={10}
            >
              <Feather name="x" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
          {imageShareEvent && (
            <>
              <ScrollView contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 18 }}>
                <ViewShot
                  ref={imageRef}
                  options={{ format: 'png', quality: 1 }}
                  style={{ width: '100%', maxWidth: 360 }}
                >
                  <PaperEventShareCard
                    event={imageShareEvent}
                    milestones={getPaperChallengeMilestones(imageShareEvent, store.history)}
                  />
                </ViewShot>
              </ScrollView>
              <View style={{ paddingHorizontal: 18, paddingTop: 10, paddingBottom: Platform.OS === 'web' ? 24 : insets.bottom + 18 }}>
                <TouchableOpacity
                  testID="share-paper-event-image-confirm"
                  accessibilityRole="button"
                  disabled={sharingImage}
                  onPress={() => { void shareSummaryImage(); }}
                  style={{ minHeight: 50, paddingHorizontal: 16, borderRadius: 12, backgroundColor: sharingImage ? colors.muted : colors.primary, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text style={{ color: colors.primaryForeground, fontFamily: 'Inter_700Bold', fontSize: 14 }}>
                    {sharingImage ? 'Preparing image…' : 'Share image'}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </Modal>
    </View>
  );
}
