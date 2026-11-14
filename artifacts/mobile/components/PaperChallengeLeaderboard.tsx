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
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import {
  getGetEventArenaLeaderboardWeeksQueryKey,
  useGetEventArenaLeaderboardWeeks,
} from '@workspace/api-client-react';
import { getInstallationId } from '@/lib/installation';
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
  returnPercent: number;
  holdings: HoldingName[];
  updatedAt: string;
};

type Props = {
  event: EventWindow;
  enrollment: PaperChallengeEnrollment | null;
  onEnrollmentChange: (enrollment: PaperChallengeEnrollment | null) => void;
};

const DEMO_ENTRIES: LeaderboardEntry[] = [
  {
    rank: 1,
    alias: 'MarketFox',
    startEquity: 100_000,
    equity: 104_320,
    returnPercent: 4.32,
    holdings: [
      { symbol: 'NVDA', companyName: 'NVIDIA Corporation' },
      { symbol: 'MSFT', companyName: 'Microsoft Corporation' },
    ],
    updatedAt: '2026-11-18T16:00:00.000Z',
  },
  {
    rank: 2,
    alias: 'BlueChip',
    startEquity: 100_000,
    equity: 102_150,
    returnPercent: 2.15,
    holdings: [{ symbol: 'AAPL', companyName: 'Apple Inc.' }],
    updatedAt: '2026-11-18T15:58:00.000Z',
  },
];

const money = (value: number) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
  if (!Number.isFinite(equity) || !Number.isFinite(startEquity) || !Number.isFinite(returnPercent)) {
    throw new Error('Your event score is unavailable. Open Paper Trading and try again.');
  }
  return {
    installationId: await getInstallationId(),
    alias: enrollment.leaderboardAlias?.trim() ?? '',
    startEquity,
    equity,
    returnPercent,
    holdings,
    eventStartAtMs: event.startAtMs,
    eventEndAtMs: event.endAtMs,
  };
}

async function responseError(response: Response, fallback: string) {
  try {
    const body = await response.json() as { error?: string };
    return typeof body.error === 'string' ? body.error : fallback;
  } catch {
    return fallback;
  }
}

