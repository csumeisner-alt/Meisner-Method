import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import {
  getGetEventArenaLeaderboardQueryKey,
  submitEventArenaScore,
  useGetEventArenaLeaderboard,
} from '@workspace/api-client-react';
import { getInstallationId } from '@/lib/installation';
import {
  calculateEventHoldingAllocationPercent,
  formatEventHoldingAllocation,
  formatEventHoldingSide,
  hasEventAverageCostFallback,
  type EventHoldingSide,
} from '@/lib/paperChallengeAllocation';
import {
  PAPER_CHALLENGE_STARTING_BALANCE,
  updatePaperChallengeStore,
  type PaperChallengeEnrollment,
} from '@/lib/paperChallenge';
import {
  getEventCashTransferImpact,
  type EventCashTransferImpact,
} from '@/lib/eventArenaTransfers';
import type { PaperAccount, PaperOrder, PaperPosition } from '@/lib/paperMath';
import {
  formatEventArenaMoney,
  formatEventArenaReturn,
  formatEventArenaSignedMoney,
  getEventArenaPodiumSlots,
  getEventArenaStatus,
} from '@/lib/eventArenaLeaderboard';

const BASE_URL = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;
const REFRESH_INTERVAL_MS = 120_000;
const LAST_SUBMISSION_KEY_PREFIX = '@stocksense/paper_event_leaderboard_last_submit:';
const AVERAGE_COST_FALLBACK_KEY_PREFIX = '@stocksense/paper_event_leaderboard_average_cost:';

type EventWindow = {
  id: string;
  startAtMs: number;
  endAtMs: number;
  phase: 'upcoming' | 'active' | 'ended';
};
type HoldingName = {
  symbol: string;
  companyName: string;
  allocationPercent: number | null;
  side: EventHoldingSide;
};
type LeaderboardEntry = {
  rank: number;
  alias: string;
  participantToken: string;
  startEquity: number;
  equity: number;
  profitLoss: number;
  returnPercent: number;
  tradeCount: number | null;
  holdings: HoldingName[];
  updatedAt: string;
  isCurrentUser: boolean;
};

type Props = {
  event: EventWindow;
  enrollment: PaperChallengeEnrollment | null;
  onEnrollmentChange: (enrollment: PaperChallengeEnrollment | null) => void;
  onRankChange?: (rank: number | null) => void;
  openOnMount?: boolean;
  embedded?: boolean;
  eventAccount?: PaperAccount | null;
  eventOrders?: PaperOrder[];
  eventPositions?: PaperPosition[];
  eventQuotes?: Record<string, number>;
  onCashTransfer?: (args: {
    recipientParticipantToken: string;
    amount: number;
    availableCash: number;
    idempotencyKey: string;
    cancelledOrderIds: string[];
  }) => Promise<void>;
};

const money = formatEventArenaMoney;
const signedMoney = formatEventArenaSignedMoney;
const returnLabel = formatEventArenaReturn;
const timeLabel = (value: string | null) => value
  ? new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  : 'Not updated yet';
