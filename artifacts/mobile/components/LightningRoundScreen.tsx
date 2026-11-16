import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ImageBackground,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAvoidingView as KeyboardControllerAvoidingView } from 'react-native-keyboard-controller';
import { useColors } from '@/hooks/useColors';
import { useApi } from '@/hooks/useApi';
import { BottomTabBar } from '@/components/BottomTabBar';
import {
  PaperChallengeLeaderboard,
  submitPaperChallengeScoreNow,
} from '@/components/PaperChallengeLeaderboard';
import { PaperEventShareCard } from '@/components/PaperEventShareCard';
import { getInstallationId } from '@/lib/installation';
import { formatProviderMarketSession, formatProviderPriceSource } from '@/lib/paperOrderEntry';
import { EVENT_ARENA_ARTWORK_SOURCES } from '@/lib/eventArenaArtwork';
import {
  getEventArenaPerformance,
  type EventArenaAccountData,
} from '@/lib/eventArenaHome';
import {
  getLightningRoundEventPortfolio,
  getLightningRoundQueuedOrders,
  getReusableEventArenaAccountId,
  isLightningRoundPreparationOpen,
} from '@/lib/lightningRoundPreparation';
import {
  buildPaperChallengeSummary,
  findPreparedLightningRoundWindow,
  getLightningRoundSeasonSummary,
  getLatestLightningRoundAlias,
  getMissingPaperChallengeQuoteSymbols,
  isPaperChallengeConfiguration,
  LIGHTNING_ROUND_STARTING_BALANCE,
  LIGHTNING_ROUND_TIME_ZONE,
  loadPaperChallengeStore,
  persistPaperChallengeFinalization,
  updatePaperChallengeStore,
  type PaperChallengeEnrollment,
  type PaperChallengeStore,
  type PaperChallengeWindow,
} from '@/lib/paperChallenge';
import {
  isShortPosition,
  parseAccountValueSnapshots,
  type LiveQuote,
  type PaperLot,
} from '@/lib/paperMath';

const BASE_URL = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;
const PAPER_CACHE_KEY = '@stocksense/paper_v2';
const money = (value: number) =>
  `${value < 0 ? '−' : ''}$${Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const signedMoney = (value: number) => `${value >= 0 ? '+' : '−'}${money(Math.abs(value))}`;
const formatPercent = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;

type ScreenTab = 'overview' | 'leaderboard' | 'trades' | 'past';
type PaperCache = Partial<EventArenaAccountData> & {
  activeId?: string;
  lots?: PaperLot[];
};
type QuoteResponse = {
  currentPrice?: number;
  priceChange?: number;
  priceChangePercent?: number;
  priceTimestamp?: number | null;
  marketSession?: string;
  priceSource?: string;
  fetchedAtMs?: number;
};

function countdownLabel(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  const seconds = total % 60;
  return days > 0
    ? `${days}d ${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m`
    : `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function localDateTime(timestamp: number) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: LIGHTNING_ROUND_TIME_ZONE,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(timestamp));
}

function eventDateRange(startAtMs: number, endAtMs: number) {
  return `${localDateTime(startAtMs)} – ${localDateTime(endAtMs)}`;
}

function quoteContext(quote: LiveQuote | undefined) {
  if (!quote) return { label: 'Quote unavailable', timestamp: '' };
  const sourceLabel = formatProviderPriceSource(quote.priceSource);
  const sessionLabel = formatProviderMarketSession(quote.marketSession);
  const label = sourceLabel
    ?? (sessionLabel === 'Market closed' ? 'Closed-session price' : sessionLabel ?? 'Latest available quote');
  const timestamp = Number.isFinite(quote.priceTimestamp) && (quote.priceTimestamp ?? 0) > 0
    ? new Date((quote.priceTimestamp ?? 0) * 1000).toLocaleString()
    : 'Provider time unavailable';
  return { label, timestamp };
}

async function prepareLightningEvents() {
  const response = await fetch(`${BASE_URL}/api/event-arena/lightning-round/prepare`, { method: 'POST' });
  if (!response.ok) throw new Error('Could not prepare the scheduled Lightning Round.');
  const payload = await response.json() as {
    events?: unknown[];
    available?: boolean;
    message?: string;
  };
  if (payload.available === false) {
    throw new Error(payload.message || 'No eligible Lightning Round dates are currently available.');
  }
  if (!Array.isArray(payload.events)) throw new Error('The Lightning Round schedule response was invalid.');
  return payload.events;
}

async function readPaperCache(): Promise<PaperCache> {
  const raw = await AsyncStorage.getItem(PAPER_CACHE_KEY);
  const parsed = raw ? JSON.parse(raw) as PaperCache : {};
  return {
    ...parsed,
    accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [],
    positions: Array.isArray(parsed.positions) ? parsed.positions : [],
    transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
    orders: Array.isArray(parsed.orders) ? parsed.orders : [],
    snapshots: parseAccountValueSnapshots(parsed.snapshots),
  };
}

export function LightningRoundScreen() {
  const colors = useColors();
  const [now, setNow] = useState(Date.now());
  const [preparedEvents, setPreparedEvents] = useState<unknown[] | null>(null);
  const [scheduleError, setScheduleError] = useState('');
  const [scheduleRetry, setScheduleRetry] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void prepareLightningEvents().then((events) => {
      if (cancelled) return;
      setPreparedEvents(events);
      setScheduleError('');
    }).catch((error: unknown) => {
      if (cancelled) return;
      setPreparedEvents(null);
      setScheduleError(error instanceof Error ? error.message : 'Could not prepare the schedule.');
    });
    return () => { cancelled = true; };
  }, [scheduleRetry]);

  const scheduleSelection = useMemo(() => {
    if (!preparedEvents) return null;
    try {
      return { window: findPreparedLightningRoundWindow(preparedEvents, now), error: '' };
    } catch (error) {
      return {
        window: null,
        error: error instanceof Error ? error.message : 'The prepared Lightning Round schedule was invalid.',
      };
    }
  }, [now, preparedEvents]);

  const retry = () => {
    setPreparedEvents(null);
    setScheduleError('');
    setScheduleRetry((value) => value + 1);
  };
  if (scheduleError || scheduleSelection?.error) {
    return (
      <LightningRoundScheduleUnavailable
        message={scheduleError || scheduleSelection?.error || ''}
        onRetry={retry}
      />
    );
  }
  if (!preparedEvents) {
    return (
      <View style={{ flex: 1, justifyContent: 'space-between', backgroundColor: colors.background }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
          <ActivityIndicator color={colors.primary} />
          <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 10 }}>
            Preparing the next eligible championship…
          </Text>
        </View>
        <BottomTabBar />
      </View>
    );
  }
  const window = scheduleSelection?.window ?? null;
  if (!window) {
    return (
      <LightningRoundScheduleUnavailable
        message="No eligible Lightning Round dates are currently available. Check back later."
        onRetry={retry}
      />
    );
  }
  return <LightningRoundScreenContent window={window} now={now} />;
}

