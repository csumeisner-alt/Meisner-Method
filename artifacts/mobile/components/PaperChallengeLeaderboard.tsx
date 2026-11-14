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
  View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import {
  getGetEventArenaLeaderboardQueryKey,
  getGetEventArenaLeaderboardWeeksQueryKey,
  submitEventArenaScore,
  useGetEventArenaLeaderboard,
  useGetEventArenaLeaderboardWeeks,
} from '@workspace/api-client-react';
import { getInstallationId } from '@/lib/installation';
import { groupCompletedEventWeeksByYear } from '@/lib/eventArenaArchive';
import {
  PAPER_CHALLENGE_STARTING_BALANCE,
  updatePaperChallengeStore,
  type PaperChallengeEnrollment,
} from '@/lib/paperChallenge';

const BASE_URL = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;
const REFRESH_INTERVAL_MS = 120_000;
const LAST_SUBMISSION_KEY_PREFIX = '@stocksense/paper_event_leaderboard_last_submit:';

type EventWindow = {
  id: string;
  startAtMs: number;
  endAtMs: number;
  phase: 'upcoming' | 'active' | 'ended';
};
type CompletedEventWeek = EventWindow & { participantCount: number };

type HoldingName = { symbol: string; companyName: string };
type LeaderboardEntry = {
  rank: number;
  alias: string;
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
};

const money = (value: number) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const signedMoney = (value: number) => `${value >= 0 ? '+' : '−'}${money(Math.abs(value))}`;
const returnLabel = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
const timeLabel = (value: string | null) => value
  ? new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
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
    .map((position) => ({
      symbol: position.symbol.trim().toUpperCase(),
      companyName: (position.companyName || position.symbol).trim().slice(0, 120),
    }))
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
    installationId: await getInstallationId(),
    alias: enrollment.leaderboardAlias?.trim() ?? '',
    startEquity,
    equity,
    returnPercent,
    tradeCount,
    holdings,
    eventStartAtMs: event.startAtMs,
    eventEndAtMs: event.endAtMs,
  };
}