const dateRangeLabel = (startAtMs: number, endAtMs: number) => {
  const start = new Date(startAtMs).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const end = new Date(endAtMs).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${start}–${end}`;
};

async function buildEventSubmission(enrollment: PaperChallengeEnrollment, event: EventWindow) {
  const raw = await AsyncStorage.getItem('@stocksense/paper_v2');
  const cache = raw ? JSON.parse(raw) as {
    accounts?: Array<{ id: string; cash: number; unsettledCash?: number }>;
    eventArenaAppliedTransferIds?: string[];
    positions?: Array<{
      accountId: string;
      symbol: string;
      companyName?: string;
      shares: number;
      avgCost: number;
    }>;
    transactions?: Array<{ accountId: string; date: string }>;
  } : {};
  const account = cache.accounts?.find((item) => item.id === enrollment.accountId);
  const positions = (cache.positions ?? []).filter((item) =>
    item.accountId === enrollment.accountId && Number.isFinite(item.shares) && item.shares > 0,
  );
  const shareablePositions = positions.slice(0, 100);
  const symbols = [...new Set(shareablePositions.map((position) => position.symbol.trim().toUpperCase()))];
  const quoteResults = await Promise.allSettled(symbols.map(async (symbol) => {
    const response = await fetch(`${BASE_URL}/api/stocks/quote/${encodeURIComponent(symbol)}`);
    if (!response.ok) throw new Error(`Quote unavailable for ${symbol}`);
    const data = await response.json();
    const price = Number(data.currentPrice);
    if (!Number.isFinite(price) || price <= 0) throw new Error(`Quote unavailable for ${symbol}`);
    return [symbol, price] as const;
  }));
  const quotes = new Map<string, number>();
  quoteResults.forEach((result) => {
    if (result.status === 'fulfilled') quotes.set(result.value[0], result.value[1]);
  });
  const startEquity = enrollment.startEquity ?? PAPER_CHALLENGE_STARTING_BALANCE;
  const equity = account
    ? Number(account.cash || 0)
      + Number(account.unsettledCash || 0)
      + positions.reduce((sum, position) => sum + position.shares * (quotes.get(position.symbol.toUpperCase()) ?? position.avgCost), 0)
    : PAPER_CHALLENGE_STARTING_BALANCE;
  const holdings = shareablePositions
    .map((position) => {
      const symbol = position.symbol.trim().toUpperCase();
      return {
        symbol,
        companyName: (position.companyName || position.symbol).trim().slice(0, 120),
        allocationPercent: calculateEventHoldingAllocationPercent(
          position.shares,
          quotes.get(symbol),
          equity,
        ),
        side: 'long' as const,
      };
    })
    .filter((holding, index, all) => holding.symbol && all.findIndex((candidate) => candidate.symbol === holding.symbol) === index)
    .slice(0, 100);
  const returnPercent = ((equity - startEquity) / startEquity) * 100;
  const transactions = Array.isArray(cache.transactions) ? cache.transactions : [];
  const tradeCount = transactions.filter((transaction) => {
    const date = typeof transaction.date === 'string' ? Date.parse(transaction.date) : Number.NaN;
    return transaction.accountId === enrollment.accountId
      && Number.isFinite(date)
      && date >= event.startAtMs
      && date <= event.endAtMs;
  }).length;
  if (!Number.isFinite(equity) || !Number.isFinite(startEquity) || !Number.isFinite(returnPercent)) {
    throw new Error('Your event score is unavailable. Open Paper Trading and try again.');
  }
  return {
    payload: {
      installationId: await getInstallationId(),
      alias: enrollment.leaderboardAlias?.trim() ?? '',
      startEquity,
      equity,
      returnPercent,
      tradeCount,
      holdings,
      eventStartAtMs: event.startAtMs,
      eventEndAtMs: event.endAtMs,
      cashBalance: account ? Number(account.cash || 0) : PAPER_CHALLENGE_STARTING_BALANCE,
      appliedTransferIds: Array.isArray(cache.eventArenaAppliedTransferIds)
        ? cache.eventArenaAppliedTransferIds.slice(-500)
        : [],
    },
    usesAverageCost: hasEventAverageCostFallback(
      positions.map((position) => position.symbol),
      new Set(quotes.keys()),
    ),
  };
}

export function PaperChallengeLeaderboard({
  event,
  enrollment,
  onEnrollmentChange,
  onRankChange,
  openOnMount = false,
  embedded = false,
  eventAccount = null,
  eventOrders = [],
  eventPositions = [],
  eventQuotes = {},
  onCashTransfer,
}: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  const [aliasEditorOpen, setAliasEditorOpen] = useState(false);
  const [sharingInfoOpen, setSharingInfoOpen] = useState(false);
  const [error, setError] = useState('');
  const [aliasDraft, setAliasDraft] = useState('');
  const [sharingBusy, setSharingBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [detail, setDetail] = useState<LeaderboardEntry | null>(null);
  const [cashTransferOpen, setCashTransferOpen] = useState(false);
  const [cashTransferAmount, setCashTransferAmount] = useState('');
  const [cashTransferError, setCashTransferError] = useState('');
  const [cashTransferReceipt, setCashTransferReceipt] = useState('');
  const [cancelledCashOrders, setCancelledCashOrders] = useState<PaperOrder[]>([]);
  const [cashTransferBusy, setCashTransferBusy] = useState(false);
  const [cashTransferRequestKey, setCashTransferRequestKey] = useState('');
  const [restoredTransfer, setRestoredTransfer] = useState<{
    idempotencyKey: string;
    recipientParticipantToken: string;
    amount: number;
    cancelledOrderIds: string[];
  } | null>(null);
  const [appIsActive, setAppIsActive] = useState(AppState.currentState === 'active');
  const refreshingRef = useRef(false);
  const enrollmentRef = useRef(enrollment);
  const averageCostFallbackSubmittedEventsRef = useRef(new Set<string>());
  const [installationId, setInstallationId] = useState<string | null>(null);
  const [installationIdReady, setInstallationIdReady] = useState(false);
  const [averageCostFallbackByEvent, setAverageCostFallbackByEvent] = useState<Record<string, boolean>>({});
  const [countdownNow, setCountdownNow] = useState(Date.now());
  const visible = embedded || open;
  const leaderboardQuery = useGetEventArenaLeaderboard(event.id, {
    request: installationId ? { headers: { 'X-Event-Arena-Installation-Id': installationId } } : undefined,
    query: {
      // The refresh effect below owns loading so opening the modal does not
      // trigger both React Query's automatic request and a manual refetch.
      enabled: false,
      queryKey: [...getGetEventArenaLeaderboardQueryKey(event.id), installationId ?? 'anonymous'],
      refetchOnWindowFocus: false,
    },
  });
  const entries = leaderboardQuery.data?.entries ?? [];
  const lastUpdated = leaderboardQuery.data?.updatedAt ?? null;
  const podiumSlots = useMemo(() => getEventArenaPodiumSlots(entries), [entries]);
  const eventStatus = getEventArenaStatus(event.startAtMs, event.endAtMs, countdownNow);
  const compactPodium = windowWidth <= 360;
  const loading = refreshing || (visible && !installationIdReady) || (leaderboardQuery.isLoading && entries.length === 0);
  const loadError = error || (leaderboardQuery.error ? 'The leaderboard could not be loaded. Please retry.' : '');
  const optedIn = enrollment?.eventId === event.id && enrollment.leaderboardOptedIn === true;
  const aliasLocked = Date.now() >= event.startAtMs;
  const canOptIn = enrollment?.eventId === event.id && event.phase !== 'ended';
  const matchingOwnEntries = useMemo(
    () => optedIn ? entries.filter((entry) => entry.isCurrentUser) : [],
    [entries, optedIn],
  );
  const ownEntry = matchingOwnEntries.length === 1 ? matchingOwnEntries[0] : null;
  const transferImpact: EventCashTransferImpact = getEventCashTransferImpact(
    eventAccount,
    eventOrders,
    eventPositions,
    Number(cashTransferAmount),
    eventQuotes,
  );
  const pendingOrderCount = eventOrders.filter((order) => order.status === 'pending').length;
  const canSendCash = event.phase === 'active'
    && optedIn
    && !!eventAccount
    && !!onCashTransfer
    && !!installationId;

  useEffect(() => {
    if (openOnMount && !embedded) setOpen(true);
  }, [embedded, openOnMount]);
  useEffect(() => { enrollmentRef.current = enrollment; }, [enrollment]);
  useEffect(() => {
    const timer = setInterval(() => setCountdownNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    let mounted = true;
    void getInstallationId()
      .then((id) => { if (mounted) setInstallationId(id); })
      .catch(() => { if (mounted) setInstallationId(null); })
      .finally(() => { if (mounted) setInstallationIdReady(true); });
    return () => { mounted = false; };
  }, []);
  useEffect(() => {
    let mounted = true;
    void AsyncStorage.getItem(`${AVERAGE_COST_FALLBACK_KEY_PREFIX}${event.id}`)
      .then((value) => {
        if (
          mounted
          && !averageCostFallbackSubmittedEventsRef.current.has(event.id)
          && (value === 'true' || value === 'false')
        ) {
          setAverageCostFallbackByEvent((current) => ({ ...current, [event.id]: value === 'true' }));
        }
      })
      .catch(() => {});
    return () => { mounted = false; };
  }, [event.id]);
  useEffect(() => {
    let mounted = true;
    void AsyncStorage.getItem(`@stocksense/event_arena_pending_transfer:${event.id}`)
      .then((value) => {
        if (!mounted || !value) return;
        try {
          const parsed = JSON.parse(value) as typeof restoredTransfer;
          if (
            parsed
            && typeof parsed.idempotencyKey === 'string'
            && typeof parsed.recipientParticipantToken === 'string'
            && Number.isFinite(parsed.amount)
            && Array.isArray(parsed.cancelledOrderIds)
          ) setRestoredTransfer(parsed);
        } catch {
          // A malformed retry record must not block a new transfer.
        }
      })
      .catch(() => {});
    return () => { mounted = false; };
  }, [event.id]);
  useEffect(() => {
    if (matchingOwnEntries.length !== 1) {
      onRankChange?.(null);
      return;
    }
    onRankChange?.(matchingOwnEntries[0]?.rank ?? null);
  }, [event.id, matchingOwnEntries, onRankChange]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => setAppIsActive(state === 'active'));
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    if (enrollment?.eventId === event.id) setAliasDraft(enrollment.leaderboardAlias ?? '');
    else setAliasDraft('');
  }, [enrollment?.eventId, enrollment?.leaderboardAlias, event.id]);

  const persistSharing = useCallback(async (alias: string, enabled: boolean) => {
    const updated = await updatePaperChallengeStore((current) => {
      if (current.enrollment?.eventId !== event.id) return current;
      return {
        ...current,
        enrollment: {
          ...current.enrollment,
          leaderboardAlias: alias,
          leaderboardOptedIn: enabled,
        },
      };
    }, {
      getItem: (key) => AsyncStorage.getItem(key),
      setItem: (key, value) => AsyncStorage.setItem(key, value),
    });
    onEnrollmentChange(updated.enrollment);
  }, [event.id, onEnrollmentChange]);

  const submitEntry = useCallback(async (targetEnrollment: PaperChallengeEnrollment, alias: string) => {
    const submission = await buildEventSubmission({ ...targetEnrollment, leaderboardAlias: alias }, event);
    await submitEventArenaScore(event.id, submission.payload);
    averageCostFallbackSubmittedEventsRef.current.add(event.id);
    setAverageCostFallbackByEvent((current) => ({ ...current, [event.id]: submission.usesAverageCost }));
    try {
      await AsyncStorage.setItem(
        `${AVERAGE_COST_FALLBACK_KEY_PREFIX}${event.id}`,
        String(submission.usesAverageCost),
      );
    } catch {
      // Keep the current indicator in memory even if its local persistence fails.
    }
    await AsyncStorage.setItem(`${LAST_SUBMISSION_KEY_PREFIX}${event.id}`, String(Date.now()));
  }, [event.id, event.startAtMs, event.endAtMs]);

  const refresh = useCallback(async () => {
    if (refreshingRef.current || !visible || !appIsActive || !installationIdReady) return;
    const targetEventId = event.id;
    refreshingRef.current = true;
    setRefreshing(true);
    setError('');
    try {
      const currentEnrollment = enrollmentRef.current;
      if (
        currentEnrollment?.eventId === targetEventId
        && currentEnrollment.leaderboardOptedIn
        && event.phase !== 'ended'
        && !sharingBusy
      ) {
        const rawLastSubmission = await AsyncStorage.getItem(`${LAST_SUBMISSION_KEY_PREFIX}${targetEventId}`);
        const lastSubmission = Number(rawLastSubmission || 0);
        if (!Number.isFinite(lastSubmission) || Date.now() - lastSubmission >= REFRESH_INTERVAL_MS) {
          try {
            await submitEntry(currentEnrollment, currentEnrollment.leaderboardAlias ?? '');
          } catch {
            setError('Your score could not be updated. It will retry when you refresh.');
          }
        }
      }
      await leaderboardQuery.refetch({ throwOnError: true });
    } catch {
      // The query error is shown with a generic retry message; keep its last successful data.
    } finally {
      setRefreshing(false);
      refreshingRef.current = false;
    }
  }, [appIsActive, event.id, event.phase, installationIdReady, leaderboardQuery.refetch, sharingBusy, submitEntry, visible]);

  useEffect(() => {
    if (!visible || !appIsActive || !installationIdReady) return;
    void refresh();
    const timer = setInterval(() => { void refresh(); }, REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [appIsActive, installationIdReady, refresh, visible]);
  const optIn = async () => {
    const currentEnrollment = enrollmentRef.current;
    const alias = aliasDraft.trim();
    if (
      sharingBusy
      || !currentEnrollment
      || currentEnrollment.eventId !== event.id
      || event.phase === 'ended'
      || alias.length < 1
      || alias.length > 24
    ) {
      setError('Choose an alias with 1–24 characters before opting in.');
      return;
    }
    setSharingBusy(true);
    setError('');
    let sharingSaved = false;
    try {
      await persistSharing(alias, true);
      sharingSaved = true;
      await AsyncStorage.removeItem(`${LAST_SUBMISSION_KEY_PREFIX}${event.id}`);
      await submitEntry(currentEnrollment, alias);
      await leaderboardQuery.refetch({ throwOnError: true });
    } catch {
      setError(sharingSaved
        ? 'Opt-in is saved on this device; your score will retry when the connection is available.'
        : 'Could not save opt-in on this device. Please retry.');
    } finally {
      setSharingBusy(false);
    }
  };

  const updateAlias = async () => {
    const currentEnrollment = enrollmentRef.current;
    const alias = aliasDraft.trim();
    if (!currentEnrollment || !optedIn || aliasLocked || alias.length < 1 || alias.length > 24 || sharingBusy) {
      setError('Choose an alias with 1–24 characters before the event starts.');
      return;
    }
    setSharingBusy(true);
    setError('');
    let aliasSaved = false;
    try {
      await persistSharing(alias, true);
      aliasSaved = true;
      await AsyncStorage.removeItem(`${LAST_SUBMISSION_KEY_PREFIX}${event.id}`);
      await submitEntry(currentEnrollment, alias);
      await leaderboardQuery.refetch({ throwOnError: true });
    } catch {
      setError(aliasSaved
        ? 'Your alias is saved on this device; the leaderboard will retry the update.'
        : 'Could not save your alias on this device. Please retry.');
    } finally {
      setSharingBusy(false);
    }
  };

  const saveAliasFromEditor = async () => {
    const currentEnrollment = enrollmentRef.current;
    const alias = aliasDraft.trim();
    if (
      !currentEnrollment
      || currentEnrollment.eventId !== event.id
      || aliasLocked
      || alias.length < 1
      || alias.length > 24
      || sharingBusy
    ) return;

    if (currentEnrollment.leaderboardOptedIn) {
      await updateAlias();
      setAliasEditorOpen(false);
      return;
    }

    setSharingBusy(true);
    setError('');
    try {
      const updated = await updatePaperChallengeStore((current) => {
        if (current.enrollment?.eventId !== event.id) return current;
        return {
          ...current,
          enrollment: {
            ...current.enrollment,
            leaderboardAlias: alias,
            leaderboardOptedIn: false,
          },
        };
      }, {
        getItem: (key) => AsyncStorage.getItem(key),
        setItem: (key, value) => AsyncStorage.setItem(key, value),
      });
      onEnrollmentChange(updated.enrollment);
      setAliasEditorOpen(false);
    } catch {
      setError('Could not save your alias on this device. Please retry.');
    } finally {
      setSharingBusy(false);
    }
  };

  const optOut = async () => {
    const currentEnrollment = enrollmentRef.current;
    if (!currentEnrollment || sharingBusy) return;
    setSharingBusy(true);
    setError('');
    try {
      const installationId = await getInstallationId();
      const response = await fetch(
        `${BASE_URL}/api/event-arena/${encodeURIComponent(event.id)}/leaderboard?installationId=${encodeURIComponent(installationId)}`,
        { method: 'DELETE' },
      );
      if (!response.ok) throw new Error();
      await persistSharing(currentEnrollment.leaderboardAlias ?? '', false);
      await AsyncStorage.removeItem(`${LAST_SUBMISSION_KEY_PREFIX}${event.id}`);
      await leaderboardQuery.refetch({ throwOnError: true });
    } catch {
      setError('Could not opt out right now. Please retry.');
    } finally {
      setSharingBusy(false);
    }
  };

  const renderEntry = (entry: LeaderboardEntry) => (
    <TouchableOpacity
      key={`${entry.rank}-${entry.alias}`}
      testID={`event-leaderboard-entry-${entry.rank}`}
      accessibilityRole="button"
      accessibilityLabel={`Rank ${entry.rank}, ${entry.alias}${entry.isCurrentUser ? ', your score' : ''}, account value ${money(entry.equity)}, profit or loss ${signedMoney(entry.profitLoss)}, ${returnLabel(entry.returnPercent)} return, ${entry.tradeCount == null ? 'trade count unavailable' : `${entry.tradeCount} trades`}. View public score summary.`}
      onPress={() => setDetail(entry)}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingVertical: 12,
        paddingHorizontal: entry.isCurrentUser ? 9 : 0,
        marginVertical: entry.isCurrentUser ? 3 : 0,
        borderBottomWidth: 1,
        borderWidth: entry.isCurrentUser ? 1 : 0,
        borderColor: entry.isCurrentUser ? colors.goldMuted : colors.border,
        borderRadius: entry.isCurrentUser ? 10 : 0,
        backgroundColor: entry.isCurrentUser ? colors.card : 'transparent',
      }}
    >
      <Text style={{
        width: 34,
        color: colors.mutedForeground,
        fontFamily: 'Inter_700Bold',
        fontSize: 14,
      }}>#{entry.rank}</Text>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ flexShrink: 1, color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 13 }} numberOfLines={1}>
            {entry.alias}
          </Text>
          {entry.isCurrentUser && (
            <Text style={{ color: colors.gold, fontFamily: 'Inter_700Bold', fontSize: 8 }}>YOU</Text>
          )}
        </View>
        <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 3 }}>
          {money(entry.equity)} account value
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', maxWidth: '42%', minWidth: 0 }}>
        <Text adjustsFontSizeToFit numberOfLines={1} style={{ color: entry.returnPercent >= 0 ? colors.primary : colors.destructive, fontFamily: 'Inter_700Bold', fontSize: 13 }}>
          {returnLabel(entry.returnPercent)}
        </Text>
        <Text adjustsFontSizeToFit numberOfLines={1} style={{ color: entry.profitLoss >= 0 ? colors.primary : colors.destructive, fontFamily: 'Inter_600SemiBold', fontSize: 10, marginTop: 3 }}>
          {signedMoney(entry.profitLoss)}
        </Text>
        <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 9, marginTop: 2 }}>
          {entry.tradeCount == null ? 'Trades unavailable' : `${entry.tradeCount} trades`}
        </Text>
      </View>
    </TouchableOpacity>
  );

  const renderPodiumCard = (slot: (typeof podiumSlots)[number]) => {
    const entry = slot.entry;
    const medal = slot.rank === 1
      ? { label: 'CHAMPION', color: '#D8B45A', height: compactPodium ? 202 : 218 }
      : slot.rank === 2
        ? { label: 'RUNNER-UP', color: '#AEB9C6', height: compactPodium ? 176 : 188 }
        : { label: 'THIRD PLACE', color: '#C68762', height: compactPodium ? 164 : 176 };
    return (
      <TouchableOpacity
        key={slot.rank}
        testID={`paper-event-podium-${slot.rank}`}
        accessibilityRole={entry ? 'button' : 'text'}
        accessibilityLabel={entry
          ? `Rank ${slot.rank}, ${entry.alias}, ${returnLabel(entry.returnPercent)} return, profit or loss ${signedMoney(entry.profitLoss)}, account value ${money(entry.equity)}`
          : `Rank ${slot.rank}, waiting for competitor`}
        disabled={!entry}
        onPress={() => { if (entry) setDetail(entry as LeaderboardEntry); }}
        style={{
          flex: 1,
          minWidth: 0,
          height: medal.height,
          justifyContent: 'flex-end',
          alignItems: 'center',
          paddingHorizontal: compactPodium ? 5 : 8,
          paddingTop: 10,
          paddingBottom: compactPodium ? 9 : 11,
          borderTopLeftRadius: 14,
          borderTopRightRadius: 14,
          borderBottomLeftRadius: 10,
          borderBottomRightRadius: 10,
          borderWidth: 1,
          borderColor: entry ? `${medal.color}88` : colors.border,
          backgroundColor: entry ? `${medal.color}12` : colors.card,
          opacity: entry ? 1 : 0.78,
        }}
      >
        {entry ? (
          <>
            <View style={{
              width: compactPodium ? 25 : 29,
              height: compactPodium ? 25 : 29,
              borderRadius: 16,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: `${medal.color}24`,
              marginBottom: 5,
            }}>
              <Feather name="award" size={compactPodium ? 14 : 16} color={medal.color} />
            </View>
            <Text style={{ color: medal.color, fontFamily: 'Inter_700Bold', fontSize: compactPodium ? 7 : 8, letterSpacing: 0.4 }}>
              {medal.label}
            </Text>
            <Text numberOfLines={1} adjustsFontSizeToFit style={{ maxWidth: '100%', color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: compactPodium ? 11 : 12, marginTop: 5 }}>
              {entry.alias}
            </Text>
            <Text numberOfLines={1} adjustsFontSizeToFit style={{ maxWidth: '100%', color: entry.returnPercent >= 0 ? colors.primary : colors.destructive, fontFamily: 'Inter_700Bold', fontSize: compactPodium ? 13 : 15, marginTop: 6 }}>
              {returnLabel(entry.returnPercent)}
            </Text>
            <Text numberOfLines={1} adjustsFontSizeToFit style={{ maxWidth: '100%', color: entry.profitLoss >= 0 ? colors.primary : colors.destructive, fontFamily: 'Inter_600SemiBold', fontSize: compactPodium ? 9 : 10, marginTop: 4 }}>
              {signedMoney(entry.profitLoss)}
            </Text>
            <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: compactPodium ? 8 : 9, marginTop: 5 }}>
              ACCOUNT VALUE
            </Text>
            <Text numberOfLines={1} adjustsFontSizeToFit style={{ maxWidth: '100%', color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: compactPodium ? 9 : 10, marginTop: 2 }}>
              {money(entry.equity)}
            </Text>
          </>
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', width: '100%' }}>
            <Text style={{ color: medal.color, fontFamily: 'Inter_700Bold', fontSize: compactPodium ? 11 : 12 }}>#{slot.rank}</Text>
            <Feather name="user-plus" size={compactPodium ? 14 : 16} color={colors.mutedForeground} style={{ marginTop: 8, marginBottom: 6 }} />
            <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold', fontSize: compactPodium ? 8 : 9, textAlign: 'center' }}>
              Waiting for competitor
            </Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const openCashTransfer = () => {
    if (!detail || !canSendCash || detail.isCurrentUser) return;
    setCashTransferError('');
    setCashTransferReceipt('');
    setCancelledCashOrders([]);
    const retry = restoredTransfer?.recipientParticipantToken === detail.participantToken
      ? restoredTransfer
      : null;
    setCashTransferRequestKey(retry?.idempotencyKey ?? '');
    setCashTransferAmount(retry ? String(retry.amount) : '');
    setCashTransferOpen(true);
  };

  const confirmCashTransfer = async () => {
    if (!detail || !canSendCash || cashTransferBusy || !installationId) return;
    const amount = Math.round(Number(cashTransferAmount) * 100) / 100;
    if (!Number.isFinite(amount) || amount < 0.01 || amount > (eventAccount?.cash ?? 0)) {
      setCashTransferError('Enter an amount up to your current Event Arena cash.');
      return;
    }
    const retry = restoredTransfer?.recipientParticipantToken === detail.participantToken
      && Math.abs(restoredTransfer.amount - amount) < 0.001
      ? restoredTransfer
      : null;
    const idempotencyKey = retry?.idempotencyKey
      ?? cashTransferRequestKey
      ?? `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}`;
    const cancelledOrderIds = retry?.cancelledOrderIds
      ?? transferImpact.cancelledOrders.map((order) => order.id);
    const request = {
      idempotencyKey,
      recipientParticipantToken: detail.participantToken,
      amount,
      cancelledOrderIds,
    };
    setCashTransferError('');
    setCashTransferBusy(true);
    try {
      await AsyncStorage.setItem(`@stocksense/event_arena_pending_transfer:${event.id}`, JSON.stringify(request));
      setCashTransferRequestKey(idempotencyKey);
      setRestoredTransfer(request);
      await onCashTransfer?.({
        recipientParticipantToken: detail.participantToken,
        amount,
        availableCash: eventAccount?.cash ?? 0,
        idempotencyKey,
        cancelledOrderIds,
      });
      setCashTransferReceipt(`Sent ${money(amount)} to ${detail.alias}.`);
      setCancelledCashOrders(transferImpact.cancelledOrders);
      await AsyncStorage.removeItem(`@stocksense/event_arena_pending_transfer:${event.id}`);
      setRestoredTransfer(null);
      setCashTransferOpen(false);
      setCashTransferAmount('');
      setCashTransferRequestKey('');
    } catch (error) {
      setCashTransferError(error instanceof Error ? error.message : 'Cash was not confirmed. Retry this transfer.');
    } finally {
      setCashTransferBusy(false);
    }
  };

  const PageWrapper: React.ComponentType<any> = embedded ? View : Modal;
  const pageWrapperProps = embedded
    ? { style: { flex: 1 } }
    : {
        visible: open,
        animationType: 'slide' as const,
        onRequestClose: () => { setOpen(false); setDetail(null); },
      };

  return (
    <>
      {!embedded && <View style={{ marginTop: 12, padding: 14, borderRadius: 12, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Feather name="users" size={17} color={colors.primary} />
          <Text style={{ flex: 1, color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 14 }}>
            Live Event Leaderboard
          </Text>
          <Text style={{ color: colors.destructive, fontFamily: 'Inter_700Bold', fontSize: 9 }}>UNVERIFIED</Text>
        </View>
        <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 16, marginTop: 5 }}>
          Compare self-reported scores from opted-in participants. Results are not independently verified.
        </Text>
        <TouchableOpacity
          testID="open-paper-event-leaderboard"
          accessibilityRole="button"
          onPress={() => {
            setDetail(null);
            setOpen(true);
          }}
          style={{ marginTop: 11, paddingVertical: 10, borderRadius: 9, backgroundColor: colors.primary, alignItems: 'center' }}
        >
          <Text style={{ color: colors.primaryForeground, fontFamily: 'Inter_700Bold', fontSize: 11 }}>OPEN LEADERBOARD</Text>
        </TouchableOpacity>
      </View>}

      <PageWrapper {...pageWrapperProps}>
        <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: embedded ? 0 : Platform.OS === 'web' ? 24 : insets.top + 8 }}>
          <View style={{ paddingHorizontal: 18, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {detail && (
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back to leaderboard" onPress={() => setDetail(null)} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                <Feather name="arrow-left" size={20} color={colors.primary} />
              </TouchableOpacity>
            )}
            <Text allowFontScaling style={{ flex: 1, minWidth: 0, color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 20 }}>
              {detail ? 'Participant score' : 'Event leaderboard'}
            </Text>
            {!detail && enrollment?.eventId === event.id && (
              <>
                <TouchableOpacity
                  testID="open-paper-event-sharing-info"
                  accessibilityRole="button"
                  accessibilityLabel="Leaderboard sharing information and settings"
                  onPress={() => { setError(''); setSharingInfoOpen(true); }}
                  style={{ width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 19, borderWidth: 1, borderColor: colors.border }}
                >
                  <Feather name="info" size={17} color={colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity
                  testID="edit-paper-event-leaderboard-alias"
                  accessibilityRole="button"
                  accessibilityLabel={aliasLocked ? 'Event alias locked' : 'Change event alias'}
                  accessibilityState={{ disabled: aliasLocked }}
                  disabled={aliasLocked}
                  onPress={() => {
                    setAliasDraft(enrollment.leaderboardAlias ?? '');
                    setAliasEditorOpen(true);
                  }}
                  style={{ minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, borderRadius: 9, borderWidth: 1, borderColor: aliasLocked ? colors.border : colors.gold, opacity: aliasLocked ? 0.55 : 1 }}
                >
                  <Feather name={aliasLocked ? 'lock' : 'edit-2'} size={12} color={aliasLocked ? colors.mutedForeground : colors.gold} />
                  <Text style={{ color: aliasLocked ? colors.mutedForeground : colors.gold, fontFamily: 'Inter_700Bold', fontSize: 9 }}>
                    {aliasLocked ? 'LOCKED' : 'EDIT NAME'}
                  </Text>
                </TouchableOpacity>
              </>
            )}
            {!detail && (
              <TouchableOpacity
                testID="refresh-paper-event-leaderboard"
                accessibilityRole="button"
                accessibilityLabel="Refresh event leaderboard"
                onPress={() => { void refresh(); }}
                style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
              >
                <Feather name="refresh-cw" size={18} color={colors.primary} />
              </TouchableOpacity>
            )}
            {!embedded && (
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close leaderboard" onPress={() => { setOpen(false); setDetail(null); }} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                <Feather name="x" size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
            )}
          </View>

          {detail ? (
            <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: Platform.OS === 'web' ? 24 : insets.bottom + 18 }}>
              <View testID="paper-event-leaderboard-detail" style={{ padding: 16, borderRadius: 14, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
                <Text style={{ color: colors.primary, fontFamily: 'Inter_700Bold', fontSize: 11 }}>RANK #{detail.rank}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 5 }}>
                  <Text style={{ flexShrink: 1, color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 22 }}>{detail.alias}</Text>
                  {detail.isCurrentUser && <Text style={{ color: colors.gold, fontFamily: 'Inter_700Bold', fontSize: 9 }}>YOU</Text>}
                </View>
                <Text style={{ color: detail.returnPercent >= 0 ? colors.primary : colors.destructive, fontFamily: 'Inter_700Bold', fontSize: 20, marginTop: 12 }}>
                  {returnLabel(detail.returnPercent)} event return
                </Text>
                <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 14, marginTop: 5 }}>
                  Reported event value · {money(detail.equity)}
                </Text>
                <Text style={{ color: detail.profitLoss >= 0 ? colors.primary : colors.destructive, fontFamily: 'Inter_600SemiBold', fontSize: 13, marginTop: 5 }}>
                  Dollar profit/loss · {signedMoney(detail.profitLoss)}
                </Text>
                <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 5 }}>
                  Trades · {detail.tradeCount == null ? 'Not available' : detail.tradeCount}
                </Text>
                <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 5 }}>
                  Last updated {timeLabel(detail.updatedAt)}
                </Text>
                <View style={{ borderTopWidth: 1, borderTopColor: colors.border, marginTop: 16, paddingTop: 12 }}>
                  <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 13 }}>Current holdings</Text>
                  <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 10, lineHeight: 15, marginTop: 4 }}>
                    Self-reported allocation is absolute market exposure as a percentage of reported event account equity.
                  </Text>
                  {detail.holdings.length === 0 ? (
                    <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 8 }}>No current holdings reported.</Text>
                  ) : detail.holdings.map((holding) => (
                    <View key={holding.symbol} style={{ paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ color: colors.primary, fontFamily: 'Inter_700Bold', fontSize: 12 }}>{holding.symbol}</Text>
                        <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 2 }}>{holding.companyName}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 11 }}>
                          {formatEventHoldingAllocation(holding.allocationPercent)}
                        </Text>
                        <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold', fontSize: 10, marginTop: 2 }}>
                          {formatEventHoldingSide(holding.side)}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
                {canSendCash && !detail.isCurrentUser ? (
                  <TouchableOpacity
                    testID="event-arena-send-cash"
                    accessibilityRole="button"
                    accessibilityLabel={`Send event cash to ${detail.alias}`}
                    onPress={openCashTransfer}
                    disabled={!!restoredTransfer && restoredTransfer.recipientParticipantToken !== detail.participantToken}
                    style={{ minHeight: 48, marginTop: 14, borderRadius: 11, backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: restoredTransfer && restoredTransfer.recipientParticipantToken !== detail.participantToken ? 0.5 : 1 }}
                  >
                    <Feather name="send" size={15} color={colors.primaryForeground} />
                    <Text style={{ color: colors.primaryForeground, fontFamily: 'Inter_700Bold', fontSize: 12 }}>SEND CASH</Text>
                  </TouchableOpacity>
                ) : null}
                {cashTransferReceipt ? (
                  <View testID="event-arena-cash-transfer-success" style={{ marginTop: 10, padding: 12, borderRadius: 10, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.primary }}>
                    <Text style={{ color: colors.primary, fontFamily: 'Inter_700Bold', fontSize: 11 }}>{cashTransferReceipt}</Text>
                    {cancelledCashOrders.length > 0 ? (
                      <>
                        <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 10, marginTop: 6 }}>Cancelled to restore order affordability:</Text>
                        {cancelledCashOrders.map((order) => (
                          <Text key={order.id} style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 3 }}>
                            {order.intent === 'short' ? 'Short' : order.intent === 'cover' ? 'Cover' : order.side.toUpperCase()} {order.symbol}
                          </Text>
                        ))}
                      </>
                    ) : (
                      <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 5 }}>No pending cash-reserving orders were cancelled.</Text>
                    )}
                  </View>
                ) : null}
                <Text style={{ color: colors.destructive, fontFamily: 'Inter_600SemiBold', fontSize: 10, lineHeight: 15, marginTop: 12 }}>
                  Self-reported and unverified. Raw share counts, prices, cost basis, account identifiers, and trade history are not shared.
                </Text>
              </View>
            </ScrollView>
          ) : (
            <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: Platform.OS === 'web' ? 24 : insets.bottom + 18 }}>
              <View testID="paper-event-leaderboard-current-event" style={{ marginBottom: 17, padding: 13, borderRadius: 13, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
                <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium', fontSize: 10 }}>
                  EVENT ARENA · {dateRangeLabel(event.startAtMs, event.endAtMs)}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7, marginTop: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 5, paddingHorizontal: 8, borderRadius: 20, backgroundColor: `${eventStatus.phase === 'active' ? colors.primary : colors.gold}18` }}>
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: eventStatus.phase === 'active' ? colors.primary : colors.gold }} />
                    <Text style={{ color: eventStatus.phase === 'active' ? colors.primary : colors.gold, fontFamily: 'Inter_700Bold', fontSize: 9 }}>
                      {eventStatus.label}
                    </Text>
                  </View>
                  <Text testID="paper-event-leaderboard-participant-count" style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 10 }}>
                    {entries.length} {entries.length === 1 ? 'participant' : 'participants'}
                  </Text>
                  <Text testID="paper-event-leaderboard-countdown" style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 10 }}>
                    {eventStatus.countdown}
                  </Text>
                </View>
                <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 8 }}>
                  Last successful update: {timeLabel(lastUpdated)}
                </Text>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7, marginBottom: 4 }}>
                <Text style={{ flex: 1, minWidth: 90, color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 17 }}>Championship standings</Text>
                <Text style={{ color: colors.destructive, fontFamily: 'Inter_700Bold', fontSize: 9 }}>SELF-REPORTED · UNVERIFIED</Text>
              </View>
              <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 16, marginBottom: 12 }}>
                Scores and event values are reported by participants and are not independently checked.
              </Text>
              {loading && entries.length === 0 ? (
                <View style={{ alignItems: 'center', padding: 24 }}>
                  <ActivityIndicator color={colors.primary} />
                  <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 8 }}>Loading leaderboard…</Text>
                </View>
              ) : loadError && entries.length === 0 ? (
                <View style={{ padding: 14, borderRadius: 10, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.destructive }}>
                  <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>{loadError}</Text>
                  <TouchableOpacity testID="retry-paper-event-leaderboard" accessibilityRole="button" onPress={() => { void refresh(); }} style={{ alignSelf: 'flex-start', paddingVertical: 8 }}>
                    <Text style={{ color: colors.primary, fontFamily: 'Inter_700Bold', fontSize: 11 }}>RETRY</Text>
                  </TouchableOpacity>
                </View>
              ) : entries.length === 0 ? (
                <>
                  <View testID="paper-event-leaderboard-empty" style={{ alignItems: 'center', paddingVertical: 12 }}>
                    <Feather name="users" size={22} color={colors.mutedForeground} />
                    <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12, paddingTop: 9, textAlign: 'center' }}>
                      No participants have opted in for this event yet.
                    </Text>
                    <TouchableOpacity testID="refresh-empty-paper-event-leaderboard" accessibilityRole="button" onPress={() => { void refresh(); }} style={{ paddingVertical: 8, paddingHorizontal: 12, marginTop: 4 }}>
                      <Text style={{ color: colors.primary, fontFamily: 'Inter_700Bold', fontSize: 10 }}>REFRESH</Text>
                    </TouchableOpacity>
                  </View>
                  <View testID="paper-event-leaderboard-podium" style={{ marginTop: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 13 }}>Podium</Text>
                      <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium', fontSize: 9 }}>TOP THREE</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: compactPodium ? 5 : 8 }}>
                      {[2, 1, 3].map((rank) => {
                        const slot = podiumSlots.find((item) => item.rank === rank);
                        return slot ? renderPodiumCard(slot) : null;
                      })}
                    </View>
                  </View>
                </>
              ) : (
                <>
                  <View testID="paper-event-leaderboard-podium" style={{ marginTop: 2 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 13 }}>Podium</Text>
                      <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium', fontSize: 9 }}>TOP THREE</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: compactPodium ? 5 : 8 }}>
                      {[2, 1, 3].map((rank) => {
                        const slot = podiumSlots.find((item) => item.rank === rank);
                        return slot ? renderPodiumCard(slot) : null;
                      })}
                    </View>
                  </View>
                  {ownEntry && (
                    <View
                      testID="paper-event-leaderboard-your-position"
                      style={{
                        padding: 14,
                        marginTop: 15,
                        marginBottom: 13,
                        borderRadius: 13,
                        borderWidth: 1,
                        borderColor: ownEntry.rank <= 3 ? (ownEntry.rank === 1 ? '#D8B45A' : ownEntry.rank === 2 ? '#AEB9C6' : '#C68762') : colors.goldMuted,
                        backgroundColor: colors.card,
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Feather name="award" size={16} color={ownEntry.rank === 1 ? '#D8B45A' : ownEntry.rank === 2 ? '#AEB9C6' : ownEntry.rank === 3 ? '#C68762' : colors.gold} />
                        <Text style={{ color: colors.gold, fontFamily: 'Inter_700Bold', fontSize: 10 }}>YOUR POSITION</Text>
                        {ownEntry.rank <= 3 && (
                          <Text style={{ marginLeft: 'auto', color: ownEntry.rank === 1 ? '#D8B45A' : ownEntry.rank === 2 ? '#AEB9C6' : '#C68762', fontFamily: 'Inter_700Bold', fontSize: 9 }}>
                            {ownEntry.rank === 1 ? 'GOLD' : ownEntry.rank === 2 ? 'SILVER' : 'BRONZE'}
                          </Text>
                        )}
                      </View>
                      <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 17, marginTop: 6 }}>
                        Rank #{ownEntry.rank} · {ownEntry.alias}
                      </Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 10 }}>
                        {[
                          { label: 'RETURN', value: returnLabel(ownEntry.returnPercent), color: ownEntry.returnPercent >= 0 ? colors.primary : colors.destructive },
                          { label: 'PROFIT / LOSS', value: signedMoney(ownEntry.profitLoss), color: ownEntry.profitLoss >= 0 ? colors.primary : colors.destructive },
                          { label: 'ACCOUNT VALUE', value: money(ownEntry.equity), color: colors.foreground },
                        ].map((metric) => (
                          <View key={metric.label} style={{ flexGrow: 1, flexBasis: 85, minWidth: 0, padding: 8, borderRadius: 9, backgroundColor: colors.background }}>
                            <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold', fontSize: 8 }}>{metric.label}</Text>
                            <Text adjustsFontSizeToFit numberOfLines={1} style={{ color: metric.color, fontFamily: 'Inter_700Bold', fontSize: 12, marginTop: 4 }}>{metric.value}</Text>
                          </View>
                        ))}
                      </View>
                      {averageCostFallbackByEvent[event.id] && (
                        <Text
                          testID="paper-event-average-cost-fallback"
                          accessibilityRole="text"
                          style={{ color: colors.gold, fontFamily: 'Inter_600SemiBold', fontSize: 10, lineHeight: 15, marginTop: 8 }}
                        >
                          A market quote was unavailable for one or more holdings, so average cost was used for those positions in your score.
                        </Text>
                      )}
                    </View>
                  )}
                  {entries.some((entry) => entry.rank > 3) && (
                    <View testID="paper-event-leaderboard-list" style={{ marginTop: 4 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                        <Text style={{ flex: 1, color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 14 }}>Standings</Text>
                        <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium', fontSize: 9 }}>
                          {entries.filter((entry) => entry.rank > 3).length} MORE
                        </Text>
                      </View>
                      <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 10, lineHeight: 15, marginBottom: 4 }}>
                        Participants ranked below the podium
                      </Text>
                      {entries.filter((entry) => entry.rank > 3).map((entry) => renderEntry(entry as LeaderboardEntry))}
                    </View>
                  )}
                </>
              )}
              {loadError && entries.length > 0 && (
                <View testID="paper-event-leaderboard-stale" style={{ marginTop: 9, padding: 10, borderRadius: 9, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.goldMuted }}>
                  <Text style={{ color: colors.gold, fontFamily: 'Inter_700Bold', fontSize: 10 }}>
                    {leaderboardQuery.error ? 'Refresh failed · showing the last successful rankings' : loadError}
                  </Text>
                  {leaderboardQuery.error && (
                    <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 3 }}>
                      Last successful update: {timeLabel(lastUpdated)}
                    </Text>
                  )}
                  <TouchableOpacity testID="retry-paper-event-leaderboard" accessibilityRole="button" onPress={() => { void refresh(); }} style={{ alignSelf: 'flex-start', paddingVertical: 7 }}>
                    <Text style={{ color: colors.primary, fontFamily: 'Inter_700Bold', fontSize: 10 }}>RETRY</Text>
                  </TouchableOpacity>
                </View>
              )}
              <Text testID="paper-event-leaderboard-last-updated" style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 10 }}>
                Last successful update: {timeLabel(lastUpdated)}
              </Text>
            </ScrollView>
          )}
        </View>
      </PageWrapper>

      <Modal visible={cashTransferOpen} animationType="fade" transparent statusBarTranslucent onRequestClose={() => {
        if (!cashTransferBusy) setCashTransferOpen(false);
      }}>
        <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={0} style={{ flex: 1, justifyContent: 'center', padding: 20, backgroundColor: 'rgba(0,0,0,0.62)' }}>
          <View testID="event-arena-send-cash-review" style={{ maxHeight: '90%', padding: 18, borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={{ color: colors.primary, fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 0.8 }}>EVENT ARENA · {event.id}</Text>
              <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 20, marginTop: 7 }}>Send cash to {detail?.alias}</Text>
              <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18, marginTop: 6 }}>
                Transfer from this event account only. Current event cash: {money(eventAccount?.cash ?? 0)}.
              </Text>
              <TextInput
                testID="event-arena-send-cash-amount"
                accessibilityLabel="Cash transfer amount"
                value={cashTransferAmount}
                onChangeText={(value) => {
                  setCashTransferAmount(value.replace(/[^0-9.]/g, ''));
                  setCashTransferError('');
                }}
                editable={!cashTransferBusy && restoredTransfer?.recipientParticipantToken !== detail?.participantToken}
                keyboardType="decimal-pad"
                returnKeyType="done"
                placeholder="Amount in dollars"
                placeholderTextColor={colors.mutedForeground}
                style={{ minHeight: 50, marginTop: 14, paddingHorizontal: 13, borderRadius: 10, color: colors.foreground, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, fontFamily: 'Inter_600SemiBold', fontSize: 17 }}
              />
              {restoredTransfer && restoredTransfer.recipientParticipantToken !== detail?.participantToken ? (
                <Text style={{ color: colors.gold, fontFamily: 'Inter_500Medium', fontSize: 11, lineHeight: 16, marginTop: 8 }}>
                  Retry the previously confirmed request with its original participant before starting another transfer.
                </Text>
              ) : null}
              {pendingOrderCount > 0 ? (
                <Text testID="event-arena-pending-order-warning" style={{ color: colors.gold, fontFamily: 'Inter_500Medium', fontSize: 11, lineHeight: 17, marginTop: 11 }}>
                  You have {pendingOrderCount} pending order{pendingOrderCount === 1 ? '' : 's'}. You can continue. If this transfer leaves too little cash for reserved orders, the newest affected orders will be cancelled.
                </Text>
              ) : null}
              {transferImpact.cancelledOrders.length > 0 ? (
                <View testID="event-arena-cash-transfer-order-impact" style={{ marginTop: 12, padding: 12, borderRadius: 10, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.destructive }}>
                  <Text style={{ color: colors.destructive, fontFamily: 'Inter_700Bold', fontSize: 11 }}>
                    Confirming will cancel {transferImpact.cancelledOrders.length} order{transferImpact.cancelledOrders.length === 1 ? '' : 's'} to cover the remaining reservations:
                  </Text>
                  {transferImpact.cancelledOrders.map((order) => (
                    <Text key={order.id} style={{ color: colors.foreground, fontFamily: 'Inter_500Medium', fontSize: 11, marginTop: 5 }}>
                      {order.intent === 'short' ? 'Short' : order.intent === 'cover' ? 'Cover' : order.side.toUpperCase()} {order.symbol} · placed {new Date(order.placedAt).toLocaleString()}
                    </Text>
                  ))}
                </View>
              ) : null}
              <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 10, lineHeight: 15, marginTop: 10 }}>
                Regular and strategy account balances, positions, orders, and history are not changed.
              </Text>
              {cashTransferError ? (
                <Text testID="event-arena-send-cash-error" accessibilityRole="alert" style={{ color: colors.destructive, fontFamily: 'Inter_500Medium', fontSize: 11, lineHeight: 16, marginTop: 9 }}>
                  {cashTransferError}
                </Text>
              ) : null}
              <View style={{ flexDirection: 'row', gap: 9, marginTop: 15 }}>
                <TouchableOpacity
                  testID="event-arena-send-cash-cancel"
                  accessibilityRole="button"
                  disabled={cashTransferBusy}
                  onPress={() => setCashTransferOpen(false)}
                  style={{ flex: 1, minHeight: 48, justifyContent: 'center', alignItems: 'center', borderRadius: 10, borderWidth: 1, borderColor: colors.border, opacity: cashTransferBusy ? 0.55 : 1 }}
                >
                  <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  testID="event-arena-send-cash-confirm"
                  accessibilityRole="button"
                  disabled={cashTransferBusy || !Number.isFinite(Number(cashTransferAmount)) || Number(cashTransferAmount) < 0.01 || Number(cashTransferAmount) > (eventAccount?.cash ?? 0)}
                  onPress={() => { void confirmCashTransfer(); }}
                  style={{ flex: 1, minHeight: 48, justifyContent: 'center', alignItems: 'center', borderRadius: 10, backgroundColor: colors.primary, opacity: cashTransferBusy || Number(cashTransferAmount) < 0.01 || Number(cashTransferAmount) > (eventAccount?.cash ?? 0) ? 0.55 : 1 }}
                >
                  <Text style={{ color: colors.primaryForeground, fontFamily: 'Inter_700Bold', fontSize: 12 }}>{cashTransferBusy ? 'SENDING…' : `SEND ${money(Number(cashTransferAmount) || 0)}`}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={aliasEditorOpen} animationType="fade" transparent statusBarTranslucent onRequestClose={() => setAliasEditorOpen(false)}>
        <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={0} style={{ flex: 1, justifyContent: 'center', padding: 20, backgroundColor: 'rgba(0,0,0,0.62)' }}>
          <View style={{ padding: 20, borderRadius: 18, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ color: colors.primary, fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 0.8 }}>EVENT ARENA</Text>
            <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 20, marginTop: 7 }}>Change your alias</Text>
            <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18, marginTop: 6 }}>
              {optedIn
                ? 'Your new alias will appear on this event’s leaderboard. It locks when the event starts.'
                : 'Sharing is off. You can turn it back on from the info button beside Edit Name.'}
            </Text>
            <TextInput
              testID="paper-event-leaderboard-alias"
              accessibilityLabel="Leaderboard alias"
              value={aliasDraft}
              onChangeText={setAliasDraft}
              editable={!sharingBusy}
              maxLength={24}
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={() => { void saveAliasFromEditor(); }}
              placeholder="Choose an alias"
              placeholderTextColor={colors.mutedForeground}
              style={{ minHeight: 48, marginTop: 16, paddingHorizontal: 13, borderRadius: 10, color: colors.foreground, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, fontFamily: 'Inter_400Regular', fontSize: 16 }}
            />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <TouchableOpacity
                testID="cancel-paper-event-alias"
                accessibilityRole="button"
                disabled={sharingBusy}
                onPress={() => setAliasEditorOpen(false)}
                style={{ flex: 1, minHeight: 48, justifyContent: 'center', alignItems: 'center', borderRadius: 10, borderWidth: 1, borderColor: colors.border, opacity: sharingBusy ? 0.6 : 1 }}
              >
                <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="save-paper-event-leaderboard-alias"
                accessibilityRole="button"
                disabled={sharingBusy || aliasDraft.trim().length < 1}
                onPress={() => { void saveAliasFromEditor(); }}
                style={{ flex: 1, minHeight: 48, justifyContent: 'center', alignItems: 'center', borderRadius: 10, backgroundColor: sharingBusy || aliasDraft.trim().length < 1 ? colors.muted : colors.primary }}
              >
                <Text style={{ color: colors.primaryForeground, fontFamily: 'Inter_700Bold', fontSize: 12 }}>
                  {sharingBusy ? 'Saving…' : 'Save alias'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      <Modal visible={sharingInfoOpen} animationType="fade" transparent statusBarTranslucent onRequestClose={() => setSharingInfoOpen(false)}>
        <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={0} style={{ flex: 1, justifyContent: 'center', padding: 20, backgroundColor: 'rgba(0,0,0,0.62)' }}>
          <View testID="paper-event-leaderboard-sharing-info" style={{ maxHeight: '90%', padding: 18, borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={{ color: colors.primary, fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 0.8 }}>EVENT ARENA PRIVACY</Text>
              <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 20, marginTop: 7 }}>Leaderboard sharing</Text>
              <Text style={{ color: optedIn ? colors.primary : colors.mutedForeground, fontFamily: 'Inter_700Bold', fontSize: 13, marginTop: 10 }}>
                {optedIn ? 'Sharing is on' : 'Sharing is off'}
              </Text>
              <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18, marginTop: 7 }}>
                When sharing is on, other event participants can see your alias, self-reported score, and each current holding’s ticker and company name, estimated allocation percentage of your reported Event Arena equity, and Long or Short direction.
              </Text>
              <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18, marginTop: 7 }}>
                Raw share counts, prices, cost basis, account identifiers, regular accounts, and trade history are never shared. Scores are self-reported and not independently verified.
              </Text>
              <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 16, marginTop: 7 }}>
                Public scores and holding details are removed 30 days after the event ends. Your local event history stays on this device. Turning sharing off removes your score and holdings from the leaderboard; your alias remains locked for this event.
              </Text>
              <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 12, marginTop: 10 }}>
                Your event alias · {aliasDraft.trim() || 'Not set'}
              </Text>
              {error ? <Text accessibilityRole="alert" style={{ color: colors.destructive, fontFamily: 'Inter_500Medium', fontSize: 11, lineHeight: 16, marginTop: 8 }}>{error}</Text> : null}
              {optedIn ? (
                <TouchableOpacity
                  testID="opt-out-paper-event-leaderboard"
                  accessibilityRole="button"
                  disabled={sharingBusy}
                  onPress={() => { void optOut(); }}
                  style={{ minHeight: 48, marginTop: 14, borderRadius: 10, borderWidth: 1, borderColor: colors.destructive, alignItems: 'center', justifyContent: 'center', opacity: sharingBusy ? 0.6 : 1 }}
                >
                  <Text style={{ color: colors.destructive, fontFamily: 'Inter_700Bold', fontSize: 12 }}>
                    {sharingBusy ? 'TURNING OFF…' : 'TURN OFF SHARING'}
                  </Text>
                </TouchableOpacity>
              ) : canOptIn ? (
                <TouchableOpacity
                  testID="opt-in-paper-event-leaderboard"
                  accessibilityRole="button"
                  disabled={sharingBusy || aliasDraft.trim().length < 1}
                  onPress={() => { void optIn(); }}
                  style={{ minHeight: 48, marginTop: 14, borderRadius: 10, backgroundColor: sharingBusy || aliasDraft.trim().length < 1 ? colors.muted : colors.primary, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text style={{ color: colors.primaryForeground, fontFamily: 'Inter_700Bold', fontSize: 12 }}>
                    {sharingBusy ? 'TURNING ON…' : 'TURN ON SHARING'}
                  </Text>
                </TouchableOpacity>
              ) : (
                <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 16, marginTop: 12 }}>
                  Sharing cannot be turned on after this event has ended.
                </Text>
              )}
              <TouchableOpacity
                accessibilityRole="button"
                onPress={() => setSharingInfoOpen(false)}
                style={{ minHeight: 46, marginTop: 8, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>Close</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}
