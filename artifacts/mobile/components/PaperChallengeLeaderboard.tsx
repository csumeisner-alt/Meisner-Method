import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  AppState,
  Image,
  ImageBackground,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
  Alert,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import ViewShot from 'react-native-view-shot';
import { useColors } from '@/hooks/useColors';
import { useReduceMotion } from '@/hooks/useReduceMotion';
import {
  getGetEventArenaLeaderboardQueryKey,
  submitEventArenaScore,
  useGetEventArenaLeaderboard,
} from '@workspace/api-client-react';
import { getInstallationId } from '@/lib/installation';
import { getEventArenaParticipantId } from '@/lib/eventArenaDeviceSync';
import {
  EVENT_HOLDINGS_PREVIEW_LIMIT,
  calculateEventHoldingAllocationPercent,
  getVisibleEventHoldings,
  formatEventHoldingAllocation,
  formatEventHoldingSide,
  type EventHoldingSide,
} from '@/lib/paperChallengeAllocation';
import {
  LEGACY_PAPER_CHALLENGE_ARTWORK_ID,
  PAPER_CHALLENGE_STARTING_BALANCE,
  isMountainChampionshipTransferLocked,
  updatePaperChallengeStore,
  updatePaperChallengeEnrollment,
  type PaperChallengeEventType,
  type PaperChallengeRankingDirection,
  type PaperChallengeEnrollment,
  type PaperChallengeArtworkId,
  type PaperChallengeStore,
} from '@/lib/paperChallenge';
import { EVENT_ARENA_ARTWORK_SOURCES } from '@/lib/eventArenaArtwork';
import {
  getEventCashTransferImpact,
  type EventCashTransferImpact,
} from '@/lib/eventArenaTransfers';
import { PennyMayhemNameplate, PennyMayhemTitle, PennyMayhemTrophy } from '@/components/PennyMayhemBrand';
import { EventArenaTransferLockNotice } from '@/components/EventArenaTransferLockNotice';
import {
  isShortPosition,
  type PaperAccount,
  type PaperOrder,
  type PaperPosition,
  type PaperTransaction,
} from '@/lib/paperMath';
import { getEventArenaAccountEquity } from '@/lib/eventArenaHome';
import { getLightningRoundEventPortfolio } from '@/lib/lightningRoundPreparation';
import {
  buildPreStartEventArenaScore,
  formatEventArenaMoney,
  formatEventArenaReturn,
  formatEventArenaSignedMoney,
  getEventArenaOwnEntry,
  getEventArenaPodiumSlots,
  getEventArenaStandingsEntries,
  getEventArenaProfitLossTone,
  getEventArenaReturnTone,
  isEventArenaScoreStale,
  getEventArenaStatus,
} from '@/lib/eventArenaLeaderboard';
import {
  getEventArenaCompetitiveChanges,
  getEventArenaNextRankReturnGap,
  getEventArenaWindowProgress,
} from '@/lib/eventArenaCompetitiveProgress';
import {
  canRefreshEventArenaLeaderboard,
  isSelectedLeaderboardEntryMissing,
  resolveSelectedLeaderboardEntry,
} from '@/lib/eventArenaLeaderboardRefresh';

const BASE_URL = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;
const REFRESH_INTERVAL_MS = 120_000;
const LAST_SUBMISSION_KEY_PREFIX = '@stocksense/paper_event_leaderboard_last_submit:';
const AVERAGE_COST_FALLBACK_KEY_PREFIX = '@stocksense/paper_event_leaderboard_average_cost:';

export type PaperChallengeLeaderboardEventWindow = {
  id: string;
  startAtMs: number;
  endAtMs: number;
  phase: 'upcoming' | 'active' | 'ended';
  artworkId?: PaperChallengeArtworkId;
  eventType?: PaperChallengeEventType;
  startingBalance?: number;
  rankingDirection?: PaperChallengeRankingDirection;
  purchaseLimit?: number;
};
type HoldingName = {
  symbol: string;
  companyName: string;
  allocationPercent: number | null;
  marketValue?: number | null;
  assetType?: 'stock' | 'etf' | 'unknown';
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
  cashBalance: number;
  tradeCount: number | null;
  holdings: HoldingName[];
  scoreSource: 'participant' | 'server';
  updatedAt: string;
  isCurrentUser: boolean;
};
type LeaderboardRegistration = {
  alias: string;
  isCurrentUser: boolean;
  status: 'queued' | 'entered';
  startEquity: number;
  equity: number | null;
  profitLoss: number | null;
  returnPercent: number | null;
  cashBalance: number | null;
  tradeCount: number | null;
  holdings: HoldingName[];
  updatedAt: string;
};

type Props = {
  event: PaperChallengeLeaderboardEventWindow;
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
  cashTransfersLocked?: boolean;
};

const money = formatEventArenaMoney;
const signedMoney = formatEventArenaSignedMoney;
const returnLabel = formatEventArenaReturn;
const timeLabel = (value: string | null) => value
  ? new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  : 'Not updated yet';
const dateRangeLabel = (startAtMs: number, endAtMs: number) => {
  const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
  const start = new Date(startAtMs).toLocaleDateString('en-US', options);
  const end = new Date(endAtMs).toLocaleDateString('en-US', options);
  return `${start} – ${end}`;
};

function getPodiumEventName(event: PaperChallengeLeaderboardEventWindow) {
  if (event.eventType === 'lightning-round' || event.artworkId === 'lightning-round-arena') return 'Lightning Round';
  if (event.eventType === 'one-stock-challenge' || event.artworkId === 'one-stock-challenge') return 'The One-Stock Challenge';
  if (event.eventType === 'penny-stock-mayhem' || event.artworkId === 'penny-stock-mayhem') return 'Penny Stock Mayhem';
  if (event.eventType === 'bear-market-mayhem' || event.rankingDirection === 'lowest-return' || event.artworkId === 'red-showdown') return 'Bear Market Mayhem';
  if (event.eventType === 'green-bull-championship' || event.artworkId === 'green-stock-exchange') return 'Green Bull Championship';
  if (event.eventType === 'mountain-championship' || event.artworkId === 'mountain-summit') return 'Mountain Championship';
  return 'Event Arena Championship';
}

function getPodiumShareCaption(event: PaperChallengeLeaderboardEventWindow) {
  const isLightningRound = event.eventType === 'lightning-round' || event.artworkId === 'lightning-round-arena';
  return [
    `Meisner Method · ${getPodiumEventName(event)} · ${dateRangeLabel(event.startAtMs, event.endAtMs)}`,
    isLightningRound
      ? 'Lightning Round scores use event-tagged fills and current market prices.'
      : 'Scores are self-reported and not independently verified.',
  ].join('\n');
}

function getEventEnrollment(store: PaperChallengeStore, eventType: PaperChallengeEventType) {
  return eventType === 'lightning-round' ? store.lightningEnrollment ?? null : store.enrollment;
}

function EventArenaPodiumShareCard({
  event,
  slots,
}: {
  event: PaperChallengeLeaderboardEventWindow;
  slots: Array<{ rank: number; entry: LeaderboardEntry | null }>;
}) {
  const colors = useColors();
  const isBearMarketMayhem = event.eventType === 'bear-market-mayhem'
    || event.rankingDirection === 'lowest-return';
  const isPennyStockMayhem = event.eventType === 'penny-stock-mayhem';
  const podiumColors = isBearMarketMayhem
    ? ['#F0525D', '#B9C0C9', '#A94B3D']
    : ['#E5BF63', '#C9D4DF', '#D99A72'];
  return (
    <ImageBackground
      source={isPennyStockMayhem
        ? require('../assets/event-arena-penny-stock-mayhem-premium.jpg')
        : EVENT_ARENA_ARTWORK_SOURCES[event.artworkId ?? LEGACY_PAPER_CHALLENGE_ARTWORK_ID]}
      resizeMode="cover"
      imageStyle={{ opacity: 0.55 }}
      style={{ width: '100%', maxWidth: 360, overflow: 'hidden', borderRadius: 22, backgroundColor: '#101720' }}
    >
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: isPennyStockMayhem ? 'rgba(4,13,9,0.72)' : 'rgba(7,12,20,0.72)' }} />
      <View testID="paper-event-podium-share-card" style={{ padding: 20 }}>
        {!isPennyStockMayhem && (
          <Text style={{ color: '#D8B45A', fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 2 }}>MEISNER METHOD</Text>
        )}
        {isPennyStockMayhem ? (
          <View
            testID="paper-event-penny-stock-podium-share-hero"
            accessibilityLabel="Penny Stock Mayhem. Stocks and ETFs under $20."
            style={{ alignItems: 'center', marginTop: 8 }}
          >
            <PennyMayhemTitle compact />
            <PennyMayhemNameplate compact />
            <Image
              source={require('../assets/event-arena-penny-stock-mayhem-premium.jpg')}
              resizeMode="contain"
              accessibilityLabel="Charging bull with copper pennies in a green championship arena"
              style={{ width: '100%', height: 180, marginTop: 7 }}
            />
          </View>
        ) : (
          <Text style={{ color: isBearMarketMayhem ? '#FF6670' : '#E6D8B2', fontFamily: 'Inter_600SemiBold', fontSize: 9, letterSpacing: 1.4, marginTop: 10 }}>
            {isBearMarketMayhem
              ? 'BEAR MARKET MAYHEM'
              : event.eventType === 'lightning-round'
                ? 'LIGHTNING ROUND'
                : event.eventType === 'green-bull-championship' ? 'GREEN BULL CHAMPIONSHIP' : 'EVENT ARENA CHAMPIONSHIP'}
          </Text>
        )}
        {isBearMarketMayhem && (
          <Text style={{ color: '#F7DADD', fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 0.8, marginTop: 4 }}>
            THE BIGGEST LOSER WINS
          </Text>
        )}
        <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium', fontSize: 9, letterSpacing: 0.7, marginTop: 4 }}>
          ${Math.round(event.startingBalance ?? PAPER_CHALLENGE_STARTING_BALANCE).toLocaleString('en-US')} STARTING CAPITAL
        </Text>
        <Text style={{ color: '#F7F2E8', fontFamily: 'Inter_700Bold', fontSize: 27, marginTop: 3 }}>The podium</Text>
        <Text style={{ color: '#C5C8CD', fontFamily: 'Inter_500Medium', fontSize: 11, marginTop: 5 }}>
          {dateRangeLabel(event.startAtMs, event.endAtMs)}
        </Text>
        <View style={{ gap: 9, marginTop: 22 }}>
          {slots.map((slot) => {
            const medalColor = podiumColors[slot.rank - 1] ?? podiumColors[0];
            return (
              <View
                key={slot.rank}
                testID={`paper-event-podium-share-rank-${slot.rank}`}
                style={{
                  minHeight: 66,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  paddingHorizontal: 13,
                  paddingVertical: 11,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: `${medalColor}88`,
                  backgroundColor: 'rgba(10,16,25,0.84)',
                }}
              >
                <View style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: `${medalColor}A0`, backgroundColor: `${medalColor}22` }}>
                  <Text style={{ color: medalColor, fontFamily: 'Inter_700Bold', fontSize: 15 }}>#{slot.rank}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    allowFontScaling
                    adjustsFontSizeToFit
                    minimumFontScale={0.7}
                    numberOfLines={1}
                    style={{ color: slot.entry ? '#F6F1E5' : '#AEB4BD', fontFamily: 'Inter_700Bold', fontSize: 15 }}
                  >
                    {slot.entry?.alias ?? 'Waiting for competitor'}
                  </Text>
                  <Text style={{ color: '#C5C8CD', fontFamily: 'Inter_600SemiBold', fontSize: 9, letterSpacing: 0.8, marginTop: 4 }}>
                    {slot.entry
                      ? `${money(slot.entry.equity)} value`
                      : 'OPEN PODIUM SPOT'}
                  </Text>
                </View>
                {slot.entry && (
                  <Text
                    allowFontScaling
                    adjustsFontSizeToFit
                    minimumFontScale={0.7}
                    numberOfLines={1}
                    style={{ color: slot.rank === 1 ? '#F0CF75' : '#F2EEE6', fontFamily: 'Inter_700Bold', fontSize: 16, maxWidth: 92, textAlign: 'right' }}
                  >
                    {returnLabel(slot.entry.returnPercent)}
                  </Text>
                )}
              </View>
            );
          })}
        </View>
        {event.eventType === 'lightning-round' && (
          <View style={{ marginTop: 18, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(216,180,90,0.38)', backgroundColor: 'rgba(216,180,90,0.10)' }}>
            <Text style={{ color: '#F0D88F', fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 0.8 }}>
              SERVER-CALCULATED · EVENT FILLS ONLY
            </Text>
            <Text style={{ color: '#D8D8D4', fontFamily: 'Inter_400Regular', fontSize: 10, lineHeight: 15, marginTop: 4 }}>
              Lightning Round returns use only fills attributed to this event and current market prices.
            </Text>
          </View>
        )}
        <Text style={{ color: '#B9BEC5', fontFamily: 'Inter_600SemiBold', fontSize: 9, letterSpacing: 1.2, marginTop: 18, textAlign: 'center' }}>
          {event.eventType === 'lightning-round'
            ? 'MEISNER METHOD · LIGHTNING ROUND'
            : isPennyStockMayhem
              ? 'MEISNER METHOD · PENNY STOCK MAYHEM'
              : 'MEISNER METHOD · EVENT ARENA'}
        </Text>
      </View>
    </ImageBackground>
  );
}

