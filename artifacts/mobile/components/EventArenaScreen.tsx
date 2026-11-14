import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { BottomTabBar } from '@/components/BottomTabBar';
import { EventArenaOverview } from '@/components/EventArenaOverview';
import { PaperChallengeLeaderboard } from '@/components/PaperChallengeLeaderboard';
import { PaperChallengeMilestoneBadges } from '@/components/PaperChallengeMilestoneBadges';
import { PaperEventShareCard } from '@/components/PaperEventShareCard';
import {
  getEventArenaCountdown,
  getEventArenaParticipation,
  getEventArenaPerformance,
  type EventArenaAccountData,
} from '@/lib/eventArenaHome';
import {
  getPaperChallengeMilestones,
  getPaperChallengeReminders,
  getPaperChallengeWindow,
  loadPaperChallengeStore,
  PAPER_CHALLENGE_STARTING_BALANCE,
  sortPaperChallengeHistory,
  ensurePaperChallengeAccount,
  updatePaperChallengeStore,
  withdrawUpcomingPaperChallenge,
  type PaperChallengeEnrollment,
  type PaperChallengeStore,
  type PaperChallengeSummary,
} from '@/lib/paperChallenge';
import {
  INITIAL_BALANCE,
  parseAccountValueSnapshots,
  type PaperLot,
} from '@/lib/paperMath';

const NOTIFICATIONS_KEY = '@stocksense/paper_events_notifications_v1';
const NOTIFICATION_ID_KEY = '@stocksense/paper_events_notification_id_v1';
const PAPER_CACHE_KEY = '@stocksense/paper_v2';
const PAPER_VALUE_SNAPSHOT_KEY = '@stocksense/paper_equity_snapshots_v1';
const BASE_URL = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

type Section = 'competition' | 'leaderboard' | 'trades' | 'past';
type StoredPaperCache = Partial<EventArenaAccountData> & { activeId?: string; lots?: PaperLot[] };

const SECTIONS: { id: Section; label: string; icon: React.ComponentProps<typeof Feather>['name'] }[] = [
  { id: 'competition', label: 'Competition', icon: 'award' },
  { id: 'leaderboard', label: 'Leaderboard', icon: 'users' },
  { id: 'trades', label: 'My Trades', icon: 'activity' },
  { id: 'past', label: 'Past Events', icon: 'archive' },
];