function LightningRoundScheduleUnavailable({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  const colors = useColors();
  return (
    <View style={{ flex: 1, justifyContent: 'space-between', backgroundColor: colors.background }}>
      <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 24 }}>
        <Text testID="lightning-round-unavailable" accessibilityRole="alert" style={{ color: colors.destructive, fontFamily: 'Inter_700Bold', fontSize: 19 }}>
          Lightning Round unavailable
        </Text>
        <Text testID="lightning-round-calendar-error" style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 20, marginTop: 10 }}>
          {message}
        </Text>
        <TouchableOpacity
          testID="retry-lightning-round-schedule"
          accessibilityRole="button"
          onPress={onRetry}
          style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start', marginTop: 12 }}
        >
          <Text style={{ color: colors.primary, fontFamily: 'Inter_700Bold', fontSize: 12 }}>RETRY</Text>
        </TouchableOpacity>
      </View>
      <BottomTabBar />
    </View>
  );
}

function LightningRoundScreenContent({ window, now }: { window: PaperChallengeWindow; now: number }) {
  const colors = useColors();
  const { apiFetch } = useApi();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const routeParams = useLocalSearchParams<{ tab?: string; join?: string }>();
  const [store, setStore] = useState<PaperChallengeStore>({ enrollment: null, history: [] });
  const [storeReady, setStoreReady] = useState(false);
  const [storeError, setStoreError] = useState('');
  const [accountData, setAccountData] = useState<EventArenaAccountData>({
    accounts: [],
    positions: [],
    transactions: [],
    orders: [],
    snapshots: [],
  });
  const [quotes, setQuotes] = useState<Record<string, LiveQuote>>({});
  const [quoteError, setQuoteError] = useState('');
  const [accountLoading, setAccountLoading] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [alias, setAlias] = useState('');
  const [joinError, setJoinError] = useState('');
  const [joining, setJoining] = useState(false);
  const joiningRef = useRef(false);
  const [rank, setRank] = useState<number | null>(null);
  const [scoreSyncError, setScoreSyncError] = useState('');
  const [serverParticipantFailure, setServerParticipantFailure] = useState('');
  const [tab, setTab] = useState<ScreenTab>('overview');
  const [archiveSaving, setArchiveSaving] = useState(false);
  const [archiveError, setArchiveError] = useState('');
  const [archiveRetry, setArchiveRetry] = useState(0);
  const archiveAttemptedEventRef = useRef<string | null>(null);
  const scoreSyncingRef = useRef(false);
  const tradeJoinPromptOpenedRef = useRef(false);

  const enrollment = store.lightningEnrollment ?? null;
  const previousLightningAlias = useMemo(
    () => getLatestLightningRoundAlias(store.history),
    [store.history],
  );
  const isEnrolled = enrollment?.eventId === window.id;
  const scheduledConfiguration = useMemo(() => ({
    id: window.id,
    startAtMs: window.startAtMs,
    endAtMs: window.endAtMs,
    artworkId: 'lightning-round-arena' as const,
    eventType: 'lightning-round' as const,
    startingBalance: LIGHTNING_ROUND_STARTING_BALANCE,
    rankingDirection: 'highest-return' as const,
    phase: window.phase,
  }), [window.endAtMs, window.id, window.phase, window.startAtMs]);

  useEffect(() => {
    if (routeParams.tab === 'leaderboard' || routeParams.tab === 'trades' || routeParams.tab === 'past' || routeParams.tab === 'overview') {
      setTab(routeParams.tab);
    }
  }, [routeParams.tab]);

  useEffect(() => {
    if (
      routeParams.join !== 'trade'
      || !storeReady
      || tradeJoinPromptOpenedRef.current
    ) return;
    tradeJoinPromptOpenedRef.current = true;
    if (store.lightningEnrollment?.eventId === window.id) {
      router.replace({ pathname: '/paper', params: { challengeAccountId: store.lightningEnrollment.accountId } });
      return;
    }
    if (
      window.phase === 'upcoming'
      && isLightningRoundPreparationOpen(window.startAtMs, now)
    ) {
      setJoinOpen(true);
    }
  }, [now, routeParams.join, store.lightningEnrollment?.accountId, store.lightningEnrollment?.eventId, storeReady, window.id, window.phase, window.startAtMs]);

  useEffect(() => {
    let cancelled = false;
    void loadPaperChallengeStore({ getItem: (key) => AsyncStorage.getItem(key) }).then((saved) => {
      if (cancelled) return;
      setStore(saved);
      setStoreReady(true);
    }).catch((error: unknown) => {
      if (cancelled) return;
      setStoreError(error instanceof Error ? error.message : 'Could not load your Lightning Round history.');
      setStoreReady(true);
    });
    return () => { cancelled = true; };
  }, []);

  const refreshAccount = useCallback(async () => {
    setAccountLoading(true);
    try {
      const cache = await readPaperCache();
      let nextData: EventArenaAccountData = {
        accounts: cache.accounts ?? [],
        positions: cache.positions ?? [],
        transactions: cache.transactions ?? [],
        orders: cache.orders ?? [],
        snapshots: cache.snapshots ?? [],
      };
      if (enrollment && Date.now() >= enrollment.eventStartAtMs) {
        try {
          const installationId = await getInstallationId();
          const remote = await apiFetch<{
            participant?: { status?: string; failureReason?: string | null };
            account?: EventArenaAccountData['accounts'][number] | null;
            positions?: EventArenaAccountData['positions'];
            transactions?: EventArenaAccountData['transactions'];
            orders?: EventArenaAccountData['orders'];
            lots?: PaperLot[];
          }>(`/api/event-arena/lightning-round/${encodeURIComponent(enrollment.eventId)}/state`, {
            headers: { 'X-Event-Arena-Installation-Id': installationId },
          });
          if (remote.account) {
            nextData = {
              ...nextData,
              accounts: [...nextData.accounts.filter((item) => item.id !== enrollment.accountId), remote.account],
              positions: [
                ...nextData.positions.filter((item) => item.accountId !== enrollment.accountId),
                ...(remote.positions ?? []),
              ],
              transactions: [
                ...nextData.transactions.filter((item) => item.accountId !== enrollment.accountId),
                ...(remote.transactions ?? []),
              ],
              orders: [
                ...nextData.orders.filter((item) => item.accountId !== enrollment.accountId),
                ...(remote.orders ?? []),
              ],
            };
            await AsyncStorage.setItem(PAPER_CACHE_KEY, JSON.stringify({
              ...cache,
              ...nextData,
              lots: [
                ...(cache.lots ?? []).filter((item) => item.accountId !== enrollment.accountId),
                ...(remote.lots ?? []),
              ],
              activeId: enrollment.accountId,
            }));
          }
          setServerParticipantFailure(
            remote.participant?.status === 'rejected'
              ? remote.participant.failureReason || 'No opening order filled, so you were not entered.'
              : '',
          );
        } catch {
          // The local cache remains usable while the scheduled worker or API is unavailable.
        }
      }
      setAccountData(nextData);
      const accountId = enrollment?.accountId;
      const symbols = accountId
        ? [...new Set(nextData.positions
          .filter((position) => position.accountId === accountId && position.shares > 0)
          .map((position) => position.symbol))]
        : [];
      const results = await Promise.allSettled(symbols.map(async (symbol) => {
        const response = await fetch(`${BASE_URL}/api/stocks/quote/${encodeURIComponent(symbol)}`);
        if (!response.ok) throw new Error(`Could not load ${symbol} quote.`);
        const quote = await response.json() as QuoteResponse;
        if (!Number.isFinite(quote.currentPrice) || (quote.currentPrice ?? 0) <= 0) {
          throw new Error(`The provider returned no usable price for ${symbol}.`);
        }
        return [symbol, {
          price: quote.currentPrice!,
          change: Number.isFinite(quote.priceChange) ? quote.priceChange! : 0,
          pct: Number.isFinite(quote.priceChangePercent) ? quote.priceChangePercent! : 0,
          priceTimestamp: quote.priceTimestamp ?? null,
          marketSession: quote.marketSession,
          priceSource: quote.priceSource,
          fetchedAtMs: quote.fetchedAtMs,
        } satisfies LiveQuote] as const;
      }));
      const nextQuotes: Record<string, LiveQuote> = {};
      const failures: string[] = [];
      for (const result of results) {
        if (result.status === 'fulfilled') nextQuotes[result.value[0]] = result.value[1];
        else failures.push(result.reason instanceof Error ? result.reason.message : 'A quote could not be loaded.');
      }
      setQuotes(nextQuotes);
      setQuoteError(failures.join(' '));
    } catch (error) {
      setQuoteError(error instanceof Error ? error.message : 'Could not load the Lightning Round account.');
    } finally {
      setAccountLoading(false);
    }
  }, [apiFetch, enrollment?.accountId, enrollment?.eventId, enrollment?.eventStartAtMs]);

  useEffect(() => {
    void refreshAccount();
    const timer = setInterval(() => { void refreshAccount(); }, 60_000);
    return () => clearInterval(timer);
  }, [refreshAccount]);

  const syncEventScore = useCallback(async () => {
    if (
      scoreSyncingRef.current
      || !storeReady
      || tab === 'leaderboard'
      || window.phase !== 'active'
      || enrollment?.eventId !== window.id
      || enrollment.leaderboardOptedIn !== true
    ) return;
    scoreSyncingRef.current = true;
    try {
      await submitPaperChallengeScoreNow(enrollment, scheduledConfiguration);
      const installationId = await getInstallationId();
      const response = await fetch(
        `${BASE_URL}/api/event-arena/${encodeURIComponent(window.id)}/leaderboard?installationId=${encodeURIComponent(installationId)}`,
        { headers: { 'X-Event-Arena-Installation-Id': installationId } },
      );
      if (!response.ok) throw new Error('The current leaderboard rank is unavailable.');
      const payload = await response.json() as {
        entries?: Array<{ rank?: number; isCurrentUser?: boolean }>;
      };
      const ownEntry = payload.entries?.find((entry) =>
        entry.isCurrentUser && Number.isInteger(entry.rank) && (entry.rank ?? 0) > 0,
      );
      setRank(ownEntry?.rank ?? null);
      setScoreSyncError('');
    } catch (error) {
      setScoreSyncError(error instanceof Error ? error.message : 'Your score could not be updated.');
    } finally {
      scoreSyncingRef.current = false;
    }
  }, [enrollment, scheduledConfiguration, storeReady, tab, window.id, window.phase]);

  useEffect(() => {
    if (
      !storeReady
      || tab === 'leaderboard'
      || window.phase !== 'active'
      || enrollment?.eventId !== window.id
      || enrollment.leaderboardOptedIn !== true
    ) return;
    void syncEventScore();
    const timer = setInterval(() => { void syncEventScore(); }, 60_000);
    return () => clearInterval(timer);
  }, [enrollment, storeReady, syncEventScore, tab, window.id, window.phase]);

  useEffect(() => {
    if (
      !storeReady
      || accountLoading
      || !enrollment
      || now < enrollment.eventEndAtMs
      || archiveAttemptedEventRef.current === enrollment.eventId
    ) return;
    const eventAccount = accountData.accounts.find((item) => item.id === enrollment.accountId);
    if (!eventAccount) {
      archiveAttemptedEventRef.current = enrollment.eventId;
      setArchiveError('The completed Lightning Round account is missing, so its result cannot be archived.');
      return;
    }
    const eventPortfolioForArchive = getLightningRoundEventPortfolio(
      accountData.transactions,
      enrollment.eventId,
      Object.fromEntries(Object.entries(quotes).map(([symbol, quote]) => [symbol, quote.price])),
      LIGHTNING_ROUND_STARTING_BALANCE,
    );
    const positions = eventPortfolioForArchive.positions.map((position) => ({
      id: `${enrollment.eventId}:${position.symbol}`,
      accountId: enrollment.accountId,
      symbol: position.symbol,
      companyName: position.companyName,
      shares: position.shares,
      positionType: 'long' as const,
      avgCost: position.avgCost,
    }));
    const missingSymbols = getMissingPaperChallengeQuoteSymbols(positions, quotes);
    if (missingSymbols.length > 0) {
      archiveAttemptedEventRef.current = enrollment.eventId;
      setArchiveError(`Could not freeze the result because quotes are unavailable for ${missingSymbols.join(', ')}.`);
      return;
    }

    archiveAttemptedEventRef.current = enrollment.eventId;
    setArchiveSaving(true);
    setArchiveError('');
    void (async () => {
      try {
        const endEquity = eventPortfolioForArchive.equity;
        if (endEquity === null || !Number.isFinite(endEquity)) {
          throw new Error('The event-only Lightning Round account value is unavailable.');
        }
        const startingEquity = LIGHTNING_ROUND_STARTING_BALANCE;
        const completedEnrollment = {
          ...enrollment,
          joinedAtMs: enrollment.eventStartAtMs,
          startEquity: startingEquity,
        };
        let finalRank: number | undefined;
        if (enrollment.leaderboardOptedIn) {
          const installationId = await getInstallationId();
          const response = await fetch(
            `${BASE_URL}/api/event-arena/${encodeURIComponent(enrollment.eventId)}/leaderboard`,
            { headers: { 'X-Event-Arena-Installation-Id': installationId } },
          );
          if (!response.ok) throw new Error('The final Lightning Round ranking is unavailable.');
          const payload = await response.json() as { entries?: Array<{ rank?: number; isCurrentUser?: boolean }> };
          finalRank = payload.entries?.find((entry) =>
            entry.isCurrentUser && Number.isInteger(entry.rank) && (entry.rank ?? 0) > 0,
          )?.rank;
        }
        const completedAtMs = Date.now();
        const summary = buildPaperChallengeSummary(
          completedEnrollment,
          endEquity,
          accountData.transactions.filter((transaction) =>
            transaction.lightningRoundEventId === enrollment.eventId,
          ),
          completedAtMs,
          {
            equityHistory: [
              {
                accountId: enrollment.accountId,
                date: new Date(completedEnrollment.joinedAtMs).toISOString(),
                value: startingEquity,
              },
              {
                accountId: enrollment.accountId,
                date: new Date(completedAtMs).toISOString(),
                value: endEquity,
              },
            ],
            finalPositions: positions.map((position) => {
              const marketPrice = quotes[position.symbol]?.price;
              if (!Number.isFinite(marketPrice) || (marketPrice ?? 0) <= 0) {
                throw new Error(`A final price is unavailable for ${position.symbol}.`);
              }
              return {
                symbol: position.symbol,
                companyName: position.companyName,
                shares: position.shares,
                positionType: isShortPosition(position) ? 'short' : 'long',
                avgCost: position.avgCost,
                marketPrice: marketPrice!,
                marketValue: position.shares * marketPrice!,
                unrealizedPnL: position.shares * (isShortPosition(position)
                  ? position.avgCost - marketPrice!
                  : marketPrice! - position.avgCost),
              };
            }),
            ...(finalRank ? { finalRank } : {}),
          },
        );
        const finalized = await persistPaperChallengeFinalization(summary, completedAtMs, {
          getItem: (key) => AsyncStorage.getItem(key),
          setItem: (key, value) => AsyncStorage.setItem(key, value),
        });
        setStore(finalized);
      } catch (error) {
        setArchiveError(error instanceof Error ? error.message : 'Could not save the completed Lightning Round result.');
      } finally {
        setArchiveSaving(false);
      }
    })();
  }, [
    accountData.accounts,
    accountData.transactions,
    accountLoading,
    enrollment,
    now,
    quotes,
    archiveRetry,
    storeReady,
  ]);

  const performance = useMemo(() => enrollment
    ? getEventArenaPerformance(enrollment, window, accountData, Object.fromEntries(
      Object.entries(quotes).map(([symbol, quote]) => [symbol, quote.price]),
    ), now)
    : null, [accountData, enrollment, now, quotes, window]);
  const eventPortfolio = useMemo(() => enrollment
    ? getLightningRoundEventPortfolio(
      accountData.transactions,
      enrollment.eventId,
      Object.fromEntries(Object.entries(quotes).map(([symbol, quote]) => [symbol, quote.price])),
      LIGHTNING_ROUND_STARTING_BALANCE,
    )
    : null, [accountData.transactions, enrollment?.eventId, quotes]);
  const eventPositions = eventPortfolio?.positions.map((position) => ({
    id: `${enrollment?.eventId}:${position.symbol}`,
    accountId: enrollment?.accountId ?? '',
    symbol: position.symbol,
    companyName: position.companyName,
    shares: position.shares,
    positionType: 'long' as const,
    avgCost: position.avgCost,
  })) ?? [];
  const accountEquity = eventPortfolio?.equity ?? null;
  const dollarProfitLoss = accountEquity == null
    ? null
    : accountEquity - LIGHTNING_ROUND_STARTING_BALANCE;
  const returnPercent = dollarProfitLoss == null
    ? null
    : dollarProfitLoss / LIGHTNING_ROUND_STARTING_BALANCE * 100;
  const tradeHistory = useMemo(() => accountData.transactions
    .filter((trade) => trade.lightningRoundEventId === enrollment?.eventId)
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date)), [accountData.transactions, enrollment?.eventId]);
  const lightningOrders = useMemo(() => accountData.orders
    .filter((order) =>
      order.accountId === enrollment?.accountId
      && order.lightningRoundEventId === enrollment?.eventId,
    )
    .sort((a, b) => Date.parse(b.placedAt) - Date.parse(a.placedAt)),
  [accountData.orders, enrollment?.accountId, enrollment?.eventId]);
  const pendingOrders = useMemo(() => enrollment
    ? getLightningRoundQueuedOrders(accountData.orders, enrollment.eventId, enrollment.accountId)
      .sort((a, b) => Date.parse(b.placedAt) - Date.parse(a.placedAt))
    : [], [accountData.orders, enrollment?.accountId, enrollment?.eventId]);
  const participantEntered = lightningOrders.some((order) => order.status === 'filled');
  const participantFailureReason = lightningOrders.find((order) => order.rejectionReason)?.rejectionReason
    || serverParticipantFailure;
  const openAccount = () => router.push({
    pathname: '/paper',
    params: { challengeAccountId: enrollment?.accountId },
  });

  const joinRound = async () => {
    if (joiningRef.current) return;
    if (!alias.trim()) {
      setJoinError('Choose an alias to appear on the leaderboard.');
      return;
    }
    joiningRef.current = true;
    setJoining(true);
    setJoinError('');
    try {
      const configuredEvents = await prepareLightningEvents();
      const matching = configuredEvents.find((item) =>
        !!item && typeof item === 'object' && (item as Record<string, unknown>).eventId === window.id,
      ) as Record<string, unknown> | undefined;
      const rawConfiguration = matching as unknown;
      if (!isPaperChallengeConfiguration(rawConfiguration)) {
        throw new Error('This event’s saved rules are invalid.');
      }
      if (
        matching?.startAtMs !== window.startAtMs
        || matching?.endAtMs !== window.endAtMs
        || matching?.eventType !== 'lightning-round'
        || matching?.artworkId !== 'lightning-round-arena'
      ) throw new Error('This event’s saved schedule does not match.');
      const latest = await loadPaperChallengeStore({ getItem: (key) => AsyncStorage.getItem(key) });
      if (latest.lightningEnrollment?.eventId === window.id) {
        setStore(latest);
        setJoinOpen(false);
        router.replace({
          pathname: '/paper',
          params: { challengeAccountId: latest.lightningEnrollment.accountId },
        });
        return;
      }
      if (latest.lightningEnrollment && latest.lightningEnrollment.eventId !== window.id) {
        throw new Error('Finish saving the prior Lightning Round result before joining another week.');
      }
      const cache = await readPaperCache();
      const accountId = getReusableEventArenaAccountId({
        accounts: cache.accounts ?? [],
        activeId: cache.activeId,
        currentEventEnrollment: latest.enrollment,
        history: latest.history,
      });
      const existingAccount = cache.accounts?.find((item) => item.id === accountId);
      if (!accountId || !existingAccount) {
        throw new Error('Open Paper Trading once to set up your existing account before joining.');
      }
      const joinedAtMs = window.startAtMs;
      const nextEnrollment: PaperChallengeEnrollment = {
        eventId: window.id,
        eventType: 'lightning-round',
        artworkId: 'lightning-round-arena',
        startingBalance: LIGHTNING_ROUND_STARTING_BALANCE,
        rankingDirection: 'highest-return',
        eventStartAtMs: window.startAtMs,
        eventEndAtMs: window.endAtMs,
        joinedAtMs,
        accountId,
        accountName: existingAccount.name,
        startEquity: null,
        leaderboardAlias: alias.trim(),
        leaderboardOptedIn: true,
      };
      const installationId = await getInstallationId();
      await apiFetch(`/api/event-arena/lightning-round/${encodeURIComponent(window.id)}/state`, {
        method: 'PUT',
        headers: { 'X-Event-Arena-Installation-Id': installationId },
        body: JSON.stringify({
          alias: alias.trim(),
          account: existingAccount,
          positions: (cache.positions ?? []).filter((item) => item.accountId === accountId),
          transactions: (cache.transactions ?? []).filter((item) => item.accountId === accountId),
          orders: (cache.orders ?? []).filter((item) => item.accountId === accountId),
          lots: (cache.lots ?? []).filter((item) => item.accountId === accountId),
        }),
      });
      await AsyncStorage.setItem(PAPER_CACHE_KEY, JSON.stringify({
        ...cache,
        activeId: accountId,
      }));
      const updated = await updatePaperChallengeStore((current) =>
        current.lightningEnrollment
          ? current
          : { ...current, lightningEnrollment: nextEnrollment }, {
        getItem: (key) => AsyncStorage.getItem(key),
        setItem: (key, value) => AsyncStorage.setItem(key, value),
      });
      if (updated.lightningEnrollment?.eventId !== window.id) {
        throw new Error('The Lightning Round registration could not be saved.');
      }
      setStore(updated);
      setJoinOpen(false);
      setAlias('');
      router.push({ pathname: '/paper', params: { challengeAccountId: accountId } });
    } catch (error) {
      setJoinError(error instanceof Error ? error.message : 'Could not join Lightning Round.');
    } finally {
      joiningRef.current = false;
      setJoining(false);
    }
  };

  const updateEnrollment = useCallback((next: PaperChallengeEnrollment | null) => {
    void updatePaperChallengeStore((current) => ({
      ...current,
      lightningEnrollment: next,
    }), {
      getItem: (key) => AsyncStorage.getItem(key),
      setItem: (key, value) => AsyncStorage.setItem(key, value),
    }).then(setStore);
  }, []);

  const changeTab = (nextTab: ScreenTab) => setTab(nextTab);
  const countdown = window.phase === 'active'
    ? countdownLabel(window.endAtMs - now)
    : countdownLabel(window.startAtMs - now);
  const formattedDates = eventDateRange(window.startAtMs, window.endAtMs);
  const account = performance?.account ?? null;
  const priorRoundNeedsArchive = !!enrollment
    && enrollment.eventId !== window.id
    && now >= enrollment.eventEndAtMs;
  const showJoin = !isEnrolled && !priorRoundNeedsArchive && window.phase !== 'ended';
  const canOpenTradeAccount = isEnrolled;
  const containerWidth = Math.min(screenWidth, 860);
  const pastLightningEvents = store.history.filter((event) =>
    event.eventType === 'lightning-round' || event.eventId.startsWith('lightning-'),
  );
  const lightningRoundSeason = getLightningRoundSeasonSummary(store.history, now);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: Platform.OS === 'web' ? 10 : insets.top }}>
      <View style={{ maxWidth: containerWidth, width: '100%', flex: 1, alignSelf: 'center' }}>
        <View style={{ minHeight: 52, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 9, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={{ width: 42, height: 42, alignItems: 'center', justifyContent: 'center' }}>
            <Feather name="arrow-left" size={19} color={colors.foreground} />
          </TouchableOpacity>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 17 }}>Lightning Round</Text>
            <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 2 }}>24-hour off-week championship</Text>
          </View>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Open Past Events"
            onPress={() => changeTab('past')}
            style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
          >
            <Feather name="archive" size={18} color={colors.primary} />
          </TouchableOpacity>
        </View>

        <View style={{ flexDirection: 'row', gap: 4, paddingHorizontal: 10, paddingVertical: 8 }}>
          {([
            { id: 'overview' as const, label: 'Round', icon: 'zap' as const },
            { id: 'leaderboard' as const, label: 'Leaderboard', icon: 'users' as const },
            { id: 'trades' as const, label: 'My Trades', icon: 'activity' as const },
            { id: 'past' as const, label: 'Past Events', icon: 'archive' as const },
          ]).map((item) => (
            <TouchableOpacity
              key={item.id}
              testID={`lightning-round-tab-${item.id}`}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === item.id }}
              onPress={() => changeTab(item.id)}
              style={{
                minHeight: 47,
                flex: 1,
                minWidth: 0,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 3,
                borderRadius: 11,
                backgroundColor: tab === item.id ? colors.primary : colors.card,
                borderWidth: 1,
                borderColor: tab === item.id ? colors.primary : colors.border,
                paddingHorizontal: 2,
              }}
            >
              <Feather name={item.icon} size={14} color={tab === item.id ? colors.primaryForeground : colors.mutedForeground} />
              <Text numberOfLines={1} style={{ color: tab === item.id ? colors.primaryForeground : colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 9 }}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {!storeReady && (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={colors.primary} />
            <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 10 }}>Preparing the next eligible championship…</Text>
          </View>
        )}

        {storeReady && storeError ? (
          <View style={{ margin: 16, padding: 16, borderRadius: 14, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.destructive }}>
            <Text accessibilityRole="alert" style={{ color: colors.destructive, fontFamily: 'Inter_700Bold', fontSize: 13 }}>Lightning Round unavailable</Text>
            <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18, marginTop: 6 }}>{storeError}</Text>
          </View>
        ) : null}

        {storeReady && enrollment && now >= enrollment.eventEndAtMs && (archiveSaving || archiveError) && (
          <View testID="lightning-round-archive-status" style={{ marginHorizontal: 14, marginTop: 9, padding: 12, borderRadius: 13, backgroundColor: colors.card, borderWidth: 1, borderColor: archiveError ? colors.destructive : colors.border }}>
            <Text accessibilityLiveRegion="polite" style={{ color: archiveError ? colors.destructive : colors.primary, fontFamily: 'Inter_700Bold', fontSize: 11 }}>
              {archiveSaving ? 'Saving your final Lightning Round result…' : 'Lightning Round result needs attention'}
            </Text>
            {archiveError ? (
              <>
                <Text accessibilityRole="alert" style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 10, lineHeight: 15, marginTop: 5 }}>{archiveError}</Text>
                <TouchableOpacity
                  testID="retry-lightning-round-archive"
                  accessibilityRole="button"
                  onPress={() => {
                    archiveAttemptedEventRef.current = null;
                    setArchiveError('');
                    setArchiveRetry((value) => value + 1);
                    void refreshAccount();
                  }}
                  style={{ minHeight: 38, alignSelf: 'flex-start', justifyContent: 'center' }}
                >
                  <Text style={{ color: colors.primary, fontFamily: 'Inter_700Bold', fontSize: 10 }}>RETRY RESULT SAVE</Text>
                </TouchableOpacity>
              </>
            ) : <ActivityIndicator style={{ marginTop: 7, alignSelf: 'flex-start' }} color={colors.primary} />}
          </View>
        )}

        {storeReady && !storeError && tab === 'overview' && (
          <ScrollView
            testID="lightning-round-overview"
            contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: insets.bottom + 28 }}
            showsVerticalScrollIndicator={false}
          >
            <ImageBackground
              testID="lightning-round-arena-background"
              source={EVENT_ARENA_ARTWORK_SOURCES['lightning-round-arena']}
              resizeMode="cover"
              imageStyle={{ opacity: 0.72, borderRadius: 22 }}
              style={{ minHeight: 280, justifyContent: 'flex-end', marginTop: 5, padding: 18, borderRadius: 22, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,202,92,0.48)', backgroundColor: '#10131a' }}
            >
              <View pointerEvents="none" style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(5,8,14,0.32)' }} />
              <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, backgroundColor: 'rgba(7,11,18,0.82)', borderWidth: 1, borderColor: 'rgba(255,213,110,0.58)' }}>
                <Feather name="zap" size={13} color="#FFD774" />
                <Text style={{ color: '#FFE7A6', fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1.1 }}>OFF-WEEK LIGHTNING ROUND</Text>
              </View>
              <Text style={{ color: '#FFF5D8', fontFamily: 'Inter_700Bold', fontSize: screenWidth < 370 ? 28 : 34, lineHeight: screenWidth < 370 ? 34 : 39, marginTop: 12 }}>24 hours.{'\n'}One champion.</Text>
              <Text style={{ color: '#E5E8ED', fontFamily: 'Inter_500Medium', fontSize: 12, lineHeight: 18, marginTop: 8 }}>
                Use your existing Event Arena paper account. The highest percentage return wins.
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
                {[
                  ['ACCOUNT', 'Event Arena'],
                  ['DURATION', '24 hours'],
                  ['OBJECTIVE', 'Highest return'],
                ].map(([label, value]) => (
                  <View key={label} style={{ flexGrow: 1, minWidth: '29%', padding: 10, borderRadius: 12, backgroundColor: 'rgba(7,11,18,0.76)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)' }}>
                    <Text style={{ color: '#BEC4CD', fontFamily: 'Inter_600SemiBold', fontSize: 8, letterSpacing: 0.8 }}>{label}</Text>
                    <Text style={{ color: '#FFF3D0', fontFamily: 'Inter_700Bold', fontSize: 12, marginTop: 4 }}>{value}</Text>
                  </View>
                ))}
              </View>
            </ImageBackground>

            <View testID="lightning-round-countdown" style={{ marginTop: 12, padding: 16, borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ color: colors.primary, fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1 }}>
                {window.phase === 'active' ? 'TIME LEFT IN THIS ROUND' : 'NEXT ROUND STARTS IN'}
              </Text>
              <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 30, letterSpacing: 1, marginTop: 5 }}>{countdown}</Text>
              <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium', fontSize: 10, lineHeight: 15, marginTop: 5 }}>
                {formattedDates} · {LIGHTNING_ROUND_TIME_ZONE}
              </Text>
              <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 6 }}>
                {window.phase === 'active'
                  ? 'Trading is open at the latest available quote, including when markets are closed.'
                  : 'Prepare market orders during the final 72 hours. They remain pending until the scheduled start.'}
              </Text>
              <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 10, lineHeight: 15, marginTop: 6 }}>
                Event notifications in Event Arena settings can remind you when an eligible round opens.
              </Text>
            </View>

            {isEnrolled ? (
              <>
                <View testID="lightning-round-account-summary" style={{ marginTop: 12, padding: 16, borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Feather name="award" size={16} color={colors.primary} />
                    <Text style={{ flex: 1, color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 14 }}>Your Lightning Round account</Text>
                    {rank && <Text style={{ color: colors.primary, fontFamily: 'Inter_700Bold', fontSize: 12 }}>#{rank}</Text>}
                  </View>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 13 }}>
                    {[
                      ['ACCOUNT EQUITY', accountEquity == null ? '—' : money(accountEquity)],
                      ['DOLLAR P/L', dollarProfitLoss == null ? '—' : signedMoney(dollarProfitLoss)],
                      ['RETURN', returnPercent == null ? '—' : formatPercent(returnPercent)],
                    ].map(([label, value]) => (
                      <View key={label} style={{ flex: 1, minWidth: '30%', padding: 11, borderRadius: 12, backgroundColor: colors.background }}>
                        <Text numberOfLines={1} style={{ color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold', fontSize: 8, letterSpacing: 0.7 }}>{label}</Text>
                        <Text adjustsFontSizeToFit numberOfLines={1} style={{ color: label === 'DOLLAR P/L' && dollarProfitLoss != null ? dollarProfitLoss >= 0 ? colors.primary : colors.destructive : colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 13, marginTop: 5 }}>{value}</Text>
                      </View>
                    ))}
                  </View>
                  <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 10, lineHeight: 15, marginTop: 10 }}>
                    Score starts at $100,000 and counts only fills tagged to this Lightning Round. Your existing Event Arena account is still used for trading.
                  </Text>
                  {participantEntered ? (
                    <Text testID="lightning-round-entry-status" style={{ color: colors.primary, fontFamily: 'Inter_700Bold', fontSize: 10, marginTop: 8 }}>
                      ENTERED — AT LEAST ONE OPENING ORDER FILLED.
                    </Text>
                  ) : participantFailureReason ? (
                    <Text testID="lightning-round-entry-status" accessibilityRole="alert" style={{ color: colors.destructive, fontFamily: 'Inter_500Medium', fontSize: 10, lineHeight: 15, marginTop: 8 }}>
                      NOT ENTERED — {participantFailureReason}
                    </Text>
                  ) : null}
                  {canOpenTradeAccount && (
                    <TouchableOpacity
                      testID="lightning-round-open-trading"
                      accessibilityRole="button"
                      onPress={openAccount}
                      style={{ minHeight: 46, marginTop: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, backgroundColor: colors.primary }}
                    >
                      <Feather name="trending-up" size={15} color={colors.primaryForeground} />
                      <Text style={{ color: colors.primaryForeground, fontFamily: 'Inter_700Bold', fontSize: 12 }}>
                        {window.phase === 'active' ? 'TRADE IN EVENT ARENA' : 'PREPARE YOUR ORDERS'}
                      </Text>
                    </TouchableOpacity>
                  )}
                  {window.phase === 'upcoming' && (
                    <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium', fontSize: 10, marginTop: 11 }}>
                      Order preparation opens 72 hours before the scheduled start.
                    </Text>
                  )}
                  {accountLoading && <ActivityIndicator style={{ marginTop: 10 }} color={colors.primary} />}
                  {quoteError ? (
                    <View style={{ marginTop: 10 }}>
                      <Text accessibilityRole="alert" style={{ color: colors.destructive, fontFamily: 'Inter_400Regular', fontSize: 10, lineHeight: 15 }}>{quoteError}</Text>
                      <TouchableOpacity accessibilityRole="button" onPress={() => { void refreshAccount(); }} style={{ minHeight: 38, alignSelf: 'flex-start', justifyContent: 'center' }}>
                        <Text style={{ color: colors.primary, fontFamily: 'Inter_700Bold', fontSize: 10 }}>RETRY QUOTES</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                  {eventPositions.length > 0 && (
                    <View style={{ marginTop: 13, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 }}>
                      <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 0.8, marginBottom: 4 }}>POSITION PRICES</Text>
                      {eventPositions.map((position) => {
                        const quote = quotes[position.symbol];
                        const context = quoteContext(quote);
                        return (
                          <View key={position.id} testID={`lightning-round-quote-${position.symbol}`} style={{ paddingVertical: 7, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                            <View style={{ flex: 1, minWidth: 0 }}>
                              <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 11 }}>{position.symbol}</Text>
                              <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium', fontSize: 9, marginTop: 2 }}>{context.label} · {context.timestamp}</Text>
                            </View>
                            <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 11 }}>{quote ? money(quote.price) : '—'}</Text>
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
                {performance?.account && (
                  <View style={{ marginTop: 10, padding: 12, borderRadius: 14, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
                    <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold', fontSize: 9 }}>PARTICIPANT</Text>
                    <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 12, marginTop: 4 }}>{enrollment.leaderboardAlias || 'Your account'}</Text>
                    <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 3 }}>
                      {eventPortfolio?.tradeCount ?? 0} event trades · {pendingOrders.length} pending orders
                    </Text>
                    {scoreSyncError ? (
                      <Text accessibilityRole="alert" style={{ color: colors.destructive, fontFamily: 'Inter_400Regular', fontSize: 10, lineHeight: 15, marginTop: 5 }}>
                        {scoreSyncError}
                      </Text>
                    ) : null}
                  </View>
                )}
              </>
            ) : showJoin ? (
              <View style={{ marginTop: 12, padding: 16, borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
                <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 15 }}>Compete in the next round</Text>
                <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 17, marginTop: 5 }}>
                  Join with a competition display name. Your existing Event Arena paper account and its current balance and positions will be used.
                </Text>
                <TouchableOpacity
                  testID="lightning-round-join"
                  accessibilityRole="button"
                  onPress={() => { setJoinError(''); setJoinOpen(true); }}
                  style={{ minHeight: 46, marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, backgroundColor: colors.primary }}
                >
                  <Feather name="zap" size={14} color={colors.primaryForeground} />
                  <Text style={{ color: colors.primaryForeground, fontFamily: 'Inter_700Bold', fontSize: 12 }}>
                  {window.phase === 'active' ? 'JOIN LIVE ROUND' : 'JOIN UPCOMING ROUND'}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}

            <View style={{ marginTop: 12, padding: 13, borderRadius: 14, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 12 }}>How the score works</Text>
              <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 10, lineHeight: 16, marginTop: 5 }}>
                Ranking is by return on the $100,000 event portfolio and counts only fills attributed to this Lightning Round. Quotes use the latest available provider price.
              </Text>
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/event-arena', params: { section: 'past' } })}
              style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 5 }}
            >
              <Feather name="archive" size={14} color={colors.primary} />
              <Text style={{ color: colors.primary, fontFamily: 'Inter_700Bold', fontSize: 10 }}>VIEW ALL PAST EVENTS</Text>
            </TouchableOpacity>
          </ScrollView>
        )}

        {storeReady && !storeError && tab === 'leaderboard' && (
          <View style={{ flex: 1 }}>
            <PaperChallengeLeaderboard
              event={scheduledConfiguration}
              enrollment={enrollment}
              onEnrollmentChange={updateEnrollment}
              onRankChange={setRank}
              eventAccount={account}
              eventOrders={performance?.pendingOrders ?? []}
              eventPositions={performance?.positions ?? []}
              eventQuotes={Object.fromEntries(Object.entries(quotes).map(([symbol, quote]) => [symbol, quote.price]))}
              embedded
            />
          </View>
        )}

        {storeReady && !storeError && tab === 'trades' && (
          <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: insets.bottom + 22 }}>
            <View style={{ padding: 15, borderRadius: 15, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 15 }}>Lightning Round trades</Text>
              <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 10, lineHeight: 15, marginTop: 4 }}>
                Only trades recorded during this round appear here in your shared Event Arena account.
              </Text>
              {canOpenTradeAccount && (
                <TouchableOpacity accessibilityRole="button" onPress={openAccount} style={{ minHeight: 42, alignSelf: 'flex-start', justifyContent: 'center', marginTop: 6 }}>
                  <Text style={{ color: colors.primary, fontFamily: 'Inter_700Bold', fontSize: 10 }}>OPEN PAPER TRADING</Text>
                </TouchableOpacity>
              )}
            </View>
            {tradeHistory.length === 0 ? (
              <View style={{ alignItems: 'center', padding: 26 }}>
                <Feather name="activity" size={22} color={colors.mutedForeground} />
                <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 11, textAlign: 'center', marginTop: 8 }}>
                  {isEnrolled ? 'No completed trades in this round yet.' : 'Join the round to start a separate trading history.'}
                </Text>
              </View>
            ) : tradeHistory.map((trade) => (
              <View key={trade.id} testID={`lightning-round-trade-${trade.id}`} style={{ marginTop: 8, padding: 13, borderRadius: 13, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
                  <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 12 }}>{trade.action} · {trade.symbol}</Text>
                  <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 12 }}>{money(trade.price * trade.shares)}</Text>
                </View>
                <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 4 }}>
                  {trade.shares} shares at {money(trade.price)} · {new Date(trade.date).toLocaleString()}
                </Text>
              </View>
            ))}
            {lightningOrders.map((order) => (
              <View key={order.id} testID={`lightning-round-pending-order-${order.id}`} style={{ marginTop: 8, padding: 13, borderRadius: 13, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
                <Text style={{ color: order.status === 'filled' ? colors.primary : order.rejectionReason ? colors.destructive : colors.mutedForeground, fontFamily: 'Inter_700Bold', fontSize: 11 }}>
                  {order.status === 'filled'
                    ? `FILLED AT ${money(order.filledPrice ?? 0)}`
                    : order.rejectionReason
                      ? 'ORDER REJECTED'
                      : 'PENDING — EXECUTES AT EVENT START'}
                </Text>
                <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 11, marginTop: 4 }}>
                  {order.shares} {order.symbol} · estimated {quotes[order.symbol]
                    ? money(order.shares * quotes[order.symbol].price)
                    : 'value unavailable'}
                </Text>
                {order.rejectionReason ? (
                  <Text accessibilityRole="alert" style={{ color: colors.destructive, fontFamily: 'Inter_400Regular', fontSize: 10, lineHeight: 15, marginTop: 3 }}>
                    {order.rejectionReason}
                  </Text>
                ) : order.status === 'pending' ? (
                  <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 10, lineHeight: 15, marginTop: 3 }}>
                    Actual execution price may differ from this estimate.
                  </Text>
                ) : null}
              </View>
            ))}
          </ScrollView>
        )}

        {storeReady && !storeError && tab === 'past' && (
          <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: insets.bottom + 24 }}>
            <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 17, marginBottom: 10 }}>Past Lightning Rounds</Text>
            {lightningRoundSeason && (
              <View testID="lightning-round-season-summary" style={{ marginBottom: 14, padding: 14, borderRadius: 13, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
                <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 14 }}>Season to date</Text>
                <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 4 }}>
                  {lightningRoundSeason.completedRounds} completed {lightningRoundSeason.completedRounds === 1 ? 'round' : 'rounds'} · weekly records below stay separate
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 11 }}>
                  {[
                    ['Total P/L', signedMoney(lightningRoundSeason.totalProfitLoss)],
                    ['Season return', formatPercent(lightningRoundSeason.returnPercent)],
                    ['Best rank', lightningRoundSeason.bestRank ? `#${lightningRoundSeason.bestRank}` : 'Unavailable'],
                  ].map(([label, value]) => (
                    <View key={label} style={{ flexGrow: 1, flexBasis: '30%', minWidth: 90, padding: 9, borderRadius: 9, backgroundColor: colors.background }}>
                      <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 9 }}>{label}</Text>
                      <Text style={{ color: label === 'Total P/L' && lightningRoundSeason.totalProfitLoss < 0 ? colors.destructive : colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 12, marginTop: 4 }}>
                        {value}
                      </Text>
                    </View>
                  ))}
                </View>
                <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 9, lineHeight: 14, marginTop: 9 }}>
                  Season return is total profit or loss divided by the starting equity across completed rounds.
                </Text>
              </View>
            )}
            {pastLightningEvents.length === 0 ? (
              <View style={{ alignItems: 'center', padding: 30 }}>
                <Feather name="archive" size={23} color={colors.mutedForeground} />
                <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 11, textAlign: 'center', marginTop: 9 }}>Completed Lightning Round results will stay here.</Text>
              </View>
            ) : pastLightningEvents.map((event) => (
              <View key={event.eventId} testID={`lightning-round-past-event-${event.eventId}`} style={{ marginBottom: 12 }}>
                <PaperEventShareCard event={event} />
                <View style={{ marginTop: 7, padding: 12, borderRadius: 12, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
                  <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 11 }}>{event.finalRank ? `Final rank #${event.finalRank}` : 'Final rank unavailable'}</Text>
                  <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 4 }}>
                    {event.eventId} · {eventDateRange(event.eventStartAtMs, event.eventEndAtMs)}
                  </Text>
                  <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium', fontSize: 10, marginTop: 4 }}>
                    Frozen result: {formatPercent(event.returnPercent)} · {signedMoney(event.netProfit)} · ending equity {money(event.endEquity)}
                  </Text>
                </View>
              </View>
            ))}
          </ScrollView>
        )}
      </View>
      <BottomTabBar />

      <Modal visible={joinOpen} animationType="fade" transparent statusBarTranslucent onRequestClose={() => setJoinOpen(false)}>
        <KeyboardControllerAvoidingView
          behavior="padding"
          keyboardVerticalOffset={0}
          style={{ flex: 1, justifyContent: 'center', padding: 20, backgroundColor: 'rgba(0,0,0,0.64)' }}
        >
          <View style={{ padding: 20, borderRadius: 18, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ color: colors.primary, fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 0.8 }}>LIGHTNING ROUND ENTRY</Text>
            <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 20, marginTop: 7 }}>Choose a competition display name</Text>
            <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 17, marginTop: 6 }}>
              This name appears on the leaderboard. Your existing Event Arena account is used; no separate balance or trading account is created.
            </Text>
            {previousLightningAlias ? (
              <View style={{ marginTop: 10 }}>
                <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium', fontSize: 11 }}>
                  Reuse your previous display name?
                </Text>
                <TouchableOpacity
                  testID="lightning-round-reuse-alias"
                  accessibilityRole="button"
                  accessibilityLabel={`Use your previous Lightning Round alias, ${previousLightningAlias}`}
                  onPress={() => { setAlias(previousLightningAlias); setJoinError(''); }}
                  style={{ minHeight: 44, marginTop: 6, alignItems: 'flex-start', justifyContent: 'center', paddingHorizontal: 11, borderRadius: 10, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.background }}
                >
                  <Text allowFontScaling style={{ color: colors.primary, fontFamily: 'Inter_700Bold', fontSize: 11 }}>
                    USE PREVIOUS ROUND’S ALIAS · {previousLightningAlias}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}
            <TextInput
              testID="lightning-round-alias"
              accessibilityLabel="Lightning Round leaderboard alias"
              value={alias}
              onChangeText={(value) => { setAlias(value); setJoinError(''); }}
              autoCapitalize="words"
              autoCorrect={false}
              maxLength={24}
              placeholder="Competition display name"
              placeholderTextColor={colors.mutedForeground}
              style={{ minHeight: 48, paddingHorizontal: 12, marginTop: 15, borderRadius: 11, borderWidth: 1, borderColor: colors.border, color: colors.foreground, fontFamily: 'Inter_500Medium', fontSize: 14, backgroundColor: colors.background }}
            />
            {joinError ? <Text accessibilityRole="alert" style={{ color: colors.destructive, fontFamily: 'Inter_500Medium', fontSize: 11, marginTop: 8 }}>{joinError}</Text> : null}
            <TouchableOpacity
              testID="lightning-round-confirm-join"
              accessibilityRole="button"
              disabled={joining}
              onPress={() => { void joinRound(); }}
              style={{ minHeight: 48, marginTop: 14, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: joining ? colors.muted : colors.primary }}
            >
              <Text style={{ color: colors.primaryForeground, fontFamily: 'Inter_700Bold', fontSize: 12 }}>{joining ? 'JOINING…' : 'JOIN LIGHTNING ROUND'}</Text>
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" onPress={() => setJoinOpen(false)} style={{ minHeight: 42, alignItems: 'center', justifyContent: 'center', marginTop: 4 }}>
              <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold', fontSize: 11 }}>CANCEL</Text>
            </TouchableOpacity>
          </View>
        </KeyboardControllerAvoidingView>
      </Modal>
    </View>
  );
}
