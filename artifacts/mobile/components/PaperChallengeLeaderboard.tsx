import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  AppState,
  ImageBackground,
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
import { LinearGradient } from 'expo-linear-gradient';
import { useColors } from '@/hooks/useColors';
import { useReduceMotion } from '@/hooks/useReduceMotion';
import {
  getEventArenaLeaderboardHistory,
  getGetEventArenaLeaderboardQueryKey,
  submitEventArenaScore,
  useGetEventArenaLeaderboard,
} from '@workspace/api-client-react';
import type { EventArenaLeaderboardHistoryResponseSnapshotsItem } from '@workspace/api-client-react';
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
  getEventArenaOwnEntry,
  getEventArenaPodiumSlots,
  getEventArenaStandingsEntries,
  getEventArenaStatus,
} from '@/lib/eventArenaLeaderboard';
import {
  getEventArenaHistoryDisplayPoints,
  getEventArenaCompetitiveChanges,
  getEventArenaNextRankReturnGap,
  getEventArenaWindowProgress,
} from '@/lib/eventArenaCompetitiveProgress';

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
  const reduceMotion = useReduceMotion();
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
  const [eventHistory, setEventHistory] = useState<EventArenaLeaderboardHistoryResponseSnapshotsItem[]>([]);
  const [eventHistoryEventId, setEventHistoryEventId] = useState<string | null>(null);
  const [eventHistoryError, setEventHistoryError] = useState(false);
  const [eventHistoryLoading, setEventHistoryLoading] = useState(false);
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
  const [rankComparison, setRankComparison] = useState<{
    eventId: string;
    previousEntries: LeaderboardEntry[] | null;
    updateAt: number;
  } | null>(null);
  const lastSuccessfulResponseRef = useRef<{
    eventId: string;
    updateAt: number;
    entries: LeaderboardEntry[];
  } | null>(null);
  const rankAnimationsRef = useRef(new Map<string, Animated.Value>());
  const eventHistoryRequestRef = useRef(0);
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
  const eventProgress = getEventArenaWindowProgress(event.startAtMs, event.endAtMs, countdownNow);
  const activeParticipantTokens = new Set(entries.map((entry) => entry.participantToken));
  for (const participantToken of rankAnimationsRef.current.keys()) {
    if (!activeParticipantTokens.has(participantToken)) rankAnimationsRef.current.delete(participantToken);
  }
  for (const entry of entries) {
    if (!rankAnimationsRef.current.has(entry.participantToken)) {
      rankAnimationsRef.current.set(entry.participantToken, new Animated.Value(1));
    }
  }
  const competitiveChanges = useMemo(
    () => rankComparison?.eventId === event.id
      ? getEventArenaCompetitiveChanges(rankComparison.previousEntries, entries)
      : new Map(),
    [entries, event.id, rankComparison],
  );
  const compactPodium = windowWidth <= 360;
  const widePodium = windowWidth >= 520;
  const loading = refreshing || (visible && !installationIdReady) || (leaderboardQuery.isLoading && entries.length === 0);
  const loadError = error || (leaderboardQuery.error ? 'The leaderboard could not be loaded. Please retry.' : '');
  const optedIn = enrollment?.eventId === event.id && enrollment.leaderboardOptedIn === true;
  const aliasLocked = Date.now() >= event.startAtMs;
  const canOptIn = enrollment?.eventId === event.id && event.phase !== 'ended';
  const matchingOwnEntries = useMemo(
    () => optedIn ? entries.filter((entry) => entry.isCurrentUser) : [],
    [entries, optedIn],
  );
  const ownEntry = useMemo(() => getEventArenaOwnEntry(entries, optedIn), [entries, optedIn]);
  const displayedEventHistory = useMemo(
    () => getEventArenaHistoryDisplayPoints(eventHistory),
    [eventHistory],
  );
  const loadEventHistory = useCallback(async (enabled = optedIn) => {
    const requestId = ++eventHistoryRequestRef.current;
    if (!enabled || !installationId) {
      setEventHistory([]);
      setEventHistoryEventId(event.id);
      setEventHistoryError(false);
      setEventHistoryLoading(false);
      return;
    }
    setEventHistoryLoading(true);
    setEventHistoryError(false);
    try {
      const response = await getEventArenaLeaderboardHistory(event.id, {
        headers: { 'X-Event-Arena-Installation-Id': installationId },
      });
      if (requestId !== eventHistoryRequestRef.current) return;
      setEventHistory(response.snapshots);
      setEventHistoryEventId(event.id);
    } catch {
      if (requestId !== eventHistoryRequestRef.current) return;
      setEventHistory([]);
      setEventHistoryError(true);
      setEventHistoryEventId(event.id);
    } finally {
      if (requestId === eventHistoryRequestRef.current) setEventHistoryLoading(false);
    }
  }, [event.id, installationId, optedIn]);
  const standingsEntries = useMemo(() => getEventArenaStandingsEntries(entries), [entries]);
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
    if (!leaderboardQuery.data || leaderboardQuery.dataUpdatedAt <= 0) return;
    const updateAt = leaderboardQuery.dataUpdatedAt;
    const lastResponse = lastSuccessfulResponseRef.current;
    if (lastResponse?.eventId === event.id && lastResponse.updateAt === updateAt) return;
    const currentEntries = leaderboardQuery.data.entries ?? [];
    setRankComparison({
      eventId: event.id,
      previousEntries: lastResponse?.eventId === event.id ? lastResponse.entries : null,
      updateAt,
    });
    lastSuccessfulResponseRef.current = { eventId: event.id, updateAt, entries: currentEntries };
  }, [event.id, leaderboardQuery.data, leaderboardQuery.dataUpdatedAt]);
  useEffect(() => {
    if (reduceMotion || rankComparison?.eventId !== event.id) return;
    for (const [participantToken, change] of competitiveChanges) {
      if (change.placesMoved === 0) continue;
      let animation = rankAnimationsRef.current.get(participantToken);
      if (!animation) {
        animation = new Animated.Value(1);
        rankAnimationsRef.current.set(participantToken, animation);
      }
      animation.stopAnimation();
      animation.setValue(0.84);
      Animated.timing(animation, {
        toValue: 1,
        duration: 240,
        useNativeDriver: Platform.OS !== 'web',
      }).start();
    }
    const champion = entries.find((entry) => entry.rank === 1);
    const previousChampion = rankComparison.previousEntries?.find((entry) => entry.rank === 1);
    if (champion && previousChampion && previousChampion.participantToken !== champion.participantToken) {
      let animation = rankAnimationsRef.current.get(champion.participantToken);
      if (!animation) {
        animation = new Animated.Value(1);
        rankAnimationsRef.current.set(champion.participantToken, animation);
      }
      animation.stopAnimation();
      animation.setValue(0.84);
      Animated.timing(animation, {
        toValue: 1,
        duration: 320,
        useNativeDriver: Platform.OS !== 'web',
      }).start();
    }
  }, [competitiveChanges, entries, event.id, rankComparison, reduceMotion]);
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
      await loadEventHistory(currentEnrollment?.leaderboardOptedIn === true);
    } catch {
      // The query error is shown with a generic retry message; keep its last successful data.
    } finally {
      setRefreshing(false);
      refreshingRef.current = false;
    }
  }, [appIsActive, event.id, event.phase, installationIdReady, leaderboardQuery.refetch, loadEventHistory, sharingBusy, submitEntry, visible]);

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
      await loadEventHistory(true);
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
      await loadEventHistory(true);
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
      await loadEventHistory(false);
      await leaderboardQuery.refetch({ throwOnError: true });
    } catch {
      setError('Could not opt out right now. Please retry.');
    } finally {
      setSharingBusy(false);
    }
  };

  const renderEntry = (entry: LeaderboardEntry) => {
    const change = competitiveChanges.get(entry.participantToken);
    const placesMoved = change?.placesMoved ?? 0;
    const progressAnnouncement = change && placesMoved !== 0
      ? `Self-reported rank movement ${placesMoved > 0 ? 'up' : 'down'} ${Math.abs(placesMoved)} ${Math.abs(placesMoved) === 1 ? 'place' : 'places'}.`
      : '';
    return (
    <Animated.View
      key={`${entry.rank}-${entry.alias}`}
      style={{
        opacity: reduceMotion ? 1 : rankAnimationsRef.current.get(entry.participantToken) ?? 1,
        borderBottomWidth: 1,
        borderWidth: entry.isCurrentUser ? 1 : 0,
        borderColor: entry.isCurrentUser ? colors.gold : colors.border,
        borderRadius: entry.isCurrentUser ? 10 : 0,
        backgroundColor: entry.isCurrentUser ? `${colors.gold}10` : 'transparent',
        marginVertical: entry.isCurrentUser ? 3 : 0,
      }}
    >
      <TouchableOpacity
        testID={`event-leaderboard-entry-${entry.rank}`}
        accessibilityRole="button"
        accessibilityLabel={`Rank ${entry.rank}, ${entry.alias}${entry.isCurrentUser ? ', your score' : ''}, account value ${money(entry.equity)}, profit or loss ${signedMoney(entry.profitLoss)}, ${returnLabel(entry.returnPercent)} return, ${entry.tradeCount == null ? 'trade count unavailable' : `${entry.tradeCount} trades`}.${progressAnnouncement ? ` ${progressAnnouncement}.` : ''} View public score summary.`}
        onPress={() => setDetail(entry)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          minHeight: 68,
          paddingVertical: 10,
          paddingHorizontal: entry.isCurrentUser ? 10 : 2,
        }}
      >
        <Text allowFontScaling adjustsFontSizeToFit minimumFontScale={0.7} numberOfLines={1} style={{
            width: 42,
            color: colors.mutedForeground,
            fontFamily: 'Inter_700Bold',
            fontSize: 17,
          }}>#{entry.rank}</Text>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text allowFontScaling adjustsFontSizeToFit minimumFontScale={0.7} style={{ flexShrink: 1, minWidth: 0, color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 16 }} numberOfLines={1}>
              {entry.alias}
            </Text>
            {entry.isCurrentUser && (
              <Text style={{ color: colors.gold, fontFamily: 'Inter_700Bold', fontSize: 9 }}>YOU</Text>
            )}
          </View>
          {entry.isCurrentUser && entry.rank > 1 && (() => {
            const returnGap = getEventArenaNextRankReturnGap(entry, entries);
            return returnGap === null ? null : (
              <Text testID="paper-event-next-rank-gap" style={{ color: colors.gold, fontFamily: 'Inter_500Medium', fontSize: 10, marginTop: 3 }}>
                {returnGap.toFixed(2)} percentage points to rank #{entry.rank - 1}
              </Text>
            );
          })()}
          {change && placesMoved !== 0 && (
            <Text style={{ color: placesMoved > 0 ? colors.primary : colors.destructive, fontFamily: 'Inter_600SemiBold', fontSize: 10, marginTop: 3 }}>
              {placesMoved > 0 ? '↑' : '↓'} {Math.abs(placesMoved)} {Math.abs(placesMoved) === 1 ? 'place' : 'places'}
            </Text>
          )}
        </View>
        <View style={{ alignItems: 'flex-end', maxWidth: '38%', minWidth: 0 }}>
          <Text allowFontScaling adjustsFontSizeToFit minimumFontScale={0.7} numberOfLines={1} style={{ color: entry.returnPercent >= 0 ? colors.primary : colors.destructive, fontFamily: 'Inter_700Bold', fontSize: 16 }}>
            {returnLabel(entry.returnPercent)}
          </Text>
          <Text allowFontScaling adjustsFontSizeToFit minimumFontScale={0.7} numberOfLines={1} style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 9, marginTop: 3 }}>
            {money(entry.equity)} value
          </Text>
          <Text allowFontScaling adjustsFontSizeToFit minimumFontScale={0.7} numberOfLines={1} style={{ color: entry.profitLoss >= 0 ? colors.primary : colors.destructive, fontFamily: 'Inter_500Medium', fontSize: 9, marginTop: 2 }}>
            {signedMoney(entry.profitLoss)} P/L
          </Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
    );
  };

  const renderPodiumCard = (slot: (typeof podiumSlots)[number]) => {
    const entry = slot.entry;
    const change = entry ? competitiveChanges.get(entry.participantToken) : undefined;
    const placesMoved = change?.placesMoved ?? 0;
    const medal = slot.rank === 1
      ? { label: 'CHAMPION', color: '#D8B45A' }
      : slot.rank === 2
        ? { label: 'RUNNER-UP', color: '#AEB9C6' }
        : { label: 'THIRD PLACE', color: '#C68762' };
    const isChampion = slot.rank === 1;
    return (
      <Animated.View
        key={slot.rank}
        style={{
          width: isChampion && !widePodium ? '100%' : undefined,
          flex: widePodium ? isChampion ? 1.25 : 1 : isChampion ? undefined : 1,
          minWidth: 0,
          opacity: !entry || reduceMotion ? 1 : rankAnimationsRef.current.get(entry.participantToken) ?? 1,
        }}
      >
         <TouchableOpacity
          testID={`paper-event-podium-${slot.rank}`}
          accessibilityRole={entry ? 'button' : 'text'}
          accessibilityLabel={entry
            ? `Rank ${slot.rank}, ${entry.alias}${entry.isCurrentUser ? ', your score' : ''}, ${returnLabel(entry.returnPercent)} return, profit or loss ${signedMoney(entry.profitLoss)}, account value ${money(entry.equity)}.${change && placesMoved !== 0 ? ` Self-reported rank movement ${placesMoved > 0 ? 'up' : 'down'} ${Math.abs(placesMoved)} ${Math.abs(placesMoved) === 1 ? 'place' : 'places'}.` : ''}`
            : `Rank ${slot.rank}, waiting for competitor`}
          disabled={!entry}
          onPress={() => { if (entry) setDetail(entry as LeaderboardEntry); }}
          style={{
             minHeight: entry ? (isChampion ? compactPodium ? 190 : 212 : compactPodium ? 138 : 154) : 82,
            justifyContent: 'center',
            alignItems: 'center',
            paddingHorizontal: isChampion ? 14 : compactPodium ? 7 : 10,
            paddingVertical: isChampion ? 14 : 11,
             borderRadius: isChampion ? 22 : 16,
            borderWidth: entry?.isCurrentUser ? 2 : 1,
            borderColor: entry?.isCurrentUser ? colors.gold : entry ? `${medal.color}88` : colors.border,
             backgroundColor: entry?.isCurrentUser ? 'rgba(26,23,15,0.96)' : entry ? 'rgba(13,19,29,0.94)' : 'rgba(12,18,27,0.78)',
             shadowColor: isChampion ? colors.gold : '#000',
             shadowOpacity: isChampion ? 0.22 : 0.12,
             shadowRadius: isChampion ? 16 : 8,
             shadowOffset: { width: 0, height: 6 },
             elevation: isChampion ? 5 : 2,
          }}
        >
          {entry ? (
            <>
               {isChampion ? (
                 <View accessible={false} style={{ width: compactPodium ? 68 : 84, height: compactPodium ? 68 : 84, alignItems: 'center', justifyContent: 'center', marginBottom: 2 }}>
                   <View style={{ position: 'absolute', width: '100%', height: '100%', borderRadius: 42, borderWidth: 1, borderColor: `${medal.color}66`, backgroundColor: 'rgba(216,180,90,0.08)' }} />
                   <View style={{ position: 'absolute', top: compactPodium ? 18 : 25, left: compactPodium ? 11 : 17, width: 18, height: 19, borderLeftWidth: 3, borderTopWidth: 3, borderBottomWidth: 3, borderColor: medal.color, borderTopLeftRadius: 10, borderBottomLeftRadius: 10 }} />
                   <View style={{ position: 'absolute', top: compactPodium ? 18 : 25, right: compactPodium ? 11 : 17, width: 18, height: 19, borderRightWidth: 3, borderTopWidth: 3, borderBottomWidth: 3, borderColor: medal.color, borderTopRightRadius: 10, borderBottomRightRadius: 10 }} />
                   <View style={{ width: compactPodium ? 36 : 42, height: compactPodium ? 26 : 30, marginTop: 4, alignItems: 'center', justifyContent: 'center', borderRadius: 5, borderBottomLeftRadius: 18, borderBottomRightRadius: 18, backgroundColor: medal.color }}>
                     <Feather name="star" size={compactPodium ? 13 : 16} color="#3A2C12" />
                   </View>
                   <View style={{ width: 6, height: 8, backgroundColor: medal.color }} />
                   <View style={{ width: 28, height: 5, borderRadius: 3, backgroundColor: medal.color }} />
                   <View style={{ width: 36, height: 5, borderRadius: 3, backgroundColor: medal.color, marginTop: 2 }} />
                 </View>
               ) : <Feather name="award" size={23} color={medal.color} />}
              <Text allowFontScaling adjustsFontSizeToFit minimumFontScale={0.7} numberOfLines={1} style={{ color: medal.color, fontFamily: 'Inter_700Bold', fontSize: isChampion ? 13 : 14, letterSpacing: 0.4, marginTop: isChampion ? 6 : 4 }}>
                #{slot.rank}
              </Text>
              <Text allowFontScaling style={{ color: medal.color, fontFamily: 'Inter_700Bold', fontSize: isChampion ? 10 : 8, letterSpacing: 0.7, marginTop: 2 }}>
                {medal.label}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, maxWidth: '100%', marginTop: isChampion ? 7 : 5 }}>
                <Text allowFontScaling numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ flexShrink: 1, minWidth: 0, maxWidth: '100%', color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: isChampion ? compactPodium ? 20 : 23 : compactPodium ? 14 : 16 }}>
                  {entry.alias}
                </Text>
                {entry.isCurrentUser && <Text style={{ color: colors.gold, fontFamily: 'Inter_700Bold', fontSize: 9 }}>YOU</Text>}
              </View>
              <Text allowFontScaling numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ maxWidth: '100%', color: entry.returnPercent >= 0 ? colors.primary : colors.destructive, fontFamily: 'Inter_700Bold', fontSize: isChampion ? compactPodium ? 27 : 31 : compactPodium ? 18 : 21, marginTop: isChampion ? 6 : 4 }}>
                {returnLabel(entry.returnPercent)}
              </Text>
               <Text allowFontScaling numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ maxWidth: '100%', color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: isChampion ? 12 : 10, marginTop: 4 }}>
                 {money(entry.equity)} account value
               </Text>
              <Text allowFontScaling numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ maxWidth: '100%', color: entry.profitLoss >= 0 ? colors.primary : colors.destructive, fontFamily: 'Inter_500Medium', fontSize: 9, marginTop: 2 }}>
                 {signedMoney(entry.profitLoss)} reported P/L
               </Text>
              {change && placesMoved !== 0 && (
                <Text style={{ color: placesMoved > 0 ? colors.primary : colors.destructive, fontFamily: 'Inter_600SemiBold', fontSize: 9, marginTop: 4 }}>
                  {placesMoved > 0 ? '↑' : '↓'} {Math.abs(placesMoved)} {Math.abs(placesMoved) === 1 ? 'place' : 'places'}
                </Text>
              )}
            </>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
              <Text style={{ color: medal.color, fontFamily: 'Inter_700Bold', fontSize: 12 }}>#{slot.rank}</Text>
              <Feather name="user-plus" size={13} color={colors.mutedForeground} />
              <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold', fontSize: 10 }}>
                Compete for {slot.rank === 1 ? 'first' : slot.rank === 2 ? 'second' : 'third'}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </Animated.View>
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
            <ScrollView contentContainerStyle={{ width: '100%', maxWidth: 1000, alignSelf: 'center', padding: 16, paddingBottom: Platform.OS === 'web' ? 28 : insets.bottom + 22 }}>
              <ImageBackground
                source={require('../assets/event-arena-stadium.jpg')}
                resizeMode="cover"
                imageStyle={{ borderRadius: 24, opacity: 0.77 }}
                style={{ overflow: 'hidden', borderRadius: 24, borderWidth: 1, borderColor: 'rgba(214,177,94,0.34)', marginBottom: 17, padding: compactPodium ? 12 : 17, backgroundColor: '#101720' }}
              >
                <View style={{ pointerEvents: 'none', position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(7,12,20,0.49)' }} />
                <LinearGradient
                  colors={['rgba(24,101,148,0.13)', 'rgba(8,14,24,0.02)', 'rgba(18,133,137,0.12)']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{ pointerEvents: 'none', position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                />
                <View testID="paper-event-leaderboard-current-event" style={{ marginBottom: 16, padding: 12, borderRadius: 15, backgroundColor: 'rgba(8,13,21,0.88)', borderWidth: 1, borderColor: 'rgba(214,177,94,0.28)' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 }}>
                    <View style={{ flex: 1, minWidth: 150 }}>
                      <Text style={{ color: '#D7B967', fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1.6 }}>
                        EVENT ARENA · PAPER TRADING
                      </Text>
                      <Text allowFontScaling style={{ color: '#F4F0E7', fontFamily: 'Inter_700Bold', fontSize: 14, marginTop: 4 }}>
                        {dateRangeLabel(event.startAtMs, event.endAtMs)}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 7, paddingHorizontal: 10, borderRadius: 20, backgroundColor: eventStatus.phase === 'active' ? 'rgba(75,184,151,0.16)' : 'rgba(216,180,90,0.14)', borderWidth: 1, borderColor: eventStatus.phase === 'active' ? 'rgba(75,184,151,0.48)' : 'rgba(216,180,90,0.42)' }}>
                      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: eventStatus.phase === 'active' ? '#61D0A7' : '#D8B45A' }} />
                      <Text style={{ color: eventStatus.phase === 'active' ? '#8BE2BF' : '#E8CB7C', fontFamily: 'Inter_700Bold', fontSize: 9 }}>
                        {eventStatus.label}
                      </Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7, marginTop: 12 }}>
                    <Text testID="paper-event-leaderboard-participant-count" style={{ color: '#F1EEE7', fontFamily: 'Inter_600SemiBold', fontSize: 11 }}>
                      {entries.length} {entries.length === 1 ? 'participant' : 'participants'}
                    </Text>
                    <Text style={{ color: 'rgba(241,238,231,0.42)', fontSize: 10 }}>·</Text>
                    <Text testID="paper-event-leaderboard-countdown" style={{ color: '#E6D8AD', fontFamily: 'Inter_600SemiBold', fontSize: 11 }}>
                      {eventStatus.countdown}
                    </Text>
                    <Text style={{ color: 'rgba(241,238,231,0.42)', fontSize: 10 }}>·</Text>
                    <Text style={{ color: '#C6C9CC', fontFamily: 'Inter_500Medium', fontSize: 10 }}>
                      {Math.round(eventProgress)}% complete
                    </Text>
                  </View>
                  <View
                    testID="paper-event-leaderboard-event-progress"
                    accessibilityRole="progressbar"
                    accessibilityLabel={`Event progress ${Math.round(eventProgress)} percent`}
                    accessibilityValue={{ min: 0, max: 100, now: Math.round(eventProgress) }}
                    style={{ height: 5, overflow: 'hidden', borderRadius: 4, marginTop: 11, backgroundColor: 'rgba(255,255,255,0.14)' }}
                  >
                    <View style={{ width: `${eventProgress}%`, height: '100%', borderRadius: 4, backgroundColor: eventStatus.phase === 'ended' ? '#D8B45A' : '#56C7A0' }} />
                  </View>
                  <Text allowFontScaling style={{ color: '#C5C8CD', fontFamily: 'Inter_400Regular', fontSize: 9, marginTop: 8 }}>
                    SELF-REPORTED · NOT INDEPENDENTLY VERIFIED · Updated {timeLabel(lastUpdated)}
                  </Text>
                </View>

                <View style={{ alignItems: 'center', marginBottom: 15 }}>
                  <Text style={{ color: '#E6D5A4', fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 2.2 }}>
                    LIVE CHAMPIONSHIP
                  </Text>
                  <Text allowFontScaling style={{ color: '#FFF9EA', fontFamily: 'Inter_700Bold', fontSize: compactPodium ? 23 : 29, letterSpacing: 0.2, textAlign: 'center', marginTop: 4, textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 8, textShadowOffset: { width: 0, height: 2 } }}>
                    Championship standings
                  </Text>
                  <View accessible={false} style={{ height: 1, width: '42%', backgroundColor: 'rgba(222,190,113,0.62)', marginTop: 10 }} />
                  <Text style={{ color: '#CFD3D7', fontFamily: 'Inter_500Medium', fontSize: 10, letterSpacing: 0.8, textAlign: 'center', marginTop: 8 }}>
                    REAL PAPER-ACCOUNT RETURNS · PRIVATE BY ALIAS
                  </Text>
                </View>
              {loading && entries.length === 0 ? (
                <View accessibilityLabel="Loading leaderboard" style={{ padding: 15, borderRadius: 17, backgroundColor: 'rgba(8,13,21,0.84)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' }}>
                  {[0, 1, 2].map((item) => (
                    <View key={item} style={{ minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: item < 2 ? 1 : 0, borderBottomColor: 'rgba(255,255,255,0.08)' }}>
                      <View style={{ width: 29, height: 29, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.13)' }} />
                      <View style={{ flex: 1 }}>
                        <View style={{ width: `${58 + item * 8}%`, height: 11, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.14)' }} />
                        <View style={{ width: '36%', height: 8, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.08)', marginTop: 7 }} />
                      </View>
                      <View style={{ width: 54, height: 18, borderRadius: 8, backgroundColor: 'rgba(216,180,90,0.17)' }} />
                    </View>
                  ))}
                  <Text style={{ color: '#D4D5D4', fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 10, textAlign: 'center' }}>Loading leaderboard…</Text>
                </View>
              ) : loadError && entries.length === 0 ? (
                <View style={{ padding: 14, borderRadius: 10, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.destructive }}>
                  <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>{loadError}</Text>
                  <TouchableOpacity testID="retry-paper-event-leaderboard" accessibilityRole="button" onPress={() => { void refresh(); }} style={{ alignSelf: 'flex-start', paddingVertical: 8 }}>
                    <Text style={{ color: colors.primary, fontFamily: 'Inter_700Bold', fontSize: 11 }}>RETRY</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  {entries.length === 0 && (
                    <View testID="paper-event-leaderboard-empty" style={{ alignItems: 'center', paddingVertical: 18, paddingHorizontal: 12, borderRadius: 16, backgroundColor: 'rgba(7,13,20,0.8)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.13)' }}>
                      <Feather name="users" size={23} color="#D8B45A" />
                      <Text allowFontScaling style={{ color: '#E2E2DE', fontFamily: 'Inter_400Regular', fontSize: 12, paddingTop: 10, textAlign: 'center', lineHeight: 18 }}>
                        No participants have opted in for this event yet.
                      </Text>
                      <TouchableOpacity testID="refresh-empty-paper-event-leaderboard" accessibilityRole="button" onPress={() => { void refresh(); }} style={{ paddingVertical: 8, paddingHorizontal: 12, marginTop: 4 }}>
                        <Text style={{ color: '#E6CA7A', fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1 }}>REFRESH</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  <View testID="paper-event-leaderboard-podium" style={{ marginTop: entries.length === 0 ? 7 : 2 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <Text style={{ color: '#F4F0E7', fontFamily: 'Inter_700Bold', fontSize: 14 }}>The podium</Text>
                      <Text style={{ color: '#D5C189', fontFamily: 'Inter_600SemiBold', fontSize: 9, letterSpacing: 1.1 }}>TOP THREE</Text>
                    </View>
                    {widePodium ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 }}>
                        {renderPodiumCard(podiumSlots[1])}
                        {podiumSlots[0] && renderPodiumCard(podiumSlots[0])}
                        {renderPodiumCard(podiumSlots[2])}
                      </View>
                    ) : (
                      <>
                        {podiumSlots[0] && renderPodiumCard(podiumSlots[0])}
                        <View style={{ flexDirection: 'row', alignItems: 'stretch', gap: compactPodium ? 7 : 10, marginTop: 8 }}>
                          {podiumSlots.slice(1).map((slot) => renderPodiumCard(slot))}
                        </View>
                      </>
                    )}
                  </View>
                </>
              )}
              </ImageBackground>

              {ownEntry && (
                <View accessible testID="paper-event-leaderboard-current-user" accessibilityLabel={`Your current leaderboard position is rank ${ownEntry.rank}. Account value ${money(ownEntry.equity)}. Return ${returnLabel(ownEntry.returnPercent)}. Profit or loss ${signedMoney(ownEntry.profitLoss)}.`} style={{ marginBottom: 17, padding: 15, borderRadius: 18, borderWidth: 1.5, borderColor: 'rgba(216,180,90,0.82)', backgroundColor: 'rgba(35,31,22,0.96)' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 11 }}>
                    <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(216,180,90,0.15)', alignItems: 'center', justifyContent: 'center' }}>
                      <Feather name="award" size={16} color="#E4C66F" />
                    </View>
                    <Text style={{ flex: 1, color: '#E8CD7B', fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1 }}>
                      YOUR LIVE POSITION
                    </Text>
                    {ownEntry.rank > 1 && (() => {
                      const returnGap = getEventArenaNextRankReturnGap(ownEntry, entries);
                      return returnGap === null ? null : (
                        <Text testID="paper-event-next-rank-gap" style={{ color: '#E8CD7B', fontFamily: 'Inter_600SemiBold', fontSize: 9, textAlign: 'right' }}>
                          {returnGap.toFixed(2)} pts to #{ownEntry.rank - 1}
                        </Text>
                      );
                    })()}
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
                    <Text allowFontScaling adjustsFontSizeToFit numberOfLines={1} style={{ color: '#F3D875', fontFamily: 'Inter_700Bold', fontSize: 31, minWidth: 54 }}>
                      #{ownEntry.rank}
                    </Text>
                    <View style={{ flex: 1, minWidth: 130 }}>
                      <Text allowFontScaling adjustsFontSizeToFit minimumFontScale={0.7} numberOfLines={1} style={{ flexShrink: 1, minWidth: 0, color: '#F6F1E5', fontFamily: 'Inter_700Bold', fontSize: 17 }}>
                        {ownEntry.alias}
                      </Text>
                      <Text style={{ color: '#AAA9A4', fontFamily: 'Inter_500Medium', fontSize: 9, marginTop: 3, letterSpacing: 0.8 }}>YOUR EVENT ACCOUNT</Text>
                    </View>
                    <View style={{ minWidth: 105, alignItems: 'flex-end' }}>
                      <Text style={{ color: '#AAA9A4', fontFamily: 'Inter_500Medium', fontSize: 9 }}>RETURN</Text>
                      <Text allowFontScaling adjustsFontSizeToFit numberOfLines={1} style={{ color: ownEntry.returnPercent >= 0 ? '#67D3A8' : '#FF8D83', fontFamily: 'Inter_700Bold', fontSize: 19, marginTop: 2 }}>
                        {returnLabel(ownEntry.returnPercent)}
                      </Text>
                    </View>
                  </View>
                  <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.11)', marginVertical: 12 }} />
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10 }}>
                    <View style={{ flex: 1, minWidth: 130 }}>
                      <Text style={{ color: '#AAA9A4', fontFamily: 'Inter_500Medium', fontSize: 9, letterSpacing: 0.8 }}>REPORTED ACCOUNT VALUE</Text>
                      <Text allowFontScaling adjustsFontSizeToFit numberOfLines={1} style={{ color: '#F5F0E7', fontFamily: 'Inter_700Bold', fontSize: 16, marginTop: 4 }}>
                        {money(ownEntry.equity)}
                      </Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 115 }}>
                      <Text style={{ color: '#AAA9A4', fontFamily: 'Inter_500Medium', fontSize: 9, letterSpacing: 0.8 }}>DOLLAR P/L</Text>
                      <Text allowFontScaling adjustsFontSizeToFit numberOfLines={1} style={{ color: ownEntry.profitLoss >= 0 ? '#67D3A8' : '#FF8D83', fontFamily: 'Inter_700Bold', fontSize: 16, marginTop: 4 }}>
                        {signedMoney(ownEntry.profitLoss)}
                      </Text>
                    </View>
                  </View>
                  <Text style={{ color: '#A9A8A3', fontFamily: 'Inter_400Regular', fontSize: 9, lineHeight: 14, marginTop: 10 }}>
                    Self-reported from your Event Arena paper account. Your private identity is not shown.
                  </Text>
                </View>
              )}

              {ownEntry && (
                <View testID="paper-event-rank-history" style={{ marginBottom: 17, padding: 14, borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Feather name="trending-up" size={15} color={colors.gold} />
                    <Text style={{ flex: 1, color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 14 }}>
                      Your event history
                    </Text>
                    <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium', fontSize: 9 }}>
                      {displayedEventHistory.length} POINTS
                    </Text>
                  </View>
                  <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 10, lineHeight: 15, marginTop: 6 }}>
                    Self-reported rank and return snapshots. Not independently verified.
                  </Text>
                  {eventHistoryError ? (
                    <View style={{ marginTop: 10 }}>
                      <Text accessibilityRole="alert" style={{ color: colors.destructive, fontFamily: 'Inter_500Medium', fontSize: 11 }}>
                        Your history could not be loaded.
                      </Text>
                      <TouchableOpacity
                        testID="retry-paper-event-rank-history"
                        accessibilityRole="button"
                        onPress={() => { void loadEventHistory(true); }}
                        style={{ alignSelf: 'flex-start', paddingVertical: 8 }}
                      >
                        <Text style={{ color: colors.primary, fontFamily: 'Inter_700Bold', fontSize: 10 }}>RETRY</Text>
                      </TouchableOpacity>
                    </View>
                  ) : eventHistoryLoading && eventHistoryEventId !== event.id ? (
                    <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 10 }}>
                      Loading your event history…
                    </Text>
                  ) : displayedEventHistory.length === 0 ? (
                    <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 16, marginTop: 10 }}>
                      History will appear after your first successful score refresh.
                    </Text>
                  ) : (
                    <>
                      {displayedEventHistory.length > 1 && (() => {
                        const first = displayedEventHistory[0]!;
                        const latest = displayedEventHistory[displayedEventHistory.length - 1]!;
                        const placesMoved = first.rank - latest.rank;
                        const movementText = placesMoved === 0
                          ? 'Your rank is unchanged'
                          : `Moved ${placesMoved > 0 ? 'up' : 'down'} ${Math.abs(placesMoved)} ${Math.abs(placesMoved) === 1 ? 'place' : 'places'}`;
                        return (
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, marginTop: 10, marginBottom: 5, padding: 10, borderRadius: 10, backgroundColor: colors.background }}>
                            <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 10 }}>{movementText} since your first snapshot</Text>
                            <Text style={{ color: latest.returnPercent >= first.returnPercent ? colors.primary : colors.destructive, fontFamily: 'Inter_600SemiBold', fontSize: 10 }}>
                              Return {latest.returnPercent >= first.returnPercent ? '+' : ''}{(latest.returnPercent - first.returnPercent).toFixed(2)} pts
                            </Text>
                          </View>
                        );
                      })()}
                      {displayedEventHistory.map((snapshot, index) => (
                        <View
                          key={`${snapshot.capturedAt}-${index}`}
                          accessible
                          accessibilityLabel={`${timeLabel(snapshot.capturedAt)}, rank ${snapshot.rank}, return ${returnLabel(snapshot.returnPercent)}, self-reported`}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 35, borderTopWidth: 1, borderTopColor: colors.border }}
                        >
                          <Text style={{ flex: 1, color: colors.mutedForeground, fontFamily: 'Inter_500Medium', fontSize: 10 }}>
                            {timeLabel(snapshot.capturedAt)}
                          </Text>
                          <Text style={{ width: 45, textAlign: 'right', color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 11 }}>
                            #{snapshot.rank}
                          </Text>
                          <Text style={{ width: 75, textAlign: 'right', color: snapshot.returnPercent >= 0 ? colors.primary : colors.destructive, fontFamily: 'Inter_700Bold', fontSize: 11 }}>
                            {returnLabel(snapshot.returnPercent)}
                          </Text>
                        </View>
                      ))}
                    </>
                  )}
                </View>
              )}

              {standingsEntries.length > 0 && (
                    <View testID="paper-event-leaderboard-list" style={{ marginTop: 3, paddingHorizontal: 14, paddingTop: 13, paddingBottom: 4, borderRadius: 18, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 8 }}>
                        <Text style={{ flex: 1, color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 15 }}>Full standings</Text>
                        <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium', fontSize: 9, letterSpacing: 0.8 }}>
                          {standingsEntries.length} MORE
                        </Text>
                      </View>
                      {standingsEntries.map((entry) => renderEntry(entry as LeaderboardEntry))}
                    </View>
              )}
              {ownEntry && averageCostFallbackByEvent[event.id] && (
                    <Text
                      testID="paper-event-average-cost-fallback"
                      accessibilityRole="text"
                      style={{ color: colors.gold, fontFamily: 'Inter_500Medium', fontSize: 10, lineHeight: 15, marginTop: 10 }}
                    >
                      A market quote was unavailable for one or more holdings, so average cost was used for those positions in your score.
                    </Text>
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