export function PaperChallengeLeaderboard({ event, enrollment, onEnrollmentChange, onRankChange, openOnMount = false, embedded = false }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [aliasEditorOpen, setAliasEditorOpen] = useState(false);
  const [error, setError] = useState('');
  const [aliasDraft, setAliasDraft] = useState('');
  const [sharingBusy, setSharingBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [detail, setDetail] = useState<LeaderboardEntry | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<EventWindow>(event);
  const [archiveYear, setArchiveYear] = useState<number | null>(null);
  const [appIsActive, setAppIsActive] = useState(AppState.currentState === 'active');
  const refreshingRef = useRef(false);
  const enrollmentRef = useRef(enrollment);
  const selectedEventRef = useRef(event);
  const [installationId, setInstallationId] = useState<string | null>(null);
  const [installationIdReady, setInstallationIdReady] = useState(false);
  const visible = embedded || open;
  const leaderboardQuery = useGetEventArenaLeaderboard(selectedEvent.id, {
    request: installationId ? { headers: { 'X-Event-Arena-Installation-Id': installationId } } : undefined,
    query: {
      // The refresh effect below owns loading so opening the modal does not
      // trigger both React Query's automatic request and a manual refetch.
      enabled: false,
      queryKey: [...getGetEventArenaLeaderboardQueryKey(selectedEvent.id), installationId ?? 'anonymous'],
      refetchOnWindowFocus: false,
    },
  });
  const entries = leaderboardQuery.data?.entries ?? [];
  const lastUpdated = leaderboardQuery.data?.updatedAt ?? null;
  const loading = refreshing || (visible && !installationIdReady) || (leaderboardQuery.isLoading && entries.length === 0);
  const loadError = error || (leaderboardQuery.error ? 'The leaderboard could not be loaded. Please retry.' : '');
  const weeksQuery = useGetEventArenaLeaderboardWeeks({
    query: { enabled: visible, queryKey: getGetEventArenaLeaderboardWeeksQueryKey() },
  });
  const archiveWeeks: CompletedEventWeek[] = useMemo(
    () => (weeksQuery.data?.weeks ?? [])
      .filter((week) => week.id !== event.id)
      .map((week) => ({ ...week, phase: 'ended' })),
    [weeksQuery.data?.weeks, event.id],
  );
  const archiveYears = useMemo(() => groupCompletedEventWeeksByYear(archiveWeeks), [archiveWeeks]);
  const selectedArchiveYear = archiveYears.some(({ year }) => year === archiveYear)
    ? archiveYear
    : archiveYears[0]?.year ?? null;
  const selectedYearWeeks = archiveYears.find(({ year }) => year === selectedArchiveYear)?.weeks ?? [];
  const optedIn = selectedEvent.id === event.id && enrollment?.leaderboardOptedIn === true;
  const aliasLocked = Date.now() >= selectedEvent.startAtMs;
  const canOptIn = selectedEvent.id === event.id
    && enrollment?.eventId === event.id
    && event.phase !== 'ended';
  const matchingOwnEntries = useMemo(
    () => optedIn ? entries.filter((entry) => entry.isCurrentUser) : [],
    [entries, optedIn],
  );
  const ownEntry = matchingOwnEntries.length === 1 ? matchingOwnEntries[0] : null;

  useEffect(() => {
    if (openOnMount && !embedded) setOpen(true);
  }, [embedded, openOnMount]);
  useEffect(() => { enrollmentRef.current = enrollment; }, [enrollment]);
  useEffect(() => {
    let mounted = true;
    void getInstallationId()
      .then((id) => { if (mounted) setInstallationId(id); })
      .catch(() => { if (mounted) setInstallationId(null); })
      .finally(() => { if (mounted) setInstallationIdReady(true); });
    return () => { mounted = false; };
  }, []);
  useEffect(() => {
    if (selectedEvent.id !== event.id || matchingOwnEntries.length !== 1) {
      onRankChange?.(null);
      return;
    }
    onRankChange?.(matchingOwnEntries[0]?.rank ?? null);
  }, [event.id, matchingOwnEntries, onRankChange, selectedEvent.id]);
  useEffect(() => {
    setArchiveYear((currentYear) => (
      archiveYears.some(({ year }) => year === currentYear)
        ? currentYear
        : archiveYears[0]?.year ?? null
    ));
  }, [archiveYears]);
  useEffect(() => {
    selectedEventRef.current = event;
    setSelectedEvent(event);
  }, [event.id, event.startAtMs, event.endAtMs]);
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
    const payload = await buildEventSubmission({ ...targetEnrollment, leaderboardAlias: alias }, event);
    await submitEventArenaScore(event.id, payload);
    await AsyncStorage.setItem(`${LAST_SUBMISSION_KEY_PREFIX}${event.id}`, String(Date.now()));
  }, [event.id, event.startAtMs, event.endAtMs]);

  const selectEvent = useCallback((targetEvent: EventWindow) => {
    selectedEventRef.current = targetEvent;
    setSelectedEvent(targetEvent);
    setDetail(null);
    setError('');
  }, []);

  const refresh = useCallback(async () => {
    if (refreshingRef.current || !visible || !appIsActive || !installationIdReady) return;
    const targetEvent = selectedEvent;
    const targetEventId = targetEvent.id;
    refreshingRef.current = true;
    setRefreshing(true);
    setError('');
    try {
      const currentEnrollment = enrollmentRef.current;
      if (
        currentEnrollment?.eventId === targetEventId
        && targetEventId === event.id
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
            if (selectedEventRef.current.id === targetEventId) {
              setError('Your score could not be updated. It will retry when you refresh.');
            }
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
  }, [appIsActive, event.id, event.phase, installationIdReady, leaderboardQuery.refetch, selectedEvent, sharingBusy, submitEntry, visible]);

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
        gap: 10,
        paddingVertical: 11,
        paddingHorizontal: entry.isCurrentUser ? 9 : 0,
        marginVertical: entry.isCurrentUser ? 3 : 0,
        borderBottomWidth: entry.isCurrentUser ? 1 : 1,
        borderWidth: entry.isCurrentUser ? 1 : 0,
        borderColor: entry.isCurrentUser ? colors.gold : colors.border,
        borderRadius: entry.isCurrentUser ? 10 : 0,
      }}
    >
      <Text style={{
        width: 34,
        color: entry.rank <= 3 ? colors.gold : colors.primary,
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
        <Text style={{ color: entry.profitLoss >= 0 ? colors.primary : colors.destructive, fontFamily: 'Inter_600SemiBold', fontSize: 10, marginTop: 2 }}>
          {signedMoney(entry.profitLoss)} · {entry.tradeCount == null ? 'trade count unavailable' : `${entry.tradeCount} trades`}
        </Text>
      </View>
      <Text style={{ color: entry.returnPercent >= 0 ? colors.primary : colors.destructive, fontFamily: 'Inter_700Bold', fontSize: 13 }}>
        {returnLabel(entry.returnPercent)}
      </Text>
    </TouchableOpacity>
  );

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
            selectedEventRef.current = event;
            setSelectedEvent(event);
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
            {!detail && selectedEvent.id === event.id && enrollment?.eventId === event.id && (
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
                  {detail.holdings.length === 0 ? (
                    <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 8 }}>No current holdings reported.</Text>
                  ) : detail.holdings.map((holding) => (
                    <View key={holding.symbol} style={{ paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                      <Text style={{ color: colors.primary, fontFamily: 'Inter_700Bold', fontSize: 12 }}>{holding.symbol}</Text>
                      <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 2 }}>{holding.companyName}</Text>
                    </View>
                  ))}
                </View>
                <Text style={{ color: colors.destructive, fontFamily: 'Inter_600SemiBold', fontSize: 10, lineHeight: 15, marginTop: 12 }}>
                  Self-reported and unverified. No trade details or position sizes are shared.
                </Text>
              </View>
            </ScrollView>
          ) : (
            <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: Platform.OS === 'web' ? 24 : insets.bottom + 18 }}>
              <View testID="paper-event-leaderboard-week-picker" style={{ marginBottom: 16 }}>
                <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 14, marginBottom: 8 }}>
                  Current event
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  <TouchableOpacity
                    testID="paper-event-leaderboard-current-week"
                    accessibilityRole="button"
                    accessibilityState={{ selected: selectedEvent.id === event.id }}
                    onPress={() => selectEvent(event)}
                    style={{
                      paddingVertical: 8,
                      paddingHorizontal: 10,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: selectedEvent.id === event.id ? colors.primary : colors.border,
                      backgroundColor: selectedEvent.id === event.id ? colors.primary : colors.card,
                    }}
                  >
                    <Text style={{
                      color: selectedEvent.id === event.id ? colors.primaryForeground : colors.foreground,
                      fontFamily: 'Inter_600SemiBold',
                      fontSize: 11,
                    }}>
                      Current · {dateRangeLabel(event.startAtMs, event.endAtMs)}
                    </Text>
                  </TouchableOpacity>
                </View>
                <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 14, marginTop: 14, marginBottom: 8 }}>
                  Past event weeks
                </Text>
                {archiveYears.length > 0 && (
                  <View
                    testID="paper-event-leaderboard-year-picker"
                    accessibilityLabel="Choose a year of completed event weeks"
                    style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 9 }}
                  >
                    {archiveYears.map(({ year, weeks }) => {
                      const selected = selectedArchiveYear === year;
                      return (
                        <TouchableOpacity
                          key={year}
                          testID={`paper-event-leaderboard-year-${year}`}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          accessibilityLabel={`Show ${year} completed event weeks, ${weeks.length} weeks`}
                          onPress={() => setArchiveYear(year)}
                          style={{
                            minHeight: 44,
                            paddingVertical: 7,
                            paddingHorizontal: 10,
                            justifyContent: 'center',
                            borderRadius: 8,
                            borderWidth: 1,
                            borderColor: selected ? colors.primary : colors.border,
                            backgroundColor: selected ? colors.primary : colors.card,
                          }}
                        >
                          <Text style={{
                            color: selected ? colors.primaryForeground : colors.foreground,
                            fontFamily: 'Inter_600SemiBold',
                            fontSize: 11,
                          }}>
                            {year} · {weeks.length}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
                {selectedYearWeeks.map((week) => {
                  const selected = selectedEvent.id === week.id;
                  return (
                    <TouchableOpacity
                      key={week.id}
                      testID={`paper-event-leaderboard-week-${week.id}`}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      accessibilityLabel={`Event week ${dateRangeLabel(week.startAtMs, week.endAtMs)}, ${week.participantCount} participants`}
                      onPress={() => selectEvent(week)}
                      style={{
                        alignSelf: 'flex-start',
                        minHeight: 44,
                        paddingHorizontal: 10,
                        justifyContent: 'center',
                        marginBottom: 7,
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: selected ? colors.primary : colors.border,
                        backgroundColor: selected ? colors.primary : colors.card,
                      }}
                    >
                      <Text style={{
                        color: selected ? colors.primaryForeground : colors.foreground,
                        fontFamily: 'Inter_600SemiBold',
                        fontSize: 11,
                      }}>
                        {dateRangeLabel(week.startAtMs, week.endAtMs)} · {week.participantCount}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
                <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 10, lineHeight: 15, marginTop: 7 }}>
                  Past weeks show only participants who opted in. Opting out removes a participant’s score and holdings.
                </Text>
                {weeksQuery.isLoading && (
                  <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 7 }}>
                    Loading completed weeks…
                  </Text>
                )}
                {weeksQuery.error ? (
                  <View style={{ marginTop: 8 }}>
                    <Text testID="paper-event-leaderboard-weeks-error" style={{ color: colors.destructive, fontFamily: 'Inter_600SemiBold', fontSize: 11 }}>
                      Past event weeks are unavailable right now.
                    </Text>
                    <TouchableOpacity
                      testID="retry-paper-event-leaderboard-weeks"
                      accessibilityRole="button"
                      onPress={() => { void weeksQuery.refetch(); }}
                      style={{ alignSelf: 'flex-start', paddingVertical: 7 }}
                    >
                      <Text style={{ color: colors.primary, fontFamily: 'Inter_700Bold', fontSize: 10 }}>RETRY PAST WEEKS</Text>
                    </TouchableOpacity>
                  </View>
                ) : !weeksQuery.isLoading && archiveWeeks.length === 0 ? (
                  <Text testID="paper-event-leaderboard-no-past-weeks" style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 7 }}>
                    No completed weeks with opted-in participants yet.
                  </Text>
                ) : null}
              </View>

              {canOptIn && (
                <View testID="paper-event-leaderboard-opt-in" style={{ padding: 14, borderRadius: 12, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, marginBottom: 14 }}>
                  <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 14 }}>
                    {optedIn ? 'Leaderboard sharing is on' : 'Choose whether to share'}
                  </Text>
                  <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 16, marginTop: 5 }}>
                    Before opting in: other event participants will see your alias, self-reported score, and current holding ticker and company names. This does not share your regular accounts or trade history.
                  </Text>
                  <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 10, lineHeight: 15, marginTop: 5 }}>
                    Shared scores and holding names are removed 30 days after the event ends. Your local event history stays on this device.
                  </Text>
                  {optedIn && (
                    <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 10, lineHeight: 15, marginTop: 5 }}>
                      Opting out removes your score and holdings from the leaderboard. Your alias remains locked for this event.
                    </Text>
                  )}
                  <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 12, marginTop: 10 }}>
                    Your alias · {aliasDraft.trim() || 'Not set yet'}
                  </Text>
                  {!aliasDraft.trim() && !aliasLocked && (
                    <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 3 }}>
                      Use EDIT NAME above before sharing your score.
                    </Text>
                  )}
                  {optedIn ? (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                      <TouchableOpacity
                        testID="opt-out-paper-event-leaderboard"
                        accessibilityRole="button"
                        disabled={sharingBusy}
                        onPress={() => { void optOut(); }}
                        style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.destructive, opacity: sharingBusy ? 0.6 : 1 }}
                      >
                        <Text style={{ color: colors.destructive, fontFamily: 'Inter_700Bold', fontSize: 10 }}>{sharingBusy ? 'UPDATING…' : 'OPT OUT'}</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      testID="opt-in-paper-event-leaderboard"
                      accessibilityRole="button"
                      disabled={sharingBusy || aliasDraft.trim().length < 1}
                      onPress={() => { void optIn(); }}
                      style={{ minHeight: 44, marginTop: 10, borderRadius: 8, backgroundColor: sharingBusy || aliasDraft.trim().length < 1 ? colors.muted : colors.primary, alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Text style={{ color: colors.primaryForeground, fontFamily: 'Inter_700Bold', fontSize: 11 }}>
                        {sharingBusy ? 'OPTING IN…' : 'OPT IN AND SHARE'}
                      </Text>
                    </TouchableOpacity>
                  )}
                  {optedIn && aliasLocked && (
                    <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 6 }}>
                      Alias locked when the event started.
                    </Text>
                  )}
                </View>
              )}

              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                <Text style={{ flex: 1, color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 15 }}>Rankings</Text>
                <Text style={{ color: colors.destructive, fontFamily: 'Inter_700Bold', fontSize: 9 }}>SELF-REPORTED · UNVERIFIED</Text>
              </View>
              <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 11, marginBottom: 8 }}>
                Scores and event values are reported by participants and are not independently checked.
              </Text>
              {ownEntry && (
                <View
                  testID="paper-event-leaderboard-your-position"
                  style={{ padding: 12, marginBottom: 10, borderRadius: 11, borderWidth: 1, borderColor: colors.gold, backgroundColor: colors.card }}
                >
                  <Text style={{ color: colors.gold, fontFamily: 'Inter_700Bold', fontSize: 10 }}>YOUR CURRENT POSITION</Text>
                  <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 16, marginTop: 4 }}>
                    Rank #{ownEntry.rank} · {returnLabel(ownEntry.returnPercent)}
                  </Text>
                  <Text style={{ color: ownEntry.profitLoss >= 0 ? colors.primary : colors.destructive, fontFamily: 'Inter_600SemiBold', fontSize: 11, marginTop: 3 }}>
                    {signedMoney(ownEntry.profitLoss)} · {money(ownEntry.equity)} account value
                  </Text>
                </View>
              )}
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
                <View testID="paper-event-leaderboard-empty" style={{ alignItems: 'center', paddingVertical: 20 }}>
                  <Feather name="users" size={22} color={colors.mutedForeground} />
                  <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12, paddingTop: 9, textAlign: 'center' }}>
                  {selectedEvent.id !== event.id
                    ? 'No opted-in participants are available for this completed week. Participants who opted out are not shown.'
                    : 'No participants have opted in for this event yet.'}
                  </Text>
                  <TouchableOpacity testID="refresh-empty-paper-event-leaderboard" accessibilityRole="button" onPress={() => { void refresh(); }} style={{ paddingVertical: 8, paddingHorizontal: 12, marginTop: 6 }}>
                    <Text style={{ color: colors.primary, fontFamily: 'Inter_700Bold', fontSize: 10 }}>REFRESH</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View testID="paper-event-leaderboard-list">
                  {entries.map(renderEntry)}
                </View>
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

      <Modal visible={aliasEditorOpen} animationType="fade" transparent statusBarTranslucent onRequestClose={() => setAliasEditorOpen(false)}>
        <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={0} style={{ flex: 1, justifyContent: 'center', padding: 20, backgroundColor: 'rgba(0,0,0,0.62)' }}>
          <View style={{ padding: 20, borderRadius: 18, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ color: colors.primary, fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 0.8 }}>EVENT ARENA</Text>
            <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 20, marginTop: 7 }}>Change your alias</Text>
            <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18, marginTop: 6 }}>
              {optedIn
                ? 'Your new alias will appear on this event’s leaderboard. It locks when the event starts.'
                : 'This alias stays on your device unless you separately opt in to leaderboard sharing.'}
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
    </>
  );
}
