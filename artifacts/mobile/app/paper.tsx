/**
 * Paper Trading Screen — risk-free trading with $100,000 virtual cash.
 * Supports 3 independent strategy accounts with live P&L, charts, and tracking.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { MMLogo } from '@/components/MMLogo';
import { PaperEventShareCard } from '@/components/PaperEventShareCard';
import { BottomTabBar } from '@/components/BottomTabBar';
import { PaperAccountSwipeArea } from '@/components/PaperAccountSwipeArea';
import { PaperEventArenaDashboard } from '@/components/PaperEventArenaDashboard';
import { useAchievements } from '@/contexts/AchievementsContext';
import { AmericanSteelBackground } from '@/components/AmericanSteelBackground';
import { useColors } from '@/hooks/useColors';
import {
  AllocationBar,
  DividendBarChart,
  GrowthProjectionChart,
  POSITION_COLORS,
  PortfolioLineChart,
} from '@/components/PaperCharts';
import OrderSheet, {
  type ConfirmOrderArgs,
  type OrderSubmissionResult,
  type OrderIntent,
} from '@/components/OrderSheet';
import {
  INITIAL_BALANCE,
  buildValueHistory,
  computePaperEquity,
  computeRealizedPnL,
  computeSellResult,
  computeSellWinRate,
  createAccountValueSnapshot,
  fundFee,
  getCoveredAccountValueHistory,
  mergeAccountValueHistory,
  normalizeDividendYield,
  parseAccountValueSnapshots,
  removeAccountValueSnapshots,
  upsertAccountValueSnapshot,
  type LiveQuote,
  type PaperAccount,
  type PaperAccountValueSnapshot,
  type PaperLot,
  type PaperOrder,
  type PaperPosition,
  type PaperTransaction,
  type OrderType,
  isShortPosition,
} from '@/lib/paperMath';
import {
  applySlippage,
  applyOrderSlippage,
  checkRisk,
  evaluateOrder,
  fillOrder,
  settleCash,
  creditDividends,
  fifoSell,
} from '@/lib/paperEngine';
import { removePendingPaperOrder } from '@/lib/paperOrderDeletion';
import { getMarketOrderQuoteError, getOrderQuoteState } from '@/lib/paperOrderEntry';
import {
  renamePaperAccount,
  resetPaperAccountData,
} from '@/lib/paperAccountManagement';
import {
  createLatestRequestGuard,
  getBuyOrderDetails,
  getStockSearchQueryFromKey,
  getStockSearchFeedback,
  isStockSearchCurrent,
  resolveStockSearchSymbol,
  type BuyStockInfo,
} from '@/lib/stockSearch';
import { useWatchlist } from '@/hooks/useWatchlist';
import {
  buildPaperChallengeSummary,
  ensurePaperChallengeAccount,
  getPaperChallengeMilestones,
  getMissingPaperChallengeQuoteSymbols,
  getPaperChallengeWindow,
  normalizePaperChallengeStore,
  PAPER_CHALLENGE_STORAGE_KEY,
  PAPER_CHALLENGE_STARTING_BALANCE,
  persistPaperChallengeFinalization,
  shouldEnsurePaperChallengeAccount,
  updatePaperChallengeStore,
  type PaperChallengeStore,
  type PaperChallengeSummary,
  capturePaperChallengeBaseline,
} from '@/lib/paperChallenge';
import {
  getSearchHeatMapInstrumentsQueryKey,
  getSearchStockSymbolsQueryKey,
  useSearchHeatMapInstruments,
  useSearchStockSymbols,
  type HeatMapInstrumentSuggestion,
} from '@workspace/api-client-react';

/**
 * Paper Trading Screen — risk-free trading with $100,000 virtual cash.
 * Supports 3 independent strategy accounts with live P&L, charts, and tracking.
 */
// ── Types ──────────────────────────────────────────────────────────────────
type TabId = 'overview' | 'positions' | 'orders' | 'history' | 'analytics' | 'dividends' | 'growth';
type PaperTabGroupId = 'portfolio' | 'activity' | 'insights';
type StockInfo = BuyStockInfo;
type PaperBuySuggestion = {
  symbol: string;
  name: string;
  exchange: string;
  instrumentType: 'stock' | 'etf';
};

// ── Local cache ─────────────────────────────────────────────────────────────
// Bumped to v2: adds orders, lots, and extended account fields.
const PAPER_CACHE_KEY = '@stocksense/paper_v2';
const PAPER_VALUE_SNAPSHOT_KEY = '@stocksense/paper_equity_snapshots_v1';
const PAPER_VALUE_SNAPSHOT_INTERVAL_MS = 60 * 60_000;
const PAPER_VALUE_SNAPSHOT_MAX_AGE_MS = 2 * 60 * 60_000;

interface PaperCache {
  accounts: PaperAccount[];
  positions: PaperPosition[];
  transactions: PaperTransaction[];
  orders: PaperOrder[];
  lots: PaperLot[];
  activeId: string;
}

async function readPaperCache(): Promise<PaperCache | null> {
  try {
    const raw = await AsyncStorage.getItem(PAPER_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PaperCache;
    // Ensure new fields exist for caches written before v2 features
    if (!parsed.orders) parsed.orders = [];
    if (!parsed.lots) parsed.lots = [];
    return parsed;
  } catch { return null; }
}

async function writePaperCache(data: PaperCache) {
  // AsyncStorage writes are asynchronous and can complete out of order when
  // an order fill and a quote poll save at nearly the same time. Serialize
  // them so an older snapshot can never overwrite a newer position update.
  paperCacheWriteQueue = paperCacheWriteQueue
    .catch(() => {})
    .then(() => AsyncStorage.setItem(PAPER_CACHE_KEY, JSON.stringify(data)))
    .catch(() => {});
  await paperCacheWriteQueue;
}

let paperCacheWriteQueue: Promise<void> = Promise.resolve();

// ── Dividend helpers ────────────────────────────────────────────────────────
/**
 * Estimate annual dividend income in dollars for a single position.
 * Prefers the declared dividendRate ($/share/yr) when available; falls back
 * to price × normalised yield for positions loaded from older DB records.
 */
function annualDivIncome(pos: { shares: number; dividendRate?: number; dividendYield: number }, price: number): number {
  if (pos.dividendRate && pos.dividendRate > 0) return pos.shares * pos.dividendRate;
  return _annualDivIncomeFallback(pos, price);
}

function _annualDivIncomeFallback(pos: { shares: number; dividendRate?: number; dividendYield: number }, price: number): number {
  return pos.shares * price * normalizeDividendYield(pos.dividendYield, pos.dividendRate, price);
}

// ── Constants ──────────────────────────────────────────────────────────────
const BASE_URL = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

const SILVER = '#c0c0c0';
const DIM = '#a2a8b2';
const BUY_COLOR = '#00e5a0';
const SELL_COLOR = '#ff3b3b';
const GOLD = '#ffd700';
const CARD_BG = 'rgba(192,192,192,0.08)';
const BORDER = 'rgba(192,192,192,0.28)';

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'overview',  label: 'Overview', icon: 'grid' },
  { id: 'positions', label: 'Positions', icon: 'list' },
  { id: 'orders',    label: 'Orders', icon: 'clock' },
  { id: 'history',   label: 'Trade History', icon: 'repeat' },
  { id: 'analytics', label: 'Analytics', icon: 'bar-chart-2' },
  { id: 'dividends', label: 'Dividends', icon: 'dollar-sign' },
  { id: 'growth',    label: 'Growth', icon: 'trending-up' },
];

const PAPER_TAB_GROUPS: {
  id: PaperTabGroupId;
  label: string;
  icon: string;
  tabs: TabId[];
}[] = [
  { id: 'portfolio', label: 'Portfolio', icon: 'briefcase', tabs: ['overview', 'positions'] },
  { id: 'activity', label: 'Activity', icon: 'activity', tabs: ['orders', 'history'] },
  { id: 'insights', label: 'Insights', icon: 'bar-chart-2', tabs: ['analytics', 'dividends', 'growth'] },
];
const PAPER_ACCOUNT_DISPLAY_NAMES = ['Tiger', 'Borg', 'Fireball'] as const;

const HISTORY_RANGES = [
  { id: '1D', ms: 86_400_000 },
  { id: '1W', ms: 7 * 86_400_000 },
  { id: '1M', ms: 30 * 86_400_000 },
  { id: '3M', ms: 90 * 86_400_000 },
  { id: '1Y', ms: 365 * 86_400_000 },
  { id: 'ALL', ms: null },
] as const;

let paperValueSnapshotWriteQueue: Promise<void> = Promise.resolve();

// ── Helpers ────────────────────────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