export function PaperChallengeLeaderboard({ event, enrollment, onEnrollmentChange }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [aliasDraft, setAliasDraft] = useState('');
  const [sharingBusy, setSharingBusy] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [detail, setDetail] = useState<LeaderboardEntry | null>(null);
  const [showDemo, setShowDemo] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<EventWindow>(event);
  const [appIsActive, setAppIsActive] = useState(AppState.currentState === 'active');
  const refreshingRef = useRef(false);
  const enrollmentRef = useRef(enrollment);
  const selectedEventRef = useRef(event);
  const weeksQuery = useGetEventArenaLeaderboardWeeks({
    query: { enabled: open, queryKey: getGetEventArenaLeaderboardWeeksQueryKey() },
  });
  const demoEntries = useMemo(() => DEMO_ENTRIES, []);
  const visibleEntries = showDemo ? demoEntries : entries;
  const archiveWeeks: CompletedEventWeek[] = (weeksQuery.data?.weeks ?? [])
    .filter((week) => week.id !== event.id)
    .map((week) => ({ ...week, phase: 'ended' }));
  const optedIn = selectedEvent.id === event.id && enrollment?.leaderboardOptedIn === true;
  const aliasLocked = Date.now() >= selectedEvent.startAtMs;
  const canOptIn = selectedEvent.id === event.id
    && enrollment?.eventId === event.id
    && event.phase !== 'ended';

  useEffect(() => { enrollmentRef.current = enrollment; }, [enrollment]);
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
    const response = await fetch(`${BASE_URL}/api/event-arena/${encodeURIComponent(event.id)}/leaderboard`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(await responseError(response, 'Could not submit your event score.'));
    await AsyncStorage.setItem(`${LAST_SUBMISSION_KEY_PREFIX}${event.id}`, String(Date.now()));
  }, [event.id, event.startAtMs, event.endAtMs]);

  const fetchLeaderboard = useCallback(async (targetEvent: EventWindow = selectedEventRef.current) => {
    const response = await fetch(`${BASE_URL}/api/event-arena/${encodeURIComponent(targetEvent.id)}/leaderboard`);
    if (!response.ok) throw new Error(await responseError(response, 'Could not load the leaderboard.'));
    const body = await response.json() as { entries?: LeaderboardEntry[]; updatedAt?: string };
    if (!Array.isArray(body.entries)) throw new Error('The leaderboard response was invalid.');
    if (selectedEventRef.current.id !== targetEvent.id) return;
    setEntries(body.entries);
    setLastUpdated(body.updatedAt ?? new Date().toISOString());
  }, []);

  const selectEvent = useCallback((targetEvent: EventWindow) => {
    selectedEventRef.current = targetEvent;
    setSelectedEvent(targetEvent);
    setDetail(null);
    setEntries([]);
    setError('');
    setLastUpdated(null);
    setShowDemo(false);
    setLoading(true);
    void fetchLeaderboard(targetEvent)
      .catch((loadError) => {
        if (selectedEventRef.current.id === targetEvent.id) {
          setError(loadError instanceof Error ? loadError.message : 'Could not load the leaderboard.');
        }
      })
      .finally(() => {
        if (selectedEventRef.current.id === targetEvent.id) setLoading(false);
      });
  }, [fetchLeaderboard]);

  const refresh = useCallback(async () => {
    if (refreshingRef.current || !open || !appIsActive) return;
    const targetEvent = selectedEvent;
    const targetEventId = targetEvent.id;
    refreshingRef.current = true;
    setLoading(true);
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
          } catch (submissionError) {
            if (selectedEventRef.current.id === targetEventId) {
              setError(submissionError instanceof Error ? submissionError.message : 'Could not submit your event score.');
            }
          }
        }
      }
      await fetchLeaderboard(targetEvent);
    } catch (loadError) {
      if (selectedEventRef.current.id === targetEventId) {
        setError(loadError instanceof Error ? loadError.message : 'Could not load the leaderboard.');
      }
    } finally {
      if (selectedEventRef.current.id === targetEventId) setLoading(false);
      refreshingRef.current = false;
    }
  }, [appIsActive, event.id, event.phase, fetchLeaderboard, open, selectedEvent, sharingBusy, submitEntry]);

  useEffect(() => {
    if (!open || !appIsActive) return;
    void refresh();
    const timer = setInterval(() => { void refresh(); }, REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [appIsActive, open, refresh]);
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
    try {
      await persistSharing(alias, true);
      await AsyncStorage.removeItem(`${LAST_SUBMISSION_KEY_PREFIX}${event.id}`);
      await submitEntry(currentEnrollment, alias);
      await fetchLeaderboard();
    } catch (optInError) {
      const detail = optInError instanceof Error ? optInError.message : 'The score upload failed.';
      setError(`Opt-in is saved on this device; the score will retry when the connection is available. ${detail}`);
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
    try {
      await persistSharing(alias, true);
      await AsyncStorage.removeItem(`${LAST_SUBMISSION_KEY_PREFIX}${event.id}`);
      await submitEntry(currentEnrollment, alias);
      await fetchLeaderboard();
    } catch (aliasError) {
      const detail = aliasError instanceof Error ? aliasError.message : 'The alias update failed.';
      setError(`Your alias is saved on this device; the leaderboard will retry the update. ${detail}`);
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
      if (!response.ok) throw new Error(await responseError(response, 'Could not remove your leaderboard entry.'));
      await persistSharing(currentEnrollment.leaderboardAlias ?? '', false);
      await AsyncStorage.removeItem(`${LAST_SUBMISSION_KEY_PREFIX}${event.id}`);
      await fetchLeaderboard();
    } catch (optOutError) {
      setError(optOutError instanceof Error ? optOutError.message : 'Could not opt out of the leaderboard.');
    } finally {
      setSharingBusy(false);
    }
  };

  const renderEntry = (entry: LeaderboardEntry) => (
    <TouchableOpacity
      key={`${entry.rank}-${entry.alias}`}
      testID={`event-leaderboard-entry-${entry.rank}`}
      accessibilityRole="button"
      accessibilityLabel={`Rank ${entry.rank}, ${entry.alias}, ${returnLabel(entry.returnPercent)}. View public score summary.`}
      onPress={() => setDetail(entry)}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }}
    >
      <Text style={{ width: 34, color: colors.primary, fontFamily: 'Inter_700Bold', fontSize: 14 }}>#{entry.rank}</Text>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 13 }} numberOfLines={1}>{entry.alias}</Text>
        <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 3 }}>
          {money(entry.equity)} · updated {timeLabel(entry.updatedAt)}
        </Text>
      </View>
      <Text style={{ color: entry.returnPercent >= 0 ? colors.primary : colors.destructive, fontFamily: 'Inter_700Bold', fontSize: 13 }}>
        {returnLabel(entry.returnPercent)}
      </Text>
      <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
    </TouchableOpacity>
  );

  return (
    <>
      <View style={{ marginTop: 12, padding: 14, borderRadius: 12, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
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
            setShowDemo(false);
            setEntries([]);
            selectedEventRef.current = event;
            setSelectedEvent(event);
            setOpen(true);
          }}
          style={{ marginTop: 11, paddingVertical: 10, borderRadius: 9, backgroundColor: colors.primary, alignItems: 'center' }}
        >
          <Text style={{ color: colors.primaryForeground, fontFamily: 'Inter_700Bold', fontSize: 11 }}>OPEN LEADERBOARD</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={open} animationType="slide" onRequestClose={() => { setOpen(false); setDetail(null); }}>
        <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: Platform.OS === 'web' ? 24 : insets.top + 8 }}>
          <View style={{ paddingHorizontal: 18, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {detail && (
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back to leaderboard" onPress={() => setDetail(null)} hitSlop={10}>
                <Feather name="arrow-left" size={20} color={colors.primary} />
              </TouchableOpacity>
            )}
            <Text allowFontScaling style={{ flex: 1, minWidth: 0, color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 20 }}>
              {detail ? 'Participant score' : 'Event leaderboard'}
            </Text>
            {!detail && (
              <TouchableOpacity
                testID="refresh-paper-event-leaderboard"
                accessibilityRole="button"
                accessibilityLabel="Refresh event leaderboard"
                onPress={() => { void refresh(); }}
                hitSlop={10}
              >
                <Feather name="refresh-cw" size={18} color={colors.primary} />
              </TouchableOpacity>
            )}
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close leaderboard" onPress={() => { setOpen(false); setDetail(null); }} hitSlop={10}>
              <Feather name="x" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          {detail ? (
            <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: Platform.OS === 'web' ? 24 : insets.bottom + 18 }}>
              <View testID="paper-event-leaderboard-detail" style={{ padding: 16, borderRadius: 14, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
                {showDemo && (
                  <Text style={{ color: colors.destructive, fontFamily: 'Inter_700Bold', fontSize: 10, marginBottom: 8 }}>
                    DEMO ONLY · NOT A REAL PARTICIPANT
                  </Text>
                )}
                <Text style={{ color: colors.primary, fontFamily: 'Inter_700Bold', fontSize: 11 }}>RANK #{detail.rank}</Text>
                <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 22, marginTop: 5 }}>{detail.alias}</Text>
                <Text style={{ color: detail.returnPercent >= 0 ? colors.primary : colors.destructive, fontFamily: 'Inter_700Bold', fontSize: 20, marginTop: 12 }}>
                  {returnLabel(detail.returnPercent)} event return
                </Text>
                <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 14, marginTop: 5 }}>
                  Reported event value · {money(detail.equity)}
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
                  Event week
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
                  {archiveWeeks.map((week) => {
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
                          paddingVertical: 8,
                          paddingHorizontal: 10,
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
                </View>
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
                      {weeksQuery.error instanceof Error ? weeksQuery.error.message : 'Past event weeks are unavailable.'}
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
                  {(!optedIn || !aliasLocked) && (
                    <TextInput
                      testID="paper-event-leaderboard-alias"
                      accessibilityLabel="Leaderboard alias"
                      value={aliasDraft}
                      onChangeText={setAliasDraft}
                      editable={!sharingBusy && (!optedIn || !aliasLocked)}
                      maxLength={24}
                      autoCapitalize="words"
                      placeholder="Choose an alias"
                      placeholderTextColor={colors.mutedForeground}
                      style={{ marginTop: 10, paddingHorizontal: 11, paddingVertical: 10, borderRadius: 8, color: colors.foreground, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, fontFamily: 'Inter_400Regular', fontSize: 14 }}
                    />
                  )}
                  {optedIn ? (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                      {!aliasLocked && (
                        <TouchableOpacity
                          testID="save-paper-event-leaderboard-alias"
                          accessibilityRole="button"
                          disabled={sharingBusy}
                          onPress={() => { void updateAlias(); }}
                          style={{ paddingVertical: 9, paddingHorizontal: 12, borderRadius: 8, backgroundColor: colors.primary, opacity: sharingBusy ? 0.6 : 1 }}
                        >
                          <Text style={{ color: colors.primaryForeground, fontFamily: 'Inter_700Bold', fontSize: 10 }}>{sharingBusy ? 'SAVING…' : 'SAVE ALIAS'}</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        testID="opt-out-paper-event-leaderboard"
                        accessibilityRole="button"
                        disabled={sharingBusy}
                        onPress={() => { void optOut(); }}
                        style={{ paddingVertical: 9, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.destructive, opacity: sharingBusy ? 0.6 : 1 }}
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
                      style={{ marginTop: 10, paddingVertical: 11, borderRadius: 8, backgroundColor: sharingBusy || aliasDraft.trim().length < 1 ? colors.muted : colors.primary, alignItems: 'center' }}
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
              {loading && entries.length === 0 && !showDemo ? (
                <View style={{ alignItems: 'center', padding: 24 }}>
                  <ActivityIndicator color={colors.primary} />
                  <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 8 }}>Loading leaderboard…</Text>
                </View>
              ) : error && entries.length === 0 && !showDemo ? (
                <View style={{ padding: 14, borderRadius: 10, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.destructive }}>
                  <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>{error}</Text>
                  <TouchableOpacity testID="retry-paper-event-leaderboard" accessibilityRole="button" onPress={() => { void refresh(); }} style={{ alignSelf: 'flex-start', paddingVertical: 8 }}>
                    <Text style={{ color: colors.primary, fontFamily: 'Inter_700Bold', fontSize: 11 }}>RETRY</Text>
                  </TouchableOpacity>
                </View>
              ) : visibleEntries.length === 0 ? (
                <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12, paddingVertical: 16 }}>
                  {selectedEvent.id !== event.id
                    ? 'No opted-in participants are available for this completed week. Participants who opted out are not shown.'
                    : 'No participants have opted in for this event yet.'}
                </Text>
              ) : (
                <View testID={showDemo ? 'paper-event-leaderboard-demo-list' : 'paper-event-leaderboard-list'}>
                  {showDemo && (
                    <Text style={{ color: colors.destructive, fontFamily: 'Inter_700Bold', fontSize: 10, paddingVertical: 7 }}>
                      DEMO ONLY · EXAMPLE ENTRIES · NOT PRODUCTION DATA
                    </Text>
                  )}
                  {visibleEntries.map(renderEntry)}
                </View>
              )}
              {error && entries.length > 0 && (
                <Text style={{ color: colors.destructive, fontFamily: 'Inter_600SemiBold', fontSize: 10, marginTop: 8 }}>{error}</Text>
              )}
              <Text testID="paper-event-leaderboard-last-updated" style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 10 }}>
                Last updated: {timeLabel(lastUpdated)}
              </Text>
              <TouchableOpacity
                testID="toggle-paper-event-leaderboard-demo"
                accessibilityRole="button"
                accessibilityState={{ selected: showDemo }}
                onPress={() => { setShowDemo((current) => !current); setDetail(null); }}
                style={{ alignSelf: 'flex-start', paddingVertical: 11 }}
              >
                <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold', fontSize: 10 }}>
                  {showDemo ? 'HIDE DEMO EXAMPLE' : 'VIEW DEMO EXAMPLE'}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          )}
        </View>
      </Modal>
    </>
  );
}