async function buildEventSubmission(enrollment: PaperChallengeEnrollment, event: PaperChallengeLeaderboardEventWindow) {
  const raw = await AsyncStorage.getItem('@stocksense/paper_v2');
  const cache = raw ? JSON.parse(raw) as {
    accounts?: Array<{ id: string; cash: number; unsettledCash?: number; shortCollateral?: number }>;
    eventArenaAppliedTransferIds?: string[];
    positions?: Array<{
      accountId: string;
      symbol: string;
      companyName?: string;
      shares: number;
      avgCost: number;
      positionType?: 'long' | 'short';
      assetType?: 'stock' | 'etf' | 'unknown';
    }>;
    transactions?: PaperTransaction[];
  } : {};
  const account = cache.accounts?.find((item) => item.id === enrollment.accountId);
  const accountPositions = (cache.positions ?? []).filter((item) =>
    item.accountId === enrollment.accountId && Number.isFinite(item.shares) && item.shares > 0,
  );
  const transactions = Array.isArray(cache.transactions) ? cache.transactions : [];
  const isLightningRound = (enrollment.eventType ?? event.eventType) === 'lightning-round';
  const eventTransactions = transactions.filter((transaction) =>
    transaction.accountId === enrollment.accountId
      && transaction.lightningRoundEventId === event.id,
  );
  const eventPositions = isLightningRound
    ? getLightningRoundEventPortfolio(
      eventTransactions,
      event.id,
      enrollment.accountId,
      {},
      enrollment.startingBalance ?? event.startingBalance ?? PAPER_CHALLENGE_STARTING_BALANCE,
    ).positions.map((position) => ({
      accountId: enrollment.accountId,
      symbol: position.symbol,
      companyName: position.companyName,
      shares: position.shares,
      avgCost: position.avgCost,
      positionType: 'long' as const,
    }))
    : accountPositions;
  const positions = eventPositions;
  if (!isLightningRound && positions.length > 500) {
    throw new Error('This event account has too many open positions to refresh its leaderboard score.');
  }
  const shareablePositions = positions.slice(0, 100);
  const symbols = [...new Set(positions.map((position) => position.symbol.trim().toUpperCase()))];
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
  const isPreStartRegistration = !isLightningRound && event.phase === 'upcoming' && !account;
  if (!account && !isPreStartRegistration) {
    throw new Error('Your isolated event account is unavailable. Open Paper Trading and try again.');
  }
  const configuration = {
      eventType: enrollment.eventType ?? event.eventType ?? 'event-arena',
    artworkId: enrollment.artworkId ?? event.artworkId ?? LEGACY_PAPER_CHALLENGE_ARTWORK_ID,
    startingBalance: enrollment.startingBalance ?? event.startingBalance ?? PAPER_CHALLENGE_STARTING_BALANCE,
    rankingDirection: enrollment.rankingDirection ?? event.rankingDirection ?? 'highest-return',
      ...(enrollment.purchaseLimit ?? event.purchaseLimit
        ? { purchaseLimit: enrollment.purchaseLimit ?? event.purchaseLimit }
        : {}),
  } as const;
  const startEquity = configuration.startingBalance;
  if (isPreStartRegistration) {
    return {
      payload: buildPreStartEventArenaScore({
        installationId: await getEventArenaParticipantId(AsyncStorage, getInstallationId),
        alias: enrollment.leaderboardAlias?.trim() ?? '',
        ...configuration,
        eventStartAtMs: event.startAtMs,
        eventEndAtMs: event.endAtMs,
      }),
      usesAverageCost: false,
    };
  }
  const eventPortfolio = isLightningRound
    ? getLightningRoundEventPortfolio(
      eventTransactions,
      event.id,
      enrollment.accountId,
      Object.fromEntries(quotes),
      enrollment.startingBalance ?? event.startingBalance ?? PAPER_CHALLENGE_STARTING_BALANCE,
    )
    : null;
  const equity = isLightningRound
    ? eventPortfolio?.equity ?? null
    : getEventArenaAccountEquity(
      account as PaperAccount,
      positions,
      Object.fromEntries(quotes),
    );
  if (equity == null) {
    throw new Error('Current quotes are unavailable for your event account. Your score was not updated.');
  }
  const holdings = shareablePositions
    .map((position) => {
      const symbol = position.symbol.trim().toUpperCase();
      const currentPrice = quotes.get(symbol);
      return {
        symbol,
        companyName: (position.companyName || position.symbol).trim().slice(0, 120),
        marketValue: typeof currentPrice === 'number' && Number.isFinite(currentPrice)
          ? Math.abs(position.shares) * currentPrice
          : null,
        assetType: ('assetType' in position ? position.assetType : undefined) ?? 'unknown',
        allocationPercent: calculateEventHoldingAllocationPercent(
          Math.abs(position.shares),
          quotes.get(symbol),
          equity,
        ),
        side: isShortPosition(position) ? 'short' as const : 'long' as const,
      };
    })
    .filter((holding, index, all) => holding.symbol && all.findIndex((candidate) => candidate.symbol === holding.symbol) === index)
    .slice(0, 100);
  const returnPercent = ((equity - startEquity) / startEquity) * 100;
  const tradeCount = isLightningRound ? eventTransactions.length : transactions.filter((transaction) => {
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
      installationId: await getEventArenaParticipantId(AsyncStorage, getInstallationId),
      alias: enrollment.leaderboardAlias?.trim() ?? '',
      ...configuration,
      startEquity,
      equity,
      returnPercent,
      tradeCount,
      holdings,
      eventStartAtMs: event.startAtMs,
      eventEndAtMs: event.endAtMs,
      cashBalance: isLightningRound
        ? eventPortfolio?.cashBalance ?? startEquity
    : Number(account?.cash || 0),
      ...(!isLightningRound && account ? {
        valuationSnapshot: {
          unsettledCash: Number.isFinite(account.unsettledCash) ? Number(account.unsettledCash) : 0,
          shortCollateral: Number.isFinite(account.shortCollateral) ? Number(account.shortCollateral) : 0,
          positions: positions.map((position) => ({
            symbol: position.symbol.trim().toUpperCase(),
            companyName: (position.companyName || position.symbol).trim().slice(0, 120),
            shares: Math.abs(position.shares),
            assetType: ('assetType' in position ? position.assetType : undefined) ?? 'unknown',
            side: isShortPosition(position) ? 'short' as const : 'long' as const,
          })),
        },
      } : {}),
      appliedTransferIds: !isLightningRound && Array.isArray(cache.eventArenaAppliedTransferIds)
        ? cache.eventArenaAppliedTransferIds.slice(-500)
        : [],
    },
    usesAverageCost: false,
  };
}