function $fmt(n: number) {
  return n.toLocaleString('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
}
function $short(n: number) {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${Math.abs(n).toFixed(2)}`;
}
function pctFmt(n: number, decimals = 2) {
  return `${n >= 0 ? '+' : ''}${n.toFixed(decimals)}%`;
}
function pnlColor(n: number) {
  return n > 0 ? BUY_COLOR : n < 0 ? SELL_COLOR : SILVER;
}

function defaultAccounts(): PaperAccount[] {
  const now = new Date().toISOString();
  return [
    { id: uid(), name: 'Strategy 1', cash: INITIAL_BALANCE, createdAt: now },
    { id: uid(), name: 'Strategy 2', cash: INITIAL_BALANCE, createdAt: now },
    { id: uid(), name: 'Strategy 3', cash: INITIAL_BALANCE, createdAt: now },
  ];
}

// ── Main Screen ────────────────────────────────────────────────────────────
export default function PaperScreen() {
  const colors = useColors();
  const router = useRouter();
  const { awardAchievement } = useAchievements();
  const insets = useSafeAreaInsets();
  const { width: screenWidth, fontScale } = useWindowDimensions();
  const compactHeroStats = screenWidth <= 360 || fontScale >= 1.3;
  const watchlist = useWatchlist();

  // Persisted state
  const [accounts, setAccounts] = useState<PaperAccount[]>([]);
  const [activeId, setActiveId] = useState('');
  const [positions, setPositions] = useState<PaperPosition[]>([]);
  const [transactions, setTransactions] = useState<PaperTransaction[]>([]);
  const [orders, setOrders] = useState<PaperOrder[]>([]);
  const [lots, setLots] = useState<PaperLot[]>([]);
  const [accountValueSnapshots, setAccountValueSnapshots] = useState<PaperAccountValueSnapshot[]>([]);
  const [snapshotStorageError, setSnapshotStorageError] = useState('');

  // Load state
  const [loaded, setLoaded] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [paperChallenge, setPaperChallenge] = useState<PaperChallengeStore>({ enrollment: null, history: [] });
  const [paperChallengeReady, setPaperChallengeReady] = useState(false);
  const [challengeNow, setChallengeNow] = useState(Date.now());
  const [challengeRetryVersion, setChallengeRetryVersion] = useState(0);
  const [challengeFinalizationBusy, setChallengeFinalizationBusy] = useState(false);
  const [challengeFinalizationError, setChallengeFinalizationError] = useState(false);
  const [completedEventSummary, setCompletedEventSummary] = useState<PaperChallengeSummary | null>(null);
  const paperChallengeRef = useRef<PaperChallengeStore>({ enrollment: null, history: [] });
  const previousEnrollmentIdRef = useRef<string | null>(null);
  const challengeFinalizingRef = useRef<string | null>(null);
  const challengeFinalizationFailureRef = useRef<string | null>(null);
  const challengeBaselineCapturingRef = useRef<string | null>(null);

  // Live quotes
  const [quotes, setQuotes] = useState<Record<string, LiveQuote>>({});
  const [loadingQuotes, setLoadingQuotes] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // UI
  const [activeTab, setActiveTab] = useState<TabId>('positions');
  const activeTabGroup = PAPER_TAB_GROUPS.find((group) => group.tabs.includes(activeTab)) ?? PAPER_TAB_GROUPS[0];
  const activeGroupTabs = TABS.filter((tab) => activeTabGroup.tabs.includes(tab.id));
  const [chartRange, setChartRange] = useState<(typeof HISTORY_RANGES)[number]['id']>('ALL');
  const [showAccountManagement, setShowAccountManagement] = useState(false);
  const [showTradeModal, setShowTradeModal] = useState(false);
  const [showOrderSheet, setShowOrderSheet] = useState(false);
  const [tradeMode, setTradeMode] = useState<OrderIntent>('buy');
  const [selectedPos, setSelectedPos] = useState<PaperPosition | null>(null);
  const [editingOrder, setEditingOrder] = useState<PaperOrder | null>(null);
  const [deleteConfirmationOrder, setDeleteConfirmationOrder] = useState<PaperOrder | null>(null);

  // Buy modal state
  const [buySymbol, setBuySymbol] = useState('');
  const [stockInfo, setStockInfo] = useState<StockInfo | null>(null);
  const [infoLoading, setInfoLoading] = useState(false);
  const [infoError, setInfoError] = useState('');
  const [debouncedBuyQuery, setDebouncedBuyQuery] = useState('');
  const stockLookupRequestRef = useRef(createLatestRequestGuard());
  const buySearchContextRef = useRef({
    input: '',
    settledQuery: '',
    enabled: false,
  });

  // Rename state
  const [renameId, setRenameId] = useState('');
  const [renameDraft, setRenameDraft] = useState('');

  // Expanded position (cost-basis lots)
  const [expandedPosId, setExpandedPosId] = useState<string | null>(null);

  const stockSearch = useSearchStockSymbols(
    { q: debouncedBuyQuery },
    {
      query: {
        queryKey: getSearchStockSymbolsQueryKey({ q: debouncedBuyQuery }),
        enabled: showTradeModal && !stockInfo && !infoLoading && !infoError && debouncedBuyQuery.length >= 2,
        staleTime: 45_000,
      },
    },
  );
  const etfSearchParams = { q: debouncedBuyQuery, category: 'etfs' as const };
  const etfSearch = useSearchHeatMapInstruments(etfSearchParams, {
    query: {
      queryKey: getSearchHeatMapInstrumentsQueryKey(etfSearchParams),
      enabled: showTradeModal && !stockInfo && !infoLoading && !infoError && debouncedBuyQuery.length >= 2,
      staleTime: 45_000,
    },
  });

  // ── Derived ──────────────────────────────────────────────────────────────
  const account = accounts.find(a => a.id === activeId);
  const myPositions = positions.filter(p => p.accountId === activeId);
  const myTxns = transactions.filter(t => t.accountId === activeId);
  const buySearchText = buySymbol.trim();
  const buyTicker = buySymbol.trim().toUpperCase();
  const buyTickerIsWatched = stockInfo ? watchlist.isWatched(buyTicker) : false;
  const isCurrentBuySearchInput = showTradeModal
    && !stockInfo
    && !infoLoading
    && !infoError
    && buySearchText.length >= 2
    && debouncedBuyQuery === buySearchText;
  const buySearchResultQuery = getStockSearchQueryFromKey(stockSearch.queryKey);
  const isCurrentBuySearch = isCurrentBuySearchInput && isStockSearchCurrent({
    input: buySearchText,
    settledQuery: debouncedBuyQuery,
    resultQuery: buySearchResultQuery,
    isPlaceholderData: stockSearch.isPlaceholderData,
  });
  const buyEtfSearchResultQuery = getStockSearchQueryFromKey(etfSearch.queryKey);
  const isCurrentEtfBuySearch = isCurrentBuySearchInput && isStockSearchCurrent({
    input: buySearchText,
    settledQuery: debouncedBuyQuery,
    resultQuery: buyEtfSearchResultQuery,
    isPlaceholderData: etfSearch.isPlaceholderData,
  });
  const stockSuggestions: PaperBuySuggestion[] = isCurrentBuySearch
    ? (stockSearch.data ?? []).map((suggestion) => ({ ...suggestion, instrumentType: 'stock' }))
    : [];
  const etfSuggestions: PaperBuySuggestion[] = isCurrentEtfBuySearch
    ? (etfSearch.data ?? []).map((suggestion: HeatMapInstrumentSuggestion) => ({
        symbol: suggestion.symbol,
        name: suggestion.name,
        exchange: suggestion.exchange,
        instrumentType: 'etf',
      }))
    : [];
  const buySuggestions = [...stockSuggestions, ...etfSuggestions]
    .filter((suggestion, index, all) => all.findIndex((item) => item.symbol === suggestion.symbol) === index);
  const exactEtfSuggestion = etfSuggestions.find(
    (suggestion) => suggestion.symbol.toUpperCase() === buySearchText.toUpperCase(),
  );
  const allowRawBuyTicker = buySearchText.length === 1
    || (
      isCurrentBuySearch
      && isCurrentEtfBuySearch
      && !stockSearch.isFetching
      && !etfSearch.isFetching
      && (stockSearch.isSuccess || stockSearch.isError)
      && (etfSearch.isSuccess || etfSearch.isError)
    );
  const resolvedBuySymbol = exactEtfSuggestion?.symbol ?? resolveStockSearchSymbol(
    buySymbol, buySuggestions, null, allowRawBuyTicker,
  );
  const buySearchIsFetching = (isCurrentBuySearch && stockSearch.isFetching)
    || (isCurrentEtfBuySearch && etfSearch.isFetching);
  const buySearchIsError = isCurrentBuySearch && stockSearch.isError
    && isCurrentEtfBuySearch && etfSearch.isError;
  const buySearchIsSuccess = isCurrentBuySearch && (stockSearch.isSuccess || stockSearch.isError)
    && isCurrentEtfBuySearch && (etfSearch.isSuccess || etfSearch.isError);
  const buySearchFeedback = isCurrentBuySearchInput
    ? getStockSearchFeedback({
        isFetching: buySearchIsFetching,
        isError: buySearchIsError,
        isSuccess: buySearchIsSuccess,
        suggestionCount: buySuggestions.length,
      })
    : null;
  const buyOrderDetails = getBuyOrderDetails(buySymbol, stockInfo);

  buySearchContextRef.current = {
    input: buySearchText,
    settledQuery: debouncedBuyQuery,
    enabled: showTradeModal && !stockInfo && !infoLoading && !infoError,
  };

  useEffect(() => () => {
    stockLookupRequestRef.current.invalidate();
  }, []);

  useEffect(() => {
    const query = buySymbol.trim();
    if (!showTradeModal || stockInfo || infoLoading || infoError || query.length < 2) {
      setDebouncedBuyQuery('');
      return;
    }

    const timer = setTimeout(() => setDebouncedBuyQuery(query), 250);
    return () => clearTimeout(timer);
  }, [buySymbol, infoError, infoLoading, showTradeModal, stockInfo]);

  // Total equity includes settled cash + unsettled T+2 proceeds + market value of positions.
  // Buying power is restricted to settled cash only (enforced in fillOrder / OrderSheet risk check).
  const portfolioValue = account ? computePaperEquity(account, myPositions, quotes) : 0;
  const paperChallengeWindow = getPaperChallengeWindow(challengeNow);
  const isPaperChallengeWaiting = !!paperChallenge.enrollment
    && challengeNow >= paperChallenge.enrollment.eventEndAtMs;
  const isEventAccountActive = paperChallengeWindow.phase === 'active'
    && !!account
    && account.id.startsWith('paper-event:')
    && paperChallenge.enrollment?.accountId === account.id;
  const hasCurrentEventEnrollment = paperChallenge.enrollment?.eventId === paperChallengeWindow.id;
  const visibleEventAccountId = paperChallenge.enrollment?.accountId
    ?? paperChallenge.history[0]?.accountId
    ?? null;
  const visibleAccounts = accounts.filter((item) =>
    !item.id.startsWith('paper-event:') || item.id === visibleEventAccountId,
  );
  const regularAccounts = visibleAccounts.filter((item) => !item.id.startsWith('paper-event:'));
  const selectedAccountIndex = regularAccounts.findIndex((item) => item.id === account?.id);
  const selectedAccountDisplayName = account?.id.startsWith('paper-event:')
    ? 'Event Arena'
    : PAPER_ACCOUNT_DISPLAY_NAMES[selectedAccountIndex] ?? account?.name ?? 'Paper account';
  const selectedAccountPosition = visibleAccounts.findIndex((item) => item.id === account?.id);
  const isSelectedEventAccount = !!account?.id.startsWith('paper-event:');
  const selectedEventEnrollment = isSelectedEventAccount
    && paperChallenge.enrollment?.accountId === account?.id
    ? paperChallenge.enrollment
    : null;
  const selectedEventSummary = isSelectedEventAccount
    ? paperChallenge.history.find((event) => event.accountId === account?.id) ?? null
    : null;
  const isSelectedArchivedEventAccount = isSelectedEventAccount
    && !selectedEventEnrollment
    && !!selectedEventSummary;
  const selectedEventId = selectedEventEnrollment?.eventId ?? selectedEventSummary?.eventId ?? '';
  const selectedEventStartAtMs = selectedEventEnrollment?.eventStartAtMs ?? selectedEventSummary?.eventStartAtMs ?? Number.NaN;
  const selectedEventEndAtMs = selectedEventEnrollment?.eventEndAtMs ?? selectedEventSummary?.eventEndAtMs ?? Number.NaN;
  const activeAccountStartingBalance = isSelectedEventAccount
    ? selectedEventEnrollment?.startingBalance
      ?? selectedEventSummary?.startingBalance
      ?? PAPER_CHALLENGE_STARTING_BALANCE
    : INITIAL_BALANCE;
  const unrealizedPnL = myPositions.reduce(
    (s, p) => s + p.shares * (isShortPosition(p)
      ? p.avgCost - (quotes[p.symbol]?.price ?? p.avgCost)
      : (quotes[p.symbol]?.price ?? p.avgCost) - p.avgCost), 0,
  );
  // Realized P&L is net of fund fees: gross realized minus fees charged at close.
  const realizedPnL = computeRealizedPnL(myTxns);
  const totalReturn = ((portfolioValue - activeAccountStartingBalance) / activeAccountStartingBalance) * 100;

  const dayChange = myPositions.reduce(
    (s, p) => s + p.shares * (quotes[p.symbol]?.change ?? 0) * (isShortPosition(p) ? -1 : 1), 0,
  );
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayRealized = myTxns
    .filter((tx) => (tx.action === 'SELL' || tx.action === 'BUY_TO_COVER')
      && new Date(tx.date).getTime() >= todayStart.getTime())
    .reduce((sum, tx) => sum + (tx.realizedPnL ?? 0) - (tx.fee ?? 0), 0);
  const todayPnL = dayChange + todayRealized;
  const totalPnLFromEquity = portfolioValue - activeAccountStartingBalance;

  const accountsRef = useRef<PaperAccount[]>([]);
  const positionsRef = useRef<PaperPosition[]>([]);
  const transactionsRef = useRef<PaperTransaction[]>([]);
  const ordersRef = useRef<PaperOrder[]>([]);
  const lotsRef = useRef<PaperLot[]>([]);
  const activeIdRef = useRef<string>('');
  const accountValueSnapshotsRef = useRef<PaperAccountValueSnapshot[]>([]);
  const orderSubmissionRef = useRef(false);

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    AsyncStorage.getItem(PAPER_CHALLENGE_STORAGE_KEY).then((raw) => {
      if (cancelled) return;
      if (raw) {
        try {
          const saved = JSON.parse(raw) as PaperChallengeStore;
          const normalized = normalizePaperChallengeStore({
            enrollment: saved.enrollment ?? null,
            history: Array.isArray(saved.history) ? saved.history : [],
          });
          paperChallengeRef.current = normalized;
          setPaperChallenge(normalized);
        } catch {
          paperChallengeRef.current = { enrollment: null, history: [] };
        }
      }
      setPaperChallengeReady(true);
    }).catch(() => {
      if (!cancelled) setPaperChallengeReady(true);
    });
    return () => { cancelled = true; };
  }, []));

  useEffect(() => {
    const timer = setInterval(() => setChallengeNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const currentEnrollmentId = paperChallenge.enrollment?.eventId ?? null;
    const previousEnrollmentId = previousEnrollmentIdRef.current;
    if (previousEnrollmentId && !currentEnrollmentId) {
      const summary = paperChallenge.history.find((event) => event.eventId === previousEnrollmentId);
      if (summary) setCompletedEventSummary(summary);
    }
    previousEnrollmentIdRef.current = currentEnrollmentId;
  }, [paperChallenge.enrollment?.eventId, paperChallenge.history]);

  const savePaperChallenge = useCallback(async (
    update: (current: PaperChallengeStore) => PaperChallengeStore,
  ) => {
    const next = await updatePaperChallengeStore(update, {
      getItem: (key) => AsyncStorage.getItem(key),
      setItem: (key, value) => AsyncStorage.setItem(key, value),
    });
    paperChallengeRef.current = next;
    setPaperChallenge(next);
    return next;
  }, []);

  const retryPaperChallengeFinalization = useCallback(() => {
    if (!isPaperChallengeWaiting || challengeFinalizationBusy) return;
    challengeFinalizationFailureRef.current = null;
    setChallengeFinalizationError(false);
    setChallengeRetryVersion((version) => version + 1);
  }, [challengeFinalizationBusy, isPaperChallengeWaiting]);

  // ── Storage helpers ───────────────────────────────────────────────────────
  const flushCache = useCallback((
    accts: PaperAccount[], pos: PaperPosition[], txns: PaperTransaction[],
    ords: PaperOrder[], ls: PaperLot[], aid: string,
  ): Promise<void> => {
    return writePaperCache({ accounts: accts, positions: pos, transactions: txns, orders: ords, lots: ls, activeId: aid });
  }, []);

  /** Save all mutable slices at once — avoids repeated flushCache calls on complex updates. */
  const saveAll = useCallback(async (
    accts: PaperAccount[], pos: PaperPosition[], txns: PaperTransaction[],
    ords: PaperOrder[], ls: PaperLot[], aid: string,
  ) => {
    accountsRef.current = accts;
    positionsRef.current = pos;
    transactionsRef.current = txns;
    ordersRef.current = ords;
    lotsRef.current = ls;
    activeIdRef.current = aid;
    setAccounts(accts);
    setPositions(pos);
    setTransactions(txns);
    setOrders(ords);
    setLots(ls);
    await flushCache(accts, pos, txns, ords, ls, aid);
  }, [flushCache]);

  const saveAccounts = useCallback(async (data: PaperAccount[]) => {
    accountsRef.current = data;
    setAccounts(data);
    await flushCache(data, positionsRef.current, transactionsRef.current, ordersRef.current, lotsRef.current, activeIdRef.current);
  }, [flushCache]);
  const savePositions = useCallback(async (data: PaperPosition[]) => {
    positionsRef.current = data;
    setPositions(data);
    await flushCache(accountsRef.current, data, transactionsRef.current, ordersRef.current, lotsRef.current, activeIdRef.current);
  }, [flushCache]);
  const saveTransactions = useCallback(async (data: PaperTransaction[]) => {
    transactionsRef.current = data;
    setTransactions(data);
    await flushCache(accountsRef.current, positionsRef.current, data, ordersRef.current, lotsRef.current, activeIdRef.current);
  }, [flushCache]);
  const saveOrders = useCallback(async (data: PaperOrder[]) => {
    ordersRef.current = data;
    setOrders(data);
    await flushCache(accountsRef.current, positionsRef.current, transactionsRef.current, data, lotsRef.current, activeIdRef.current);
  }, [flushCache]);

  const persistAccountValueSnapshots = useCallback(async (
    next: PaperAccountValueSnapshot[],
  ) => {
    accountValueSnapshotsRef.current = next;
    setAccountValueSnapshots(next);
    const write = paperValueSnapshotWriteQueue
      .catch(() => {})
      .then(() => AsyncStorage.setItem(PAPER_VALUE_SNAPSHOT_KEY, JSON.stringify(next)));
    paperValueSnapshotWriteQueue = write;
    try {
      await write;
      setSnapshotStorageError('');
    } catch {
      setSnapshotStorageError('Saved account values could not be written to this device.');
    }
  }, []);

  const recordAccountValueSnapshot = useCallback(async (
    accountId: string,
    liveQuotes: Record<string, LiveQuote>,
  ) => {
    const snapshot = createAccountValueSnapshot(
      accountId,
      accountsRef.current,
      positionsRef.current,
      liveQuotes,
    );
    if (!snapshot) return;
    const next = upsertAccountValueSnapshot(
      accountValueSnapshotsRef.current,
      snapshot,
      PAPER_VALUE_SNAPSHOT_INTERVAL_MS,
    );
    if (next === accountValueSnapshotsRef.current) return;
    await persistAccountValueSnapshots(next);
  }, [persistAccountValueSnapshots]);

  const clearAccountValueSnapshots = useCallback(async (accountId: string) => {
    const next = removeAccountValueSnapshots(accountValueSnapshotsRef.current, accountId);
    if (next.length !== accountValueSnapshotsRef.current.length) {
      await persistAccountValueSnapshots(next);
    }
  }, [persistAccountValueSnapshots]);

  useEffect(() => {
    const enrollment = paperChallenge.enrollment;
    if (!loaded || !paperChallengeReady || !enrollment) return;
    if (!shouldEnsurePaperChallengeAccount(enrollment, challengeNow)) {
      const prematureEventAccountIsSelected = enrollment.startEquity === null
        && challengeNow < enrollment.eventStartAtMs
        && activeIdRef.current === enrollment.accountId;
      const fallbackAccount = accountsRef.current.find((item) => !item.id.startsWith('paper-event:'));
      if (prematureEventAccountIsSelected && fallbackAccount) {
        void saveAll(
          accountsRef.current,
          positionsRef.current,
          transactionsRef.current,
          ordersRef.current,
          lotsRef.current,
          fallbackAccount.id,
        );
      }
      return;
    }
    const existingEventAccount = accountsRef.current.find((item) => item.id === enrollment.accountId);
    if (existingEventAccount) {
      if (activeIdRef.current !== existingEventAccount.id) {
        void saveAll(
          accountsRef.current,
          positionsRef.current,
          transactionsRef.current,
          ordersRef.current,
          lotsRef.current,
          existingEventAccount.id,
        );
      }
      return;
    }
    const eventAccountState = ensurePaperChallengeAccount(enrollment, {
      accounts: accountsRef.current,
      positions: positionsRef.current,
      transactions: transactionsRef.current,
      orders: ordersRef.current,
      lots: lotsRef.current,
    });
    const eventAccount = eventAccountState.accounts.find((item) => item.id === enrollment.accountId);
    if (!eventAccount) return;
    void saveAll(
      eventAccountState.accounts,
      eventAccountState.positions,
      eventAccountState.transactions,
      eventAccountState.orders,
      eventAccountState.lots,
      enrollment.accountId,
    );
  }, [challengeNow, loaded, paperChallenge.enrollment, paperChallengeReady, saveAll]);

  // ── Init ─────────────────────────────────────────────────────────────────
  const init = useCallback(async () => {
    setErrorMsg('');
    setLoaded(false);

    // Paper trading is guest-local: load the exact state used by order
    // execution and never replace it with an unauthenticated server response.
    const [cached, rawSnapshots] = await Promise.all([
      readPaperCache(),
      AsyncStorage.getItem(PAPER_VALUE_SNAPSHOT_KEY).catch(() => null),
    ]);
    let savedSnapshots: PaperAccountValueSnapshot[] = [];
    try {
      savedSnapshots = parseAccountValueSnapshots(rawSnapshots ? JSON.parse(rawSnapshots) : null);
    } catch {
      // A damaged chart-history record must not block account and trade recovery.
    }
    accountValueSnapshotsRef.current = savedSnapshots;
    setAccountValueSnapshots(savedSnapshots);
    if (cached && cached.accounts.length > 0) {
      accountsRef.current = cached.accounts;
      positionsRef.current = cached.positions;
      transactionsRef.current = cached.transactions;
      ordersRef.current = cached.orders ?? [];
      lotsRef.current = cached.lots ?? [];
      activeIdRef.current = cached.activeId;
      setAccounts(cached.accounts);
      setPositions(cached.positions);
      setTransactions(cached.transactions);
      setOrders(cached.orders ?? []);
      setLots(cached.lots ?? []);
      setActiveId(cached.activeId);
    }
    else {
      const localAccounts = defaultAccounts();
      const localActiveId = localAccounts[0].id;
      accountsRef.current = localAccounts;
      positionsRef.current = [];
      transactionsRef.current = [];
      ordersRef.current = [];
      lotsRef.current = [];
      activeIdRef.current = localActiveId;
      setAccounts(localAccounts);
      setPositions([]);
      setTransactions([]);
      setOrders([]);
      setLots([]);
      setActiveId(localActiveId);
      await writePaperCache({
        accounts: localAccounts,
        positions: [],
        transactions: [],
        orders: [],
        lots: [],
        activeId: localActiveId,
      });
    }

    const nowISO = new Date().toISOString();
    const currentAccounts = accountsRef.current;
    const currentPositions = positionsRef.current;
    const currentTransactions = transactionsRef.current;
    let settledAccounts = currentAccounts.map((a) => settleCash(a, nowISO).updated);
    let extraTxns: PaperTransaction[] = [];
    for (const a of settledAccounts) {
      const accountPositions = currentPositions.filter(p => p.accountId === a.id);
      const { updatedAccount, newTransactions } = creditDividends(accountPositions, a, {}, nowISO, uid);
      settledAccounts = settledAccounts.map(sa => sa.id === updatedAccount.id ? updatedAccount : sa);
      extraTxns = [...extraTxns, ...newTransactions];
    }
    const finalTxns = extraTxns.length > 0
      ? [...currentTransactions, ...extraTxns]
      : currentTransactions;
    const id = activeIdRef.current || settledAccounts[0].id;
    accountsRef.current = settledAccounts;
    transactionsRef.current = finalTxns;
    activeIdRef.current = id;
    setAccounts(settledAccounts);
    setTransactions(finalTxns);
    setActiveId(id);
    await writePaperCache({
      accounts: settledAccounts,
      positions: currentPositions,
      transactions: finalTxns,
      orders: ordersRef.current,
      lots: lotsRef.current,
      activeId: id,
    });
    setErrorMsg('');
    setLoaded(true);
  }, []);

  useEffect(() => { init(); }, [init]);

  // ── Pending-order evaluation ──────────────────────────────────────────────
  /**
   * After quotes are refreshed, walk every pending order and auto-fill those
   * whose trigger condition is now satisfied.  Trailing-stop references are
   * also updated so the watermark moves with the price.
   */
  const evaluatePendingOrders = useCallback((
    newQuotes: Record<string, LiveQuote>,
  ) => {
    const pending = ordersRef.current.filter(o => o.status === 'pending');
    if (pending.length === 0) return;

    const nowISO = new Date().toISOString();
    let updatedOrders = [...ordersRef.current];
    let updatedAccounts = [...accountsRef.current];
    let updatedPositions = [...positionsRef.current];
    let updatedLots = [...lotsRef.current];
    const newTxns: PaperTransaction[] = [];

    let ordersChanged = false;

    for (const order of pending) {
      const eventEnrollment = paperChallengeRef.current.enrollment;
      if (
        eventEnrollment?.accountId === order.accountId
        && Date.now() >= eventEnrollment.eventEndAtMs
      ) {
        updatedOrders = updatedOrders.map((item) =>
          item.id === order.id ? { ...item, status: 'cancelled' as const } : item,
        );
        ordersChanged = true;
        continue;
      }
      const q = newQuotes[order.symbol];
      if (!q) continue;
      if (getOrderQuoteState(q) !== 'fresh') continue;
      const result = evaluateOrder(order, q.price);

      if (!result.shouldFill) {
        // Update trailing reference if it moved — must be persisted even without a fill
        if ('updatedTrailRef' in result && result.updatedTrailRef !== undefined) {
          updatedOrders = updatedOrders.map(o =>
            o.id === order.id ? { ...o, trailRef: result.updatedTrailRef } : o,
          );
          ordersChanged = true;
        }
        continue;
      }

      // This order fills — apply slippage and execute
      const fillPrice = applyOrderSlippage(order, q.price);
      const account = updatedAccounts.find(a => a.id === order.accountId);
      if (!account) continue;
      const executionRiskError = checkRisk({
        side: order.side,
        intent: order.intent,
        shares: order.shares,
        orderType: order.orderType,
        limitPrice: order.limitPrice,
        stopPrice: order.stopPrice,
        trailPct: order.trailPct,
        trailAbs: order.trailAbs,
        symbol: order.symbol,
        currentPrice: fillPrice,
        account: order.intent === 'short' && order.shortCollateralRatio != null
          ? { ...account, shortCollateralRatio: order.shortCollateralRatio }
          : account,
        accountPositions: updatedPositions.filter((position) => position.accountId === order.accountId),
        quotes: newQuotes,
        pendingOrders: updatedOrders,
        excludeOrderId: order.id,
      });
      if (executionRiskError) {
        updatedOrders = updatedOrders.map((item) =>
          item.id === order.id ? { ...item, status: 'cancelled' as const } : item,
        );
        ordersChanged = true;
        continue;
      }

      const fillResult = fillOrder({
        order,
        fillPrice,
        filledAt: nowISO,
        account,
        positions: updatedPositions,
        lots: updatedLots,
        uid,
      });

      if (!fillResult.ok) {
        // Execution-time constraint violated (e.g. price moved, shares already sold) —
        // cancel the order so it doesn't keep attempting to fill on every tick.
        console.warn('[paper] order fill rejected:', order.id, fillResult.reason);
        updatedOrders = updatedOrders.map(o =>
          o.id === order.id ? { ...o, status: 'cancelled' as const } : o,
        );
        ordersChanged = true;
        continue;
      }

      updatedAccounts = updatedAccounts.map(a =>
        a.id === order.accountId ? fillResult.updatedAccount : a,
      );
      updatedPositions = fillResult.updatedPositions;
      updatedLots = fillResult.updatedLots;
      newTxns.push(fillResult.newTransaction);
      updatedOrders = updatedOrders.map(o =>
        o.id === order.id ? { ...o, status: 'filled', filledPrice: fillPrice, filledAt: nowISO } : o,
      );
      ordersChanged = true;
    }

    // Nothing at all changed — skip persistence entirely
    if (!ordersChanged && newTxns.length === 0) return;

    const allTxns = [...transactionsRef.current, ...newTxns];

    if (newTxns.length > 0) {
      // Full save: accounts, positions, lots, transactions, orders all changed
      void saveAll(updatedAccounts, updatedPositions, allTxns, updatedOrders, updatedLots, activeIdRef.current);
    } else {
      // Only trailRef(s) changed — persist orders only to avoid a heavier full-save on every tick
      void saveOrders(updatedOrders);
    }
  }, [saveAll]);

  // ── Fetch quotes ──────────────────────────────────────────────────────────
  const fetchQuotes = useCallback(async (
    pos: PaperPosition[],
    accountId: string,
    evaluateOrders = true,
  ): Promise<Record<string, LiveQuote>> => {
    // Fetch quotes for positions of the active account PLUS any pending-order symbols
    const posSymbols = pos.filter(p => p.accountId === accountId).map(p => p.symbol);
    const orderSymbols = ordersRef.current
      .filter(o => o.accountId === accountId && o.status === 'pending')
      .map(o => o.symbol);
    const symbols = [...new Set([...posSymbols, ...orderSymbols])];
    if (symbols.length === 0) {
      await recordAccountValueSnapshot(accountId, {});
      return {};
    }
    setLoadingQuotes(true);
    try {
      const results = await Promise.allSettled(
        symbols.map(async sym => {
          const res = await fetch(`${BASE_URL}/api/stocks/quote/${sym}`);
          if (!res.ok) throw new Error(`Quote request failed for ${sym}`);
          const data = await res.json();
          return { sym, data };
        }),
      );
      const next: Record<string, LiveQuote> = {};
      for (const r of results) {
        if (r.status === 'fulfilled' && Number.isFinite(r.value.data.currentPrice) && r.value.data.currentPrice > 0) {
          const { sym, data } = r.value;
          next[sym] = {
            price: data.currentPrice,
            change: Number.isFinite(data.priceChange) ? data.priceChange : 0,
            pct: Number.isFinite(data.priceChangePercent) ? data.priceChangePercent : 0,
            priceTimestamp: data.priceTimestamp ?? null,
            marketSession: typeof data.marketSession === 'string' ? data.marketSession : undefined,
            priceSource: typeof data.priceSource === 'string' ? data.priceSource : undefined,
            fetchedAtMs: Date.now(),
          };
        }
      }
      setQuotes(prev => {
        const merged = { ...prev, ...next };
        return merged;
      });
      // Evaluate pending orders with the freshly-fetched quotes
      if (evaluateOrders) evaluatePendingOrders({ ...quotes, ...next });
      await recordAccountValueSnapshot(accountId, next);
      return next;
    } finally {
      setLoadingQuotes(false);
    }
  }, [evaluatePendingOrders, recordAccountValueSnapshot]);

  // Keep the selector's equity cards current without evaluating orders from
  // accounts that are not active in the trading workspace.
  const fetchInactiveAccountCardQuotes = useCallback(async () => {
    const inactiveAccounts = accounts.filter((item) => item.id !== activeId);
    const symbols = [...new Set(
      positions
        .filter((position) => position.accountId !== activeId)
        .map((position) => position.symbol),
    )];
    if (symbols.length === 0) {
      for (const inactiveAccount of inactiveAccounts) {
        void recordAccountValueSnapshot(inactiveAccount.id, {});
      }
      return;
    }
    const results = await Promise.allSettled(symbols.map(async (symbol) => {
      const response = await fetch(`${BASE_URL}/api/stocks/quote/${symbol}`);
      if (!response.ok) throw new Error(`Quote request failed for ${symbol}`);
      const data = await response.json();
      if (!Number.isFinite(data.currentPrice) || data.currentPrice <= 0) {
        throw new Error(`Invalid quote for ${symbol}`);
      }
      return [symbol, {
        price: data.currentPrice,
        change: Number.isFinite(data.priceChange) ? data.priceChange : 0,
        pct: Number.isFinite(data.priceChangePercent) ? data.priceChangePercent : 0,
        priceTimestamp: data.priceTimestamp ?? null,
        marketSession: typeof data.marketSession === 'string' ? data.marketSession : undefined,
        priceSource: typeof data.priceSource === 'string' ? data.priceSource : undefined,
        fetchedAtMs: Date.now(),
      }] as const;
    }));
    const next: Record<string, LiveQuote> = {};
    for (const result of results) {
      if (result.status === 'fulfilled') next[result.value[0]] = result.value[1];
    }
    for (const inactiveAccount of inactiveAccounts) {
      void recordAccountValueSnapshot(inactiveAccount.id, next);
    }
    if (Object.keys(next).length > 0) setQuotes((current) => ({ ...current, ...next }));
  }, [accounts, activeId, positions, recordAccountValueSnapshot]);

  useEffect(() => {
    if (!loaded) return;
    void fetchInactiveAccountCardQuotes();
    const timer = setInterval(() => void fetchInactiveAccountCardQuotes(), 60_000);
    return () => clearInterval(timer);
  }, [fetchInactiveAccountCardQuotes, loaded]);

  useEffect(() => {
    const enrollment = paperChallenge.enrollment;
    if (
      !paperChallengeReady
      || !loaded
      || !enrollment
      || enrollment.startEquity === null
      || challengeNow < enrollment.eventEndAtMs
    ) return;
    if (challengeFinalizingRef.current === enrollment.eventId) return;
    if (challengeFinalizationFailureRef.current === enrollment.eventId) return;
    challengeFinalizingRef.current = enrollment.eventId;
    setChallengeFinalizationBusy(true);

    void (async () => {
      const eventAccount = accountsRef.current.find((item) => item.id === enrollment.accountId);
      if (!eventAccount) throw new Error('The event account is unavailable.');
      const eventPositions = positionsRef.current.filter((position) => position.accountId === enrollment.accountId);
      const freshQuotes = await fetchQuotes(eventPositions, enrollment.accountId, false);
      if (getMissingPaperChallengeQuoteSymbols(eventPositions, freshQuotes).length > 0) {
        throw new Error('Current event quotes are unavailable.');
      }

      const pendingEventOrders = ordersRef.current.filter(
        (order) => order.accountId === enrollment.accountId && order.status === 'pending',
      );
      if (pendingEventOrders.length > 0) {
        const pendingIds = new Set(pendingEventOrders.map((order) => order.id));
        await saveOrders(ordersRef.current.map((order) =>
          pendingIds.has(order.id) ? { ...order, status: 'cancelled' as const } : order,
        ));
      }
      const endEquity = computePaperEquity(eventAccount, eventPositions, freshQuotes);
      if (!Number.isFinite(endEquity)) throw new Error('Event account data is incomplete.');
      const startEquity = enrollment.startEquity;
      if (startEquity === null) return;
      const completedAtMs = Date.now();
      const eventEquityHistory = accountValueSnapshotsRef.current.filter(
        (snapshot) => snapshot.accountId === enrollment.accountId,
      );
      const summary = buildPaperChallengeSummary(
        { ...enrollment, startEquity },
        endEquity,
        transactionsRef.current,
        completedAtMs,
        {
          equityHistory: [
            {
              accountId: enrollment.accountId,
              date: new Date(enrollment.joinedAtMs).toISOString(),
              value: startEquity,
            },
            ...eventEquityHistory,
            {
              accountId: enrollment.accountId,
              date: new Date(completedAtMs).toISOString(),
              value: endEquity,
            },
          ],
          finalPositions: eventPositions.map((position) => {
            const marketPrice = freshQuotes[position.symbol]?.price;
            if (!Number.isFinite(marketPrice) || marketPrice <= 0) {
              throw new Error(`A final price is unavailable for ${position.symbol}.`);
            }
            return {
              symbol: position.symbol,
              companyName: position.companyName,
              shares: position.shares,
              positionType: isShortPosition(position) ? 'short' : 'long',
              avgCost: position.avgCost,
              marketPrice,
              marketValue: position.shares * marketPrice,
              unrealizedPnL: position.shares * (isShortPosition(position)
                ? position.avgCost - marketPrice
                : marketPrice - position.avgCost),
            };
          }),
        },
      );
      const latestStore = paperChallengeRef.current;
      if (latestStore.enrollment?.eventId !== enrollment.eventId) return;
      const fallbackAccount = accountsRef.current.find((item) => !item.id.startsWith('paper-event:'));
      if (activeIdRef.current === enrollment.accountId && fallbackAccount) {
        await saveAll(
          accountsRef.current,
          positionsRef.current,
          transactionsRef.current,
          ordersRef.current,
          lotsRef.current,
          fallbackAccount.id,
        );
      }
      const finalizedStore = await persistPaperChallengeFinalization(
        summary,
        challengeNow,
        {
          getItem: (key) => AsyncStorage.getItem(key),
          setItem: (key, value) => AsyncStorage.setItem(key, value),
        },
      );
      paperChallengeRef.current = finalizedStore;
      setPaperChallenge(finalizedStore);
      challengeFinalizationFailureRef.current = null;
      setChallengeFinalizationError(false);
    })().catch(() => {
      challengeFinalizationFailureRef.current = enrollment.eventId;
      setChallengeFinalizationError(true);
    }).finally(() => {
      challengeFinalizingRef.current = null;
      setChallengeFinalizationBusy(false);
    });
  }, [
    accounts,
    challengeNow,
    challengeRetryVersion,
    fetchQuotes,
    loaded,
    paperChallenge.enrollment,
    paperChallengeReady,
    positions,
    quotes,
    saveAll,
    saveOrders,
    savePaperChallenge,
  ]);

  useEffect(() => {
    const enrollment = paperChallenge.enrollment;
    if (!paperChallengeReady || !loaded || !enrollment || enrollment.startEquity !== null) return;

    if (challengeNow >= enrollment.eventEndAtMs) {
      if (challengeFinalizationFailureRef.current === enrollment.eventId) return;
      if (challengeBaselineCapturingRef.current === enrollment.eventId) return;
      challengeBaselineCapturingRef.current = enrollment.eventId;
      setChallengeFinalizationBusy(true);
      const latestStore = paperChallengeRef.current;
      const eventAccount = accountsRef.current.find((item) => item.id === enrollment.accountId);
      if (!eventAccount || latestStore.enrollment?.eventId !== enrollment.eventId) {
        challengeFinalizationFailureRef.current = enrollment.eventId;
        setChallengeFinalizationError(true);
        challengeBaselineCapturingRef.current = null;
        setChallengeFinalizationBusy(false);
        return;
      }
      void savePaperChallenge((current) => {
        const currentEnrollment = current.enrollment;
        if (!currentEnrollment || currentEnrollment.eventId !== enrollment.eventId || currentEnrollment.startEquity !== null) {
          return current;
        }
        return {
          ...current,
          enrollment: capturePaperChallengeBaseline(currentEnrollment, PAPER_CHALLENGE_STARTING_BALANCE),
        };
      }).catch(() => {
        challengeFinalizationFailureRef.current = enrollment.eventId;
        setChallengeFinalizationError(true);
      }).finally(() => {
        challengeBaselineCapturingRef.current = null;
        setChallengeFinalizationBusy(false);
      });
      return;
    }

    if (challengeNow < enrollment.eventStartAtMs || challengeBaselineCapturingRef.current === enrollment.eventId) return;
    challengeBaselineCapturingRef.current = enrollment.eventId;
    void (async () => {
      const currentWindow = getPaperChallengeWindow(Date.now());
      if (currentWindow.id !== enrollment.eventId || currentWindow.phase !== 'active') return;
      const eventPositions = positionsRef.current.filter((position) => position.accountId === enrollment.accountId);
      const freshQuotes = await fetchQuotes(eventPositions, enrollment.accountId, false);
      const latestWindow = getPaperChallengeWindow(Date.now());
      if (latestWindow.id !== enrollment.eventId || latestWindow.phase !== 'active') return;

      const eventAccount = accountsRef.current.find((item) => item.id === enrollment.accountId);
      if (!eventAccount) throw new Error('The event account is unavailable.');
      const latestPositions = positionsRef.current.filter((position) => position.accountId === enrollment.accountId);
      const latestQuotes = { ...quotes, ...freshQuotes };
      const startEquity = computePaperEquity(eventAccount, latestPositions, latestQuotes);
      const latestStore = paperChallengeRef.current;
      if (latestStore.enrollment?.eventId !== enrollment.eventId || latestStore.enrollment.startEquity !== null) return;
      await savePaperChallenge((current) => {
        const currentEnrollment = current.enrollment;
        if (!currentEnrollment || currentEnrollment.eventId !== enrollment.eventId || currentEnrollment.startEquity !== null) {
          return current;
        }
        return {
          ...current,
          enrollment: capturePaperChallengeBaseline(currentEnrollment, startEquity),
        };
      });
    })().catch(() => {
      // Keep the opt-in so the next clock tick can retry a local baseline capture.
    }).finally(() => {
      if (challengeBaselineCapturingRef.current === enrollment.eventId) {
        challengeBaselineCapturingRef.current = null;
      }
    });
  }, [
    accounts,
    challengeNow,
    challengeRetryVersion,
    fetchQuotes,
    loaded,
    paperChallenge.enrollment,
    paperChallengeReady,
    positions,
    quotes,
    savePaperChallenge,
  ]);

  useEffect(() => {
    if (activeId) fetchQuotes(positions, activeId);
  }, [activeId, positions.length, orders.length]);

  useEffect(() => {
    if (!loaded || !activeId) return;
    const timer = setInterval(() => {
      void fetchQuotes(positionsRef.current, activeIdRef.current, false);
    }, PAPER_VALUE_SNAPSHOT_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [activeId, fetchQuotes, loaded]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchQuotes(positions, activeId);
    setRefreshing(false);
  };

  const refreshOrderQuote = async (symbol: string) => {
    const normalizedSymbol = symbol.trim().toUpperCase();
    if (!normalizedSymbol) throw new Error('Choose a stock before refreshing its quote.');
    const response = await fetch(`${BASE_URL}/api/stocks/quote/${encodeURIComponent(normalizedSymbol)}`);
    const data = await response.json();
    if (!response.ok || data.error) {
      throw new Error(data.message ?? 'The market-data provider could not refresh this quote.');
    }
    if (!Number.isFinite(data.currentPrice) || data.currentPrice <= 0) {
      throw new Error('The provider did not return a valid price.');
    }
    setQuotes((current) => ({
      ...current,
      [normalizedSymbol]: {
        price: data.currentPrice,
        change: Number.isFinite(data.priceChange) ? data.priceChange : 0,
        pct: Number.isFinite(data.priceChangePercent) ? data.priceChangePercent : 0,
        priceTimestamp: data.priceTimestamp ?? null,
        marketSession: typeof data.marketSession === 'string' ? data.marketSession : undefined,
        priceSource: typeof data.priceSource === 'string' ? data.priceSource : undefined,
        fetchedAtMs: Date.now(),
      },
    }));
  };

  // ── Account actions ───────────────────────────────────────────────────────
  const switchAccount = async (id: string) => {
    activeIdRef.current = id;
    setActiveId(id);
    setChartRange('ALL');
    await flushCache(accountsRef.current, positionsRef.current, transactionsRef.current, ordersRef.current, lotsRef.current, id);
    fetchQuotes(positions, id);
  };

  const renameAccount = async (id: string, name: string) => {
    const updated = renamePaperAccount(accountsRef.current, id, name);
    await saveAccounts(updated);
    setRenameId('');
  };

  const resetAccount = async (id: string) => {
    if (paperChallengeWindow.phase === 'active' && paperChallengeRef.current.enrollment?.accountId === id) {
      Alert.alert('Account is in an event', 'This account cannot be reset until its paper trading event is complete.');
      return;
    }
    const reset = resetPaperAccountData({
      accounts: accountsRef.current,
      positions: positionsRef.current,
      transactions: transactionsRef.current,
      orders: ordersRef.current,
      lots: lotsRef.current,
    }, id, new Date().toISOString());
    await saveAll(reset.accounts, reset.positions, reset.transactions, reset.orders, reset.lots, activeIdRef.current);
    await clearAccountValueSnapshots(id);
    setQuotes(prev => {
      const remaining = new Set(reset.positions.map(p => p.symbol));
      const next: Record<string, LiveQuote> = {};
      for (const [k, v] of Object.entries(prev)) {
        if (remaining.has(k)) next[k] = v;
      }
      return next;
    });
  };

  // ── Buy ───────────────────────────────────────────────────────────────────
  const invalidateStockLookup = () => {
    stockLookupRequestRef.current.invalidate();
    setInfoLoading(false);
  };

  const lookUpStock = async (symbolOverride?: string) => {
    const sym = (symbolOverride ?? resolvedBuySymbol ?? '').trim().toUpperCase();
    if (!sym) return;
    const requestId = stockLookupRequestRef.current.begin();
    setBuySymbol(sym);
    setDebouncedBuyQuery('');
    setInfoLoading(true);
    setInfoError('');
    setStockInfo(null);
    try {
      const [infoRes, quoteRes] = await Promise.all([
        fetch(`${BASE_URL}/api/stocks/info/${sym}`),
        fetch(`${BASE_URL}/api/stocks/quote/${sym}`),
      ]);
      if (!stockLookupRequestRef.current.isCurrent(requestId)) return;
      const info = await infoRes.json();
      const quote = await quoteRes.json();
      if (!stockLookupRequestRef.current.isCurrent(requestId)) return;
      if (info.error) throw new Error(info.error);
      if (quote.error) throw new Error(quote.error);
      setStockInfo({
        companyName: info.companyName,
        currentPrice: quote.currentPrice,
        dividendYield: info.dividendYield ?? 0,
        dividendRate: info.dividendRate ?? 0,
        expenseRatio: info.expenseRatio ?? 0,
        sector: info.sector ?? '',
      });
      setQuotes(prev => ({
        ...prev,
        [sym]: {
          price: quote.currentPrice,
          change: Number.isFinite(quote.priceChange) ? quote.priceChange : 0,
          pct: Number.isFinite(quote.priceChangePercent) ? quote.priceChangePercent : 0,
          priceTimestamp: quote.priceTimestamp ?? null,
          marketSession: typeof quote.marketSession === 'string' ? quote.marketSession : undefined,
          priceSource: typeof quote.priceSource === 'string' ? quote.priceSource : undefined,
          fetchedAtMs: Date.now(),
        },
      }));
    } catch (e: any) {
      if (stockLookupRequestRef.current.isCurrent(requestId)) {
        setInfoError(e.message ?? 'Could not fetch stock info');
      }
    } finally {
      if (stockLookupRequestRef.current.isCurrent(requestId)) {
        setInfoLoading(false);
      }
    }
  };

  const addBuyTickerToWatchlist = async () => {
    if (!stockInfo || !buyTicker || buyTickerIsWatched) return;
    await watchlist.add(buyTicker);
    Alert.alert('Added to watchlist', `${buyTicker} was added to your watchlist.`);
  };

  /**
   * Unified order handler called by OrderSheet.onConfirm for both buy and sell.
   * Market orders execute immediately (with slippage).
   * Non-market orders are added to the pending-orders queue.
   */
  const handleConfirmOrder = async (args: ConfirmOrderArgs): Promise<OrderSubmissionResult> => {
    if (orderSubmissionRef.current) {
      return { status: 'rejected', message: 'This order is already being processed.' };
    }
    orderSubmissionRef.current = true;
    try {
      const accountId = args.accountId;
      const sym = args.symbol.trim().toUpperCase();
      const companyName = args.companyName.trim() || sym;
      const intent = args.side === 'short' || args.side === 'cover' ? args.side : undefined;
      const direction = args.side === 'buy' || args.side === 'cover' ? 'buy' : 'sell';
      const enrollment = paperChallengeRef.current.enrollment;
      if (enrollment?.accountId === accountId && Date.now() >= enrollment.eventEndAtMs) {
        return {
          status: 'rejected',
          message: 'The event week has ended. Choose another paper account to continue trading.',
        };
      }
      if (enrollment?.accountId === accountId && Date.now() < enrollment.eventStartAtMs) {
        return {
          status: 'rejected',
          message: 'This event has not started yet. Your event account will be ready at the scheduled opening.',
        };
      }
      if (accountId.startsWith('paper-event:') && enrollment?.accountId !== accountId) {
        return {
          status: 'rejected',
          message: 'Completed Event Arena accounts are read-only. Choose another account to trade.',
        };
      }

      const currentAccounts = accountsRef.current;
      const currentPositions = positionsRef.current;
      const currentTransactions = transactionsRef.current;
      const currentOrders = ordersRef.current;
      const currentLots = lotsRef.current;
      const currentAccount = currentAccounts.find((item) => item.id === accountId);
      if (!currentAccount) {
        return { status: 'rejected', message: 'The reviewed paper account is no longer available.' };
      }
      if (!sym) return { status: 'rejected', message: 'Choose a stock before submitting the order.' };
      const currentQuote = quotes[sym];
      if (args.orderType === 'market') {
        const quoteError = getMarketOrderQuoteError(currentQuote, args.quotePrice);
        if (quoteError) return { status: 'rejected', message: quoteError };
      } else if (!currentQuote || !Number.isFinite(currentQuote.price) || currentQuote.price <= 0) {
        return { status: 'rejected', message: 'A provider quote is unavailable. No order was submitted.' };
      }
      if (args.orderType === 'market' && args.orderId) {
        return { status: 'rejected', message: 'Market orders cannot be edited. Cancel the pending order and place a new market order.' };
      }

      const accountPositions = currentPositions.filter((position) => position.accountId === accountId);
      const riskAccount = intent === 'short'
        ? { ...currentAccount, shortCollateralRatio: args.shortCollateralRatio ?? currentAccount.shortCollateralRatio }
        : currentAccount;
      const riskQuotes = args.orderType === 'market'
        ? { ...quotes, [sym]: { ...currentQuote, price: args.quotePrice } }
        : quotes;
      const riskError = checkRisk({
        side: direction,
        intent,
        shares: args.shares,
        orderType: args.orderType,
        limitPrice: args.limitPrice,
        stopPrice: args.stopPrice,
        trailPct: args.trailPct,
        trailAbs: args.trailAbs,
        symbol: sym,
        currentPrice: args.orderType === 'market' ? args.quotePrice : currentQuote.price,
        account: riskAccount,
        accountPositions,
        quotes: riskQuotes,
        pendingOrders: currentOrders,
        excludeOrderId: args.orderId,
      });
      if (riskError) return { status: 'rejected', message: riskError };

      const nowISO = new Date().toISOString();
      if (args.orderType === 'market') {
        const fillPrice = applySlippage(args.quotePrice, args.shares, direction);
        const fillRiskError = checkRisk({
          side: direction,
          intent,
          shares: args.shares,
          orderType: args.orderType,
          limitPrice: args.limitPrice,
          stopPrice: args.stopPrice,
          trailPct: args.trailPct,
          trailAbs: args.trailAbs,
          symbol: sym,
          currentPrice: fillPrice,
          account: riskAccount,
          accountPositions,
          quotes: riskQuotes,
          pendingOrders: currentOrders,
          excludeOrderId: args.orderId,
        });
        if (fillRiskError) return { status: 'rejected', message: fillRiskError };
        const existingPosition = accountPositions.find((position) =>
          position.symbol === sym && (intent === 'cover'
            ? isShortPosition(position)
            : intent === 'short' ? isShortPosition(position) : !isShortPosition(position)),
        );
        const metadata = args.stockInfo ?? existingPosition;
        const syntheticOrder: PaperOrder = {
          id: uid(),
          accountId,
          symbol: sym,
          companyName,
          orderType: 'market',
          side: direction,
          intent,
          shortCollateralRatio: args.shortCollateralRatio,
          shares: args.shares,
          dividendYield: metadata?.dividendYield ?? 0,
          dividendRate: metadata?.dividendRate ?? 0,
          expenseRatio: metadata?.expenseRatio ?? 0,
          sector: metadata?.sector ?? '',
          status: 'pending',
          placedAt: nowISO,
        };
        const fillResult = fillOrder({
          order: syntheticOrder,
          fillPrice,
          filledAt: nowISO,
          account: currentAccount,
          positions: currentPositions,
          lots: currentLots,
          uid,
        });
        if (!fillResult.ok) return { status: 'rejected', message: fillResult.reason };

        const { updatedAccount, updatedPositions, updatedLots, newTransaction } = fillResult;
        await saveAll(
          currentAccounts.map((item) => item.id === accountId ? updatedAccount : item),
          updatedPositions,
          [...currentTransactions, newTransaction],
          currentOrders,
          updatedLots,
          activeIdRef.current,
        );
        if (!args.orderId) {
          void awardAchievement('first-paper-order');
          if (args.side === 'sell') void awardAchievement('first-paper-sell');
        }
        const actionLabel = args.side === 'short' ? 'Short sold'
          : args.side === 'cover' ? 'Covered'
            : args.side === 'buy' ? 'Bought' : 'Sold';
        return {
          status: 'filled',
          message: `${actionLabel} ${args.shares} ${sym} in ${currentAccount.name}.`,
          fillPrice,
        };
      }

      const priorOrder = args.orderId
        ? currentOrders.find((order) => order.id === args.orderId
          && order.accountId === accountId
          && order.status === 'pending')
        : undefined;
      if (args.orderId && !priorOrder) {
        return { status: 'rejected', message: 'That order is no longer pending and cannot be edited.' };
      }
      const metadata = args.stockInfo
        ?? priorOrder
        ?? accountPositions.find((position) => position.symbol === sym
          && (intent === 'cover' ? isShortPosition(position) : !isShortPosition(position)));
      const newOrder: PaperOrder = {
        id: priorOrder?.id ?? uid(),
        accountId,
        symbol: sym,
        companyName,
        orderType: args.orderType,
        side: direction,
        intent,
        shortCollateralRatio: args.shortCollateralRatio,
        shares: args.shares,
        limitPrice: args.limitPrice,
        stopPrice: args.stopPrice,
        trailPct: args.trailPct,
        trailAbs: args.trailAbs,
        trailRef: currentQuote.price,
        dividendYield: metadata?.dividendYield ?? 0,
        dividendRate: metadata?.dividendRate ?? 0,
        expenseRatio: metadata?.expenseRatio ?? 0,
        sector: metadata?.sector ?? '',
        status: 'pending',
        placedAt: priorOrder?.placedAt ?? nowISO,
      };
      await saveOrders(priorOrder
        ? currentOrders.map((order) => order.id === priorOrder.id ? newOrder : order)
        : [...currentOrders, newOrder]);
      if (!args.orderId) {
        void awardAchievement('first-paper-order');
        void awardAchievement('first-paper-limit');
        if (args.side === 'sell') void awardAchievement('first-paper-sell');
      }
      return {
        status: 'pending',
        message: `${args.side === 'short' ? 'Short sell' : args.side === 'cover' ? 'Buy to cover' : args.side === 'buy' ? 'Buy' : 'Sell'} ${args.orderType.replace('_', ' ')} for ${args.shares} ${sym} was saved to ${currentAccount.name}.`,
      };
    } catch (error) {
      return {
        status: 'rejected',
        message: error instanceof Error ? error.message : 'The order could not be saved.',
      };
    } finally {
      orderSubmissionRef.current = false;
    }
  };

  // ── Cancel order ──────────────────────────────────────────────────────────
  const cancelOrder = async (orderId: string) => {
    const updated = ordersRef.current.map(o =>
      o.id === orderId ? { ...o, status: 'cancelled' as const } : o,
    );
    await saveOrders(updated);
  };

  const deleteOrder = async (order: PaperOrder) => {
    const updatedOrders = removePendingPaperOrder(ordersRef.current, order, activeIdRef.current);
    if (!updatedOrders) return;
    await saveOrders(updatedOrders);
  };

  const requestDeleteOrder = (order: PaperOrder) => {
    if (order.status !== 'pending' || order.accountId !== activeIdRef.current) return;
    if (Platform.OS === 'web') {
      setDeleteConfirmationOrder(order);
      return;
    }
    Alert.alert('Delete Order', `Delete pending ${order.side} ${order.shares} ${order.symbol}?`, [
      { text: 'No', style: 'cancel' },
      { text: 'Delete Order', style: 'destructive', onPress: () => { void deleteOrder(order); } },
    ]);
  };

  const confirmDeleteOrder = () => {
    const order = deleteConfirmationOrder;
    setDeleteConfirmationOrder(null);
    if (order) void deleteOrder(order);
  };

  const editOrder = (order: PaperOrder) => {
    if (order.status !== 'pending') return;
    setEditingOrder(order);
    setTradeMode(order.intent ?? order.side);
    setBuySymbol(order.symbol);
    if (order.intent === 'cover' || order.side === 'sell' && order.intent !== 'short') {
      setSelectedPos(positionsRef.current.find(p =>
        p.accountId === activeIdRef.current && p.symbol === order.symbol
          && (order.intent === 'cover' ? isShortPosition(p) : !isShortPosition(p)),
      ) ?? null);
    } else {
      const quote = quotes[order.symbol];
      setStockInfo({
        companyName: order.companyName,
        currentPrice: quote?.price ?? order.limitPrice ?? order.stopPrice ?? 0,
        dividendYield: order.dividendYield ?? 0,
        dividendRate: order.dividendRate ?? 0,
        expenseRatio: order.expenseRatio ?? 0,
        sector: order.sector ?? '',
      });
    }
    setShowOrderSheet(true);
  };

  // ── Open modals ───────────────────────────────────────────────────────────
  const openBuyModal = () => {
    invalidateStockLookup();
    setEditingOrder(null);
    setTradeMode('buy');
    setBuySymbol('');
    setDebouncedBuyQuery('');
    setStockInfo(null);
    setInfoError('');
    setShowTradeModal(true);
  };

  const openSelectedStockOrder = (intent: OrderIntent) => {
    const symbol = buyOrderDetails.symbol.trim().toUpperCase();
    const position = positionsRef.current.find((item) => item.accountId === activeIdRef.current
      && item.symbol === symbol
      && (intent === 'sell' ? !isShortPosition(item) : isShortPosition(item)));
    setEditingOrder(null);
    setTradeMode(intent);
    setSelectedPos(intent === 'sell' ? position ?? null : null);
    invalidateStockLookup();
    setShowOrderSheet(true);
    setShowTradeModal(false);
  };

  const openSellModal = (pos: PaperPosition) => {
    invalidateStockLookup();
    setEditingOrder(null);
    setTradeMode('sell');
    setSelectedPos(pos);
    // Clear any stale buy-lookup state so it cannot bleed into sell execution
    setBuySymbol('');
    setStockInfo(null);
    setShowOrderSheet(true);
  };

  const openCoverModal = (pos: PaperPosition) => {
    invalidateStockLookup();
    setEditingOrder(null);
    setTradeMode('cover');
    setSelectedPos(pos);
    setBuySymbol('');
    setStockInfo(null);
    setShowOrderSheet(true);
  };

  // ── Tab views ─────────────────────────────────────────────────────────────
  const renderPositions = () => {
    if (myPositions.length === 0) {
      return (
        <View style={{ paddingHorizontal: 16 }}>
          <View style={styles.emptyWrap}>
            <Feather name="activity" size={36} color={DIM} />
            <Text style={styles.emptyTitle}>No open positions</Text>
            <Text style={styles.emptyHint}>Tap Buy to place your first paper trade</Text>
          </View>
        </View>
      );
    }
    return (
      <View style={{ gap: 4, paddingHorizontal: 16 }}>
        {myPositions.map((pos, i) => {
          const q = quotes[pos.symbol];
          const price = q?.price ?? pos.avgCost;
          const pnl = pos.shares * (isShortPosition(pos) ? pos.avgCost - price : price - pos.avgCost);
          const pnlPct = pos.avgCost > 0 ? (pnl / (pos.shares * pos.avgCost)) * 100 : 0;
          const mktVal = pos.shares * price;
          const color = POSITION_COLORS[i % POSITION_COLORS.length];
          const isExpanded = expandedPosId === pos.id;

          // Lots for this position (oldest first)
          const posLots = lots
            .filter(l => l.symbol === pos.symbol && l.accountId === activeId && l.shares > 0.0001)
            .sort((a, b) => new Date(a.purchasedAt).getTime() - new Date(b.purchasedAt).getTime());

          // Aggregate: total shares and FIFO-weighted avg cost from lots
          const totalLotShares = posLots.reduce((s, l) => s + l.shares, 0);
          const weightedAvgCost = totalLotShares > 0
            ? posLots.reduce((s, l) => s + l.shares * l.cost, 0) / totalLotShares
            : pos.avgCost;

          return (
            <View key={pos.id}>
              <TouchableOpacity
                testID={`paper-position-${pos.id}`}
                style={[styles.posCard, isExpanded && styles.posCardExpanded]}
                onPress={() => setExpandedPosId(isExpanded ? null : pos.id)}
                activeOpacity={0.7}
              >
                <View style={[styles.posColorBar, { backgroundColor: color }]} />
                <View style={{ flex: 1 }}>
                  <View style={styles.posRow}>
                    <View style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
                      <Text style={styles.posSymbol}>{pos.symbol}{isShortPosition(pos) ? '  ·  SHORT' : ''}</Text>
                      <Text style={styles.posName} numberOfLines={1}>{pos.companyName}</Text>
                    </View>
                    <View style={styles.positionValue}>
                      <View style={styles.posValueLine}>
                        <Text style={styles.posMktLabel}>{isShortPosition(pos) ? 'LIABILITY' : 'MARKET VALUE'}</Text>
                        <Text style={styles.posMktVal}>{$fmt(mktVal)}</Text>
                      </View>
                      <Text style={[styles.posPnl, { color: pnlColor(pnl) }]} numberOfLines={1}>
                        {pnl >= 0 ? '+' : ''}{$fmt(pnl)} ({pctFmt(pnlPct)})
                      </Text>
                    </View>
                  </View>
                  <View style={styles.posMetaRow}>
                    <Text style={styles.posMeta} numberOfLines={1}>
                      {pos.shares} sh · {isShortPosition(pos) ? 'Entry' : 'Avg'} {$fmt(pos.avgCost)} ·{' '}
                      {q ? (
                        <Text style={{ color: pnlColor(q.change * (isShortPosition(pos) ? -1 : 1)) }}>
                          ${price.toFixed(2)} ({q.pct >= 0 ? '+' : ''}{q.pct.toFixed(2)}%)
                        </Text>
                      ) : `${price.toFixed(2)}`}
                    </Text>
                  </View>
                </View>
                <Feather
                  name={isExpanded ? 'chevron-down' : 'chevron-right'}
                  size={14}
                  color={DIM}
                  style={{ marginLeft: 8 }}
                />
              </TouchableOpacity>

              {isExpanded && (
                <View style={styles.lotsPanel}>
                  {isShortPosition(pos) ? (
                    <>
                      <Text style={styles.lotsPanelTitle}>SHORT POSITION DETAILS</Text>
                      <View style={styles.historyDetailRow}>
                        <Text style={styles.historyDetail}>Current price</Text>
                        <Text style={styles.historyDetail}>{$fmt(price)}</Text>
                      </View>
                      <View style={styles.historyDetailRow}>
                        <Text style={styles.historyDetail}>Current liability</Text>
                        <Text style={styles.historyDetail}>{$fmt(mktVal)}</Text>
                      </View>
                      <View style={styles.historyDetailRow}>
                        <Text style={styles.historyDetail}>Unrealized return</Text>
                        <Text style={[styles.historyDetail, { color: pnlColor(pnl) }]}>
                          {pnl >= 0 ? '+' : ''}{$fmt(pnl)} ({pctFmt(pnlPct)})
                        </Text>
                      </View>
                      <Text style={[styles.lotsEmpty, { marginTop: 8 }]}>
                        Borrow availability is simulated and does not represent real shares borrowed.
                      </Text>
                      <TouchableOpacity
                        testID={`paper-cover-short-${pos.symbol}`}
                        accessibilityRole="button"
                        style={[styles.lotSellBtn, { backgroundColor: SELL_COLOR }]}
                        onPress={() => { setExpandedPosId(null); openCoverModal(pos); }}
                        activeOpacity={0.75}
                      >
                        <Feather name="corner-up-left" size={13} color="#000" />
                        <Text style={styles.lotSellBtnText}>BUY TO COVER {pos.symbol}</Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                  <>
                  {/* Header */}
                  <Text style={styles.lotsPanelTitle}>COST BASIS LOTS</Text>

                  {/* Column headers */}
                  <View style={styles.lotHeaderRow}>
                    <Text style={[styles.lotHeaderCell, { flex: 1.8 }]}>DATE</Text>
                    <Text style={[styles.lotHeaderCell, { flex: 1, textAlign: 'right' }]}>SHARES</Text>
                    <Text style={[styles.lotHeaderCell, { flex: 1.3, textAlign: 'right' }]}>COST/SH</Text>
                    <Text style={[styles.lotHeaderCell, { flex: 1.3, textAlign: 'right' }]}>VALUE</Text>
                    <Text style={[styles.lotHeaderCell, { flex: 1.4, textAlign: 'right' }]}>P&L</Text>
                  </View>

                  {/* Individual lots */}
                  {posLots.length === 0 ? (
                    <Text style={styles.lotsEmpty}>No lot data — lots are tracked for orders placed after the engine update.</Text>
                  ) : (
                    posLots.map(lot => {
                      const lotVal = lot.shares * price;
                      const lotPnl = lot.shares * (price - lot.cost);
                      const lotPnlPct = ((price - lot.cost) / lot.cost) * 100;
                      const dateStr = new Date(lot.purchasedAt).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', year: '2-digit',
                      });
                      return (
                        <View key={lot.id} style={styles.lotRow}>
                          <Text style={[styles.lotCell, { flex: 1.8 }]}>{dateStr}</Text>
                          <Text style={[styles.lotCell, { flex: 1, textAlign: 'right' }]}>{lot.shares % 1 === 0 ? lot.shares : lot.shares.toFixed(4)}</Text>
                          <Text style={[styles.lotCell, { flex: 1.3, textAlign: 'right' }]}>{$fmt(lot.cost)}</Text>
                          <Text style={[styles.lotCell, { flex: 1.3, textAlign: 'right' }]}>{$short(lotVal)}</Text>
                          <View style={{ flex: 1.4, alignItems: 'flex-end' }}>
                            <Text style={[styles.lotPnlCell, { color: pnlColor(lotPnl) }]}>
                              {lotPnl >= 0 ? '+' : ''}{$short(lotPnl)}
                            </Text>
                            <Text style={styles.lotPnlPct}>
                              {pctFmt(lotPnlPct, 1)}
                            </Text>
                          </View>
                        </View>
                      );
                    })
                  )}

                  {/* Aggregate row */}
                  {posLots.length > 1 && (
                    <View style={styles.lotAggRow}>
                      <Text style={[styles.lotAggCell, { flex: 1.8 }]}>TOTAL</Text>
                      <Text style={[styles.lotAggCell, { flex: 1, textAlign: 'right' }]}>{totalLotShares % 1 === 0 ? totalLotShares : totalLotShares.toFixed(4)}</Text>
                      <Text style={[styles.lotAggCell, { flex: 1.3, textAlign: 'right' }]}>{$fmt(weightedAvgCost)}</Text>
                      <Text style={[styles.lotAggCell, { flex: 1.3, textAlign: 'right' }]}>{$short(totalLotShares * price)}</Text>
                      <View style={{ flex: 1.4, alignItems: 'flex-end' }}>
                        <Text style={[styles.lotAggCell, { color: pnlColor(pnl) }]}>
                          {pnl >= 0 ? '+' : ''}{$short(pnl)}
                        </Text>
                      </View>
                    </View>
                  )}

                  {/* Sell button */}
                  <TouchableOpacity
                    style={styles.lotSellBtn}
                    onPress={() => { setExpandedPosId(null); openSellModal(pos); }}
                    activeOpacity={0.75}
                  >
                    <Feather name="trending-down" size={13} color="#000" />
                    <Text style={styles.lotSellBtnText}>SELL {pos.symbol}</Text>
                  </TouchableOpacity>
                  </>
                  )}
                </View>
              )}
            </View>
          );
        })}

      </View>
    );
  };

  const renderOverview = () => {
    const tradeHistory = account
      ? buildValueHistory(account, myTxns, (account.cash + (account.unsettledCash ?? 0)), myPositions, quotes)
      : [];
    const currentAccountSnapshots = account
      ? accountValueSnapshots.filter((snapshot) =>
          snapshot.accountId === account.id
          && new Date(snapshot.date).getTime() >= new Date(account.createdAt).getTime(),
        )
      : [];
    const valueHistory = account
      ? mergeAccountValueHistory(tradeHistory, currentAccountSnapshots, account.id)
      : tradeHistory;
    const nowMs = Date.now();
    const supportedRanges = HISTORY_RANGES.filter((range) => {
      if (range.ms == null) return valueHistory.length >= 2;
      return !!account && getCoveredAccountValueHistory(
        currentAccountSnapshots,
        account.id,
        range.ms,
        nowMs,
        PAPER_VALUE_SNAPSHOT_MAX_AGE_MS,
      ).length >= 2;
    });
    const activeRange = supportedRanges.some((range) => range.id === chartRange)
      ? chartRange
      : 'ALL';
    const rangeMs = HISTORY_RANGES.find((range) => range.id === activeRange)?.ms;
    const chartPoints = rangeMs == null
      ? valueHistory
      : account
        ? getCoveredAccountValueHistory(
            currentAccountSnapshots,
            account.id,
            rangeMs,
            nowMs,
            PAPER_VALUE_SNAPSHOT_MAX_AGE_MS,
          )
        : [];

    return (
      <View style={{ gap: 12, paddingHorizontal: 16 }}>
        <View style={styles.card}>
          <View style={styles.chartHeading}>
            <View style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
              <Text style={styles.sectionTitle}>ACCOUNT PERFORMANCE</Text>
              <Text style={styles.chartNote}>Dated ranges use saved account values; ALL also includes trade history</Text>
            </View>
            <Text numberOfLines={1} style={[styles.chartCurrentValue, { color: pnlColor(totalPnLFromEquity) }]}>
              {totalPnLFromEquity >= 0 ? '+' : ''}{$short(totalPnLFromEquity)}
            </Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rangeRow}>
            {supportedRanges.map((range) => (
              <TouchableOpacity
                key={range.id}
                testID={`paper-chart-range-${range.id}`}
                accessibilityRole="button"
                accessibilityState={{ selected: activeRange === range.id }}
                onPress={() => setChartRange(range.id)}
                style={[styles.rangeChip, activeRange === range.id && styles.rangeChipActive]}
              >
                <Text style={[styles.rangeChipText, activeRange === range.id && styles.rangeChipTextActive]}>
                  {range.id}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <PortfolioLineChart points={chartPoints} width={screenWidth - 64} height={180} />
          {!!snapshotStorageError && (
            <Text style={[styles.chartNote, { color: colors.sellColor, marginTop: 2, marginBottom: 0 }]}>
              {snapshotStorageError}
            </Text>
          )}
        </View>
      </View>
    );
  };

  const renderHistory = () => (
    <View style={{ gap: 10, paddingHorizontal: 16 }}>
      {myTxns.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Feather name="repeat" size={38} color={DIM} />
          <Text style={styles.emptyTitle}>No trade history</Text>
          <Text style={styles.emptyHint}>Trades for {account?.name ?? 'this account'} will appear here.</Text>
        </View>
      ) : [...myTxns].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((tx) => {
        const net = (tx.realizedPnL ?? 0) - (tx.fee ?? 0);
        return (
          <View key={tx.id} style={styles.historyCard}>
            <View style={styles.historyTopRow}>
              <View style={[styles.txBadge, { backgroundColor: tx.action === 'BUY' || tx.action === 'BUY_TO_COVER' ? 'rgba(0,229,160,0.15)' : tx.action === 'SELL' || tx.action === 'SHORT_SELL' ? 'rgba(255,59,59,0.15)' : 'rgba(255,215,0,0.12)' }]}>
                <Text style={[styles.txBadgeText, { color: tx.action === 'BUY' || tx.action === 'BUY_TO_COVER' ? BUY_COLOR : tx.action === 'SELL' || tx.action === 'SHORT_SELL' ? SELL_COLOR : '#ffd700' }]}>{tx.action}</Text>
              </View>
              <Text style={styles.txSym}>{tx.symbol}</Text>
              <Text style={styles.historyDate}>{new Date(tx.date).toLocaleString()}</Text>
            </View>
            <View style={styles.historyDetailRow}>
              <Text style={styles.historyDetail}>{tx.shares} shares @ {$fmt(tx.price)}</Text>
              <Text style={styles.txTotal}>{$fmt(tx.total)}</Text>
            </View>
            <View style={styles.historyDetailRow}>
              <Text style={styles.historyAccount}>Account: {account?.name ?? '—'}</Text>
              {(tx.action === 'SELL' || tx.action === 'BUY_TO_COVER') && (
                <Text style={[styles.historyRealized, { color: pnlColor(net) }]}>
                  Realized {net >= 0 ? '+' : ''}{$fmt(net)}
                </Text>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );

  const renderAnalytics = () => {
    const totalMktVal = myPositions.reduce(
      (s, p) => s + p.shares * (quotes[p.symbol]?.price ?? p.avgCost), 0,
    );
    const segments = myPositions.map((p, i) => ({
      label: p.symbol,
      value: p.shares * (quotes[p.symbol]?.price ?? p.avgCost),
      color: POSITION_COLORS[i % POSITION_COLORS.length],
    }));
    if (account) {
      segments.push({ label: 'Cash', value: account.cash, color: 'rgba(192,192,192,0.25)' });
    }

    // Win/loss judged on net (after-fee) P&L: a win is net profit of $0.01+.
    // Each sell (including a partial close) counts once toward the win rate.
    const { rate: winRatePct } = computeSellWinRate(myTxns);
    const winRate = winRatePct != null ? winRatePct.toFixed(0) : '—';

    return (
      <View style={{ gap: 12, paddingHorizontal: 16 }}>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>ALLOCATION</Text>
          <AllocationBar segments={segments} width={screenWidth - 64} />
          <View style={{ gap: 6, marginTop: 12 }}>
            {segments.map(s => (
              <View key={s.label} style={styles.allocRow}>
                <View style={[styles.allocDot, { backgroundColor: s.color }]} />
                <Text style={styles.allocLabel}>{s.label}</Text>
                <Text style={styles.allocVal}>{$fmt(s.value)}</Text>
                <Text style={styles.allocPct}>
                  {totalMktVal + (account?.cash ?? 0) > 0
                    ? ((s.value / (totalMktVal + (account?.cash ?? 0))) * 100).toFixed(1) + '%'
                    : '—'}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>PERFORMANCE METRICS</Text>
          <View style={styles.metricsGrid}>
            {[
              { label: 'Total Return', val: pctFmt(totalReturn), color: pnlColor(totalReturn) },
              { label: 'Total P&L', val: $fmt(totalPnLFromEquity), color: pnlColor(totalPnLFromEquity) },
              { label: 'Unrealized P&L', val: $fmt(unrealizedPnL), color: pnlColor(unrealizedPnL) },
              { label: 'Realized P&L', val: $fmt(realizedPnL), color: pnlColor(realizedPnL) },
              { label: "Today's Change", val: $fmt(todayPnL), color: pnlColor(todayPnL) },
              { label: 'Win Rate', val: `${winRate}%`, color: SILVER },
              { label: 'Total Trades', val: `${myTxns.length}`, color: SILVER },
            ].map(m => (
              <View key={m.label} style={styles.metricBox}>
                <Text style={[styles.metricVal, { color: m.color }]}>{m.val}</Text>
                <Text style={styles.metricLabel}>{m.label}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>
    );
  };

  const renderDividends = () => {
    const divPositions = myPositions.filter(p => p.dividendYield > 0 || (p.dividendRate ?? 0) > 0);
    const dividendsReceived = myTxns
      .filter((transaction) => transaction.action === 'DIVIDEND')
      .reduce((sum, transaction) => sum + transaction.total, 0);
    const totalAnnualDiv = divPositions.reduce(
      (s, p) => s + annualDivIncome(p, quotes[p.symbol]?.price ?? p.avgCost), 0,
    );
    const portfolioYield = portfolioValue > 0 ? (totalAnnualDiv / portfolioValue) * 100 : 0;
    const items = divPositions.map(p => ({
      symbol: p.symbol,
      annual: annualDivIncome(p, quotes[p.symbol]?.price ?? p.avgCost),
    }));

    return (
      <View style={{ gap: 12, paddingHorizontal: 16 }}>
        <View style={styles.card}>
          <View style={styles.divSummary}>
            <View style={{ flex: 1 }}>
              <Text style={styles.divBig}>{$fmt(totalAnnualDiv)}</Text>
              <Text style={styles.divLabel}>Est. Annual Dividends</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[styles.divBig, { color: BUY_COLOR }]}>{portfolioYield.toFixed(2)}%</Text>
              <Text style={styles.divLabel}>Portfolio Yield</Text>
            </View>
          </View>
          <Text style={styles.reportNote}>Estimated from current holdings; this is not income already received.</Text>
          <View style={styles.receivedDividendRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.receivedDividendLabel}>ACTUAL DIVIDENDS RECEIVED</Text>
              <Text style={styles.receivedDividendValue}>{$fmt(dividendsReceived)}</Text>
              <Text style={styles.receivedDividendHint}>Simulated credits posted to this account</Text>
            </View>
            <Feather name="check-circle" size={17} color={BUY_COLOR} />
          </View>
          <View style={styles.divRow}>
            <Text style={styles.divDetail}>{$fmt(totalAnnualDiv / 4)} / quarter</Text>
            <Text style={styles.divDetail}>{$fmt(totalAnnualDiv / 12)} / month</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>ESTIMATED ANNUAL INCOME BY HOLDING</Text>
          <DividendBarChart items={items} width={screenWidth - 64} height={180} />
        </View>

        {divPositions.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>DIVIDEND BREAKDOWN</Text>
            {divPositions.map((p, i) => {
              const price = quotes[p.symbol]?.price ?? p.avgCost;
              const annual = annualDivIncome(p, price);
              return (
                <View key={p.id} style={styles.divDetailRow}>
                  <View style={[styles.allocDot, { backgroundColor: POSITION_COLORS[i % POSITION_COLORS.length] }]} />
                  <Text style={styles.divSym}>{p.symbol}</Text>
                  <Text style={styles.divYield}>{(normalizeDividendYield(p.dividendYield, p.dividendRate, price) * 100).toFixed(2)}% yield</Text>
                  <View style={{ flex: 1 }} />
                  <Text style={[styles.divAnnual, { color: BUY_COLOR }]}>{$fmt(annual)}/yr</Text>
                </View>
              );
            })}
          </View>
        )}

        {divPositions.length === 0 && (
          <View style={styles.emptyWrap}>
            <Feather name="dollar-sign" size={36} color={DIM} />
            <Text style={styles.emptyTitle}>No dividend stocks</Text>
            <Text style={styles.emptyHint}>Buy dividend-paying stocks to see income estimates</Text>
          </View>
        )}
      </View>
    );
  };

  const renderGrowth = () => (
    <View style={{ gap: 12, paddingHorizontal: 16 }}>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>10-YEAR GROWTH PROJECTION</Text>
        <Text style={styles.chartNote}>
          Illustrative scenarios from current account equity of {$fmt(portfolioValue)}. Not a forecast or actual return.
        </Text>
        <GrowthProjectionChart startValue={portfolioValue} width={screenWidth - 64} height={220} />
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>YEAR-OVER-YEAR ESTIMATES</Text>
        {[0.06, 0.10, 0.15].map((rate, ri) => {
          const colors = ['#74c0fc', '#00e5a0', '#ffd700'];
          const labels = ['Conservative (6%)', 'Moderate (10%)', 'Aggressive (15%)'];
          return (
            <View key={rate} style={{ marginBottom: ri < 2 ? 16 : 0 }}>
              <Text style={[styles.rateLabel, { color: colors[ri] }]}>{labels[ri]}</Text>
              <View style={styles.yoyGrid}>
                {[1, 2, 3, 5, 10].map(yr => (
                  <View key={yr} style={styles.yoyCell}>
                    <Text style={[styles.yoyVal, { color: colors[ri] }]}>
                      {$short(portfolioValue * Math.pow(1 + rate, yr))}
                    </Text>
                    <Text style={styles.yoyYear}>Yr {yr}</Text>
                  </View>
                ))}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );

  // ── renderOrders ─────────────────────────────────────────────────────────
  const renderOrders = () => {
    const accountOrders = orders
      .filter(o => o.accountId === activeId)
      .sort((a, b) => new Date(b.placedAt).getTime() - new Date(a.placedAt).getTime());

    if (accountOrders.length === 0) {
      return (
        <View style={styles.emptyWrap}>
          <Feather name="clock" size={40} color={DIM} />
          <Text style={styles.emptyTitle}>No orders</Text>
          <Text style={styles.emptyHint}>Limit, stop, and trailing-stop orders appear here</Text>
        </View>
      );
    }

    const statusColor = (s: string) => s === 'filled' ? BUY_COLOR : s === 'cancelled' ? DIM : SILVER;
    const typeLabel: Record<string, string> = {
      market: 'MKT', limit: 'LMT', stop: 'STP', stop_limit: 'S/L', trailing_stop: 'TRL',
    };

    return (
      <View style={{ gap: 8, paddingHorizontal: 16 }}>
        {accountOrders.map(o => {
          const q = quotes[o.symbol];
          return (
            <View key={o.id} testID={`paper-order-${o.id}`} style={[styles.orderCard, { opacity: o.status === 'cancelled' ? 0.5 : 1 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                <View style={[styles.posAccentBar, { backgroundColor: o.intent === 'cover' ? BUY_COLOR : SELL_COLOR }]} />
                <Text style={[styles.posSymbol, { flexShrink: 1 }]}>{o.symbol}</Text>
                <View style={{ flex: 1 }} />
                <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 11, color: o.intent === 'cover' ? BUY_COLOR : SELL_COLOR, letterSpacing: 1 }}>
                  {o.intent === 'short' ? 'SHORT SELL' : o.intent === 'cover' ? 'BUY TO COVER' : o.side.toUpperCase()}
                </Text>
                <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11, color: DIM, marginLeft: 8 }}>
                  {typeLabel[o.orderType] ?? o.orderType}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 4 }}>
                <View>
                  <Text style={styles.posLabel}>SHARES</Text>
                  <Text style={styles.posVal}>{o.shares}</Text>
                </View>
                {o.limitPrice != null && <View>
                  <Text style={styles.posLabel}>LIMIT</Text>
                  <Text style={styles.posVal}>${o.limitPrice.toFixed(2)}</Text>
                </View>}
                {o.stopPrice != null && <View>
                  <Text style={styles.posLabel}>STOP</Text>
                  <Text style={styles.posVal}>${o.stopPrice.toFixed(2)}</Text>
                </View>}
                {o.trailPct != null && <View>
                  <Text style={styles.posLabel}>TRAIL</Text>
                  <Text style={styles.posVal}>{o.trailPct}%</Text>
                </View>}
                {o.trailAbs != null && <View>
                  <Text style={styles.posLabel}>TRAIL $</Text>
                  <Text style={styles.posVal}>${o.trailAbs.toFixed(2)}</Text>
                </View>}
                {q && <View>
                  <Text style={styles.posLabel}>MARKET</Text>
                  <Text style={styles.posVal}>${q.price.toFixed(2)}</Text>
                </View>}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 26 }}>
                <Text style={[styles.posLabel, { color: statusColor(o.status) }]}>{o.status.toUpperCase()}</Text>
                {o.filledPrice != null && (
                  <Text style={[styles.posLabel, { marginLeft: 8 }]}>@ ${o.filledPrice.toFixed(2)}</Text>
                )}
                <View style={{ flex: 1 }} />
                {o.status === 'pending' && (
                  <View style={styles.orderActions}>
                    <TouchableOpacity
                      testID={`edit-order-${o.id}`}
                      accessibilityLabel={`Edit ${o.symbol} order`}
                      onPress={() => editOrder(o)}
                      style={styles.orderAction}
                    >
                      <Feather name="edit-2" size={14} color={BUY_COLOR} />
                      <Text style={[styles.orderActionText, { color: BUY_COLOR }]}>EDIT</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      testID={`delete-order-${o.id}`}
                      accessibilityLabel={`Delete ${o.symbol} order`}
                      onPress={() => requestDeleteOrder(o)}
                      style={styles.orderAction}
                    >
                      <Feather name="x-circle" size={14} color={SELL_COLOR} />
                      <Text style={[styles.orderActionText, { color: SELL_COLOR }]}>DELETE</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
          );
        })}
      </View>
    );
  };

  // ── Modals (derived state) ─────────────────────────────────────────────────

  // ── Render ────────────────────────────────────────────────────────────────
  if (!loaded) {
    return (
      <AmericanSteelBackground>
        <SafeAreaView style={[styles.screen, { backgroundColor: 'transparent' }]}>
        <ActivityIndicator color={SILVER} size="large" style={{ flex: 1 }} />
        </SafeAreaView>
      </AmericanSteelBackground>
    );
  }

  if (errorMsg) {
    return (
      <AmericanSteelBackground>
        <SafeAreaView style={[styles.screen, { backgroundColor: 'transparent' }]}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
          <Text style={{ color: SILVER, fontSize: 15, textAlign: 'center', marginBottom: 20 }}>{errorMsg}</Text>
          <TouchableOpacity
            onPress={init}
            style={{ backgroundColor: BUY_COLOR, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 28 }}
            activeOpacity={0.8}
          >
            <Text style={{ color: '#000', fontFamily: 'Inter_600SemiBold', fontSize: 15 }}>Try again</Text>
          </TouchableOpacity>
        </View>
        </SafeAreaView>
      </AmericanSteelBackground>
    );
  }

  return (
    <AmericanSteelBackground>
    <SafeAreaView style={[styles.screen, { backgroundColor: 'transparent' }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: Platform.OS === 'android' ? insets.top + 8 : 0 }]}>
        <MMLogo size={36} />
          <Text numberOfLines={1} style={[styles.headerTitle, { color: colors.heading }]}>
          PAPER TRADING
        </Text>
        <View style={{ flex: 1 }} />
        <Text numberOfLines={1} style={styles.headerSub}>Risk-free · $100k start</Text>
      </View>

      <PaperAccountSwipeArea
        style={[styles.accountHero, isSelectedEventAccount && styles.eventChampionshipHero]}
        testID="paper-account-hero"
        accounts={visibleAccounts}
        activeId={activeId}
        onSwitchAccount={(id) => { void switchAccount(id); }}
      >
        {isSelectedEventAccount ? (
          <>
            <View style={styles.eventChampionshipTopline}>
              <Text style={styles.eventHeroLabel}>EVENT ARENA</Text>
              <TouchableOpacity
                testID="paper-account-switch"
                accessibilityRole="button"
                accessibilityLabel="Switch paper trading account"
                onPress={() => setShowAccountManagement(true)}
                style={[styles.editAccountsButton, styles.eventChampionshipSwitchButton]}
              >
                <Text style={styles.editAccountsText}>SWITCH</Text>
              </TouchableOpacity>
            </View>
            <PaperEventArenaDashboard
              eventId={selectedEventId}
              startAtMs={selectedEventStartAtMs}
              endAtMs={selectedEventEndAtMs}
              enrollment={selectedEventEnrollment}
              summary={selectedEventSummary}
              equity={portfolioValue}
              buyingPower={account?.cash ?? 0}
              onViewLeaderboard={() => router.push({
                pathname: '/event-arena',
                params: { section: 'leaderboard', eventId: selectedEventId },
              })}
            />
          </>
        ) : (
          <>
            <View style={styles.heroTopline}>
              <Text style={styles.selectorTitle}>SIMULATED PORTFOLIO</Text>
              <TouchableOpacity
                testID="paper-account-switch"
                accessibilityRole="button"
                accessibilityLabel="Switch paper trading account"
                onPress={() => setShowAccountManagement(true)}
                style={styles.editAccountsButton}
              >
                <Text style={styles.editAccountsText}>SWITCH</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.heroIdentityRow}>
              <Text style={styles.heroAccountName} numberOfLines={1}>{selectedAccountDisplayName}</Text>
              <Text style={styles.heroAccountPosition}>
                {selectedAccountPosition >= 0 ? `${selectedAccountPosition + 1} / ${visibleAccounts.length}` : ''}
              </Text>
            </View>
            <Text style={styles.heroEquity} numberOfLines={1}>{$fmt(portfolioValue)}</Text>
            <Text style={styles.heroEquityLabel}>TOTAL EQUITY</Text>
            <View style={[styles.heroStats, compactHeroStats && styles.heroStatsCompact]}>
              <View style={[styles.heroStat, compactHeroStats && styles.heroStatCompact]}>
                <Text allowFontScaling style={[styles.heroStatValue, compactHeroStats && styles.heroStatValueCompact, { color: pnlColor(todayPnL) }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                  {todayPnL >= 0 ? '+' : ''}{$fmt(todayPnL)}
                </Text>
                <Text allowFontScaling style={[styles.heroStatLabel, compactHeroStats && styles.heroStatLabelCompact]}>TODAY’S P/L</Text>
              </View>
              <View style={[styles.heroStatDivider, compactHeroStats && styles.heroStatDividerCompact]} />
              <View style={[styles.heroStat, compactHeroStats && styles.heroStatCompact]}>
                <Text testID="paper-account-total-return" allowFontScaling style={[styles.heroStatValue, compactHeroStats && styles.heroStatValueCompact, { color: pnlColor(totalReturn) }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                  {pctFmt(totalReturn)}
                </Text>
                <Text allowFontScaling style={[styles.heroStatLabel, compactHeroStats && styles.heroStatLabelCompact]}>TOTAL RETURN</Text>
              </View>
              <View style={[styles.heroStatDivider, compactHeroStats && styles.heroStatDividerCompact]} />
              <View style={[styles.heroStat, compactHeroStats && styles.heroStatCompact]}>
                <Text testID="paper-account-buying-power" allowFontScaling style={[styles.heroStatValue, compactHeroStats && styles.heroStatValueCompact]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                  {$fmt(account?.cash ?? 0)}
                </Text>
                <Text allowFontScaling style={[styles.heroStatLabel, compactHeroStats && styles.heroStatLabelCompact]}>BUYING POWER</Text>
              </View>
            </View>
          </>
        )}
        {visibleAccounts.length > 1 && (
          <View
            testID="paper-account-position-indicator"
            accessibilityRole="text"
            accessibilityLabel={`Account ${selectedAccountPosition + 1} of ${visibleAccounts.length}`}
            style={styles.accountPositionIndicators}
          >
            {visibleAccounts.map((item, index) => (
              <View
                key={item.id}
                testID={`paper-account-indicator-${index}`}
                style={[
                  styles.accountPositionIndicator,
                  item.id === activeId && styles.accountPositionIndicatorActive,
                  item.id.startsWith('paper-event:') && styles.eventPositionIndicator,
                ]}
              />
            ))}
          </View>
        )}
      </PaperAccountSwipeArea>

      {paperChallengeWindow.phase === 'active' && (
        <View
          testID="paper-event-live-banner"
          accessibilityLiveRegion="polite"
          style={{
            marginHorizontal: 16,
            marginTop: 10,
            padding: 12,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: colors.primary,
            backgroundColor: colors.card,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            <Feather name="award" size={14} color={colors.primary} />
            <Text style={{ color: colors.primary, fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 0.7 }}>
              {hasCurrentEventEnrollment ? 'YOUR EVENT IS LIVE' : 'LIVE EVENT · JOIN ANY TIME'}
            </Text>
          </View>
            <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 12, lineHeight: 17, marginTop: 7 }}>
            {paperChallenge.enrollment?.eventType === 'green-bull-championship'
              ? 'GREEN BULL CHAMPIONSHIP · $500,000 STARTING CAPITAL'
              : paperChallenge.enrollment?.eventType === 'bear-market-mayhem'
                ? `BEAR MARKET MAYHEM · $${(paperChallenge.enrollment.startingBalance ?? paperChallengeWindow.startingBalance ?? INITIAL_BALANCE).toLocaleString('en-US', { maximumFractionDigits: 0 })} STARTING CAPITAL`
                : `EVENT ARENA · $${(paperChallenge.enrollment?.startingBalance ?? paperChallengeWindow.startingBalance ?? INITIAL_BALANCE).toLocaleString('en-US', { maximumFractionDigits: 0 })} STARTING CAPITAL`}
          </Text>
          <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 16, marginTop: 4 }}>
            {hasCurrentEventEnrollment
              ? isEventAccountActive
                ? 'You’re trading in the Event Portfolio. The event closes Friday at 4:00 p.m. ET.'
                : 'Choose Event Portfolio from the account menu above to place event trades. The event closes Friday at 4:00 p.m. ET.'
              : 'Join in Settings → Event Arena before Friday at 4:00 p.m. ET. This is simulated paper trading.'}
          </Text>
          {hasCurrentEventEnrollment && !isEventAccountActive && (
            <TouchableOpacity
              testID="switch-to-paper-event-account"
              accessibilityRole="button"
              onPress={() => {
                const eventAccount = visibleAccounts.find((item) => item.id === paperChallenge.enrollment?.accountId);
                if (eventAccount) void switchAccount(eventAccount.id);
              }}
              style={{ alignSelf: 'flex-start', marginTop: 9, paddingVertical: 7, paddingHorizontal: 10, borderRadius: 8, backgroundColor: colors.primary }}
            >
              <Text style={{ color: colors.primaryForeground, fontFamily: 'Inter_700Bold', fontSize: 10 }}>
                CHOOSE EVENT PORTFOLIO
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {isPaperChallengeWaiting && (
        <View
          testID="paper-event-results-pending"
          accessibilityLiveRegion="polite"
          style={{
            marginHorizontal: 16,
            marginTop: 10,
            padding: 12,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: challengeFinalizationError ? BUY_COLOR : BORDER,
            backgroundColor: CARD_BG,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ color: BUY_COLOR, fontFamily: 'Inter_700Bold', fontSize: 12 }}>
              {challengeFinalizationBusy ? 'FINISHING EVENT RESULTS' : 'EVENT RESULTS WAITING'}
            </Text>
            <Text style={{ color: SILVER, fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 16, marginTop: 4 }}>
              {challengeFinalizationBusy
                ? 'Checking your event account and current quotes…'
                : challengeFinalizationError
                  ? 'Account data or a current quote could not be loaded. Your enrollment is saved; retry when data is available.'
                  : 'Your event enrollment is saved while the final summary is prepared.'}
            </Text>
          </View>
          <TouchableOpacity
            testID="retry-paper-event-results"
            accessibilityRole="button"
            accessibilityLabel="Retry event results"
            disabled={challengeFinalizationBusy}
            onPress={retryPaperChallengeFinalization}
            style={{
              paddingVertical: 9,
              paddingHorizontal: 11,
              borderRadius: 8,
              backgroundColor: challengeFinalizationBusy ? BORDER : BUY_COLOR,
              opacity: challengeFinalizationBusy ? 0.65 : 1,
            }}
          >
            <Text style={{ color: '#000', fontFamily: 'Inter_700Bold', fontSize: 10 }}>
              {challengeFinalizationBusy ? 'WAIT…' : 'RETRY'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Core account values stay on the selected account card; secondary metrics expand on demand. */}
      {/* Primary groups and their smaller secondary navigation */}
      <View style={styles.primaryTabs} accessibilityRole="tablist">
        {PAPER_TAB_GROUPS.map((group) => {
          const selected = group.id === activeTabGroup.id;
          return (
            <TouchableOpacity
              key={group.id}
              testID={`paper-tab-group-${group.id}`}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              style={[styles.primaryTab, selected && styles.primaryTabActive]}
              onPress={() => {
                if (!group.tabs.includes(activeTab)) setActiveTab(group.tabs[0]);
              }}
              activeOpacity={0.7}
            >
              <Feather name={group.icon as any} size={15} color={selected ? GOLD : DIM} />
              <Text style={[styles.primaryTabLabel, selected && styles.primaryTabLabelActive]}>{group.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {activeTabGroup.id === 'portfolio' ? (
        <View style={[styles.subTabBar, styles.portfolioSubTabBar]} accessibilityRole="tablist">
          {activeGroupTabs.map((tab) => {
            const selected = activeTab === tab.id;
            return (
              <TouchableOpacity
                key={tab.id}
                testID={`paper-tab-${tab.id}`}
                accessibilityRole="tab"
                accessibilityLabel={tab.id === 'positions' ? `Positions, ${myPositions.length} open` : tab.label}
                accessibilityState={{ selected }}
                style={[styles.tabBtn, styles.portfolioTabBtn, selected && styles.tabBtnActive]}
                onPress={() => setActiveTab(tab.id)}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.portfolioTabLabel,
                  styles.tabLabel,
                  selected && (tab.id === 'positions' ? styles.positionsTabLabelActive : styles.tabLabelActive),
                ]} allowFontScaling>
                  {tab.label}
                </Text>
                {tab.id === 'positions' && selected && (
                  <Text
                    testID="paper-positions-count"
                    allowFontScaling
                    style={styles.sectionCount}
                  >
                    {myPositions.length}
                  </Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabScroll}
          contentContainerStyle={styles.subTabBar}
          accessibilityRole="tablist"
        >
          {activeGroupTabs.map((tab) => (
            <TouchableOpacity
              key={tab.id}
              testID={`paper-tab-${tab.id}`}
              accessibilityRole="tab"
              accessibilityState={{ selected: activeTab === tab.id }}
              style={[styles.tabBtn, activeTab === tab.id && styles.tabBtnActive]}
              onPress={() => setActiveTab(tab.id)}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabLabel, activeTab === tab.id && styles.tabLabelActive]}>{tab.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Content */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 16, paddingTop: 10 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={SILVER} />}
        showsVerticalScrollIndicator={false}
      >
        {activeTab === 'overview' && renderOverview()}
        {activeTab === 'positions' && renderPositions()}
        {activeTab === 'orders' && renderOrders()}
        {activeTab === 'history' && renderHistory()}
        {activeTab === 'analytics' && renderAnalytics()}
        {activeTab === 'dividends' && renderDividends()}
        {activeTab === 'growth' && renderGrowth()}
      </ScrollView>

      {/* Integrated action stays in the layout instead of floating over content. */}
      <View style={styles.buyActionWrap}>
          <TouchableOpacity
            testID="paper-trading-buy-action"
            accessibilityRole="button"
            accessibilityLabel={isSelectedArchivedEventAccount
              ? 'Completed Event Arena account is read-only'
              : `Buy stocks or ETFs in ${account?.name ?? 'selected account'}`}
            accessibilityState={{ disabled: isSelectedArchivedEventAccount }}
            disabled={isSelectedArchivedEventAccount}
            style={[styles.buyAction, isSelectedArchivedEventAccount && { opacity: 0.55 }]}
            onPress={openBuyModal}
            activeOpacity={0.85}
          >
            <Feather name={isSelectedArchivedEventAccount ? 'lock' : 'plus'} size={18} color="#000" />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text allowFontScaling style={styles.buyActionTitle}>
                {isSelectedArchivedEventAccount ? 'Event complete' : 'Trade'}
              </Text>
              <Text allowFontScaling style={styles.buyActionHint}>
                {isSelectedArchivedEventAccount ? 'Select a strategy account to trade' : `Trade in ${selectedAccountDisplayName}`}
              </Text>
            </View>
            {!isSelectedArchivedEventAccount && <Feather name="arrow-up-right" size={17} color="#000" />}
          </TouchableOpacity>
      </View>

      <BottomTabBar />

      {Platform.OS === 'web' && (
        <Modal
          visible={deleteConfirmationOrder !== null}
          transparent
          animationType="fade"
          onRequestClose={() => setDeleteConfirmationOrder(null)}
        >
          <View
            testID="paper-order-delete-confirmation"
            accessibilityRole="alert"
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              padding: 20,
              backgroundColor: 'rgba(0,0,0,0.72)',
            }}
          >
            <View style={{
              width: '100%',
              maxWidth: 420,
              padding: 20,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.card,
            }}>
              <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 18 }}>
                Delete pending order?
              </Text>
              {deleteConfirmationOrder && (
                <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 14, marginTop: 10 }}>
                  Delete pending {deleteConfirmationOrder.side} {deleteConfirmationOrder.shares} {deleteConfirmationOrder.symbol}?
                </Text>
              )}
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 22 }}>
                <TouchableOpacity
                  testID="cancel-delete-paper-order"
                  accessibilityRole="button"
                  onPress={() => setDeleteConfirmationOrder(null)}
                  style={{
                    minHeight: 44,
                    paddingHorizontal: 16,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 13 }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  testID="confirm-delete-paper-order"
                  accessibilityRole="button"
                  onPress={confirmDeleteOrder}
                  style={{
                    minHeight: 44,
                    paddingHorizontal: 16,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 10,
                    backgroundColor: SELL_COLOR,
                  }}
                >
                  <Text style={{ color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 13 }}>Delete Order</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      <Modal
        visible={completedEventSummary !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setCompletedEventSummary(null)}
      >
        <View style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.88)',
          paddingTop: insets.top + 12,
          paddingBottom: Math.max(insets.bottom, 12),
          paddingHorizontal: 16,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: colors.primary, fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 1 }}>
                EVENT COMPLETE
              </Text>
              <Text allowFontScaling style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 18, marginTop: 4 }}>
                Your results are in.
              </Text>
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Dismiss event results"
              onPress={() => setCompletedEventSummary(null)}
              hitSlop={10}
            >
              <Feather name="x" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 16 }}>
            {completedEventSummary && (
              <PaperEventShareCard
                event={completedEventSummary}
                milestones={getPaperChallengeMilestones(completedEventSummary, paperChallenge.history)}
              />
            )}
          </ScrollView>
          <TouchableOpacity
            testID="dismiss-paper-event-recap"
            accessibilityRole="button"
            onPress={() => setCompletedEventSummary(null)}
            style={{ minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: colors.primary }}
          >
            <Text style={{ color: colors.primaryForeground, fontFamily: 'Inter_700Bold', fontSize: 13 }}>
              DONE
            </Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* ── Account Management Modal ─────────────────────────────── */}
      <Modal
        visible={showAccountManagement}
        transparent
        animationType="slide"
        onRequestClose={() => { setShowAccountManagement(false); setRenameId(''); }}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            testID="close-paper-account-management-backdrop"
            style={StyleSheet.absoluteFillObject}
            accessibilityLabel="Close account management"
            onPress={() => { setShowAccountManagement(false); setRenameId(''); }}
          />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.accountManagementKeyboard}
          >
            <View
              testID="paper-account-management"
              style={[styles.bottomSheet, styles.accountSheet, { paddingBottom: Math.max(insets.bottom, 22) }]}
            >
              <View style={styles.sheetHandle} />
              <View style={styles.sheetHeadingRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sheetTitle}>Manage portfolios</Text>
                  <Text style={styles.sheetSub}>Choose an account or swipe the summary</Text>
                </View>
                <TouchableOpacity
                  testID="close-paper-account-management"
                  accessibilityRole="button"
                  accessibilityLabel="Close account management"
                  onPress={() => { setShowAccountManagement(false); setRenameId(''); }}
                  style={styles.manageAccountsButton}
                >
                  <Feather name="check" size={16} color={GOLD} />
                </TouchableOpacity>
              </View>
              <ScrollView
                testID="paper-account-management-list"
                style={styles.accountSheetScroll}
                contentContainerStyle={{ paddingBottom: 8 }}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                showsVerticalScrollIndicator={false}
              >
                {visibleAccounts.map((acct) => {
                  const isEventAcct = acct.id.startsWith('paper-event:');
                  const isArchivedEventAccount = isEventAcct
                    && paperChallenge.history.some((event) => event.accountId === acct.id);
                  const isEventAcctResetLocked = isArchivedEventAccount || (isEventAcct
                    && paperChallengeWindow.phase === 'active'
                    && paperChallenge.enrollment?.accountId === acct.id);
                  const isActive = acct.id === activeId;
                  const acctPositions = positions.filter((position) => position.accountId === acct.id);
                  const acctValue = computePaperEquity(acct, acctPositions, quotes);
                  const accountIndex = regularAccounts.findIndex((item) => item.id === acct.id);
                  const portfolioLabel = isEventAcct
                    ? 'Event Arena'
                    : PAPER_ACCOUNT_DISPLAY_NAMES[accountIndex] ?? acct.name;
                  return (
                    <View
                      key={acct.id}
                      testID={isEventAcct ? 'active-paper-event-account' : `paper-account-${acct.id}`}
                      style={[
                        styles.accountSheetRow,
                        isEventAcct && styles.eventAcctRow,
                        isActive && styles.acctRowActive,
                        isActive && isEventAcct && styles.eventAcctRowActive,
                      ]}
                    >
                      <TouchableOpacity
                        testID={`select-paper-account-${acct.id}`}
                        accessibilityRole="button"
                        accessibilityLabel={`Select ${portfolioLabel}${isActive ? ', active' : ''}`}
                        accessibilityState={{ selected: isActive }}
                        onPress={() => {
                          setShowAccountManagement(false);
                          setRenameId('');
                          void switchAccount(acct.id);
                        }}
                        activeOpacity={0.75}
                        style={[styles.accountChoiceCopy, styles.accountSelectHit]}
                      >
                        <View style={styles.accountChoiceTitleLine}>
                          <Text style={[styles.acctName, isEventAcct && styles.eventAccountName]} numberOfLines={1}>
                            {portfolioLabel}
                          </Text>
                          {isActive && (
                            <View style={styles.activeAccountBadge}>
                              <Feather name="check" size={10} color={GOLD} />
                              <Text style={styles.activeAccountBadgeText}>ACTIVE</Text>
                            </View>
                          )}
                          {isEventAcct && <Feather name="award" size={15} color={BUY_COLOR} />}
                        </View>
                        {acct.name !== portfolioLabel && !isEventAcct && (
                          <Text style={styles.accountStoredName} numberOfLines={1}>Saved as {acct.name}</Text>
                        )}
                        {isEventAcct && (
                          <>
                            <View testID="paper-event-account-badge" style={styles.eventAccountBadge}>
                              <Feather name="award" size={10} color="#07140F" />
                              <Text style={styles.eventAccountBadgeText}>EVENT PORTFOLIO</Text>
                            </View>
                            <Text style={styles.eventAccountPrompt}>
                              {isArchivedEventAccount
                                ? 'COMPLETED EVENT · READ-ONLY RESULTS'
                                : isEventAcctResetLocked
                                ? 'ACTIVE EVENT · RESET LOCKED UNTIL EVENT ENDS'
                                : 'FRESH $100,000 · TRADE HERE TO COMPETE THIS WEEK'}
                            </Text>
                          </>
                        )}
                        <View style={styles.accountChoiceValues}>
                          <Text style={styles.accountChoiceValue}>
                            <Text style={styles.accountChoiceLabel}>CASH </Text>{$fmt(acct.cash)}
                          </Text>
                          <Text style={styles.accountChoiceValue}>
                            <Text style={styles.accountChoiceLabel}>TOTAL </Text>{$fmt(acctValue)}
                          </Text>
                        </View>
                      </TouchableOpacity>
                      <View style={styles.accountManagementTools}>
                        {renameId === acct.id ? (
                          <TextInput
                            testID={`rename-paper-account-input-${acct.id}`}
                            accessibilityLabel={`New name for ${acct.name}`}
                            style={styles.renameInput}
                            value={renameDraft}
                            onChangeText={setRenameDraft}
                            autoFocus
                            returnKeyType="done"
                            maxLength={32}
                            onSubmitEditing={() => { void renameAccount(acct.id, renameDraft); setRenameId(''); }}
                            onBlur={() => { void renameAccount(acct.id, renameDraft); setRenameId(''); }}
                          />
                        ) : (
                          <TouchableOpacity
                            testID={`rename-paper-account-${acct.id}`}
                            accessibilityRole="button"
                            accessibilityLabel={`Rename ${acct.name}`}
                            onPress={() => { setRenameId(acct.id); setRenameDraft(acct.name); }}
                            style={styles.accountManageButton}
                          >
                            <Feather name="edit-2" size={13} color={DIM} />
                            <Text style={styles.accountManageText}>RENAME</Text>
                          </TouchableOpacity>
                        )}
                        <TouchableOpacity
                          testID={`reset-paper-account-${acct.id}`}
                          accessibilityRole="button"
                          accessibilityLabel={isEventAcctResetLocked
                            ? isArchivedEventAccount
                              ? 'Completed Event Arena account is read-only'
                              : 'Reset unavailable until the active event ends'
                            : `Reset ${acct.name}`}
                          accessibilityState={{ disabled: isEventAcctResetLocked }}
                          disabled={isEventAcctResetLocked}
                          onPress={() =>
                            Alert.alert(
                              'Reset Account',
                              `Reset "${acct.name}" to $100,000? All positions and trade history will be lost.`,
                              [
                                { text: 'Cancel', style: 'cancel' },
                                {
                                  text: 'Reset', style: 'destructive',
                                  onPress: () => { void resetAccount(acct.id); },
                                },
                              ],
                            )
                          }
                          style={[
                            styles.accountManageButton,
                            isEventAcctResetLocked && { opacity: 0.55 },
                          ]}
                        >
                          <Feather name={isEventAcctResetLocked ? 'lock' : 'refresh-ccw'} size={13} color={isEventAcctResetLocked ? DIM : SELL_COLOR} />
                          <Text style={[styles.accountManageText, { color: isEventAcctResetLocked ? DIM : SELL_COLOR }]}>
                            {isEventAcctResetLocked ? 'LOCKED' : 'RESET'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
                {!visibleAccounts.some((item) => item.id.startsWith('paper-event:')) && (
                  <View testID="paper-event-account-unavailable" style={[styles.accountSheetRow, styles.eventAcctRow, styles.eventUnavailableRow]}>
                    <View style={styles.accountChoiceCopy}>
                      <View style={styles.accountChoiceTitleLine}>
                        <Text style={[styles.acctName, styles.eventAccountName]}>Event Arena</Text>
                        <Feather name="award" size={15} color={BUY_COLOR} />
                      </View>
                      <Text style={styles.eventUnavailableHint}>Join an event in Settings to activate this portfolio.</Text>
                    </View>
                  </View>
                )}
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* ── Buy Lookup Modal (company name or ticker) ─────────────── */}
      <Modal
        visible={showTradeModal}
        transparent
        animationType="slide"
        onRequestClose={() => {
          invalidateStockLookup();
          setShowTradeModal(false);
          setStockInfo(null);
        }}
      >
        <KeyboardAvoidingView
          style={{ flex: 1, justifyContent: 'flex-end' }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Pressable
            style={StyleSheet.absoluteFillObject}
            onPress={() => {
              invalidateStockLookup();
              setShowTradeModal(false);
              setStockInfo(null);
            }}
          />
          <ScrollView
            style={styles.bottomSheet}
            contentContainerStyle={{ paddingBottom: 8 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <View>
              <View style={styles.sheetHandle} />
              <Text style={styles.sheetTitle}>BUY STOCK OR ETF</Text>
              <Text style={styles.sheetSub}>Buying power: {$fmt(account?.cash ?? 0)}</Text>

              {/* Company and ticker lookup */}
              <View style={styles.lookupRow}>
                <TextInput
                  testID="paper-stock-search-input"
                  style={styles.symbolInput}
                  value={buySymbol}
                  onChangeText={text => {
                    invalidateStockLookup();
                    buySearchContextRef.current = {
                      ...buySearchContextRef.current,
                      input: text.trim(),
                    };
                    setBuySymbol(text);
                    setStockInfo(null);
                    setInfoError('');
                  }}
                  placeholder="Stock or ETF name or ticker"
                  placeholderTextColor={DIM}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="search"
                  editable={!infoLoading}
                  accessibilityLabel="Search by stock or ETF name or ticker"
                  onSubmitEditing={() => {
                    if (resolvedBuySymbol) void lookUpStock(resolvedBuySymbol);
                  }}
                />
                <TouchableOpacity
                  testID="paper-stock-lookup-button"
                  accessibilityRole="button"
                  accessibilityLabel="Look up selected ticker"
                  style={[styles.lookupBtn, (infoLoading || !resolvedBuySymbol) && { opacity: 0.5 }]}
                  onPress={() => {
                    if (resolvedBuySymbol) void lookUpStock(resolvedBuySymbol);
                  }}
                  disabled={infoLoading || !resolvedBuySymbol}
                >
                  {infoLoading
                    ? <ActivityIndicator size="small" color="#000" />
                    : <Text style={styles.lookupBtnText}>LOOK UP</Text>}
                </TouchableOpacity>
              </View>

              {buySuggestions.length > 0 && (
                <View style={styles.searchResults}>
                  {buySuggestions.map((suggestion, index) => (
                    <TouchableOpacity
                      key={suggestion.symbol}
                      testID={`paper-${suggestion.instrumentType}-result-${suggestion.symbol}`}
                      accessibilityRole="button"
                      accessibilityLabel={`Select ${suggestion.name}, ${suggestion.symbol}`}
                      style={[
                        styles.searchResultRow,
                        index < buySuggestions.length - 1 && styles.searchResultDivider,
                      ]}
                      onPress={() => {
                        const currentSearch = buySearchContextRef.current;
                        const resultQuery = suggestion.instrumentType === 'etf'
                          ? buyEtfSearchResultQuery
                          : buySearchResultQuery;
                        const isPlaceholderData = suggestion.instrumentType === 'etf'
                          ? etfSearch.isPlaceholderData
                          : stockSearch.isPlaceholderData;
                        if (
                          !currentSearch.enabled
                          || !isStockSearchCurrent({
                            input: currentSearch.input,
                            settledQuery: currentSearch.settledQuery,
                            resultQuery,
                            isPlaceholderData,
                          })
                        ) return;

                        const selectedSymbol = resolveStockSearchSymbol(
                          buySymbol,
                          buySuggestions,
                          suggestion,
                          false,
                        );
                        if (selectedSymbol) void lookUpStock(selectedSymbol);
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.searchResultName} numberOfLines={1}>{suggestion.name}</Text>
                        {suggestion.exchange ? (
                          <Text style={styles.searchResultExchange} numberOfLines={1}>
                            {suggestion.instrumentType === 'etf' ? `ETF · ${suggestion.exchange}` : suggestion.exchange}
                          </Text>
                        ) : null}
                      </View>
                      <Text style={styles.searchResultSymbol}>{suggestion.symbol}</Text>
                      <Feather name="chevron-right" size={15} color={DIM} />
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {buySearchFeedback?.kind === 'loading' && (
                <View style={styles.searchStatus}>
                  <ActivityIndicator size="small" color={SILVER} />
                  <Text style={styles.searchHint}>{buySearchFeedback.message}</Text>
                </View>
              )}
              {buySearchFeedback && buySearchFeedback.kind !== 'loading' && (
                <Text style={styles.searchHint}>{buySearchFeedback.message}</Text>
              )}
              {showTradeModal && buySearchText.length === 1 && !infoLoading && (
                <Text style={styles.searchHint}>Type at least 2 characters to search stocks and ETFs.</Text>
              )}

              {infoError ? (
                <Text style={styles.errorText}>{infoError}</Text>
              ) : stockInfo ? (
                <>
                  <View testID="paper-stock-info-card" style={styles.stockInfoCard}>
                    <Text style={styles.stockInfoName}>{stockInfo.companyName}</Text>
                    {stockInfo.sector ? <Text style={styles.stockInfoSector}>{stockInfo.sector}</Text> : null}
                    <Text style={styles.stockInfoPrice}>${stockInfo.currentPrice.toFixed(2)}</Text>
                    {stockInfo.dividendYield > 0 && (
                      <Text style={styles.stockInfoDiv}>
                         Dividend yield: {(normalizeDividendYield(stockInfo.dividendYield, stockInfo.dividendRate, stockInfo.currentPrice) * 100).toFixed(2)}%
                      </Text>
                    )}
                    <TouchableOpacity
                      testID="paper-add-to-watchlist-button"
                      accessibilityRole="button"
                      accessibilityLabel={
                        buyTickerIsWatched
                          ? `${buyTicker} is already on your watchlist`
                          : `Add ${buyTicker} to your watchlist`
                      }
                      accessibilityState={{ disabled: buyTickerIsWatched }}
                      style={[
                        styles.watchlistAction,
                        buyTickerIsWatched && styles.watchlistActionAdded,
                      ]}
                      onPress={() => { void addBuyTickerToWatchlist(); }}
                      disabled={buyTickerIsWatched}
                      activeOpacity={0.75}
                    >
                      <Feather
                        name={buyTickerIsWatched ? 'check' : 'plus'}
                        size={15}
                        color={buyTickerIsWatched ? BUY_COLOR : SILVER}
                      />
                      <Text
                        style={[
                          styles.watchlistActionText,
                          buyTickerIsWatched && styles.watchlistActionTextAdded,
                        ]}
                      >
                        {buyTickerIsWatched ? 'ALREADY ON WATCHLIST' : 'ADD TO WATCHLIST'}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity
                      testID="paper-stock-buy-button"
                      accessibilityRole="button"
                      style={[styles.confirmBtn, styles.buyBtn, { flex: 1 }]}
                      onPress={() => openSelectedStockOrder('buy')}
                    >
                      <Text style={styles.confirmBtnText}>BUY</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      testID="paper-stock-sell-button"
                      accessibilityRole="button"
                      style={[styles.confirmBtn, { flex: 1, backgroundColor: myPositions.some((position) =>
                        position.symbol === buyOrderDetails.symbol && !isShortPosition(position),
                      ) ? SELL_COLOR : 'rgba(255,59,59,0.25)' }]}
                      onPress={() => openSelectedStockOrder('sell')}
                      disabled={!myPositions.some((position) =>
                        position.symbol === buyOrderDetails.symbol && !isShortPosition(position),
                      )}
                    >
                      <Text style={styles.confirmBtnText}>SELL</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      testID="paper-stock-short-sell-button"
                      accessibilityRole="button"
                      style={[styles.confirmBtn, { flex: 1, backgroundColor: SELL_COLOR }]}
                      onPress={() => openSelectedStockOrder('short')}
                    >
                      <Text style={styles.confirmBtnText}>SHORT SELL</Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : null}

              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => {
                  invalidateStockLookup();
                  setShowTradeModal(false);
                  setStockInfo(null);
                }}
              >
                <Text style={styles.cancelBtnText}>CANCEL</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Order Sheet (shared buy + sell) ──────────────────────── */}
      {account && (
        <OrderSheet
          visible={showOrderSheet}
          side={tradeMode}
          symbol={tradeMode === 'buy' || tradeMode === 'short' ? buyOrderDetails.symbol : (selectedPos?.symbol ?? '')}
          companyName={tradeMode === 'buy' || tradeMode === 'short' ? buyOrderDetails.companyName : (selectedPos?.companyName ?? '')}
          currentPrice={tradeMode === 'buy' || tradeMode === 'short' ? buyOrderDetails.currentPrice : (quotes[selectedPos?.symbol ?? '']?.price ?? 0)}
          account={account}
          accountEquity={portfolioValue}
          accountPositions={myPositions}
          quotes={quotes}
          stockInfo={tradeMode === 'buy' || tradeMode === 'short' ? buyOrderDetails.stockInfo : undefined}
          selectedPos={tradeMode === 'sell' || tradeMode === 'cover' ? selectedPos : null}
          existingOrder={editingOrder}
          pendingOrders={orders.filter(o => o.accountId === activeId)}
          onClose={() => {
            setShowOrderSheet(false);
            setEditingOrder(null);
            if (tradeMode === 'sell' || tradeMode === 'cover') setSelectedPos(null);
          }}
          onRefreshQuote={refreshOrderQuote}
          onSearchStock={() => {
            setShowOrderSheet(false);
            setSelectedPos(null);
            openBuyModal();
          }}
          onSetShortCollateralRatio={(ratio) => {
            if (!Number.isFinite(ratio) || ratio < 1) return;
            void saveAccounts(accountsRef.current.map((item) => item.id === activeId
              ? { ...item, shortCollateralRatio: ratio }
              : item));
          }}
          onConfirm={handleConfirmOrder}
        />
      )}
    </SafeAreaView>
    </AmericanSteelBackground>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  headerTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    color: SILVER,
    letterSpacing: 0.8,
  },
  headerSub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
    color: DIM,
    letterSpacing: 0.25,
  },

  // Account bar
  accountSelectorHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 4,
  },
  selectorTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    color: GOLD,
    letterSpacing: 1.2,
  },
  selectorSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: DIM,
    marginTop: 3,
  },
  accountHero: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: 'rgba(214,179,91,0.46)',
    backgroundColor: 'rgba(28,27,23,0.96)',
  },
  eventChampionshipHero: {
    backgroundColor: 'rgba(24,24,25,0.98)',
    borderColor: 'rgba(231,198,106,0.62)',
    paddingHorizontal: 13,
    paddingTop: 8,
    paddingBottom: 6,
  },
  eventChampionshipTopline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 4,
  },
  eventChampionshipSwitchButton: { minHeight: 30, paddingHorizontal: 9 },
  heroTopline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  eventHeroLabel: { color: BUY_COLOR },
  editAccountsButton: {
    minHeight: 36,
    paddingHorizontal: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.38)',
    borderRadius: 8,
    backgroundColor: 'rgba(255,215,0,0.08)',
  },
  editAccountsText: { color: GOLD, fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 0.8 },
  heroIdentityRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 3 },
  heroAccountName: { flex: 1, color: '#eee9dc', fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  heroAccountPosition: { color: DIM, fontFamily: 'Inter_600SemiBold', fontSize: 9, letterSpacing: 0.8 },
  heroEquity: { color: '#f4f0e6', fontFamily: 'Inter_700Bold', fontSize: 29, letterSpacing: -0.7, marginTop: 3 },
  heroEquityLabel: { color: DIM, fontFamily: 'Inter_600SemiBold', fontSize: 9, letterSpacing: 1.2, marginTop: 2 },
  heroStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(192,192,192,0.16)',
  },
  heroStatsCompact: { flexDirection: 'column', alignItems: 'stretch', gap: 5 },
  heroStat: { flex: 1, minWidth: 0 },
  heroStatCompact: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 30 },
  heroStatValue: { color: '#e5e0d4', fontFamily: 'Inter_700Bold', fontSize: 12 },
  heroStatValueCompact: { flex: 1, minWidth: 0, textAlign: 'right' },
  heroStatLabel: { color: DIM, fontFamily: 'Inter_500Medium', fontSize: 8, letterSpacing: 0.65, marginTop: 2 },
  heroStatLabelCompact: { flex: 1, minWidth: 0, fontSize: 10, letterSpacing: 0.35, marginTop: 0, textAlign: 'left' },
  heroStatDivider: { width: 1, height: 30, backgroundColor: BORDER },
  heroStatDividerCompact: { width: '100%', height: StyleSheet.hairlineWidth, backgroundColor: BORDER },
  accountPositionIndicators: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 5, marginTop: 7 },
  accountPositionIndicator: { width: 5, height: 5, borderRadius: 3, backgroundColor: 'rgba(192,192,192,0.3)' },
  accountPositionIndicatorActive: { width: 16, backgroundColor: GOLD },
  eventPositionIndicator: { backgroundColor: BUY_COLOR },
  manageAccountsButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD_BG,
  },
  accountSelectorScroll: { flexGrow: 0 },
  accountCards: { paddingHorizontal: 16, paddingBottom: 8, gap: 10 },
  accountCard: {
    width: 224,
    minHeight: 118,
    padding: 12,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 13,
    backgroundColor: 'rgba(28,32,40,0.94)',
  },
  accountCardActive: {
    borderColor: GOLD,
    backgroundColor: 'rgba(43,38,24,0.96)',
  },
  accountCardEvent: {
    borderColor: 'rgba(255,215,0,0.56)',
    backgroundColor: 'rgba(50,40,20,0.78)',
  },
  accountCardEventActive: { borderColor: GOLD, borderWidth: 2 },
  eventAccountPlaceholder: { justifyContent: 'center' },
  accountCardTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  accountCardName: { flex: 1, fontFamily: 'Inter_700Bold', fontSize: 12, color: DIM, letterSpacing: 0.45 },
  accountCardNameActive: { color: GOLD },
  accountCardEquity: { marginTop: 5, fontFamily: 'Inter_700Bold', fontSize: 20, color: '#fff' },
  accountCardCaption: { marginTop: 1, fontFamily: 'Inter_500Medium', fontSize: 10, color: DIM, letterSpacing: 0.45 },
  eventAccountCardPrompt: { marginTop: 5, fontFamily: 'Inter_600SemiBold', fontSize: 9, lineHeight: 12, color: GOLD },
  accountCardDivider: { height: 1, backgroundColor: BORDER, marginTop: 5, marginBottom: 6 },
  accountCardMetrics: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  accountCardMetricValue: { fontFamily: 'Inter_700Bold', fontSize: 12, color: SILVER },
  accountCardMetricLabel: { marginTop: 2, fontFamily: 'Inter_500Medium', fontSize: 10, color: DIM, letterSpacing: 0.1 },
  eventPlaceholderValue: { marginTop: 12, fontFamily: 'Inter_600SemiBold', fontSize: 15, color: '#fff' },
  eventPlaceholderHint: { marginTop: 5, fontFamily: 'Inter_400Regular', fontSize: 10, lineHeight: 14, color: DIM },
  accountDetailsWrap: {
    marginHorizontal: 16,
    marginTop: 0,
    marginBottom: 8,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: 'rgba(18,21,27,0.96)',
  },
  accountDetailsToggle: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 13, paddingVertical: 8 },
  accountDetailsTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: SILVER },
  accountDetailsHint: { marginTop: 2, fontFamily: 'Inter_400Regular', fontSize: 10, color: DIM },
  accountDetailsGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: 12, paddingTop: 4, paddingBottom: 6, borderTopWidth: 1, borderTopColor: BORDER },
  overviewMetric: { width: '50%', minHeight: 48, paddingVertical: 7, paddingRight: 8 },
  overviewMetricValue: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  overviewMetricLabel: { marginTop: 4, fontFamily: 'Inter_500Medium', fontSize: 10, color: DIM, letterSpacing: 0.25 },
  chartHeading: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, minWidth: 0 },
  chartCurrentValue: { fontFamily: 'Inter_700Bold', fontSize: 13 },
  rangeRow: { flexDirection: 'row', gap: 6, paddingVertical: 8 },
  rangeChip: { minWidth: 38, height: 30, paddingHorizontal: 9, alignItems: 'center', justifyContent: 'center', borderRadius: 8, borderWidth: 1, borderColor: BORDER },
  rangeChipActive: { borderColor: GOLD, backgroundColor: 'rgba(255,215,0,0.13)' },
  rangeChipText: { fontFamily: 'Inter_600SemiBold', fontSize: 10, color: DIM },
  rangeChipTextActive: { color: GOLD },
  historyCard: { padding: 12, borderRadius: 12, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD_BG },
  historyTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  historyDate: { flex: 1, textAlign: 'right', fontFamily: 'Inter_400Regular', fontSize: 10, color: DIM },
  historyDetailRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 8 },
  historyDetail: { fontFamily: 'Inter_500Medium', fontSize: 11, color: SILVER },
  historyAccount: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 10, color: DIM },
  historyRealized: { fontFamily: 'Inter_600SemiBold', fontSize: 10 },
  accountBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: CARD_BG,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    gap: 8,
  },
  eventAccountBar: {
    backgroundColor: 'rgba(0,229,160,0.08)',
    borderBottomColor: 'rgba(0,229,160,0.34)',
    borderLeftWidth: 3,
    borderLeftColor: BUY_COLOR,
  },
  accountDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: BUY_COLOR },
  eventAccountDot: { width: 10, height: 10, borderRadius: 5 },
  accountName: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: SILVER, flex: 1 },
  eventAccountName: { color: '#fff' },
  eventAccountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
    backgroundColor: BUY_COLOR,
  },
  eventAccountBadgeText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 8,
    color: '#000',
    letterSpacing: 0.45,
  },
  eventAccountPrompt: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 8,
    color: BUY_COLOR,
    letterSpacing: 0.55,
    marginTop: 2,
  },
  eventAcctRow: {
    borderColor: 'rgba(0,229,160,0.45)',
    backgroundColor: 'rgba(0,229,160,0.06)',
  },
  accountVal: { fontFamily: 'Inter_700Bold', fontSize: 14, color: '#fff' },

  // Summary strip
  summaryStrip: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: BORDER },
  summaryCell: { flex: 1, alignItems: 'center', paddingVertical: 10 },
  summaryVal: { fontFamily: 'Inter_700Bold', fontSize: 12, letterSpacing: 0.3 },
  summaryLabel: { fontFamily: 'Inter_400Regular', fontSize: 9, color: DIM, marginTop: 2, letterSpacing: 0.5 },

  // Primary tab groups and secondary views
  primaryTabs: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 2,
    padding: 4,
    gap: 4,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  primaryTab: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 4,
    borderRadius: 10,
  },
  primaryTabActive: { backgroundColor: 'rgba(255,215,0,0.12)' },
  primaryTabLabel: { color: DIM, fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  primaryTabLabelActive: { color: GOLD },
  tabScroll: { flexGrow: 0 },
  subTabBar: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 8, gap: 8 },
  portfolioSubTabBar: { flexDirection: 'row', alignItems: 'stretch' },
  tabBtn: { minHeight: 38, minWidth: 78, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD_BG },
  portfolioTabBtn: { flex: 1, minWidth: 0, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, paddingHorizontal: 8 },
  portfolioTabLabel: { flexShrink: 1, textAlign: 'center' },
  tabBtnActive: { borderColor: GOLD, backgroundColor: 'rgba(255,215,0,0.12)' },
  tabLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: DIM },
  tabLabelActive: { color: GOLD },
  positionsTabLabelActive: { color: '#fff' },

  // Cards
  card: {
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    padding: 16,
  },
  sectionTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    color: DIM,
    letterSpacing: 1.5,
    marginBottom: 12,
  },
  contentSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 2 },
  contentSectionTitle: { fontFamily: 'Inter_700Bold', fontSize: 17, color: '#fff' },
  contentSectionHint: { fontFamily: 'Inter_400Regular', fontSize: 11, color: DIM, marginTop: 4 },
  sectionCount: { minWidth: 28, textAlign: 'center', color: GOLD, fontFamily: 'Inter_700Bold', fontSize: 12, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 9, backgroundColor: 'rgba(255,215,0,0.1)' },
  chartNote: {
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
    color: 'rgba(192,192,192,0.3)',
    marginBottom: 10,
    marginTop: -6,
  },

  // Position cards
  posCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    paddingVertical: 4,
    paddingHorizontal: 9,
    gap: 7,
  },
  orderCard: {
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    padding: 11,
  },
  posColorBar: { width: 3, height: '100%', borderRadius: 2, minHeight: 28 },
  posAccentBar: { width: 3, borderRadius: 2, minHeight: 30, marginRight: 2 },
  posRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  posSymbol: { fontFamily: 'Inter_700Bold', fontSize: 15, color: '#fff' },
  posLabel: { fontFamily: 'Inter_400Regular', fontSize: 10, color: 'rgba(192,192,192,0.38)', letterSpacing: 1 },
  posVal: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: '#fff', marginTop: 1 },
  posName: { fontFamily: 'Inter_400Regular', fontSize: 10, color: DIM, marginTop: 1 },
  positionValue: { minWidth: 110, maxWidth: 140, alignItems: 'flex-end' },
  posValueLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  posMktLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 7, color: DIM, letterSpacing: 0.35 },
  posMktVal: { fontFamily: 'Inter_700Bold', fontSize: 13, color: '#fff' },
  posPnl: { fontFamily: 'Inter_600SemiBold', fontSize: 9, marginTop: 1 },
  posMetaRow: { flexDirection: 'row', alignItems: 'center', minWidth: 0, paddingTop: 2, borderTopWidth: 1, borderTopColor: 'rgba(192,192,192,0.12)' },
  posMeta: { flex: 1, minWidth: 0, fontFamily: 'Inter_400Regular', fontSize: 9, color: DIM },

  // Transaction rows
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    gap: 8,
  },
  txBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  txBadgeText: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 0.5 },
  txSym: { fontFamily: 'Inter_700Bold', fontSize: 12, color: SILVER, width: 48 },
  txDetail: { fontFamily: 'Inter_400Regular', fontSize: 11, color: DIM },
  txTotal: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: SILVER },

  // Allocation
  allocRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  allocDot: { width: 8, height: 8, borderRadius: 4 },
  allocLabel: { fontFamily: 'Inter_500Medium', fontSize: 12, color: SILVER, flex: 1 },
  allocVal: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: '#fff', width: 90, textAlign: 'right' },
  allocPct: { fontFamily: 'Inter_400Regular', fontSize: 11, color: DIM, width: 44, textAlign: 'right' },

  // Metrics
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 },
  metricBox: { width: '48%', minHeight: 68, justifyContent: 'center', backgroundColor: 'rgba(192,192,192,0.04)', borderRadius: 10, padding: 12 },
  metricVal: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  metricLabel: { fontFamily: 'Inter_400Regular', fontSize: 11, color: DIM, marginTop: 5 },

  // Dividends
  divSummary: { flexDirection: 'row', marginBottom: 10 },
  divBig: { fontFamily: 'Inter_700Bold', fontSize: 22, color: '#fff' },
  divLabel: { fontFamily: 'Inter_400Regular', fontSize: 11, color: DIM, marginTop: 4 },
  divRow: { flexDirection: 'row', gap: 20 },
  divDetail: { fontFamily: 'Inter_400Regular', fontSize: 12, color: DIM },
  reportNote: { fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 16, color: DIM, marginTop: 10 },
  receivedDividendRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: BORDER },
  receivedDividendLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 9, color: DIM, letterSpacing: 0.7 },
  receivedDividendValue: { fontFamily: 'Inter_700Bold', fontSize: 18, color: SILVER, marginTop: 4 },
  receivedDividendHint: { fontFamily: 'Inter_400Regular', fontSize: 10, color: DIM, marginTop: 3 },
  divDetailRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: BORDER },
  divSym: { fontFamily: 'Inter_700Bold', fontSize: 13, color: SILVER, width: 52 },
  divYield: { fontFamily: 'Inter_400Regular', fontSize: 11, color: DIM },
  divAnnual: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },

  // Growth
  rateLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 12, letterSpacing: 0.5, marginBottom: 8 },
  yoyGrid: { flexDirection: 'row', gap: 8 },
  yoyCell: { flex: 1, alignItems: 'center', backgroundColor: 'rgba(192,192,192,0.04)', borderRadius: 8, padding: 8 },
  yoyVal: { fontFamily: 'Inter_700Bold', fontSize: 11 },
  yoyYear: { fontFamily: 'Inter_400Regular', fontSize: 9, color: DIM, marginTop: 3 },

  // Position card expanded state
  posCardExpanded: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderBottomWidth: 0,
  },

  // Cost-basis lots panel
  lotsPanel: {
    backgroundColor: 'rgba(192,192,192,0.05)',
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: BORDER,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    padding: 14,
    paddingTop: 12,
  },
  lotsPanelTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 9,
    color: DIM,
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  lotHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  lotHeaderCell: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 8,
    color: 'rgba(192,192,192,0.35)',
    letterSpacing: 0.25,
  },
  lotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(192,192,192,0.07)',
  },
  lotCell: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: SILVER,
  },
  lotPnlCell: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
  },
  lotPnlPct: {
    fontFamily: 'Inter_400Regular',
    fontSize: 9,
    color: DIM,
    marginTop: 1,
  },
  lotAggRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    marginTop: 2,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  lotAggCell: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    color: SILVER,
  },
  lotsEmpty: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: DIM,
    paddingVertical: 8,
    fontStyle: 'italic',
  },
  lotSellBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: SELL_COLOR,
    borderRadius: 8,
    paddingVertical: 10,
    marginTop: 12,
  },
  lotSellBtnText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
    color: '#000',
    letterSpacing: 0.5,
  },

  // Empty state
  emptyWrap: { alignItems: 'center', paddingVertical: 36, gap: 12 },
  emptyTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 16, color: DIM },
  emptyHint: { fontFamily: 'Inter_400Regular', fontSize: 13, color: 'rgba(192,192,192,0.25)', textAlign: 'center', maxWidth: 240 },

  // Integrated trading action
  buyActionWrap: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10 },
  buyAction: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    backgroundColor: BUY_COLOR,
    borderRadius: 13,
  },
  buyActionTitle: { fontFamily: 'Inter_700Bold', fontSize: 14, color: '#000' },
  buyActionHint: { fontFamily: 'Inter_500Medium', fontSize: 10, color: 'rgba(0,0,0,0.72)', marginTop: 2 },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  accountManagementKeyboard: { width: '100%', justifyContent: 'flex-end' },
  bottomSheet: {
    backgroundColor: '#111',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: BORDER,
    padding: 20,
    paddingBottom: 36,
    maxHeight: '88%',
  },
  accountSheet: { padding: 18, paddingTop: 14, maxHeight: '88%' },
  accountSheetScroll: { flexGrow: 0, maxHeight: '100%' },
  sheetHeadingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  sheetHandle: { width: 36, height: 4, backgroundColor: BORDER, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  sheetTitle: { fontFamily: 'Inter_700Bold', fontSize: 16, color: '#fff', letterSpacing: 1, marginBottom: 4 },
  sheetSub: { fontFamily: 'Inter_400Regular', fontSize: 12, color: DIM, marginBottom: 16 },

  // Account rows in dropdown
  acctRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: BORDER,
  },
  acctRowActive: { borderColor: GOLD, backgroundColor: 'rgba(255,215,0,0.10)' },
  eventAcctRowActive: { borderColor: GOLD, backgroundColor: 'rgba(0,229,160,0.12)' },
  accountSheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 7,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    backgroundColor: 'rgba(26,29,34,0.92)',
    overflow: 'hidden',
  },
  accountSelectHit: { flex: 1, minWidth: 0, paddingVertical: 13, paddingHorizontal: 13 },
  accountChoiceCopy: { flex: 1, minWidth: 0 },
  accountChoiceTitleLine: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
  accountStoredName: { color: DIM, fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 2 },
  accountChoiceValues: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 3, marginTop: 7 },
  accountChoiceValue: { color: '#d9d4c9', fontFamily: 'Inter_600SemiBold', fontSize: 10 },
  accountChoiceLabel: { color: DIM, fontFamily: 'Inter_600SemiBold', fontSize: 8, letterSpacing: 0.65 },
  activeAccountBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 5, paddingVertical: 3, borderRadius: 5, backgroundColor: 'rgba(255,215,0,0.09)' },
  activeAccountBadgeText: { color: GOLD, fontFamily: 'Inter_700Bold', fontSize: 8, letterSpacing: 0.5 },
  accountManagementTools: {
    flexDirection: 'column',
    alignItems: 'stretch',
    justifyContent: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 5,
    borderLeftWidth: 1,
    borderLeftColor: BORDER,
    backgroundColor: 'rgba(8,10,12,0.45)',
  },
  accountManageButton: { minWidth: 84, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 7, paddingHorizontal: 6 },
  accountManageText: { color: DIM, fontFamily: 'Inter_700Bold', fontSize: 8, letterSpacing: 0.55 },
  accountResetConfirm: { paddingVertical: 6, paddingHorizontal: 7 },
  eventUnavailableRow: { paddingVertical: 12, paddingHorizontal: 13 },
  eventUnavailableHint: { color: 'rgba(0,229,160,0.76)', fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 3 },
  acctName: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#fff', marginBottom: 3 },
  acctCash: { fontFamily: 'Inter_400Regular', fontSize: 11, color: DIM },
  renameInput: {
    fontFamily: 'Inter_600SemiBold',
    width: 96,
    fontSize: 12,
    color: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: SILVER,
    paddingVertical: 4,
    marginHorizontal: 4,
  },
  closeSheetBtn: { marginTop: 16, alignItems: 'center', paddingVertical: 14, borderRadius: 10, borderWidth: 1, borderColor: BORDER },
  closeSheetText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: DIM, letterSpacing: 1 },

  // Trade modal
  lookupRow: { flexDirection: 'row', gap: 10, marginBottom: 12, alignItems: 'center' },
  symbolInput: {
    flex: 1,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#fff',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    letterSpacing: 1,
  },
  lookupBtn: {
    backgroundColor: SILVER,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 88,
  },
  lookupBtnText: { fontFamily: 'Inter_700Bold', fontSize: 12, color: '#000', letterSpacing: 0.5 },
  searchResults: {
    backgroundColor: 'rgba(192,192,192,0.04)',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 12,
  },
  searchResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    minHeight: 56,
  },
  searchResultDivider: { borderBottomWidth: 1, borderBottomColor: BORDER },
  searchResultName: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: '#fff' },
  searchResultExchange: { fontFamily: 'Inter_400Regular', fontSize: 10, color: DIM, marginTop: 3 },
  searchResultSymbol: { fontFamily: 'Inter_700Bold', fontSize: 12, color: BUY_COLOR, letterSpacing: 0.5 },
  searchStatus: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, paddingHorizontal: 2 },
  searchHint: { fontFamily: 'Inter_400Regular', fontSize: 11, color: DIM, marginBottom: 10 },
  errorText: { fontFamily: 'Inter_400Regular', fontSize: 12, color: SELL_COLOR, marginBottom: 8 },
  stockInfoCard: {
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    padding: 14,
    marginBottom: 14,
  },
  stockInfoName: { fontFamily: 'Inter_700Bold', fontSize: 15, color: '#fff', marginBottom: 4 },
  stockInfoSector: { fontFamily: 'Inter_400Regular', fontSize: 11, color: DIM, marginBottom: 8 },
  stockInfoPrice: { fontFamily: 'Inter_700Bold', fontSize: 24, color: SILVER, marginBottom: 4 },
  stockInfoDiv: { fontFamily: 'Inter_400Regular', fontSize: 11, color: BUY_COLOR },
  watchlistAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    minHeight: 42,
    marginTop: 12,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 9,
  },
  watchlistActionAdded: { borderColor: BUY_COLOR },
  watchlistActionText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    color: SILVER,
    letterSpacing: 0.6,
  },
  watchlistActionTextAdded: { color: BUY_COLOR },
  inputLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    color: DIM,
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  sharesInput: {
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#fff',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 20,
    marginBottom: 12,
  },
  allBtn: {
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  allBtnText: { fontFamily: 'Inter_700Bold', fontSize: 12, color: SILVER, letterSpacing: 1 },
  tradeCalc: { gap: 6, marginBottom: 16 },
  calcRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  calcLabel: { fontFamily: 'Inter_400Regular', fontSize: 13, color: DIM },
  calcVal: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: SILVER },
  confirmBtn: {
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginBottom: 8,
  },
  buyBtn: { backgroundColor: BUY_COLOR },
  sellBtn: { backgroundColor: SELL_COLOR },
  confirmBtnText: { fontFamily: 'Inter_700Bold', fontSize: 14, color: '#000', letterSpacing: 0.5 },
  cancelBtn: { paddingVertical: 12, alignItems: 'center' },
  cancelBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: DIM, letterSpacing: 1 },
  orderAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  orderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  orderActionText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    letterSpacing: 1,
  },
});