const money = (value: number) =>
  `${value < 0 ? '−' : ''}$${Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateRange = (start: number, end: number) =>
  `${new Date(start).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}–${new Date(end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

async function ensureStoredEventAccount(enrollment: PaperChallengeEnrollment) {
  const raw = await AsyncStorage.getItem(PAPER_CACHE_KEY);
  const cache = raw ? JSON.parse(raw) as StoredPaperCache : {};
  const createdAt = new Date().toISOString();
  const accounts = Array.isArray(cache.accounts) && cache.accounts.length > 0
    ? cache.accounts
    : [1, 2, 3].map((number) => ({
        id: `paper-strategy-${number}`,
        name: `Strategy ${number}`,
        cash: INITIAL_BALANCE,
        createdAt,
      }));
  const state = ensurePaperChallengeAccount(enrollment, {
    accounts,
    positions: Array.isArray(cache.positions) ? cache.positions : [],
    transactions: Array.isArray(cache.transactions) ? cache.transactions : [],
    orders: Array.isArray(cache.orders) ? cache.orders : [],
    lots: Array.isArray(cache.lots) ? cache.lots : [],
  });
  await AsyncStorage.setItem(PAPER_CACHE_KEY, JSON.stringify({
    ...cache,
    ...state,
    activeId: enrollment.accountId,
  }));
}

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

export function EventArenaScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [section, setSection] = useState<Section>('competition');
  const [store, setStore] = useState<PaperChallengeStore>({ enrollment: null, history: [] });
  const [storeState, setStoreState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [accountData, setAccountData] = useState<EventArenaAccountData>({
    accounts: [],
    positions: [],
    transactions: [],
    orders: [],
    snapshots: [],
  });
  const [quotes, setQuotes] = useState<Record<string, number>>({});
  const [accountLoading, setAccountLoading] = useState(false);
  const [accountError, setAccountError] = useState('');
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rank, setRank] = useState<number | null>(null);
  const [sortMode, setSortMode] = useState<'date' | 'top'>('date');
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [imageShareEvent, setImageShareEvent] = useState<PaperChallengeSummary | null>(null);
  const [sharingImage, setSharingImage] = useState(false);
  const imageRef = useRef<ViewShot | null>(null);
  const [now, setNow] = useState(Date.now());
  const currentWindow = getPaperChallengeWindow(now);
  const hasCurrentEnrollment = store.enrollment?.eventId === currentWindow.id;
  const enrollment = hasCurrentEnrollment ? store.enrollment : null;
  const participantAlias = enrollment?.leaderboardAlias?.trim();
  const participation = getEventArenaParticipation(currentWindow, store.enrollment, now);
  const countdown = getEventArenaCountdown(currentWindow, now);
  const performance = enrollment
    ? getEventArenaPerformance(enrollment, currentWindow, accountData, quotes, now)
    : null;
  const sortedHistory = useMemo(
    () => sortPaperChallengeHistory(store.history, sortMode),
    [store.history, sortMode],
  );

  const readStore = useCallback(async () => {
    setStoreState('loading');
    try {
      const loadedStore = await loadPaperChallengeStore({
        getItem: (key) => AsyncStorage.getItem(key),
      });
      setStore(loadedStore);
      setStoreState('ready');
    } catch {
      setStoreState('error');
    }
  }, []);

  const refreshAccountData = useCallback(async () => {
    setAccountLoading(true);
    setAccountError('');
    try {
      const [rawCache, rawSnapshots] = await Promise.all([
        AsyncStorage.getItem(PAPER_CACHE_KEY),
        AsyncStorage.getItem(PAPER_VALUE_SNAPSHOT_KEY),
      ]);
      const cache = rawCache ? JSON.parse(rawCache) as StoredPaperCache : {};
      const snapshots = parseAccountValueSnapshots(rawSnapshots ? JSON.parse(rawSnapshots) : null);
      const nextData: EventArenaAccountData = {
        accounts: Array.isArray(cache.accounts) ? cache.accounts : [],
        positions: Array.isArray(cache.positions) ? cache.positions : [],
        transactions: Array.isArray(cache.transactions) ? cache.transactions : [],
        orders: Array.isArray(cache.orders) ? cache.orders : [],
        snapshots,
      };
      setAccountData(nextData);
      const currentEnrollment = store.enrollment?.eventId === currentWindow.id ? store.enrollment : null;
      const eventPositions = currentEnrollment
        ? nextData.positions.filter((item) => item.accountId === currentEnrollment.accountId && item.shares > 0)
        : [];
      const symbols = [...new Set(eventPositions.map((item) => item.symbol.trim().toUpperCase()).filter(Boolean))];
      const quoteResults = await Promise.allSettled(symbols.map(async (symbol) => {
        const response = await fetch(`${BASE_URL}/api/stocks/quote/${encodeURIComponent(symbol)}`);
        if (!response.ok) throw new Error(`Quote unavailable for ${symbol}`);
        const result = await response.json() as { currentPrice?: unknown };
        const price = Number(result.currentPrice);
        if (!Number.isFinite(price) || price <= 0) throw new Error(`Quote unavailable for ${symbol}`);
        return [symbol, price] as const;
      }));
      const nextQuotes: Record<string, number> = {};
      quoteResults.forEach((result) => {
        if (result.status === 'fulfilled') nextQuotes[result.value[0]] = result.value[1];
      });
      setQuotes(nextQuotes);
    } catch {
      setAccountError('Event account data could not be refreshed. Your saved trading data is unchanged.');
    } finally {
      setAccountLoading(false);
    }
  }, [currentWindow.id, store.enrollment]);

  useEffect(() => {
    void readStore();
    void AsyncStorage.getItem(NOTIFICATIONS_KEY)
      .then((value) => setNotificationsEnabled(value === 'true'))
      .catch(() => {});
  }, [readStore]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (storeState !== 'ready') return;
    let cancelled = false;
    void (async () => {
      try {
        const currentEnrollment = store.enrollment?.eventId === currentWindow.id ? store.enrollment : null;
        if (currentEnrollment) await ensureStoredEventAccount(currentEnrollment);
        if (!cancelled) await refreshAccountData();
      } catch {
        if (!cancelled) setAccountError('The isolated event account could not be loaded. Your saved trading data is unchanged.');
      }
    })();
    return () => { cancelled = true; };
  }, [currentWindow.id, refreshAccountData, store.enrollment, storeState]);

  useEffect(() => {
    if (!notificationsEnabled || Platform.OS === 'web') return;
    let cancelled = false;
    void (async () => {
      const Notifications = await import('expo-notifications');
      const permission = await Notifications.getPermissionsAsync();
      if (permission.granted && !cancelled) await scheduleUpcomingEventReminders();
    })().catch(() => {
      if (!cancelled) Alert.alert('Could not refresh event reminders', 'Try again from Event Arena.');
    });
    return () => { cancelled = true; };
  }, [notificationsEnabled]);

  const joinEvent = async () => {
    const event = getPaperChallengeWindow(Date.now());
    if (saving || storeState !== 'ready' || event.phase === 'ended' || store.enrollment) return;
    setSaving(true);
    const newEnrollment: PaperChallengeEnrollment = {
      eventId: event.id,
      eventStartAtMs: event.startAtMs,
      eventEndAtMs: event.endAtMs,
      joinedAtMs: event.phase === 'upcoming' ? event.startAtMs : Date.now(),
      accountId: `paper-event:${event.id}`,
      accountName: 'Event Portfolio',
      startEquity: event.phase === 'upcoming' ? null : PAPER_CHALLENGE_STARTING_BALANCE,
    };
    try {
      const updated = await updatePaperChallengeStore((current) => {
        if (event.phase === 'ended' || current.enrollment) return current;
        return { ...current, enrollment: newEnrollment };
      }, {
        getItem: (key) => AsyncStorage.getItem(key),
        setItem: (key, value) => AsyncStorage.setItem(key, value),
      });
      setStore(updated);
      if (updated.enrollment?.eventId === event.id) {
        setSection('competition');
      }
    } catch {
      Alert.alert('Could not join', 'Your event enrollment was not saved. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const withdrawUpcomingSignup = async () => {
    if (saving || storeState !== 'ready') return;
    const nowMs = Date.now();
    const updated = await updatePaperChallengeStore(
      (current) => withdrawUpcomingPaperChallenge(current, currentWindow.id, nowMs),
      {
        getItem: (key) => AsyncStorage.getItem(key),
        setItem: (key, value) => AsyncStorage.setItem(key, value),
      },
    );
    setStore(updated);
  };

  const confirmWithdraw = () => {
    Alert.alert(
      'Withdraw from this event?',
      'Your fresh event account will not be created when the event starts.',
      [
        { text: 'Keep signup', style: 'cancel' },
        {
          text: 'Withdraw',
          style: 'destructive',
          onPress: () => {
            setSaving(true);
            void withdrawUpcomingSignup()
              .catch(() => Alert.alert('Could not withdraw', 'Your event signup is unchanged. Please try again.'))
              .finally(() => setSaving(false));
          },
        },
      ],
    );
  };

  const updateLeaderboardEnrollment = useCallback((nextEnrollment: PaperChallengeEnrollment | null) => {
    setStore((current) => ({ ...current, enrollment: nextEnrollment }));
  }, []);

  const setEventNotifications = async (enabled: boolean) => {
    if (Platform.OS === 'web') {
      Alert.alert('Mobile notifications only', 'Enable event notifications from the mobile app.');
      return;
    }
    try {
      const Notifications = await import('expo-notifications');
      if (!enabled) {
        const ids = await readScheduledIds();
        await Promise.all(ids.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})));
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
      Alert.alert('Could not update notifications', 'Please try again from Event Arena.');
    }
  };

  const shareSummary = async (event: PaperChallengeSummary) => {
    const symbols = event.symbolsTraded?.length ? event.symbolsTraded.join(', ') : 'No trades';
    const milestones = getPaperChallengeMilestones(event, store.history);
    const text = [
      'Meisner Method · Event Arena Results',
      dateRange(event.eventStartAtMs, event.eventEndAtMs),
      `Starting balance: ${money(PAPER_CHALLENGE_STARTING_BALANCE)}`,
      `Ending balance: ${money(event.endEquity)}`,
      `Return: ${event.returnPercent >= 0 ? '+' : ''}${event.returnPercent.toFixed(2)}% (${money(event.netProfit)})`,
      `Trades: ${event.buyCount ?? 0} buys, ${event.sellCount ?? 0} sells`,
      `Realized P&L: ${money(event.realizedPnL)}`,
      `Symbols: ${symbols}`,
      ...(milestones.length > 0
        ? [`Milestones: ${milestones.join(', ')}`]
        : []),
    ].join('\n');
    try {
      await Share.share({ title: 'Event Arena Results', message: text });
    } catch {
      Alert.alert('Could not share', 'The device share sheet is unavailable right now.');
    }
  };

  const shareSummaryImage = async () => {
    const viewShot = imageRef.current;
    if (!viewShot || sharingImage || !imageShareEvent) return;
    setSharingImage(true);
    try {
      const uri = await viewShot.capture?.();
      if (!uri) throw new Error('The result card could not be rendered.');
      const Sharing = await import('expo-sharing');
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('Sharing unavailable', 'Your device cannot share an image right now.');
        return;
      }
      await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: 'Meisner Method Event Results' });
    } catch {
      Alert.alert('Could not share image', 'Please try again or share the text summary instead.');
    } finally {
      setSharingImage(false);
    }
  };

  const renderPastEvents = () => (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 28 }} showsVerticalScrollIndicator={false}>
      <View style={{ padding: 16, borderRadius: 18, backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }}>
        <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 20 }}>Your event history</Text>
        <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18, marginTop: 5 }}>
          Private results and archived trades saved on this device.
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
          {([
            { key: 'date' as const, label: 'Newest first' },
            { key: 'top' as const, label: 'Best returns' },
          ]).map((option) => (
            <TouchableOpacity
              key={option.key}
              accessibilityRole="button"
              accessibilityState={{ selected: sortMode === option.key }}
              onPress={() => setSortMode(option.key)}
              style={{ minHeight: 42, justifyContent: 'center', paddingHorizontal: 13, borderRadius: 12, backgroundColor: sortMode === option.key ? colors.primary : colors.background, borderWidth: 1, borderColor: sortMode === option.key ? colors.primary : colors.border }}
            >
              <Text style={{ color: sortMode === option.key ? colors.primaryForeground : colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      {sortedHistory.length === 0 ? (
        <View testID="event-arena-past-empty" style={{ alignItems: 'center', padding: 32 }}>
          <Feather name="archive" size={25} color={colors.mutedForeground} />
          <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 14, marginTop: 12 }}>No completed events yet</Text>
          <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12, textAlign: 'center', lineHeight: 18, marginTop: 5 }}>
            {storeState === 'error' ? 'Saved results are unavailable. Try refreshing the page.' : 'Events you join and their results will appear here.'}
          </Text>
          {storeState === 'error' && (
            <TouchableOpacity accessibilityRole="button" onPress={() => { void readStore(); }} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 14 }}>
              <Text style={{ color: colors.primary, fontFamily: 'Inter_700Bold', fontSize: 12 }}>RETRY</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : sortedHistory.map((event, index) => (
        <View key={event.eventId} testID={`event-arena-past-${event.eventId}`} style={{ marginTop: 12, padding: 15, borderRadius: 16, backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }}>
          <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 0.7 }}>
            {sortMode === 'top' ? `RANK #${index + 1} · ` : ''}{dateRange(event.eventStartAtMs, event.eventEndAtMs)}
          </Text>
          <Text style={{ color: event.netProfit >= 0 ? colors.buyColor : colors.sellColor, fontFamily: 'Inter_700Bold', fontSize: 22, marginTop: 7 }}>
            {event.netProfit >= 0 ? '+' : ''}{money(event.netProfit)}
          </Text>
          <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 12, marginTop: 4 }}>
            {money(event.endEquity)} ending equity · {event.returnPercent >= 0 ? '+' : ''}{event.returnPercent.toFixed(2)}%
          </Text>
          <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 4 }}>
            {event.buyCount ?? 0} buys · {event.sellCount ?? 0} sells · {event.tradeCount} completed trades
          </Text>
          <PaperChallengeMilestoneBadges milestones={getPaperChallengeMilestones(event, store.history)} compact />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 7 }}>
            <TouchableOpacity
              testID={`share-paper-event-${event.eventId}`}
              accessibilityRole="button"
              accessibilityLabel={`Share ${dateRange(event.eventStartAtMs, event.eventEndAtMs)} event summary`}
              onPress={() => { void shareSummary(event); }}
              style={{ minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' }}
            >
              <Feather name="share" size={17} color={colors.primary} />
            </TouchableOpacity>
            {Platform.OS !== 'web' && (
              <TouchableOpacity
                testID={`share-paper-event-image-${event.eventId}`}
                accessibilityRole="button"
                accessibilityLabel={`Preview ${dateRange(event.eventStartAtMs, event.eventEndAtMs)} event result image`}
                onPress={() => setImageShareEvent(event)}
                style={{ minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' }}
              >
                <Feather name="image" size={17} color={colors.primary} />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              testID={`toggle-paper-event-trades-${event.eventId}`}
              accessibilityRole="button"
              accessibilityState={{ expanded: expandedEventId === event.eventId }}
              accessibilityLabel={`${expandedEventId === event.eventId ? 'Hide' : 'View'} archived trades for ${dateRange(event.eventStartAtMs, event.eventEndAtMs)}`}
              onPress={() => setExpandedEventId((current) => current === event.eventId ? null : event.eventId)}
              style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 }}
            >
              <Text style={{ color: colors.primary, fontFamily: 'Inter_700Bold', fontSize: 11 }}>
                {expandedEventId === event.eventId ? 'HIDE' : 'VIEW'} TRADES ({event.transactions?.length ?? 0})
              </Text>
            </TouchableOpacity>
          </View>
          {expandedEventId === event.eventId && (
            <View testID={`paper-event-trades-${event.eventId}`} style={{ marginTop: 5, paddingHorizontal: 10, borderRadius: 12, backgroundColor: colors.background }}>
              {(event.transactions ?? []).length === 0 ? (
                <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12, paddingVertical: 12 }}>No transactions were recorded for this event.</Text>
              ) : [...(event.transactions ?? [])].sort((a, b) => Date.parse(b.date) - Date.parse(a.date)).map((transaction, transactionIndex) => {
                const net = (transaction.realizedPnL ?? 0) - (transaction.fee ?? 0);
                return (
                  <View key={transaction.id ?? `${transaction.date}-${transaction.symbol}-${transactionIndex}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                    <Text style={{ width: 48, color: transaction.action === 'BUY' ? colors.primary : transaction.action === 'SELL' ? colors.destructive : colors.mutedForeground, fontFamily: 'Inter_700Bold', fontSize: 9 }}>{transaction.action}</Text>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 11 }}>{transaction.symbol} · {transaction.shares ?? 0} shares</Text>
                      <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 2 }}>{new Date(transaction.date).toLocaleString()}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 10 }}>{money(transaction.total ?? 0)}</Text>
                      {transaction.action === 'SELL' && <Text style={{ color: net >= 0 ? colors.primary : colors.destructive, fontFamily: 'Inter_500Medium', fontSize: 9, marginTop: 2 }}>{net >= 0 ? '+' : ''}{money(net)}</Text>}
                    </View>
                  </View>
                );
              })}
            </View>
          )}
          <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 7 }}>
            Finalized {new Date(event.completedAtMs).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} using latest available quotes
          </Text>
        </View>
      ))}
    </ScrollView>
  );

  const renderTrades = () => {
    const eventAccountId = store.enrollment?.accountId;
    const eventPositions = eventAccountId
      ? accountData.positions.filter((item) => item.accountId === eventAccountId && item.shares > 0)
      : [];
    const eventTransactions = eventAccountId
      ? accountData.transactions
        .filter((item) => item.accountId === eventAccountId)
        .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
      : [];
    const eventOrders = eventAccountId
      ? accountData.orders
        .filter((item) => item.accountId === eventAccountId)
        .sort((a, b) => Date.parse(b.placedAt) - Date.parse(a.placedAt))
      : [];
    const openTrading = () => router.push('/paper');

    if (!store.enrollment) {
      return (
        <View testID="event-arena-trades-not-joined" style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 }}>
          <Feather name="activity" size={28} color={colors.mutedForeground} />
          <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 17, marginTop: 12 }}>No event account yet</Text>
          <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12, textAlign: 'center', lineHeight: 18, marginTop: 6 }}>Join the scheduled competition to see event-only positions, orders, and completed trades here.</Text>
        </View>
      );
    }

    return (
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 30 }} showsVerticalScrollIndicator={false}>
        <View style={{ padding: 16, borderRadius: 18, backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }}>
          <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 0.8 }}>ISOLATED EVENT ACCOUNT</Text>
          <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 20, marginTop: 5 }}>{store.enrollment.accountName}</Text>
          <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 4 }}>Only trades from {store.enrollment.eventId} are shown. Regular and strategy accounts are not included.</Text>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open Paper Trading for event trades" onPress={openTrading} style={{ minHeight: 46, marginTop: 14, borderRadius: 12, backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Feather name="trending-up" size={15} color={colors.primaryForeground} />
            <Text style={{ color: colors.primaryForeground, fontFamily: 'Inter_700Bold', fontSize: 12 }}>OPEN PAPER TRADING</Text>
          </TouchableOpacity>
        </View>
        {accountError ? <Text accessibilityRole="alert" style={{ color: colors.destructive, fontFamily: 'Inter_500Medium', fontSize: 12, marginTop: 12 }}>{accountError}</Text> : null}
        {accountLoading && <ActivityIndicator style={{ marginTop: 16 }} color={colors.primary} />}
        <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 16, marginTop: 20, marginBottom: 8 }}>Open positions</Text>
        {eventPositions.length === 0 ? (
          <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12, paddingVertical: 12 }}>No open event positions.</Text>
        ) : eventPositions.map((position) => (
          <View key={position.id} style={{ paddingVertical: 12, borderTopWidth: 1, borderColor: colors.border }}>
            <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 14 }}>{position.symbol} · {position.shares} shares</Text>
            <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 3 }}>Average cost {money(position.avgCost)} · position value {quotes[position.symbol] ? money(position.shares * quotes[position.symbol]!) : 'Quote unavailable'}</Text>
          </View>
        ))}
        <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 16, marginTop: 18, marginBottom: 8 }}>Pending orders</Text>
        {eventOrders.filter((order) => order.status === 'pending').length === 0 ? (
          <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12, paddingVertical: 12 }}>No pending event orders.</Text>
        ) : eventOrders.filter((order) => order.status === 'pending').map((order) => (
          <View key={order.id} style={{ paddingVertical: 11, borderTopWidth: 1, borderColor: colors.border }}>
            <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>{order.side.toUpperCase()} · {order.symbol} · {order.shares} shares</Text>
            <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 3 }}>{order.orderType.replace('_', ' ').toUpperCase()} · placed {new Date(order.placedAt).toLocaleString()}</Text>
          </View>
        ))}
        <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 16, marginTop: 18, marginBottom: 8 }}>Completed trades</Text>
        {eventTransactions.filter((transaction) => transaction.action === 'BUY' || transaction.action === 'SELL').length === 0 ? (
          <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12, paddingVertical: 12 }}>No completed event trades yet.</Text>
        ) : eventTransactions.filter((transaction) => transaction.action === 'BUY' || transaction.action === 'SELL').map((transaction) => (
          <View key={transaction.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderTopWidth: 1, borderColor: colors.border }}>
            <Text style={{ width: 42, color: transaction.action === 'BUY' ? colors.primary : colors.destructive, fontFamily: 'Inter_700Bold', fontSize: 10 }}>{transaction.action}</Text>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>{transaction.symbol} · {transaction.shares} shares</Text>
              <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 2 }}>{new Date(transaction.date).toLocaleString()} · {money(transaction.price)} per share</Text>
            </View>
            <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 11 }}>{money(transaction.total)}</Text>
          </View>
        ))}
      </ScrollView>
    );
  };

  const renderCompetition = () => (
    <View style={{ flex: 1 }}>
      <EventArenaOverview
        event={currentWindow}
        nowMs={now}
        enrollment={enrollment}
        participation={participation}
        countdown={countdown}
        performance={performance}
        rank={rank}
        loading={accountLoading || storeState === 'loading'}
        saving={saving}
        onJoin={() => { void joinEvent(); }}
        onWithdraw={confirmWithdraw}
        onRefresh={() => { void Promise.all([readStore(), refreshAccountData()]); }}
        onOpenTrades={() => setSection('trades')}
      />
      {storeState === 'error' && (
        <View style={{ paddingHorizontal: 18, paddingBottom: 10 }}>
          <Text style={{ color: colors.destructive, fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>Saved event history could not load. Joining and withdrawing are paused to protect your results.</Text>
          <TouchableOpacity testID="retry-paper-challenge-history" accessibilityRole="button" onPress={() => { void readStore(); }} style={{ minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center' }}>
            <Text style={{ color: colors.primary, fontFamily: 'Inter_700Bold', fontSize: 11 }}>RETRY</Text>
          </TouchableOpacity>
        </View>
      )}
      {accountError ? <Text accessibilityRole="alert" style={{ color: colors.destructive, fontFamily: 'Inter_500Medium', fontSize: 11, paddingHorizontal: 20, paddingBottom: 9 }}>{accountError}</Text> : null}
      <View style={{ marginHorizontal: 18, marginBottom: 14, paddingHorizontal: 14, minHeight: 64, borderWidth: 1, borderColor: colors.border, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.card }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>Event notifications</Text>
          <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 3 }}>Up to three reminders per event</Text>
        </View>
        <Switch
          testID="paper-event-notifications-toggle"
          accessibilityLabel="Event notifications"
          value={notificationsEnabled}
          onValueChange={(value) => { void setEventNotifications(value); }}
          trackColor={{ false: colors.muted, true: colors.primary }}
          thumbColor={colors.card}
        />
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: Platform.OS === 'web' ? 12 : insets.top }}>
      <View style={{ paddingHorizontal: 16, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <View style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 9 }}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Feather name="arrow-left" size={19} color={colors.foreground} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 18 }}>Event Arena</Text>
            <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 2 }}>Competition hub</Text>
          </View>
          <Text
            testID="event-arena-header-alias"
            accessibilityLabel={participantAlias ? `Competition alias ${participantAlias}` : 'Meisner Method'}
            numberOfLines={1}
            ellipsizeMode="tail"
            style={{ maxWidth: 140, minWidth: 0, flexShrink: 1, color: colors.primary, fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 0.6, textAlign: 'right' }}
          >
            {participantAlias || 'MEISNER'}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 4, paddingVertical: 7 }}>
          {SECTIONS.map((item) => {
            const selected = section === item.id;
            return (
              <TouchableOpacity
                key={item.id}
                testID={`event-arena-tab-${item.id}`}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                accessibilityLabel={item.label}
                onPress={() => setSection(item.id)}
                style={{ flex: 1, minWidth: 0, minHeight: 52, flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, paddingHorizontal: 2, borderRadius: 12, backgroundColor: selected ? colors.primary : colors.card, borderWidth: 1, borderColor: selected ? colors.primary : colors.border }}
              >
                <Feather name={item.icon} size={14} color={selected ? colors.primaryForeground : colors.mutedForeground} />
                <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: selected ? colors.primaryForeground : colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 8 }}>{item.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={{ flex: 1 }}>
        {section === 'competition' && renderCompetition()}
        {section === 'leaderboard' && (
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 30 }} showsVerticalScrollIndicator={false}>
            <PaperChallengeLeaderboard
              event={currentWindow}
              enrollment={enrollment}
              onEnrollmentChange={updateLeaderboardEnrollment}
              onRankChange={setRank}
            />
          </ScrollView>
        )}
        {section === 'trades' && renderTrades()}
        {section === 'past' && renderPastEvents()}
      </View>
      <BottomTabBar />

      <Modal visible={imageShareEvent !== null} animationType="slide" onRequestClose={() => setImageShareEvent(null)}>
        <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: Platform.OS === 'web' ? 24 : insets.top + 8 }}>
          <View style={{ paddingHorizontal: 18, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ flex: 1, color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 20 }}>Share result image</Text>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close image preview" onPress={() => setImageShareEvent(null)} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
              <Feather name="x" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
          {imageShareEvent && (
            <>
              <ScrollView contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 18 }}>
                <ViewShot ref={imageRef} options={{ format: 'png', quality: 1 }} style={{ width: '100%', maxWidth: 360 }}>
                  <PaperEventShareCard event={imageShareEvent} milestones={getPaperChallengeMilestones(imageShareEvent, store.history)} />
                </ViewShot>
              </ScrollView>
              <View style={{ paddingHorizontal: 18, paddingTop: 10, paddingBottom: Platform.OS === 'web' ? 24 : insets.bottom + 18 }}>
                <TouchableOpacity
                  testID="share-paper-event-image-confirm"
                  accessibilityRole="button"
                  disabled={sharingImage}
                  onPress={() => { void shareSummaryImage(); }}
                  style={{ minHeight: 50, borderRadius: 12, backgroundColor: sharingImage ? colors.muted : colors.primary, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text style={{ color: colors.primaryForeground, fontFamily: 'Inter_700Bold', fontSize: 14 }}>{sharingImage ? 'Preparing image…' : 'Share image'}</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </Modal>
    </View>
  );
}