export async function submitPaperChallengeScoreNow(
  enrollment: PaperChallengeEnrollment,
  event: PaperChallengeLeaderboardEventWindow,
) {
  const submission = await buildEventSubmission(enrollment, event);
  await submitEventArenaScore(event.id, submission.payload);
  return submission.payload;
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
  cashTransfersLocked,
}: Props) {
  const colors = useColors();
  const returnColor = (value: number) => {
    const tone = getEventArenaReturnTone(value);
    if (tone === 'positive') return colors.primary;
    if (tone === 'negative') return colors.destructive;
    return colors.foreground;
  };
  const profitLossColor = (value: number) => {
    const tone = getEventArenaProfitLossTone(value);
    if (tone === 'positive') return colors.primary;
    if (tone === 'negative') return colors.destructive;
    return colors.foreground;
  };
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
  const [selectedDetail, setDetail] = useState<LeaderboardEntry | null>(null);
  const [expandedHoldingsParticipantToken, setExpandedHoldingsParticipantToken] = useState<string | null>(null);
  const [cashTransferOpen, setCashTransferOpen] = useState(false);
  const [cashTransferAmount, setCashTransferAmount] = useState('');
  const [cashTransferError, setCashTransferError] = useState('');
  const [cashTransferReceipt, setCashTransferReceipt] = useState('');
  const [cancelledCashOrders, setCancelledCashOrders] = useState<PaperOrder[]>([]);
  const [cashTransferBusy, setCashTransferBusy] = useState(false);
  const [transferLockNoticeOpen, setTransferLockNoticeOpen] = useState(false);
  const [cashTransferRequestKey, setCashTransferRequestKey] = useState('');
  const [podiumImageOpen, setPodiumImageOpen] = useState(false);
  const [sharingPodiumImage, setSharingPodiumImage] = useState(false);
  const podiumImageRef = useRef<ViewShot | null>(null);
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
  const podiumEntranceValueRef = useRef(new Animated.Value(0.94));
  const podiumEntranceEventRef = useRef<string | null>(null);
  const visible = embedded || open;
  const isBearMarketMayhem = event.eventType === 'bear-market-mayhem'
    || event.rankingDirection === 'lowest-return';
  const isLightningRound = event.eventType === 'lightning-round';
  const isPennyStockMayhem = event.eventType === 'penny-stock-mayhem';
  const isOneStockChallenge = event.eventType === 'one-stock-challenge';
  const isTransferLocked = cashTransfersLocked ?? isMountainChampionshipTransferLocked(
    event.eventType,
    event.id,
    event.endAtMs,
    countdownNow,
  );
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
  const detail = resolveSelectedLeaderboardEntry(entries, selectedDetail);
  const detailMissingFromLatestStandings = isSelectedLeaderboardEntryMissing(
    entries,
    selectedDetail,
    leaderboardQuery.data != null && leaderboardQuery.dataUpdatedAt > 0,
  );
  const registrations: LeaderboardRegistration[] = leaderboardQuery.data?.registrations ?? [];
  const participantCount = entries.length + registrations.length;
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
  const standingsEntries = useMemo(() => getEventArenaStandingsEntries(entries), [entries]);
  const ownMedal = ownEntry?.rank === 1
    ? { label: isBearMarketMayhem ? 'ANTI-CHAMPION' : 'CHAMPION', color: isBearMarketMayhem ? '#F0525D' : '#D8B45A' }
    : ownEntry?.rank === 2
      ? { label: 'RUNNER-UP', color: '#C5D0DC' }
      : ownEntry?.rank === 3
        ? { label: 'THIRD PLACE', color: '#D39470' }
        : { label: ownEntry ? `RANK ${ownEntry.rank}` : '', color: '#D8B45A' };
  const transferImpact: EventCashTransferImpact = getEventCashTransferImpact(
    eventAccount,
    eventOrders,
    eventPositions,
    Number(cashTransferAmount),
    eventQuotes,
  );
  const pendingOrderCount = eventOrders.filter((order) => order.status === 'pending').length;
  const canSendCash = !isLightningRound
    && !isTransferLocked
    && event.phase === 'active'
    && optedIn
    && !!eventAccount
    && !!onCashTransfer
    && !!installationId;
  const holdingsExpanded = detail != null
    && expandedHoldingsParticipantToken === detail.participantToken;
  const visibleHoldings = detail
    ? getVisibleEventHoldings(detail.holdings, holdingsExpanded)
    : [];
  const detailScoreIsStale = detailMissingFromLatestStandings || (detail
    ? isEventArenaScoreStale({
      phase: event.phase,
      updatedAt: detail.updatedAt,
      nowMs: countdownNow,
      scoreSource: detail.scoreSource,
      isLightningRound,
    })
    : false);
  const detailStaleWarning = detailMissingFromLatestStandings
    ? 'This participant was not included in the latest standings. The details below are saved from their last appearance and may no longer be current. Last seen:'
    : isLightningRound && detail?.scoreSource !== 'server'
      ? 'The current server score is unavailable; showing the last saved score. Last update:'
      : 'Rankings may be stale because this score has not refreshed recently. Last update:';

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
      animation.setValue(0.96);
      Animated.timing(animation, {
        toValue: 1,
        duration: 280,
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
      animation.setValue(0.96);
      Animated.timing(animation, {
        toValue: 1,
        duration: 340,
        useNativeDriver: Platform.OS !== 'web',
      }).start();
    }
  }, [competitiveChanges, entries, event.id, rankComparison, reduceMotion]);
  useEffect(() => {
    if (!visible || entries.length === 0 || podiumEntranceEventRef.current === event.id) return;
    podiumEntranceEventRef.current = event.id;
    if (reduceMotion) {
      podiumEntranceValueRef.current.setValue(1);
      return;
    }
    podiumEntranceValueRef.current.setValue(0.985);
    const entrance = Animated.spring(podiumEntranceValueRef.current, {
      toValue: 1,
      damping: 20,
      stiffness: 125,
      mass: 1,
      useNativeDriver: Platform.OS !== 'web',
    });
    entrance.start();
    return () => entrance.stop();
  }, [entries.length, event.id, reduceMotion, visible]);
  useEffect(() => {
    const timer = setInterval(() => setCountdownNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    let mounted = true;
    void getEventArenaParticipantId(AsyncStorage, getInstallationId)
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
      return updatePaperChallengeEnrollment(
        current,
        event.eventType ?? 'event-arena',
        (currentEnrollment) => currentEnrollment.eventId !== event.id
          ? currentEnrollment
          : { ...currentEnrollment, leaderboardAlias: alias, leaderboardOptedIn: enabled },
      );
    }, {
      getItem: (key) => AsyncStorage.getItem(key),
      setItem: (key, value) => AsyncStorage.setItem(key, value),
    });
    onEnrollmentChange(getEventEnrollment(updated, event.eventType ?? 'event-arena'));
  }, [event.eventType, event.id, onEnrollmentChange]);

  const submitEntry = useCallback(async (
    targetEnrollment: PaperChallengeEnrollment,
    alias: string,
    forceRefresh = false,
  ) => {
    const submission = await buildEventSubmission({ ...targetEnrollment, leaderboardAlias: alias }, event);
    await submitEventArenaScore(event.id, { ...submission.payload, forceRefresh });
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

  const refresh = useCallback(async (forceSubmission = false) => {
    if (
      refreshingRef.current
      || !canRefreshEventArenaLeaderboard({ visible, appIsActive, installationIdReady })
    ) return;
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
        if (
          forceSubmission
          || !Number.isFinite(lastSubmission)
          || Date.now() - lastSubmission >= REFRESH_INTERVAL_MS
        ) {
          try {
            await submitEntry(
              currentEnrollment,
              currentEnrollment.leaderboardAlias ?? '',
              forceSubmission,
            );
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
    if (!canRefreshEventArenaLeaderboard({ visible, appIsActive, installationIdReady })) return;
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
        return updatePaperChallengeEnrollment(
          current,
          event.eventType ?? 'event-arena',
          (currentEnrollment) => currentEnrollment.eventId !== event.id
            ? currentEnrollment
            : { ...currentEnrollment, leaderboardAlias: alias, leaderboardOptedIn: false },
        );
      }, {
        getItem: (key) => AsyncStorage.getItem(key),
        setItem: (key, value) => AsyncStorage.setItem(key, value),
      });
      onEnrollmentChange(getEventEnrollment(updated, event.eventType ?? 'event-arena'));
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
      const installationId = await getEventArenaParticipantId(AsyncStorage, getInstallationId);
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
        transform: [{ scale: reduceMotion ? 1 : rankAnimationsRef.current.get(entry.participantToken) ?? 1 }],
        borderBottomWidth: 0,
        borderWidth: entry.isCurrentUser ? 1.5 : 1,
        borderColor: entry.isCurrentUser ? colors.gold : colors.border,
        borderRadius: 14,
        backgroundColor: entry.isCurrentUser ? `${colors.gold}10` : 'rgba(255,255,255,0.025)',
        marginVertical: 5,
      }}
    >
      <TouchableOpacity
        testID={`event-leaderboard-entry-${entry.rank}`}
        accessibilityRole="button"
        accessibilityLabel={`Rank ${entry.rank}, ${entry.alias}${entry.isCurrentUser ? ', your score' : ''}, account value ${money(entry.equity)}, profit or loss ${signedMoney(entry.profitLoss)}, ${returnLabel(entry.returnPercent)} return${isOneStockChallenge ? `, current holding ${entry.holdings[0]?.symbol ?? 'cash'}, position market value ${entry.holdings[0]?.marketValue == null ? 'unavailable' : money(entry.holdings[0].marketValue)}, cash remaining ${money(entry.cashBalance)}` : ''}, ${entry.tradeCount == null ? 'trade count unavailable' : `${entry.tradeCount} trades`}.${progressAnnouncement ? ` ${progressAnnouncement}.` : ''} View public score summary.`}
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
          {isOneStockChallenge && (
            <View
              testID={`one-stock-leaderboard-holding-${entry.rank}`}
              style={{ alignSelf: 'flex-start', width: '100%', flexShrink: 1, marginTop: 5, paddingVertical: 5, paddingHorizontal: 8, borderRadius: 8, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.card }}
            >
              <Text numberOfLines={1} style={{ color: colors.primary, fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 0.6 }}>
                {entry.holdings[0]?.symbol ?? 'HOLDING CASH'}
              </Text>
              <Text numberOfLines={1} style={{ color: colors.foreground, fontFamily: 'Inter_500Medium', fontSize: 9, marginTop: 2 }}>
                Position {entry.holdings[0]?.marketValue == null ? '—' : money(entry.holdings[0].marketValue)} · Cash {money(entry.cashBalance)}
              </Text>
            </View>
          )}
          {change && placesMoved !== 0 && (
            <Text style={{ color: placesMoved > 0 ? colors.primary : colors.destructive, fontFamily: 'Inter_600SemiBold', fontSize: 10, marginTop: 3 }}>
              {placesMoved > 0 ? '↑' : '↓'} {Math.abs(placesMoved)} {Math.abs(placesMoved) === 1 ? 'place' : 'places'}
            </Text>
          )}
        </View>
        <View style={{ alignItems: 'flex-end', maxWidth: '38%', minWidth: 0 }}>
          <Text allowFontScaling adjustsFontSizeToFit minimumFontScale={0.7} numberOfLines={1} style={{ color: returnColor(entry.returnPercent), fontFamily: 'Inter_700Bold', fontSize: 16 }}>
            {returnLabel(entry.returnPercent)}
          </Text>
          <Text allowFontScaling adjustsFontSizeToFit minimumFontScale={0.7} numberOfLines={1} style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 9, marginTop: 3 }}>
            {money(entry.equity)} value
          </Text>
          <Text allowFontScaling adjustsFontSizeToFit minimumFontScale={0.7} numberOfLines={1} style={{ color: profitLossColor(entry.profitLoss), fontFamily: 'Inter_500Medium', fontSize: 9, marginTop: 2 }}>
            {signedMoney(entry.profitLoss)} P/L
          </Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
    );
  };

  const renderPodiumCard = (slot: (typeof podiumSlots)[number]) => {
    const entry = slot.entry;
    const oneStockHolding = entry?.holdings[0];
    const oneStockPositionValue = oneStockHolding
      ? oneStockHolding.marketValue == null ? '—' : money(oneStockHolding.marketValue)
      : money(0);
    const change = entry ? competitiveChanges.get(entry.participantToken) : undefined;
    const placesMoved = change?.placesMoved ?? 0;
    const medal = slot.rank === 1
      ? { color: isBearMarketMayhem ? '#F0525D' : '#E5BF63' }
      : slot.rank === 2
        ? { color: '#C9D4DF' }
        : { color: isBearMarketMayhem ? '#A94B3D' : '#D99A72' };
    const isChampion = slot.rank === 1;
    return (
      <Animated.View
        key={slot.rank}
        style={{
          width: isChampion && !widePodium ? '100%' : undefined,
          flex: widePodium ? isChampion ? 1.25 : 1 : isChampion ? undefined : 1,
          minWidth: 0,
          opacity: !entry || reduceMotion ? 1 : rankAnimationsRef.current.get(entry.participantToken) ?? 1,
        transform: [{ scale: !entry || reduceMotion ? 1 : rankAnimationsRef.current.get(entry.participantToken) ?? 1 }],
        }}
      >
         <TouchableOpacity
          testID={`paper-event-podium-${slot.rank}`}
          accessibilityRole={entry ? 'button' : 'text'}
          accessibilityLabel={entry
            ? `Rank ${entry.rank} of ${entries.length}${isBearMarketMayhem && entry.rank === 1 ? ', anti-champion' : ''}, ${entry.alias}${entry.isCurrentUser ? ', your score' : ''}, competition return ${returnLabel(entry.returnPercent)}, current equity ${money(entry.equity)}, profit or loss ${signedMoney(entry.profitLoss)}${isOneStockChallenge ? `, current holding ${oneStockHolding?.symbol ?? 'cash'}, position market value ${oneStockHolding?.marketValue == null ? oneStockHolding ? 'unavailable' : money(0) : money(oneStockHolding.marketValue)}, cash remaining ${money(entry.cashBalance)}` : ''}.${change && placesMoved !== 0 ? ` Self-reported rank movement ${placesMoved > 0 ? 'up' : 'down'} ${Math.abs(placesMoved)} ${Math.abs(placesMoved) === 1 ? 'place' : 'places'}.` : ''}`
            : `Rank ${slot.rank}, waiting for competitor`}
          disabled={!entry}
          onPress={() => { if (entry) setDetail(entry as LeaderboardEntry); }}
          style={{
              minHeight: entry ? (isChampion ? compactPodium ? 264 : 280 : compactPodium ? 218 : 228) : 90,
            justifyContent: 'center',
            alignItems: 'center',
             paddingHorizontal: isChampion ? 16 : compactPodium ? 8 : 11,
             paddingVertical: isChampion ? 17 : 13,
              borderRadius: isChampion ? 24 : 18,
            borderWidth: entry?.isCurrentUser ? 2 : 1,
              borderColor: entry?.isCurrentUser ? colors.gold : entry ? `${medal.color}D0` : `${medal.color}72`,
              backgroundColor: entry?.isCurrentUser
                ? isBearMarketMayhem ? 'rgba(45,15,20,0.92)' : isPennyStockMayhem ? 'rgba(11,32,21,0.92)' : 'rgba(26,23,15,0.88)'
                : entry
                  ? isChampion && isBearMarketMayhem
                    ? 'rgba(35,12,17,0.88)'
                    : isChampion && isPennyStockMayhem
                      ? 'rgba(9,28,20,0.82)'
                      : isChampion ? 'rgba(13,17,23,0.76)' : isPennyStockMayhem ? 'rgba(10,23,17,0.78)' : 'rgba(13,19,29,0.73)'
                  : 'rgba(12,18,27,0.55)',
              shadowColor: isChampion ? isBearMarketMayhem ? '#F0525D' : isPennyStockMayhem ? '#62D57A' : colors.gold : '#000',
              shadowOpacity: isChampion ? 0.32 : 0.16,
              shadowRadius: isChampion ? 20 : 10,
              shadowOffset: { width: 0, height: isChampion ? 10 : 7 },
              elevation: isChampion ? 8 : 3,
          }}
        >
          <LinearGradient
            colors={isChampion
              ? isBearMarketMayhem
                ? ['rgba(240,82,93,0.38)', 'rgba(50,15,22,0.10)', 'rgba(8,13,21,0.38)']
                : isPennyStockMayhem
                  ? ['rgba(229,191,99,0.30)', 'rgba(52,132,78,0.12)', 'rgba(8,13,21,0.34)']
                  : ['rgba(229,191,99,0.30)', 'rgba(25,28,32,0.03)', 'rgba(8,13,21,0.27)']
              : slot.rank === 2
                ? ['rgba(201,212,223,0.24)', 'rgba(13,19,29,0.02)', 'rgba(8,13,21,0.26)']
                : ['rgba(217,154,114,0.25)', 'rgba(13,19,29,0.02)', 'rgba(8,13,21,0.28)']}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={{ pointerEvents: 'none', position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: isChampion ? 24 : 18 }}
          />
          {entry ? (
            <>
               {isChampion && isPennyStockMayhem ? (
                  <PennyMayhemTrophy size={compactPodium ? 82 : 100} />
                ) : isChampion ? (
                  <View accessible={false} style={{ width: compactPodium ? 78 : 96, height: compactPodium ? 78 : 96, alignItems: 'center', justifyContent: 'center', marginBottom: 2 }}>
                    <Animated.View style={{ position: 'absolute', width: '100%', height: '100%', borderRadius: 50, borderWidth: 1.5, borderColor: `${medal.color}88`, backgroundColor: isBearMarketMayhem ? 'rgba(240,82,93,0.18)' : 'rgba(216,180,90,0.12)', shadowColor: medal.color, shadowOpacity: reduceMotion ? 0 : 0.48, shadowRadius: 19, shadowOffset: { width: 0, height: 0 } }} />
                    <View style={{ position: 'absolute', top: compactPodium ? 17 : 21, left: compactPodium ? 9 : 12, width: compactPodium ? 20 : 25, height: compactPodium ? 26 : 31, borderLeftWidth: 4, borderTopWidth: 4, borderBottomWidth: 4, borderColor: medal.color, borderTopLeftRadius: 12, borderBottomLeftRadius: 12 }} />
                    <View style={{ position: 'absolute', top: compactPodium ? 17 : 21, right: compactPodium ? 9 : 12, width: compactPodium ? 20 : 25, height: compactPodium ? 26 : 31, borderRightWidth: 4, borderTopWidth: 4, borderBottomWidth: 4, borderColor: medal.color, borderTopRightRadius: 12, borderBottomRightRadius: 12 }} />
                    <View style={{ width: compactPodium ? 43 : 52, height: compactPodium ? 34 : 40, marginTop: 5, alignItems: 'center', justifyContent: 'center', borderRadius: 7, borderBottomLeftRadius: 22, borderBottomRightRadius: 22, borderWidth: 1, borderColor: isBearMarketMayhem ? '#FFADB3' : 'rgba(255,244,210,0.72)', backgroundColor: medal.color, shadowColor: medal.color, shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } }}>
                      <Feather name={isBearMarketMayhem ? 'trending-down' : 'star'} size={compactPodium ? 18 : 22} color={isBearMarketMayhem ? '#FFF1F2' : '#3A2C12'} />
                    </View>
                    <View style={{ width: 8, height: 10, backgroundColor: medal.color }} />
                    <View style={{ width: 34, height: 6, borderRadius: 3, backgroundColor: medal.color }} />
                    <View style={{ width: 44, height: 6, borderRadius: 3, backgroundColor: medal.color, marginTop: 3 }} />
                 </View>
                ) : (
                    <View accessible={false} style={{ width: compactPodium ? 40 : 46, height: compactPodium ? 40 : 46, borderRadius: 24, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: `${medal.color}A0`, backgroundColor: `${medal.color}22`, marginBottom: 2 }}>
                    <Feather name="award" size={compactPodium ? 22 : 26} color={medal.color} />
                  </View>
                )}
              <Text allowFontScaling adjustsFontSizeToFit minimumFontScale={0.7} numberOfLines={1} style={{ color: medal.color, fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 0.9, marginTop: isChampion ? 6 : 4 }}>
                {isBearMarketMayhem && isChampion ? 'ANTI-CHAMPION' : `RANK ${entry.rank} OF ${entries.length}`}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, maxWidth: '100%', marginTop: isChampion ? 7 : 5 }}>
                <Text allowFontScaling numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ flexShrink: 1, minWidth: 0, maxWidth: '100%', color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: isChampion ? compactPodium ? 20 : 23 : compactPodium ? 14 : 16 }}>
                  {entry.alias}
                </Text>
                {entry.isCurrentUser && <Text style={{ color: colors.gold, fontFamily: 'Inter_700Bold', fontSize: 9 }}>YOU</Text>}
              </View>
              <Text allowFontScaling style={{ color: '#F1EEE7', fontFamily: 'Inter_700Bold', fontSize: isChampion ? 10 : 9, letterSpacing: 1.2, marginTop: isChampion ? 7 : 5 }}>
                {isBearMarketMayhem ? 'LOSS RETURN' : 'COMPETITION RETURN'}
              </Text>
              <Text allowFontScaling numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ maxWidth: '100%', color: returnColor(entry.returnPercent), fontFamily: 'Inter_700Bold', fontSize: isChampion ? compactPodium ? 30 : 36 : compactPodium ? 22 : 26, marginTop: 1, textShadowColor: returnColor(entry.returnPercent), textShadowOffset: { width: 0, height: 0 }, textShadowRadius: isChampion ? 10 : 7 }}>
                {returnLabel(entry.returnPercent)}
              </Text>
              <View style={{ width: '100%', flexDirection: 'row', gap: 6, marginTop: isChampion ? 9 : 7 }}>
                <View style={{ flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', paddingVertical: 5, paddingHorizontal: 3, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.055)' }}>
                  <Text allowFontScaling numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ maxWidth: '100%', color: '#C9CED5', fontFamily: 'Inter_600SemiBold', fontSize: 8, letterSpacing: 0.55 }}>
                    CURRENT EQUITY
                  </Text>
                  <Text allowFontScaling numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65} style={{ maxWidth: '100%', color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: isChampion ? 12 : 10, marginTop: 2 }}>
                    {money(entry.equity)}
                  </Text>
                </View>
                <View style={{ flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', paddingVertical: 5, paddingHorizontal: 3, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.055)' }}>
                  <Text allowFontScaling numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ maxWidth: '100%', color: '#C9CED5', fontFamily: 'Inter_600SemiBold', fontSize: 8, letterSpacing: 0.55 }}>
                    DOLLAR P/L
                  </Text>
                  <Text allowFontScaling numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65} style={{ maxWidth: '100%', color: profitLossColor(entry.profitLoss), fontFamily: 'Inter_700Bold', fontSize: isChampion ? 12 : 10, marginTop: 2 }}>
                    {signedMoney(entry.profitLoss)}
                  </Text>
                </View>
              </View>
              {isOneStockChallenge && (
                <View
                  testID={`one-stock-podium-holding-${slot.rank}`}
                  style={{
                    width: '100%',
                    minWidth: 0,
                    marginTop: 7,
                    paddingVertical: 6,
                    paddingHorizontal: compactPodium ? 6 : 8,
                    borderRadius: 9,
                    borderWidth: 1,
                    borderColor: 'rgba(229,191,99,0.35)',
                    backgroundColor: 'rgba(8,13,21,0.48)',
                  }}
                >
                  <Text
                    testID={`one-stock-podium-ticker-${slot.rank}`}
                    allowFontScaling
                    adjustsFontSizeToFit
                    minimumFontScale={0.65}
                    numberOfLines={1}
                    style={{ maxWidth: '100%', color: medal.color, fontFamily: 'Inter_700Bold', fontSize: isChampion ? 11 : 10, letterSpacing: 0.6, textAlign: 'center' }}
                  >
                    {oneStockHolding?.symbol ?? 'HOLDING CASH'}
                  </Text>
                  <View style={{ width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 3, marginTop: 4 }}>
                    <Text style={{ flexShrink: 0, color: '#C9CED5', fontFamily: 'Inter_600SemiBold', fontSize: 8 }}>POSITION</Text>
                    <Text
                      testID={`one-stock-podium-position-${slot.rank}`}
                      allowFontScaling
                      adjustsFontSizeToFit
                      minimumFontScale={0.6}
                      numberOfLines={1}
                      style={{ flex: 1, minWidth: 0, color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 9, textAlign: 'right' }}
                    >
                      {oneStockPositionValue}
                    </Text>
                  </View>
                  <View style={{ width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 3, marginTop: 2 }}>
                    <Text style={{ flexShrink: 0, color: '#C9CED5', fontFamily: 'Inter_600SemiBold', fontSize: 8 }}>CASH</Text>
                    <Text
                      testID={`one-stock-podium-cash-${slot.rank}`}
                      allowFontScaling
                      adjustsFontSizeToFit
                      minimumFontScale={0.6}
                      numberOfLines={1}
                      style={{ flex: 1, minWidth: 0, color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 9, textAlign: 'right' }}
                    >
                      {money(entry.cashBalance)}
                    </Text>
                  </View>
                </View>
              )}
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
                {isBearMarketMayhem
                  ? slot.rank === 1 ? 'Compete to lose the most' : `Rank #${slot.rank}`
                  : `Compete for ${slot.rank === 1 ? 'first' : slot.rank === 2 ? 'second' : 'third'}`}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </Animated.View>
    );
  };

  const openCashTransfer = () => {
    if (isTransferLocked) {
      setTransferLockNoticeOpen(true);
      return;
    }
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

  const sharePodiumImage = async () => {
    const viewShot = podiumImageRef.current;
    if (!viewShot || sharingPodiumImage || entries.length === 0) return;
    setSharingPodiumImage(true);
    try {
      const uri = await viewShot.capture?.();
      if (!uri) throw new Error('The podium image could not be rendered.');
      const NativeShare = await import('react-native-share');
      await NativeShare.default.open({
        url: uri,
        type: 'image/png',
        message: getPodiumShareCaption(event),
        title: 'Meisner Method Event Arena Podium',
        failOnCancel: false,
      });
    } catch {
      Alert.alert('Could not share', 'The podium image is unavailable right now. Please try again.');
    } finally {
      setSharingPodiumImage(false);
    }
  };

  const confirmCashTransfer = async () => {
    if (isTransferLocked) {
      setTransferLockNoticeOpen(true);
      return;
    }
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
    ? { style: { flex: 1, minHeight: 0 } }
    : {
        visible: open,
        animationType: 'slide' as const,
        onRequestClose: () => { setOpen(false); setDetail(null); },
      };

  const renderLeaderboardHeader = () => (
    <View style={{ paddingHorizontal: 18, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back to leaderboard" onPress={() => setDetail(null)} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
        <Feather name="arrow-left" size={20} color={colors.primary} />
      </TouchableOpacity>
      <Text allowFontScaling style={{ flex: 1, minWidth: 0, color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 20 }}>
        Participant score
      </Text>
      {!embedded && (
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close leaderboard" onPress={() => { setOpen(false); setDetail(null); }} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Feather name="x" size={22} color={colors.mutedForeground} />
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <>
      {!embedded && <View style={{ marginTop: 12, padding: 14, borderRadius: 12, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Feather name="users" size={17} color={colors.primary} />
          <Text style={{ flex: 1, color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 14 }}>
            Live Event Leaderboard
          </Text>
          <Text style={{ color: isLightningRound ? colors.primary : colors.destructive, fontFamily: 'Inter_700Bold', fontSize: 9 }}>
            {isLightningRound ? 'SERVER-CALCULATED' : 'UNVERIFIED'}
          </Text>
        </View>
        <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 16, marginTop: 5 }}>
          {isLightningRound
            ? 'Compare returns calculated from this Lightning Round’s event-tagged fills.'
            : 'Compare self-reported scores from opted-in participants. Results are not independently verified.'}
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
        <View style={{ flex: 1, minHeight: 0, backgroundColor: colors.background, paddingTop: embedded ? 0 : Platform.OS === 'web' ? 24 : insets.top + 8 }}>
          {detail && renderLeaderboardHeader()}

          {detail ? (
            <ScrollView
              style={{ flex: 1, minHeight: 0 }}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ width: '100%', maxWidth: 820, alignSelf: 'center', padding: 18, paddingBottom: Platform.OS === 'web' ? 24 : insets.bottom + 18 }}
            >
              <View testID="paper-event-leaderboard-detail" style={{ overflow: 'hidden', borderRadius: 22, backgroundColor: '#101720', borderWidth: 1, borderColor: 'rgba(214,177,94,0.52)' }}>
                <LinearGradient
                  pointerEvents="none"
                  colors={['rgba(229,191,99,0.16)', 'rgba(16,23,32,0.03)', 'rgba(16,23,32,0.10)']}
                  start={{ x: 0.5, y: 0 }}
                  end={{ x: 0.5, y: 1 }}
                  style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 220 }}
                />
                <View style={{ padding: 20, borderBottomWidth: 1, borderBottomColor: 'rgba(214,177,94,0.22)' }}>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, backgroundColor: 'rgba(214,177,94,0.14)', borderWidth: 1, borderColor: 'rgba(214,177,94,0.42)' }}>
                      <Feather name="award" size={13} color={colors.gold} />
                      <Text allowFontScaling style={{ color: colors.gold, fontFamily: 'Inter_700Bold', fontSize: 10 }}>
                        {detailMissingFromLatestStandings ? `LAST KNOWN RANK #${detail.rank}` : `RANK #${detail.rank}`}
                      </Text>
                    </View>
                    {detail.isCurrentUser && (
                      <Text allowFontScaling style={{ color: colors.gold, fontFamily: 'Inter_700Bold', fontSize: 10 }}>
                        {detailMissingFromLatestStandings ? 'YOUR LAST SAVED SCORE' : 'YOUR SCORE'}
                      </Text>
                    )}
                    <Text
                      testID="paper-event-detail-freshness"
                      accessibilityRole="text"
                      style={{ color: detailScoreIsStale ? '#FF9B9B' : detail.scoreSource === 'server' ? '#63E6BE' : colors.gold, fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 0.5 }}
                    >
                      {detailMissingFromLatestStandings
                        ? 'NOT IN LATEST STANDINGS'
                        : detailScoreIsStale
                          ? 'STALE SCORE'
                        : detail.scoreSource === 'server' ? 'SERVER-VALUED' : 'DEVICE UPDATE'}
                    </Text>
                  </View>
                  <Text
                    allowFontScaling
                    accessibilityRole="header"
                    style={{ flexShrink: 1, color: '#F5F1E5', fontFamily: 'Inter_700Bold', fontSize: 26, marginTop: 11 }}
                  >
                    {detail.alias}
                  </Text>
                  {detailMissingFromLatestStandings && (
                    <Text
                      testID="paper-event-detail-unavailable"
                      accessibilityRole="alert"
                      style={{ color: '#FFB2B2', fontFamily: 'Inter_600SemiBold', fontSize: 11, lineHeight: 16, marginTop: 9 }}
                    >
                      This participant is unavailable in the latest standings. The score and holdings shown here are saved details, not current server data.
                    </Text>
                  )}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 20 }}>
                    <Text allowFontScaling style={{ color: '#D6B15E', fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1 }}>EVENT RETURN</Text>
                    <Text
                      testID="paper-event-detail-return"
                      allowFontScaling
                      accessibilityLabel={`${returnLabel(detail.returnPercent)} ${detailMissingFromLatestStandings ? 'saved' : ''} event return`.trim()}
                      style={{ color: returnColor(detail.returnPercent), fontFamily: 'Inter_700Bold', fontSize: 34 }}
                    >
                      {returnLabel(detail.returnPercent)}
                    </Text>
                  </View>
                  <Text allowFontScaling style={{ color: '#BBC5D2', fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 2 }}>
                    {detailMissingFromLatestStandings
                      ? 'Saved score from this participant’s last appearance; it is not a current server valuation'
                      : isLightningRound
                      ? 'Calculated from this round’s server-recorded trades and current quotes'
                      : detail.scoreSource === 'server'
                        ? 'Revalued from the latest isolated event-account snapshot and current server quotes'
                        : 'Last score submitted by this participant’s device'}
                  </Text>
                  {detailScoreIsStale && (
                    <Text testID="paper-event-detail-stale-warning" style={{ color: '#FFB2B2', fontFamily: 'Inter_600SemiBold', fontSize: 11, lineHeight: 16, marginTop: 8 }}>
                      {detailStaleWarning} {timeLabel(detail.updatedAt)}.
                    </Text>
                  )}
                </View>

                <View style={{ padding: 16 }}>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                    <View style={{ flexGrow: 1, flexBasis: '47%', minWidth: 132, padding: 13, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.045)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}>
                      <Text allowFontScaling style={{ color: '#AEB9C7', fontFamily: 'Inter_600SemiBold', fontSize: 10 }}>
                        {detailMissingFromLatestStandings
                          ? 'SAVED ACCOUNT VALUE'
                          : detail.scoreSource === 'server' ? 'CURRENT ACCOUNT VALUE' : 'REPORTED ACCOUNT VALUE'}
                      </Text>
                      <Text testID="paper-event-detail-equity" allowFontScaling style={{ flexShrink: 1, color: '#F5F1E5', fontFamily: 'Inter_700Bold', fontSize: 20, marginTop: 6 }}>
                        {money(detail.equity)}
                      </Text>
                    </View>
                    <View style={{ flexGrow: 1, flexBasis: '47%', minWidth: 132, padding: 13, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.045)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}>
                      <Text allowFontScaling style={{ color: '#AEB9C7', fontFamily: 'Inter_600SemiBold', fontSize: 10 }}>DOLLAR PROFIT / LOSS</Text>
                      <Text testID="paper-event-detail-profit-loss" allowFontScaling style={{ flexShrink: 1, color: profitLossColor(detail.profitLoss), fontFamily: 'Inter_700Bold', fontSize: 19, marginTop: 6 }}>
                        {signedMoney(detail.profitLoss)}
                      </Text>
                    </View>
                    <View style={{ flexGrow: 1, flexBasis: '47%', minWidth: 132, padding: 13, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.045)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}>
                      <Text allowFontScaling style={{ color: '#AEB9C7', fontFamily: 'Inter_600SemiBold', fontSize: 10 }}>TRADE COUNT</Text>
                      <Text testID="paper-event-detail-trade-count" allowFontScaling style={{ color: '#F5F1E5', fontFamily: 'Inter_700Bold', fontSize: 19, marginTop: 6 }}>
                        {detail.tradeCount == null ? 'Not available' : detail.tradeCount}
                      </Text>
                    </View>
                    <View style={{ flexGrow: 1, flexBasis: '47%', minWidth: 132, padding: 13, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.045)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}>
                      <Text allowFontScaling style={{ color: '#AEB9C7', fontFamily: 'Inter_600SemiBold', fontSize: 10 }}>LAST UPDATE</Text>
                      <Text testID="paper-event-detail-updated" allowFontScaling style={{ flexShrink: 1, color: '#F5F1E5', fontFamily: 'Inter_600SemiBold', fontSize: 13, marginTop: 6 }}>
                        {timeLabel(detail.updatedAt)}
                      </Text>
                    </View>
                  </View>

                  <View style={{ marginTop: 17, padding: 15, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.035)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Feather name="briefcase" size={15} color={colors.gold} />
                      <Text allowFontScaling accessibilityRole="header" style={{ color: '#F5F1E5', fontFamily: 'Inter_700Bold', fontSize: 15 }}>
                        {detailMissingFromLatestStandings ? 'Saved holdings' : 'Current holdings'}
                      </Text>
                    </View>
                    <Text allowFontScaling style={{ color: '#AEB9C7', fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 16, marginTop: 5 }}>
                      {detailMissingFromLatestStandings
                        ? 'These holdings and allocations were saved at the participant’s last appearance and may no longer be current.'
                        : isLightningRound
                        ? 'Positions come from this round’s recorded fills and are valued using the latest available server quotes.'
                        : detail.scoreSource === 'server'
                          ? 'Positions come from the isolated event-account snapshot and are revalued using current server quotes.'
                          : 'Positions and allocations come from the participant’s last device submission.'}
                    </Text>
                    {detail.holdings.length === 0 ? (
                      <Text allowFontScaling style={{ color: '#AEB9C7', fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 12 }}>No current holdings reported.</Text>
                    ) : visibleHoldings.map((holding) => (
                      <View key={holding.symbol} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10, padding: 12, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' }}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text allowFontScaling style={{ color: colors.gold, fontFamily: 'Inter_700Bold', fontSize: 13 }}>{holding.symbol}</Text>
                          <Text allowFontScaling style={{ color: '#BBC5D2', fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 17, marginTop: 3 }}>{holding.companyName}</Text>
                        </View>
                        <View style={{ alignItems: 'flex-end', flexShrink: 0, maxWidth: '42%' }}>
                          <Text allowFontScaling style={{ color: '#F5F1E5', fontFamily: 'Inter_700Bold', fontSize: 12 }}>
                            {formatEventHoldingAllocation(holding.allocationPercent)}
                          </Text>
                          <Text allowFontScaling style={{ color: '#D6DEE8', fontFamily: 'Inter_500Medium', fontSize: 10, marginTop: 3 }}>
                            {holding.marketValue == null ? 'Value unavailable' : money(holding.marketValue)}
                          </Text>
                          <Text allowFontScaling style={{ color: holding.side === 'short' ? colors.destructive : colors.primary, fontFamily: 'Inter_600SemiBold', fontSize: 10, marginTop: 4 }}>
                            {formatEventHoldingSide(holding.side).toUpperCase()}
                          </Text>
                        </View>
                      </View>
                    ))}
                    {detail.holdings.length > EVENT_HOLDINGS_PREVIEW_LIMIT && (
                      <TouchableOpacity
                        testID="paper-event-holdings-toggle"
                        accessibilityRole="button"
                        accessibilityLabel={holdingsExpanded
                          ? 'Show fewer holdings'
                          : `Show all ${detail.holdings.length} holdings`}
                        accessibilityHint={holdingsExpanded
                          ? `Hides holdings after the first ${EVENT_HOLDINGS_PREVIEW_LIMIT}.`
                          : 'Reveals the remaining participant holdings.'}
                        accessibilityState={{ expanded: holdingsExpanded }}
                        onPress={() => setExpandedHoldingsParticipantToken(
                          holdingsExpanded ? null : detail.participantToken,
                        )}
                        style={{
                          minHeight: 44,
                          marginTop: 10,
                          paddingHorizontal: 12,
                          borderRadius: 10,
                          borderWidth: 1,
                          borderColor: 'rgba(214,177,94,0.4)',
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 7,
                        }}
                      >
                        <Text allowFontScaling style={{ color: colors.gold, fontFamily: 'Inter_700Bold', fontSize: 12, textAlign: 'center' }}>
                          {holdingsExpanded ? 'Show fewer holdings' : `Show all ${detail.holdings.length} holdings`}
                        </Text>
                        <Feather name={holdingsExpanded ? 'chevron-up' : 'chevron-down'} size={14} color={colors.gold} />
                      </TouchableOpacity>
                    )}
                  </View>

                  <View testID="paper-event-detail-privacy" style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 13, padding: 12, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.035)' }}>
                    <Feather name="lock" size={14} color="#D6B15E" style={{ marginTop: 1 }} />
                    <Text allowFontScaling style={{ flex: 1, minWidth: 0, color: '#BBC5D2', fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 16 }}>
                      Self-reported and unverified. Raw share counts, prices, cost basis, account identifiers, and trade history are not shared.
                    </Text>
                  </View>
                  {(canSendCash || isTransferLocked) && !detail.isCurrentUser && !detailMissingFromLatestStandings ? (
                    <TouchableOpacity
                      testID="event-arena-send-cash"
                      accessibilityRole="button"
                      accessibilityLabel={isTransferLocked
                        ? 'Mountain Championship transfers are locked'
                        : `Send event cash to ${detail.alias}`}
                      onPress={openCashTransfer}
                      disabled={!isTransferLocked && !!restoredTransfer && restoredTransfer.recipientParticipantToken !== detail.participantToken}
                      style={{ minHeight: 48, marginTop: 14, borderRadius: 11, backgroundColor: isTransferLocked ? colors.card : colors.primary, borderWidth: isTransferLocked ? 1 : 0, borderColor: isTransferLocked ? colors.gold : 'transparent', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: restoredTransfer && restoredTransfer.recipientParticipantToken !== detail.participantToken && !isTransferLocked ? 0.5 : 1 }}
                    >
                      <Feather name={isTransferLocked ? 'lock' : 'send'} size={15} color={isTransferLocked ? colors.gold : colors.primaryForeground} />
                      <Text style={{ color: isTransferLocked ? colors.gold : colors.primaryForeground, fontFamily: 'Inter_700Bold', fontSize: 12 }}>{isTransferLocked ? 'CASH TRANSFERS LOCKED' : 'SEND CASH'}</Text>
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
                </View>
              </View>
            </ScrollView>
          ) : (
            <ScrollView
              style={{ flex: 1, minHeight: 0 }}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ width: '100%', maxWidth: 1000, alignSelf: 'center', padding: 16, paddingBottom: embedded ? 28 : Platform.OS === 'web' ? 24 : insets.bottom + 24 }}
            >
              <View
                testID={isOneStockChallenge ? 'paper-event-one-stock-hero-art' : undefined}
                style={{ width: '100%' }}
              >
              <ImageBackground
                testID={!isOneStockChallenge ? `event-arena-leaderboard-artwork-${event.id}` : undefined}
                source={isPennyStockMayhem
                  ? require('../assets/event-arena-penny-stock-mayhem-premium.jpg')
                  : isOneStockChallenge
                    ? EVENT_ARENA_ARTWORK_SOURCES['one-stock-challenge']
                    : EVENT_ARENA_ARTWORK_SOURCES[event.artworkId ?? LEGACY_PAPER_CHALLENGE_ARTWORK_ID]}
                resizeMode="cover"
                imageStyle={{ borderRadius: 24, opacity: isPennyStockMayhem ? 0 : isOneStockChallenge ? 1 : 0.96 }}
                style={{ overflow: 'hidden', borderRadius: 24, borderWidth: 1, borderColor: isBearMarketMayhem ? 'rgba(240,82,93,0.62)' : isPennyStockMayhem ? 'rgba(173,202,119,0.62)' : isOneStockChallenge ? 'rgba(216,180,90,0.5)' : 'rgba(214,177,94,0.34)', marginBottom: 17, padding: compactPodium ? 12 : 17, backgroundColor: isPennyStockMayhem ? '#07110D' : isOneStockChallenge ? '#07111E' : '#101720' }}
              >
                <View style={{ pointerEvents: 'none', position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: isPennyStockMayhem ? 'transparent' : isOneStockChallenge ? 'rgba(4,10,20,0.08)' : 'rgba(7,12,20,0.18)' }} />
                <LinearGradient
                  colors={isBearMarketMayhem
                    ? ['rgba(123,22,34,0.42)', 'rgba(8,14,24,0.04)', 'rgba(90,18,28,0.3)']
                    : isOneStockChallenge
                      ? ['rgba(3,12,25,0.72)', 'rgba(4,14,28,0.34)', 'rgba(3,9,19,0.86)']
                      : isPennyStockMayhem
                      ? ['transparent', 'transparent', 'transparent']
                      : ['rgba(25,139,218,0.22)', 'rgba(8,14,24,0.03)', 'rgba(25,139,218,0.15)']}
                  start={isOneStockChallenge ? { x: 0.5, y: 0 } : { x: 0, y: 0 }}
                  end={isOneStockChallenge ? { x: 0.5, y: 1 } : { x: 1, y: 1 }}
                  style={{ pointerEvents: 'none', position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                />
                <LinearGradient
                  colors={isBearMarketMayhem
                    ? ['rgba(255,106,115,0.18)', 'rgba(255,106,115,0.05)', 'transparent']
                    : isPennyStockMayhem || isOneStockChallenge
                      ? ['transparent', 'transparent', 'transparent']
                      : ['rgba(255,218,128,0.18)', 'rgba(255,218,128,0.06)', 'transparent']}
                  start={{ x: 0.5, y: 0 }}
                  end={{ x: 0.5, y: 1 }}
                  style={{ pointerEvents: 'none', position: 'absolute', top: 205, left: '-8%', width: '44%', height: 270, transform: [{ rotate: '12deg' }] }}
                />
                <LinearGradient
                  colors={isBearMarketMayhem
                    ? ['rgba(255,106,115,0.16)', 'rgba(255,106,115,0.05)', 'transparent']
                    : isPennyStockMayhem || isOneStockChallenge
                      ? ['transparent', 'transparent', 'transparent']
                      : ['rgba(255,218,128,0.16)', 'rgba(255,218,128,0.05)', 'transparent']}
                  start={{ x: 0.5, y: 0 }}
                  end={{ x: 0.5, y: 1 }}
                  style={{ pointerEvents: 'none', position: 'absolute', top: 205, right: '-8%', width: '44%', height: 270, transform: [{ rotate: '-12deg' }] }}
                />
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 7, marginBottom: 10 }}>
                  {enrollment?.eventId === event.id && (
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
                      style={{ minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, borderRadius: 18, borderWidth: 1, borderColor: aliasLocked ? 'rgba(255,255,255,0.22)' : 'rgba(216,180,90,0.65)', backgroundColor: 'rgba(7,12,20,0.62)', opacity: aliasLocked ? 0.65 : 1 }}
                    >
                      <Feather name={aliasLocked ? 'lock' : 'edit-2'} size={12} color={aliasLocked ? '#C5C8CD' : '#E8CB7C'} />
                      <Text style={{ color: aliasLocked ? '#C5C8CD' : '#E8CB7C', fontFamily: 'Inter_700Bold', fontSize: 9 }}>
                        {aliasLocked ? 'LOCKED' : 'EDIT NAME'}
                      </Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    testID="refresh-paper-event-leaderboard"
                    accessibilityRole="button"
                    accessibilityLabel="Refresh event leaderboard"
                    accessibilityState={{ busy: refreshing }}
                    onPress={() => { void refresh(true); }}
                    style={{ width: isOneStockChallenge ? 44 : 36, height: isOneStockChallenge ? 44 : 36, alignItems: 'center', justifyContent: 'center', borderRadius: isOneStockChallenge ? 22 : 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)', backgroundColor: isOneStockChallenge ? 'rgba(7,12,20,0.76)' : 'rgba(7,12,20,0.62)' }}
                  >
                    <Feather name="refresh-cw" size={16} color="#F1EEE7" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    testID="open-paper-event-sharing-info"
                    accessibilityRole="button"
                    accessibilityLabel="Leaderboard sharing information and settings"
                    onPress={() => { setError(''); setSharingInfoOpen(true); }}
                    style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)', backgroundColor: 'rgba(7,12,20,0.62)' }}
                  >
                    <Feather name="info" size={16} color="#F1EEE7" />
                  </TouchableOpacity>
                </View>

                <View testID="paper-event-leaderboard-current-event" style={{ alignItems: 'center', marginBottom: 18 }}>
                  {isPennyStockMayhem && (
                    <View
                      testID="paper-event-penny-stock-hero"
                      accessibilityLabel="Penny Stock Mayhem. Stocks and ETFs under $20."
                      style={{ width: '100%', alignItems: 'center', marginBottom: 15, paddingTop: 3 }}
                    >
                      <PennyMayhemTitle testID="paper-event-championship-identity" compact={compactPodium} />
                      <PennyMayhemNameplate testID="paper-event-penny-stock-rule-banner" compact={compactPodium} />
                      <Image
                        testID="paper-event-penny-stock-art"
                        source={require('../assets/event-arena-penny-stock-mayhem-premium.jpg')}
                        resizeMode="contain"
                        accessibilityLabel="Charging bull with copper pennies in a green championship arena"
                        style={{
                          width: '100%',
                          aspectRatio: 1,
                          marginTop: 7,
                        }}
                      />
                    </View>
                  )}
                  {!isPennyStockMayhem && (
                    <Text testID="paper-event-championship-identity" style={{ color: isBearMarketMayhem ? '#FF6670' : '#E8CB7C', fontFamily: 'Inter_700Bold', fontSize: isOneStockChallenge ? 18 : 11, letterSpacing: isOneStockChallenge ? 1.15 : 1.2, textAlign: 'center', marginBottom: isOneStockChallenge ? 5 : 7, textShadowColor: 'transparent', textShadowRadius: 7 }}>
                    {isBearMarketMayhem
                      ? 'BEAR MARKET MAYHEM'
                      : isOneStockChallenge
                        ? 'THE ONE-STOCK CHALLENGE'
                      : isLightningRound
                        ? 'LIGHTNING ROUND'
                        : event.eventType === 'green-bull-championship' ? 'GREEN BULL CHAMPIONSHIP' : 'EVENT ARENA CHAMPIONSHIP'}
                    </Text>
                  )}
                  {isOneStockChallenge && (
                    <Text
                      testID="paper-event-one-stock-description"
                      allowFontScaling
                      style={{ maxWidth: 480, color: colors.mutedForeground, fontFamily: 'Inter_500Medium', fontSize: compactPodium ? 11 : 13, lineHeight: 19, textAlign: 'center', marginBottom: 9 }}
                    >
                      One participant. One stock. One winning position.
                    </Text>
                  )}
                  <Text testID="paper-event-starting-capital" style={{ color: '#F1EEE7', fontFamily: 'Inter_600SemiBold', fontSize: isOneStockChallenge ? 11 : 10, letterSpacing: 0.8, textAlign: 'center', marginBottom: 8 }}>
                    ${Math.round(event.startingBalance ?? PAPER_CHALLENGE_STARTING_BALANCE).toLocaleString('en-US')} STARTING CAPITAL
                  </Text>
                  {!isPennyStockMayhem && !isOneStockChallenge && (
                    <Text allowFontScaling style={{ color: isBearMarketMayhem ? '#FFF0F1' : '#FFF9EA', fontFamily: 'Inter_700Bold', fontSize: compactPodium ? 22 : 28, letterSpacing: 1.1, textAlign: 'center', textShadowColor: 'rgba(0,0,0,0.85)', textShadowRadius: 8, textShadowOffset: { width: 0, height: 2 } }}>
                      {isBearMarketMayhem ? 'THE BIGGEST LOSER WINS' : 'CHAMPIONSHIP STANDINGS'}
                    </Text>
                  )}
                  {isBearMarketMayhem && (
                    <Text testID="paper-event-bear-ranking-objective" style={{ color: '#FFD9DC', fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1.1, textAlign: 'center', marginTop: 5 }}>
                      LOWEST PERCENTAGE RETURN RANKS FIRST
                    </Text>
                  )}
                  <View testID="paper-event-leaderboard-status" style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 10, paddingVertical: 6, paddingHorizontal: 11, borderRadius: 20, backgroundColor: eventStatus.phase === 'active' ? 'rgba(35,128,103,0.42)' : 'rgba(7,12,20,0.68)', borderWidth: 1, borderColor: eventStatus.phase === 'active' ? 'rgba(112,226,181,0.58)' : 'rgba(222,190,113,0.48)' }}>
                    <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: eventStatus.phase === 'active' ? '#61D0A7' : '#D8B45A' }} />
                    <Text style={{ color: eventStatus.phase === 'active' ? '#A1F0D0' : '#E8CB7C', fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1 }}>
                      {eventStatus.label.toUpperCase()}
                    </Text>
                  </View>
                  {optedIn && eventStatus.phase === 'upcoming' && (
                    <View
                      testID="paper-event-registration-status"
                      accessible
                      accessibilityLabel="You’re registered. Your Event Portfolio opens when the event starts."
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 12, backgroundColor: 'rgba(35,128,103,0.25)', borderWidth: 1, borderColor: 'rgba(112,226,181,0.5)' }}
                    >
                      <Feather name="check-circle" size={15} color="#81E2BB" />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ color: '#A1F0D0', fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 0.8 }}>
                          YOU’RE REGISTERED
                        </Text>
                        <Text style={{ color: '#D4E8DF', fontFamily: 'Inter_400Regular', fontSize: 10, lineHeight: 14, marginTop: 2 }}>
                          Your Event Portfolio opens when the event starts.
                        </Text>
                      </View>
                    </View>
                  )}
                  {eventStatus.phase !== 'ended' && (
                    <View testID="paper-event-leaderboard-countdown" accessible accessibilityLabel={eventStatus.countdown} style={{ alignItems: 'center', marginTop: 12, paddingVertical: 10, paddingHorizontal: 15, borderRadius: 14, backgroundColor: 'rgba(7,12,20,0.68)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' }}>
                      <Text style={{ color: '#CFD3D7', fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1.5 }}>
                        {eventStatus.phase === 'upcoming' ? 'COUNTDOWN TO START' : 'TIME REMAINING'}
                      </Text>
                      <Text allowFontScaling style={{ color: '#FFF1C5', fontFamily: 'Inter_700Bold', fontSize: compactPodium ? 21 : 25, marginTop: 3, textShadowColor: 'rgba(0,0,0,0.75)', textShadowRadius: 5 }}>
                        {eventStatus.countdown}
                      </Text>
                    </View>
                  )}
                  <View style={{ width: '100%', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 11 }}>
                    <View testID="paper-event-leaderboard-date-range" style={{ minHeight: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 7, paddingHorizontal: 10, borderRadius: 18, backgroundColor: 'rgba(7,12,20,0.58)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }}>
                      <Feather name="calendar" size={12} color="#D8C993" />
                      <Text allowFontScaling style={{ color: '#F1EEE7', fontFamily: 'Inter_600SemiBold', fontSize: 10 }}>
                        {dateRangeLabel(event.startAtMs, event.endAtMs)}
                      </Text>
                    </View>
                  <View testID="paper-event-leaderboard-participant-count" accessible accessibilityLabel={`${participantCount} ${participantCount === 1 ? 'competitor' : 'competitors'}`} style={{ minHeight: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 7, paddingHorizontal: 10, borderRadius: 18, backgroundColor: 'rgba(7,12,20,0.58)', borderWidth: 1, borderColor: 'rgba(216,180,90,0.25)' }}>
                      <Feather name="users" size={13} color="#E8CB7C" />
                      <Text allowFontScaling style={{ color: '#FFF4D7', fontFamily: 'Inter_700Bold', fontSize: 12 }}>
                        {participantCount}
                      </Text>
                      <Text style={{ color: '#D9D6CE', fontFamily: 'Inter_500Medium', fontSize: 10 }}>
                        {participantCount === 1 ? 'competitor' : 'competitors'}
                      </Text>
                    </View>
                  </View>
                  {eventStatus.phase === 'active' && (
                    <View
                      testID="paper-event-leaderboard-event-progress"
                      accessibilityRole="progressbar"
                      accessibilityLabel={`Event progress ${Math.round(eventProgress)} percent`}
                      accessibilityValue={{ min: 0, max: 100, now: Math.round(eventProgress) }}
                      style={{ width: '100%', maxWidth: 420, height: 5, overflow: 'hidden', borderRadius: 4, marginTop: 13, backgroundColor: 'rgba(255,255,255,0.18)' }}
                    >
                      <View style={{ width: `${eventProgress}%`, height: '100%', borderRadius: 4, backgroundColor: '#56C7A0' }} />
                    </View>
                  )}
                  <Text allowFontScaling style={{ color: '#C5C8CD', fontFamily: 'Inter_400Regular', fontSize: 9, textAlign: 'center', marginTop: 9 }}>
                    {isLightningRound
                      ? 'SERVER-CALCULATED FROM EVENT FILLS'
                      : 'SELF-REPORTED · NOT INDEPENDENTLY VERIFIED'} · Updated {timeLabel(lastUpdated)}
                  </Text>
                </View>
              {loading && entries.length === 0 ? (
                <View testID="paper-event-leaderboard-loading" accessibilityLabel="Loading leaderboard" style={{ padding: 15, borderRadius: 17, backgroundColor: isOneStockChallenge ? 'rgba(8,13,21,0.92)' : 'rgba(8,13,21,0.84)', borderWidth: 1, borderColor: isOneStockChallenge ? 'rgba(255,255,255,0.24)' : 'rgba(255,255,255,0.12)' }}>
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
              ) : loadError && entries.length === 0 && registrations.length === 0 ? (
                <View testID="paper-event-leaderboard-error" style={{ padding: 14, borderRadius: 10, backgroundColor: isOneStockChallenge ? 'rgba(7,13,20,0.94)' : colors.card, borderWidth: 1, borderColor: isOneStockChallenge ? 'rgba(255,190,190,0.72)' : colors.destructive }}>
                  <Text style={{ color: isOneStockChallenge ? '#FFF1EF' : colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 12, lineHeight: isOneStockChallenge ? 18 : undefined }}>{loadError}</Text>
                  <TouchableOpacity testID="retry-paper-event-leaderboard" accessibilityRole="button" onPress={() => { void refresh(true); }} style={{ minHeight: isOneStockChallenge ? 44 : undefined, minWidth: isOneStockChallenge ? 44 : undefined, alignItems: isOneStockChallenge ? 'center' : undefined, justifyContent: isOneStockChallenge ? 'center' : undefined, alignSelf: 'flex-start', paddingHorizontal: isOneStockChallenge ? 12 : 0, paddingVertical: 8 }}>
                    <Text style={{ color: colors.primary, fontFamily: 'Inter_700Bold', fontSize: 11 }}>RETRY</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  {entries.length === 0 && registrations.length === 0 && (
                    <View testID="paper-event-leaderboard-empty" style={{ alignItems: 'center', paddingVertical: 18, paddingHorizontal: 12, borderRadius: 16, backgroundColor: isOneStockChallenge ? 'rgba(7,13,20,0.92)' : 'rgba(7,13,20,0.8)', borderWidth: 1, borderColor: isOneStockChallenge ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.13)' }}>
                      <Feather name="users" size={23} color="#D8B45A" />
                      <Text allowFontScaling style={{ color: '#E2E2DE', fontFamily: 'Inter_400Regular', fontSize: 12, paddingTop: 10, textAlign: 'center', lineHeight: 18 }}>
                        No participants have opted in for this event yet.
                      </Text>
                      <TouchableOpacity testID="refresh-empty-paper-event-leaderboard" accessibilityRole="button" onPress={() => { void refresh(true); }} style={{ minHeight: isOneStockChallenge ? 44 : undefined, minWidth: isOneStockChallenge ? 44 : undefined, alignItems: 'center', justifyContent: 'center', paddingVertical: 8, paddingHorizontal: 12, marginTop: 4 }}>
                        <Text style={{ color: '#E6CA7A', fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1 }}>REFRESH</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  {registrations.length > 0 && (
                    <View testID="paper-event-registered-participants" style={{ marginTop: 8, paddingHorizontal: 11, paddingVertical: 12, borderRadius: 15, backgroundColor: 'rgba(7,13,20,0.9)', borderWidth: 1, borderColor: 'rgba(216,180,90,0.42)' }}>
                      <Text style={{ color: '#E6CA7A', fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.1, marginBottom: 9 }}>
                        OPTED-IN · AWAITING RANK
                      </Text>
                      {registrations.map((participant, index) => (
                        <View
                          key={`${participant.alias}-${participant.updatedAt}-${index}`}
                          testID={`paper-event-unranked-participant-${index + 1}`}
                          accessible
                          accessibilityLabel={`${participant.alias}${participant.isCurrentUser ? ', you' : ''}, ${participant.status === 'queued' ? 'registered, waiting for opening fill' : participant.equity == null ? 'entered, score unavailable' : 'entered, awaiting rank'}, ${participant.tradeCount ?? 'unknown'} trades, current equity ${participant.equity == null ? 'unavailable' : money(participant.equity)}, ${participant.holdings.length} holdings`}
                          style={{ marginTop: index === 0 ? 0 : 9, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(255,255,255,0.035)' }}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                            <Feather name="user" size={14} color="#D8B45A" />
                            <Text numberOfLines={1} style={{ flex: 1, minWidth: 0, color: '#F4F0E7', fontFamily: 'Inter_700Bold', fontSize: 13 }}>
                              {participant.alias}
                            </Text>
                            {participant.isCurrentUser && (
                              <Text style={{ color: '#E6CA7A', fontFamily: 'Inter_700Bold', fontSize: 9 }}>YOU</Text>
                            )}
                            <Text style={{ color: '#C5C8CD', fontFamily: 'Inter_600SemiBold', fontSize: 8, letterSpacing: 0.45 }}>
                              {participant.status === 'queued'
                                ? event.phase === 'upcoming' ? 'REGISTERED' : 'WAITING FOR FILL'
                                : participant.equity == null ? 'SCORE PENDING' : 'AWAITING RANK'}
                            </Text>
                          </View>
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 9 }}>
                            {[
                              ['START', money(participant.startEquity)],
                              ['EQUITY', participant.equity == null ? 'Unavailable' : money(participant.equity)],
                              ['P/L', participant.profitLoss == null ? 'Unavailable' : signedMoney(participant.profitLoss)],
                              ['RETURN', participant.returnPercent == null ? 'Unavailable' : returnLabel(participant.returnPercent)],
                              ['CASH', participant.cashBalance == null ? 'Unavailable' : money(participant.cashBalance)],
                              ['TRADES', participant.tradeCount == null ? 'Unavailable' : String(participant.tradeCount)],
                            ].map(([label, value]) => (
                              <View key={label} style={{ flexGrow: 1, flexBasis: '30%', minWidth: 82, paddingVertical: 7, paddingHorizontal: 8, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.24)' }}>
                                <Text style={{ color: '#AEB5BF', fontFamily: 'Inter_600SemiBold', fontSize: 8, letterSpacing: 0.5 }}>{label}</Text>
                                <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={{ color: '#F4F0E7', fontFamily: 'Inter_700Bold', fontSize: 10, marginTop: 3 }}>{value}</Text>
                              </View>
                            ))}
                          </View>
                          {participant.holdings.length > 0 && (
                            <View style={{ marginTop: 8, paddingTop: 7, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)' }}>
                              <Text style={{ color: '#C5C8CD', fontFamily: 'Inter_600SemiBold', fontSize: 8, letterSpacing: 0.7, marginBottom: 4 }}>OPEN HOLDINGS</Text>
                              {participant.holdings.map((holding) => (
                                <Text key={holding.symbol} numberOfLines={1} style={{ color: '#F4F0E7', fontFamily: 'Inter_500Medium', fontSize: 10, marginTop: 3 }}>
                                  {holding.symbol} · {holding.companyName} · {holding.marketValue == null ? 'market value unavailable' : money(holding.marketValue)}
                                  {holding.allocationPercent == null ? '' : ` · ${holding.allocationPercent.toFixed(1)}%`}
                                </Text>
                              ))}
                            </View>
                          )}
                          <Text style={{ color: '#858D98', fontFamily: 'Inter_400Regular', fontSize: 8, marginTop: 7 }}>
                            Updated {timeLabel(participant.updatedAt)}
                          </Text>
                        </View>
                      ))}
                      <Text style={{ color: '#C5C8CD', fontFamily: 'Inter_400Regular', fontSize: 9, marginTop: 8 }}>
                        These participants remain visible while their ranked score is being prepared.
                      </Text>
                    </View>
                  )}
                  <View testID="paper-event-leaderboard-podium" style={{ marginTop: entries.length === 0 ? 7 : 2 }}>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 10 }}>
                      <Text style={{ color: '#F4F0E7', fontFamily: 'Inter_700Bold', fontSize: 14 }}>The podium</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                        <Text style={{ color: '#D5C189', fontFamily: 'Inter_600SemiBold', fontSize: 9, letterSpacing: 1.1 }}>TOP THREE</Text>
                        {Platform.OS !== 'web' && entries.length > 0 && (
                          <TouchableOpacity
                            testID="share-paper-event-podium"
                            accessibilityRole="button"
                            accessibilityLabel="Preview and share the Event Arena podium image"
                            onPress={() => setPodiumImageOpen(true)}
                            style={{ minHeight: 40, minWidth: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 8, borderRadius: 9, borderWidth: 1, borderColor: 'rgba(216,180,90,0.48)', backgroundColor: 'rgba(216,180,90,0.10)' }}
                          >
                            <Feather name="image" size={14} color="#E6CA7A" />
                            <Text style={{ color: '#E6CA7A', fontFamily: 'Inter_700Bold', fontSize: 9 }}>SHARE IMAGE</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                    <Animated.View style={{
                      opacity: reduceMotion ? 1 : podiumEntranceValueRef.current,
                      transform: [{ scale: reduceMotion ? 1 : podiumEntranceValueRef.current }],
                    }}>
                      {widePodium ? (
                        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginTop: 8 }}>
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
                    </Animated.View>
                  </View>
                </>
              )}
              </ImageBackground>
              </View>

              {standingsEntries.length > 0 && (
                    <View testID="paper-event-leaderboard-list" style={{ marginTop: 3, paddingHorizontal: 14, paddingTop: 13, paddingBottom: 4, borderRadius: 18, backgroundColor: isPennyStockMayhem ? 'rgba(7,17,13,0.95)' : colors.card, borderWidth: 1, borderColor: isPennyStockMayhem ? 'rgba(184,149,90,0.5)' : colors.border }}>
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
              {ownEntry && (
                <View
                  accessible
                  testID="paper-event-leaderboard-current-user"
                  accessibilityLabel={`Your leaderboard position is rank ${ownEntry.rank}, ${ownEntry.alias}.`}
                  style={{ marginTop: 17, marginBottom: 17, padding: 14, borderRadius: 16, borderWidth: 1.5, borderColor: 'rgba(216,180,90,0.82)', backgroundColor: 'rgba(35,31,22,0.96)' }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                    <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: `${ownMedal.color}24`, borderWidth: 1, borderColor: `${ownMedal.color}78`, alignItems: 'center', justifyContent: 'center' }}>
                      <Feather name="award" size={18} color={ownMedal.color} />
                    </View>
                    <Text style={{ flex: 1, color: '#E8CD7B', fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1 }}>
                      YOUR POSITION
                    </Text>
                    <Text style={{ color: ownMedal.color, fontFamily: 'Inter_700Bold', fontSize: 10 }}>
                      {ownMedal.label}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10 }}>
                    <Text allowFontScaling adjustsFontSizeToFit numberOfLines={1} style={{ color: ownMedal.color, fontFamily: 'Inter_700Bold', fontSize: 30, minWidth: 48 }}>
                      #{ownEntry.rank}
                    </Text>
                    <Text allowFontScaling adjustsFontSizeToFit minimumFontScale={0.7} numberOfLines={1} style={{ flex: 1, minWidth: 0, color: '#F6F1E5', fontFamily: 'Inter_700Bold', fontSize: 17 }}>
                      {ownEntry.alias}
                    </Text>
                  </View>
                  {ownEntry.rank > 1 && (() => {
                    const returnGap = getEventArenaNextRankReturnGap(ownEntry, entries);
                    return returnGap === null ? null : (
                      <Text testID="paper-event-next-rank-gap" style={{ color: '#E8CD7B', fontFamily: 'Inter_600SemiBold', fontSize: 10, marginTop: 8 }}>
                        {returnGap.toFixed(2)} percentage points to rank #{ownEntry.rank - 1}
                      </Text>
                    );
                  })()}
                </View>
              )}
              {loadError && (entries.length > 0 || registrations.length > 0) && (
                <View testID="paper-event-leaderboard-stale" style={{ marginTop: 9, padding: 10, borderRadius: 9, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.goldMuted }}>
                  <Text style={{ color: colors.gold, fontFamily: 'Inter_700Bold', fontSize: 10 }}>
                    {leaderboardQuery.error ? 'Refresh failed · showing the last successful rankings' : loadError}
                  </Text>
                  {leaderboardQuery.error && (
                    <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 3 }}>
                      Last successful update: {timeLabel(lastUpdated)}
                    </Text>
                  )}
                  <TouchableOpacity testID="retry-paper-event-leaderboard" accessibilityRole="button" onPress={() => { void refresh(true); }} style={{ alignSelf: 'flex-start', paddingVertical: 7 }}>
                    <Text style={{ color: colors.primary, fontFamily: 'Inter_700Bold', fontSize: 10 }}>RETRY</Text>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          )}
        </View>
      </PageWrapper>

      <Modal
        visible={podiumImageOpen}
        animationType="slide"
        onRequestClose={() => setPodiumImageOpen(false)}
      >
        <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: Platform.OS === 'web' ? 24 : insets.top + 8 }}>
          <View style={{ paddingHorizontal: 18, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ flex: 1, color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 20 }}>Share podium image</Text>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close podium image preview" onPress={() => setPodiumImageOpen(false)} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
              <Feather name="x" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 18 }}>
            <ViewShot
              ref={podiumImageRef}
              options={{ format: 'png', quality: 1 }}
              style={{ width: '100%', maxWidth: 360 }}
            >
              <EventArenaPodiumShareCard event={event} slots={podiumSlots} />
            </ViewShot>
          </ScrollView>
          <View style={{ paddingHorizontal: 18, paddingTop: 10, paddingBottom: Platform.OS === 'web' ? 24 : insets.bottom + 18 }}>
            <TouchableOpacity
              testID="share-paper-event-podium-confirm"
              accessibilityRole="button"
              disabled={sharingPodiumImage}
              onPress={() => { void sharePodiumImage(); }}
              style={{ minHeight: 50, borderRadius: 12, backgroundColor: sharingPodiumImage ? colors.muted : colors.primary, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ color: colors.primaryForeground, fontFamily: 'Inter_700Bold', fontSize: 14 }}>
                {sharingPodiumImage ? 'Preparing image…' : 'Share image'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <EventArenaTransferLockNotice
        visible={transferLockNoticeOpen}
        onDismiss={() => setTransferLockNoticeOpen(false)}
      />

      <Modal visible={cashTransferOpen} animationType="fade" transparent statusBarTranslucent onRequestClose={() => {
        if (!cashTransferBusy) setCashTransferOpen(false);
      }}>
        <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={0} style={{ flex: 1, justifyContent: 'center', padding: 20, backgroundColor: 'rgba(0,0,0,0.62)' }}>
          <View testID="event-arena-send-cash-review" style={{ maxHeight: '90%', padding: 18, borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={{ color: colors.primary, fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 0.8 }}>{isLightningRound ? 'LIGHTNING ROUND' : 'EVENT ARENA'} · {event.id}</Text>
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
                  disabled={isTransferLocked || cashTransferBusy || !Number.isFinite(Number(cashTransferAmount)) || Number(cashTransferAmount) < 0.01 || Number(cashTransferAmount) > (eventAccount?.cash ?? 0)}
                  onPress={() => { void confirmCashTransfer(); }}
                  style={{ flex: 1, minHeight: 48, justifyContent: 'center', alignItems: 'center', borderRadius: 10, backgroundColor: colors.primary, opacity: isTransferLocked || cashTransferBusy || Number(cashTransferAmount) < 0.01 || Number(cashTransferAmount) > (eventAccount?.cash ?? 0) ? 0.55 : 1 }}
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
            <Text style={{ color: colors.primary, fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 0.8 }}>{isLightningRound ? 'LIGHTNING ROUND' : 'EVENT ARENA'}</Text>
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
              <Text style={{ color: colors.primary, fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 0.8 }}>{isLightningRound ? 'LIGHTNING ROUND PRIVACY' : 'EVENT ARENA PRIVACY'}</Text>
              <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 20, marginTop: 7 }}>Leaderboard sharing</Text>
              <Text style={{ color: optedIn ? colors.primary : colors.mutedForeground, fontFamily: 'Inter_700Bold', fontSize: 13, marginTop: 10 }}>
                {optedIn ? 'Sharing is on' : 'Sharing is off'}
              </Text>
              <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18, marginTop: 7 }}>
                When sharing is on, other event participants can see your alias, {isLightningRound ? 'server-calculated event score' : 'self-reported score'}, and each current holding’s ticker and company name, estimated allocation percentage of your {isLightningRound ? 'event-only portfolio' : 'reported Event Arena equity'}, and Long or Short direction.
              </Text>
              <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18, marginTop: 7 }}>
                Raw share counts, prices, cost basis, account identifiers, regular accounts, and trade history are never shared. {isLightningRound ? 'The score is calculated from event-tagged fills and current prices.' : 'Scores are self-reported and not independently verified.'}
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
