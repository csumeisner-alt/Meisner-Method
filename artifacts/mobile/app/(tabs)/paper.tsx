/**
 * Paper Trading Screen — risk-free trading with $100,000 virtual cash.
 * Supports 3 independent strategy accounts with live P&L, charts, and tracking.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as Network from 'expo-network';
import { KeyboardAvoidingView as KeyboardControllerAvoidingView } from 'react-native-keyboard-controller';
import {
  ActivityIndicator,
  Animated,
  AppState,
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
import * as Haptics from 'expo-haptics';
import { MMLogo } from '@/components/MMLogo';
import { PaperEventShareCard } from '@/components/PaperEventShareCard';
import { BottomTabBar } from '@/components/BottomTabBar';
import { PaperAccountSwipeArea } from '@/components/PaperAccountSwipeArea';
import {
  PaperPortfolioNavigation,
  PaperPortfolioSummary,
  PaperPositionRow,
  PaperTradingAction,
} from '@/components/PaperPortfolioLayout';
import { PaperEventArenaDashboard } from '@/components/PaperEventArenaDashboard';
import { PaperEventLiveNotice } from '@/components/PaperEventLiveNotice';
import { useAchievements } from '@/contexts/AchievementsContext';
import { AmericanSteelBackground } from '@/components/AmericanSteelBackground';
import { useColors } from '@/hooks/useColors';
import { useReduceMotion } from '@/hooks/useReduceMotion';
import { useRetainedTabScroll } from '@/lib/useRetainedTabScroll';
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
  isFreshPaperQuote,
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
  getPurchaseLimitRejectionReason,
  settleCash,
  creditDividends,
  fifoSell,
} from '@/lib/paperEngine';
import { removePendingPaperOrder } from '@/lib/paperOrderDeletion';
import { createPaperOrderFillHapticNotifier } from '@/lib/paperOrderFillHaptics';
import {
  createPaperOrderFillAlertNotifier,
  type PaperOrderFillAlert,
} from '@/lib/paperOrderFillAlerts';
import {
  canEvaluatePendingOrderQuote,
  getMarketOrderQuoteError,
  getOrderQuoteState,
  getPennyQuoteStatus,
  formatProviderPriceSource,
  isClosedMarketQuote,
  isPennyStockMayhemEligible,
} from '@/lib/paperOrderEntry';
import {
  canExecuteLightningRoundStagedOrder,
  cancelLightningRoundStagedOrders,
  getLightningRoundEventPortfolio,
  getLightningRoundStartEquityFromSnapshots,
  getLightningRoundQueuedOrders,
  isLightningRoundPreparationOpen,
  isLightningRoundStagedOrder,
  isLightningRoundQualified,
  shouldSyncLightningRoundPreparation,
  shouldOfferLightningRoundTradeEnrollment,
} from '@/lib/lightningRoundPreparation';
import {
  renamePaperAccount,
  resetPaperAccountData,
} from '@/lib/paperAccountManagement';
import {
  PAPER_CACHE_KEY,
  createDefaultPaperCache,
  loadOrCreatePaperCache,
  type StoredPaperCache as PaperCache,
} from '@/lib/paperCache';
import {
  PAPER_PORTFOLIO_PRELOAD_KEY,
  PAPER_QUOTE_CACHE_KEY,
  buildPaperPortfolioPreloadSummaries,
  createPaperPortfolioPreloadCache,
  getPaperPortfolioPreloadState,
  mergePaperPreloadQuotes,
  parsePaperQuoteCache,
  persistPaperPreloadQuotes,
  publishPaperPortfolioPreload,
  requestPaperPreloadQuote,
  subscribePaperPortfolioPreload,
} from '@/lib/paperPortfolioPreload';
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
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { getInstallationId } from '@/lib/installation';
import {
  buildEventArenaDeviceSnapshot,
  EVENT_ARENA_DEVICE_DIRTY_KEY,
  EVENT_ARENA_DEVICE_REVISION_KEY,
  EVENT_ARENA_DEVICE_TOKEN_KEY,
  EVENT_ARENA_SOURCE_INSTALLATION_ID_KEY,
  getEventArenaParticipantId,
  mergeEventArenaDeviceSnapshot,
  syncEventArenaDeviceSnapshot,
  type EventArenaDeviceSyncResponse,
} from '@/lib/eventArenaDeviceSync';
import { useApi } from '@/hooks/useApi';
import { getRegularEventCalendarError } from '@/lib/paperChallengeCalendar';
import {
  buildPaperChallengeSummary,
  ensurePaperChallengeAccount,
  getPaperChallengeMilestones,
  getMissingPaperChallengeQuoteSymbols,
  getPaperChallengeWindow,
  finalizePaperChallengeStore,
  LIGHTNING_ROUND_STARTING_BALANCE,
  findPreparedLightningRoundWindow,
  normalizePaperChallengeStore,
  loadPaperChallengeStore,
  PAPER_CHALLENGE_STORAGE_KEY,
  PAPER_CHALLENGE_STARTING_BALANCE,
  ONE_STOCK_CHALLENGE_REJECTION_MESSAGE,
  shouldEnsurePaperChallengeAccount,
  updatePaperChallengeStore,
  updatePaperChallengeEnrollment,
  type PaperChallengeStore,
  type PaperChallengeSummary,
  type PaperChallengeEnrollment,
  type PaperChallengeWindow,
  capturePaperChallengeBaseline,
  findLightningRoundWindow,
  getPaperChallengeEnrollmentForAccount,
  getPaperChallengeEnrollments,
  isPaperChallengeAccountId,
  isLightningRoundEventId,
} from '@/lib/paperChallenge';
import {
  getSearchHeatMapInstrumentsQueryKey,
  getSearchStockSymbolsQueryKey,
  useSearchHeatMapInstruments,
  useSearchStockSymbols,
  createDeviceTransfer,
  redeemDeviceTransfer,
  completeDeviceTransfer,
  restoreDeviceTransferAlerts,
  type HeatMapInstrumentSuggestion,
} from '@workspace/api-client-react';
import {
  applyDeviceTransfer,
  createDeviceTransferBundle,
  preflightDeviceTransfer,
  DEVICE_TRANSFER_DESTINATION_KEY,
  type DeviceTransferCategoryResult,
  type DeviceTransferPreview,
  hasDeviceTransferDestinationChanged,
  replaceDeviceTransferCategoryData,
} from '@/lib/deviceTransfer';
import { stableDeviceTransferJson } from '../../../../lib/api-zod/src/deviceTransferManifest.ts';
import { didNetworkReconnect, isNetworkOffline } from '@/lib/networkConnectivity';

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
const PAPER_VALUE_SNAPSHOT_KEY = '@stocksense/paper_equity_snapshots_v1';
const PAPER_VALUE_SNAPSHOT_INTERVAL_MS = 60 * 60_000;
const PAPER_VALUE_SNAPSHOT_MAX_AGE_MS = 2 * 60 * 60_000;
const PAPER_FOCUS_REFRESH_MIN_INTERVAL_MS = 60_000;
const PAPER_QUOTE_REFRESH_INTERVAL_MS = 60_000;

async function readPaperCache(): Promise<PaperCache | null> {
  return loadOrCreatePaperCache(AsyncStorage);
}

async function writePaperCache(data: PaperCache) {
  // AsyncStorage writes are asynchronous and can complete out of order when
  // an order fill and a quote poll save at nearly the same time. Serialize
  // them so an older snapshot can never overwrite a newer position update.
  const preloadSummaries = buildPaperPortfolioPreloadSummaries(data);
  publishPaperPortfolioPreload(preloadSummaries, getPaperPortfolioPreloadState().quotes);
  const preloadCache = createPaperPortfolioPreloadCache(preloadSummaries);
  paperCacheWriteQueue = paperCacheWriteQueue
    .catch(() => {})
    .then(async () => {
      await AsyncStorage.setItem(PAPER_CACHE_KEY, JSON.stringify(data));
      await AsyncStorage.setItem(PAPER_PORTFOLIO_PRELOAD_KEY, JSON.stringify(preloadCache));
    })
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
function formatProviderTimestamp(timestamp: number | null | undefined) {
  if (!Number.isFinite(timestamp) || (timestamp ?? 0) <= 0) return 'Provider time unavailable';
  return new Date((timestamp as number) * 1000).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
function lightningCountdownLabel(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  const seconds = total % 60;
  return `${days}d ${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
}
function pnlColor(n: number) {
  return n > 0 ? BUY_COLOR : n < 0 ? SELL_COLOR : SILVER;
}

// ── Main Screen ────────────────────────────────────────────────────────────
export default function PaperScreen() {
  const colors = useColors();
  const paperScroll = useRetainedTabScroll('main-tab:paper');
  const reduceMotion = useReduceMotion();
  const { apiFetch } = useApi();
  const router = useRouter();
  const routeParams = useLocalSearchParams<{ challengeAccountId?: string; tab?: string }>();
  const { awardAchievement } = useAchievements();
  const { pushToken: currentPushToken, requestPermissionAndGetToken } = usePushNotifications();
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const watchlist = useWatchlist();

  // Persisted state
  const [accounts, setAccounts] = useState<PaperAccount[]>([]);
  const [activeId, setActiveId] = useState('');
  const [positions, setPositions] = useState<PaperPosition[]>([]);
  const [transactions, setTransactions] = useState<PaperTransaction[]>([]);
  const [orders, setOrders] = useState<PaperOrder[]>([]);
  const [lots, setLots] = useState<PaperLot[]>([]);
  const paperOrderFillHapticNotifierRef = useRef<ReturnType<typeof createPaperOrderFillHapticNotifier> | null>(null);
  if (!paperOrderFillHapticNotifierRef.current) {
    paperOrderFillHapticNotifierRef.current = createPaperOrderFillHapticNotifier(
      Platform.OS,
      () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
    );
  }
  const [paperOrderFillAlerts, setPaperOrderFillAlerts] = useState<PaperOrderFillAlert[]>([]);
  const paperOrderFillAlertNotifierRef = useRef<ReturnType<typeof createPaperOrderFillAlertNotifier> | null>(null);
  if (!paperOrderFillAlertNotifierRef.current) {
    paperOrderFillAlertNotifierRef.current = createPaperOrderFillAlertNotifier((alert) => {
      setPaperOrderFillAlerts((current) => [...current, alert]);
    });
  }
  const visiblePaperOrderFillAlert = paperOrderFillAlerts[0] ?? null;
  useEffect(() => {
    if (!visiblePaperOrderFillAlert) return;
    const timeout = setTimeout(() => {
      setPaperOrderFillAlerts((current) => current.filter((alert) => alert.orderId !== visiblePaperOrderFillAlert.orderId));
    }, 4_000);
    return () => clearTimeout(timeout);
  }, [visiblePaperOrderFillAlert?.orderId]);
  const [accountValueSnapshots, setAccountValueSnapshots] = useState<PaperAccountValueSnapshot[]>([]);
  const [snapshotStorageError, setSnapshotStorageError] = useState('');

  // Load state
  const [loaded, setLoaded] = useState(false);
  const loadedRef = useRef(false);
  loadedRef.current = loaded;
  const [isFocused, setIsFocused] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [lightningEntryFailure, setLightningEntryFailure] = useState('');
  const [paperChallenge, setPaperChallenge] = useState<PaperChallengeStore>({ enrollment: null, history: [] });
  const [paperChallengeReady, setPaperChallengeReady] = useState(false);
  const [challengeNow, setChallengeNow] = useState(Date.now());
  const [challengeRetryVersion, setChallengeRetryVersion] = useState(0);
  const [challengeFinalizationBusy, setChallengeFinalizationBusy] = useState(false);
  const [challengeFinalizationError, setChallengeFinalizationError] = useState(false);
  const [completedEventSummary, setCompletedEventSummary] = useState<PaperChallengeSummary | null>(null);
  const paperChallengeRef = useRef<PaperChallengeStore>({ enrollment: null, history: [] });
  const previousEnrollmentIdsRef = useRef(new Set<string>());
  const challengeFinalizingRef = useRef<string | null>(null);
  const challengeFinalizationFailureRef = useRef<string | null>(null);
  const challengeBaselineCapturingRef = useRef<string | null>(null);

  // Live quotes
  const [quotes, setQuotes] = useState<Record<string, LiveQuote>>(
    () => getPaperPortfolioPreloadState().quotes,
  );
  const [loadingQuotes, setLoadingQuotes] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => subscribePaperPortfolioPreload((state) => {
    setQuotes(state.quotes);
  }), []);

  // UI
  const [activeTab, setActiveTab] = useState<TabId>('positions');
  const [chartRange, setChartRange] = useState<(typeof HISTORY_RANGES)[number]['id']>('ALL');
  const [showAccountManagement, setShowAccountManagement] = useState(false);
  const [deviceTransferMode, setDeviceTransferMode] = useState<'create' | 'restore' | 'review' | 'result' | null>(null);
  const [deviceTransferCode, setDeviceTransferCode] = useState('');
  const [deviceTransferCodeInput, setDeviceTransferCodeInput] = useState('');
  const [deviceTransferRestoreCode, setDeviceTransferRestoreCode] = useState('');
  const [deviceTransferPreview, setDeviceTransferPreview] = useState<DeviceTransferPreview | null>(null);
  const [deviceTransferResults, setDeviceTransferResults] = useState<DeviceTransferCategoryResult[]>([]);
  const [deviceTransferEventArenaSync, setDeviceTransferEventArenaSync] = useState<{
    sourceInstallationId: string;
    revision: number;
  } | null>(null);
  const [deviceTransferBusy, setDeviceTransferBusy] = useState(false);
  const [deviceTransferError, setDeviceTransferError] = useState('');
  const [showTradeModal, setShowTradeModal] = useState(false);
  const [showOrderSheet, setShowOrderSheet] = useState(false);
  const [lightningTradeOfferWindow, setLightningTradeOfferWindow] = useState<PaperChallengeWindow | null>(null);
  const [lightningTradeOfferNow, setLightningTradeOfferNow] = useState(Date.now());
  const [tradeMode, setTradeMode] = useState<OrderIntent>('buy');
  const [selectedPos, setSelectedPos] = useState<PaperPosition | null>(null);
  const [editingOrder, setEditingOrder] = useState<PaperOrder | null>(null);
  const [deleteConfirmationOrder, setDeleteConfirmationOrder] = useState<PaperOrder | null>(null);
  const [finalLightningCancelOrder, setFinalLightningCancelOrder] = useState<PaperOrder | null>(null);
  const [finalLightningCancelError, setFinalLightningCancelError] = useState('');
  const [finalLightningCancelling, setFinalLightningCancelling] = useState(false);
  const [leaveLightningOpen, setLeaveLightningOpen] = useState(false);
  const [leaveLightningError, setLeaveLightningError] = useState('');
  const [leavingLightning, setLeavingLightning] = useState(false);
  const [lightningPreparationMessage, setLightningPreparationMessage] = useState('');

  // Buy modal state
  const [buySymbol, setBuySymbol] = useState('');
  const [stockInfo, setStockInfo] = useState<StockInfo | null>(null);
  const [infoLoading, setInfoLoading] = useState(false);
  const [infoError, setInfoError] = useState('');
  const [debouncedBuyQuery, setDebouncedBuyQuery] = useState('');
  const [searchQuotes, setSearchQuotes] = useState<Record<string, LiveQuote>>({});
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
  const activeQuoteSignature = [
    activeId,
    ...myPositions.map((position) => position.symbol.trim().toUpperCase()),
    ...orders
      .filter((order) => order.accountId === activeId && order.status === 'pending')
      .map((order) => order.symbol.trim().toUpperCase()),
  ].sort().join('|');
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
  const selectedAccountEnrollment = getPaperChallengeEnrollmentForAccount(paperChallenge, activeId);
  const savedLightningEnrollment = paperChallenge.lightningEnrollment ?? null;
  const activeLightningEnrollment = savedLightningEnrollment?.accountId === activeId
    && isPaperChallengeAccountId(activeId)
    ? savedLightningEnrollment
    : null;
  const lightningEnrollmentForDisplay = activeLightningEnrollment;
  const lightningQueuedOrders = lightningEnrollmentForDisplay
    ? getLightningRoundQueuedOrders(
      orders,
      lightningEnrollmentForDisplay.eventId,
      lightningEnrollmentForDisplay.accountId,
    )
    : [];
  const lightningIsQualified = lightningEnrollmentForDisplay
    ? isLightningRoundQualified(
      orders,
      lightningEnrollmentForDisplay.eventId,
      lightningEnrollmentForDisplay.accountId,
    )
    : false;
  const isLightningPreparationOpen = !!lightningEnrollmentForDisplay
    && isLightningRoundPreparationOpen(lightningEnrollmentForDisplay.eventStartAtMs, challengeNow);
  const isLightningPreparationAccount = !!activeLightningEnrollment && isLightningPreparationOpen;
  const isPennyStockMayhemFlow = selectedAccountEnrollment?.eventType === 'penny-stock-mayhem'
    && challengeNow >= selectedAccountEnrollment.eventStartAtMs
    && challengeNow < selectedAccountEnrollment.eventEndAtMs;
  const activePurchaseLimit = isPennyStockMayhemFlow
    ? selectedAccountEnrollment?.purchaseLimit ?? 20
    : undefined;
  const buySuggestionsKey = buySuggestions
    .map((suggestion) => `${suggestion.instrumentType}:${suggestion.symbol}`)
    .join('|');

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

  useEffect(() => {
    if (!isPennyStockMayhemFlow || buySuggestions.length === 0) {
      setSearchQuotes({});
      return;
    }
    let cancelled = false;
    setSearchQuotes({});
    void fetch(`${BASE_URL}/api/stocks/quotes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ symbols: buySuggestions.map((suggestion) => suggestion.symbol) }),
    }).then(async (response) => {
      if (!response.ok) throw new Error('Search quotes unavailable');
      return await response.json() as { quotes?: Array<Record<string, unknown>> };
    }).then((payload) => {
      if (cancelled || !Array.isArray(payload.quotes)) return;
      const fetchedAtMs = Date.now();
      const next: Record<string, LiveQuote> = {};
      for (const raw of payload.quotes) {
        const symbol = typeof raw.symbol === 'string' ? raw.symbol.toUpperCase() : '';
        const price = Number(raw.currentPrice);
        if (!symbol || !Number.isFinite(price) || price <= 0) continue;
        next[symbol] = {
          price,
          change: Number.isFinite(Number(raw.priceChange)) ? Number(raw.priceChange) : 0,
          pct: Number.isFinite(Number(raw.priceChangePercent)) ? Number(raw.priceChangePercent) : 0,
          priceTimestamp: typeof raw.priceTimestamp === 'number' ? raw.priceTimestamp : null,
          marketSession: typeof raw.marketSession === 'string' ? raw.marketSession : undefined,
          priceSource: typeof raw.priceSource === 'string' ? raw.priceSource : undefined,
          fetchedAtMs,
        };
      }
      setSearchQuotes(next);
    }).catch(() => {
      if (!cancelled) setSearchQuotes({});
    });
    return () => { cancelled = true; };
  }, [buySuggestionsKey, isPennyStockMayhemFlow]);

  // Total equity includes settled cash + unsettled T+1 proceeds + market value of positions.
  // Buying power is restricted to settled cash only (enforced in fillOrder / OrderSheet risk check).
  const portfolioValue = account ? computePaperEquity(account, myPositions, quotes) : 0;
  const regularCalendarError = getRegularEventCalendarError();
  const paperChallengeWindow = getPaperChallengeWindow(challengeNow);
  const lightningRoundWindow = regularCalendarError ? null : findLightningRoundWindow(challengeNow);
  const lightningRoundPromotionWindow = regularCalendarError
    ? null
    : findLightningRoundWindow(challengeNow - 24 * 60 * 60 * 1000);
  const challengeEnrollments = getPaperChallengeEnrollments(paperChallenge);
  const isEnrollmentActive = (enrollment: PaperChallengeEnrollment) =>
    challengeNow >= enrollment.eventStartAtMs && challengeNow < enrollment.eventEndAtMs;
  const activeChallengeEnrollment = challengeEnrollments.find((enrollment) =>
    enrollment.eventType === 'lightning-round'
    && enrollment.accountId === account?.id
    && isEnrollmentActive(enrollment),
  ) ?? challengeEnrollments.find((enrollment) =>
    enrollment.accountId === account?.id && isEnrollmentActive(enrollment),
  ) ?? challengeEnrollments.find(isEnrollmentActive) ?? null;
  const isPaperChallengeWaiting = challengeEnrollments.some(
    (enrollment) => challengeNow >= enrollment.eventEndAtMs,
  );
  const isEventAccountActive = !!account && challengeEnrollments.some((enrollment) =>
    enrollment.accountId === account.id
    && challengeNow >= enrollment.eventStartAtMs
    && challengeNow < enrollment.eventEndAtMs,
  );
  const hasCurrentEventEnrollment = challengeEnrollments.some((enrollment) =>
    enrollment.eventId === paperChallengeWindow.id || enrollment.eventId === lightningRoundWindow?.id,
  );
  const visibleEventAccountIds = new Set([
    ...challengeEnrollments.map((enrollment) => enrollment.accountId),
    ...paperChallenge.history
      .filter((event) => event.eventType !== 'lightning-round')
      .slice(0, 1)
      .map((event) => event.accountId),
    ...paperChallenge.history
      .filter((event) => event.eventType === 'lightning-round')
      .slice(0, 1)
      .map((event) => event.accountId),
  ]);
  const visibleAccounts = accounts.filter((item) =>
    !isPaperChallengeAccountId(item.id) || visibleEventAccountIds.has(item.id),
  );
  const regularAccounts = visibleAccounts.filter((item) => !isPaperChallengeAccountId(item.id));
  const selectedAccountIndex = regularAccounts.findIndex((item) => item.id === account?.id);
  const selectedAccountDisplayName = account && isPaperChallengeAccountId(account.id)
    ? account.id.startsWith('paper-lightning:')
      ? 'Lightning Round'
      : getPaperChallengeEnrollmentForAccount(paperChallenge, account.id)?.eventType === 'penny-stock-mayhem'
        ? 'Penny Stock Mayhem'
        : getPaperChallengeEnrollmentForAccount(paperChallenge, account.id)?.eventType === 'one-stock-challenge'
          ? 'The One-Stock Challenge' : 'Event Arena'
    : PAPER_ACCOUNT_DISPLAY_NAMES[selectedAccountIndex] ?? account?.name ?? 'Paper account';
  const selectedAccountPosition = visibleAccounts.findIndex((item) => item.id === account?.id);
  const isSelectedEventAccount = !!account && isPaperChallengeAccountId(account.id);
  const selectedEventEnrollment = isSelectedEventAccount && account
    ? getPaperChallengeEnrollmentForAccount(paperChallenge, account.id)
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
  const selectedEventDateRange = (() => {
    const start = new Date(selectedEventStartAtMs);
    const end = new Date(selectedEventEndAtMs);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return '';
    const startMonth = start.toLocaleDateString('en-US', { month: 'short' });
    const endMonth = end.toLocaleDateString('en-US', { month: 'short' });
    return startMonth === endMonth
      ? `${startMonth} ${start.getDate()}–${end.getDate()}`
      : `${startMonth} ${start.getDate()}–${endMonth} ${end.getDate()}`;
  })();
  const activeAccountStartingBalance = isSelectedEventAccount
    ? selectedEventEnrollment?.eventType === 'lightning-round'
      ? selectedEventEnrollment.startEquity ?? portfolioValue
      : selectedEventEnrollment?.startingBalance
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
  const eventArenaDeviceTokenRef = useRef('');
  const eventArenaDeviceSyncInFlightRef = useRef<Promise<void> | null>(null);
  const eventArenaDeviceRevisionRef = useRef(0);
  const eventArenaSourceInstallationIdRef = useRef('');
  const eventArenaDeviceSyncEnabledRef = useRef(false);
  const pushEventArenaSnapshotRef = useRef<(data: {
    accounts: PaperAccount[];
    positions: PaperPosition[];
    transactions: PaperTransaction[];
    orders: PaperOrder[];
    lots: PaperLot[];
    challengeStore: PaperChallengeStore;
  }) => Promise<void>>(async () => {});
  const accountValueSnapshotsRef = useRef<PaperAccountValueSnapshot[]>([]);
  const orderSubmissionRef = useRef(false);
  const tradeEntryCheckInFlightRef = useRef(false);
  const quoteRefreshCountRef = useRef(0);
  const quoteRefreshPromisesRef = useRef(new Map<string, Promise<Record<string, LiveQuote>>>());
  const quoteRefreshEvaluateRequestedRef = useRef(new Set<string>());
  const quoteRefreshIndicatorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (quoteRefreshIndicatorTimerRef.current) {
      clearTimeout(quoteRefreshIndicatorTimerRef.current);
      quoteRefreshIndicatorTimerRef.current = null;
    }
  }, []);
  const didFocusOnceRef = useRef(false);
  const lastDeviceSyncAtRef = useRef(0);
  const autoQuoteRefreshRef = useRef({ signature: '', refreshedAt: 0 });
  const initRef = useRef<(backgroundRefresh?: boolean, allowDeviceSync?: boolean) => Promise<void>>(async () => {});

  useEffect(() => {
    if (!lightningTradeOfferWindow) return;
    const timer = setInterval(() => setLightningTradeOfferNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [lightningTradeOfferWindow]);

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    AsyncStorage.getItem(PAPER_CHALLENGE_STORAGE_KEY).then((raw) => {
      if (cancelled) return;
      if (raw) {
        try {
          const saved = JSON.parse(raw) as PaperChallengeStore;
          const normalized = normalizePaperChallengeStore({
            enrollment: saved.enrollment ?? null,
            lightningEnrollment: saved.lightningEnrollment ?? null,
            history: Array.isArray(saved.history) ? saved.history : [],
          });
          paperChallengeRef.current = normalized;
          setPaperChallenge(normalized);
        } catch {
          paperChallengeRef.current = { enrollment: null, lightningEnrollment: null, history: [] };
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
    const currentIds = new Set(getPaperChallengeEnrollments(paperChallenge).map((item) => item.eventId));
    const completedId = [...previousEnrollmentIdsRef.current].find((eventId) =>
      !currentIds.has(eventId) && paperChallenge.history.some((event) => event.eventId === eventId),
    );
    if (completedId) {
      const summary = paperChallenge.history.find((event) => event.eventId === completedId);
      if (summary) setCompletedEventSummary(summary);
    }
    previousEnrollmentIdsRef.current = currentIds;
  }, [paperChallenge.enrollment?.eventId, paperChallenge.lightningEnrollment?.eventId, paperChallenge.history]);

  const savePaperChallenge = useCallback(async (
    update: (current: PaperChallengeStore) => PaperChallengeStore,
  ) => {
    const next = await updatePaperChallengeStore(update, {
      getItem: (key) => AsyncStorage.getItem(key),
      setItem: (key, value) => AsyncStorage.setItem(key, value),
    });
    paperChallengeRef.current = next;
    setPaperChallenge(next);
    if (eventArenaDeviceSyncEnabledRef.current) {
      void pushEventArenaSnapshotRef.current({
        accounts: accountsRef.current,
        positions: positionsRef.current,
        transactions: transactionsRef.current,
        orders: ordersRef.current,
        lots: lotsRef.current,
        challengeStore: next,
      });
    }
    return next;
  }, []);

  const retryPaperChallengeFinalization = useCallback(() => {
    if (!isPaperChallengeWaiting || challengeFinalizationBusy) return;
    challengeFinalizationFailureRef.current = null;
    setChallengeFinalizationError(false);
    setChallengeRetryVersion((version) => version + 1);
  }, [challengeFinalizationBusy, isPaperChallengeWaiting]);

  // ── Storage helpers ───────────────────────────────────────────────────────
  const pushEventArenaSnapshot = useCallback((data: {
    accounts: PaperAccount[];
    positions: PaperPosition[];
    transactions: PaperTransaction[];
    orders: PaperOrder[];
    lots: PaperLot[];
    challengeStore: PaperChallengeStore;
  }) => {
    if (!eventArenaDeviceSyncEnabledRef.current) return Promise.resolve();
    return syncEventArenaDeviceSnapshot(
      AsyncStorage,
      { ...data, activeId: activeIdRef.current },
      data.challengeStore,
      (snapshot, token, revision) => apiFetch<{ revision: number }>('/api/event-arena/device-sync', {
        method: 'PUT',
        headers: {
          'X-Event-Arena-Device-Token': token,
          'X-Event-Arena-Revision': String(revision),
        },
        body: JSON.stringify({ snapshot }),
      }),
    ).then((revision) => {
      if (revision !== null) eventArenaDeviceRevisionRef.current = revision;
      setDeviceTransferError('');
    }).catch(() => {
      setDeviceTransferError('This device saved your changes locally, but could not sync the shared Event Arena account.');
    });
  }, [apiFetch]);
  pushEventArenaSnapshotRef.current = pushEventArenaSnapshot;

  const flushCache = useCallback((
    accts: PaperAccount[], pos: PaperPosition[], txns: PaperTransaction[],
    ords: PaperOrder[], ls: PaperLot[], aid: string,
    options: { syncGeneralDeviceSnapshot?: boolean } = {},
  ): Promise<void> => {
    return (async () => {
      const syncGeneralDeviceSnapshot = options.syncGeneralDeviceSnapshot !== false;
      if (syncGeneralDeviceSnapshot && eventArenaDeviceSyncEnabledRef.current) {
        await AsyncStorage.setItem(EVENT_ARENA_DEVICE_DIRTY_KEY, 'true').catch(() => {
          setDeviceTransferError('Shared Event Arena changes may not sync until local storage is available.');
        });
      }
      await writePaperCache({ accounts: accts, positions: pos, transactions: txns, orders: ords, lots: ls, activeId: aid });
      if (syncGeneralDeviceSnapshot) {
        await pushEventArenaSnapshot({
          accounts: accts,
          positions: pos,
          transactions: txns,
          orders: ords,
          lots: ls,
          challengeStore: paperChallengeRef.current,
        });
      }
      const enrollment = paperChallengeRef.current.lightningEnrollment;
      if (!enrollment || !shouldSyncLightningRoundPreparation({
        enrollmentAccountId: enrollment.accountId,
        selectedAccountId: aid,
        eventStartAtMs: enrollment.eventStartAtMs,
        nowMs: Date.now(),
      })) return;
      const account = accts.find((item) => item.id === enrollment.accountId);
      if (!account) return;
      const installationId = await getEventArenaParticipantId(AsyncStorage, getInstallationId);
      try {
        await apiFetch(`/api/event-arena/lightning-round/${encodeURIComponent(enrollment.eventId)}/state`, {
          method: 'PUT',
          headers: { 'X-Event-Arena-Installation-Id': installationId },
          body: JSON.stringify({
            alias: enrollment.leaderboardAlias ?? enrollment.accountName,
            account,
            positions: pos.filter((item) => item.accountId === enrollment.accountId),
            transactions: txns.filter((item) => item.accountId === enrollment.accountId),
            orders: ords.filter((item) => item.accountId === enrollment.accountId),
            lots: ls.filter((item) => item.accountId === enrollment.accountId),
          }),
        });
        setLightningPreparationMessage('');
      } catch {
        setLightningPreparationMessage('Your account is saved on this device, but Lightning Round preparation could not sync.');
      }
    })();
  }, [apiFetch, pushEventArenaSnapshot]);

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

  useEffect(() => {
    const enrollment = paperChallenge.lightningEnrollment;
    if (
      !loaded
      || !isFocused
      || !paperChallengeReady
      || !enrollment
      || enrollment.accountId !== activeId
      || !isPaperChallengeAccountId(activeId)
      || challengeNow < enrollment.eventStartAtMs
    ) return;
    let cancelled = false;
    void (async () => {
      try {
        const installationId = await getEventArenaParticipantId(AsyncStorage, getInstallationId);
        const state = await apiFetch<{
          participant?: { status?: string; failureReason?: string | null };
          account?: PaperAccount | null;
          positions?: PaperPosition[];
          transactions?: PaperTransaction[];
          orders?: PaperOrder[];
          lots?: PaperLot[];
        }>(`/api/event-arena/lightning-round/${encodeURIComponent(enrollment.eventId)}/state`, {
          headers: { 'X-Event-Arena-Installation-Id': installationId },
        });
        if (cancelled || !state.account) return;
        const accountId = enrollment.accountId;
        const mergedAccounts = [
          ...accountsRef.current.filter((item) => item.id !== accountId),
          state.account,
        ];
        const mergedPositions = [
          ...positionsRef.current.filter((item) => item.accountId !== accountId),
          ...(state.positions ?? []),
        ];
        const mergedTransactions = [
          ...transactionsRef.current.filter((item) => item.accountId !== accountId),
          ...(state.transactions ?? []),
        ];
        const mergedOrders = [
          ...ordersRef.current.filter((item) => item.accountId !== accountId),
          ...(state.orders ?? []),
        ];
        const mergedLots = [
          ...lotsRef.current.filter((item) => item.accountId !== accountId),
          ...(state.lots ?? []),
        ];
        await saveAll(
          mergedAccounts,
          mergedPositions,
          mergedTransactions,
          mergedOrders,
          mergedLots,
          activeIdRef.current,
        );
        setLightningEntryFailure(
          state.participant?.status === 'rejected'
            ? state.participant.failureReason || 'No opening order filled, so you were not entered.'
            : '',
        );
      } catch {
        // Keep the locally saved account visible if the worker is temporarily unavailable.
      }
    })();
    return () => { cancelled = true; };
  }, [
    apiFetch,
    challengeNow,
    loaded,
    paperChallenge.lightningEnrollment?.eventId,
    paperChallenge.lightningEnrollment?.eventStartAtMs,
    paperChallenge.lightningEnrollment?.accountId,
    activeId,
    isFocused,
    paperChallengeReady,
    saveAll,
  ]);

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

  const createEventArenaTransferCode = useCallback(async () => {
    setDeviceTransferBusy(true);
    setDeviceTransferError('');
    try {
      const savedToken = eventArenaDeviceTokenRef.current
        || await AsyncStorage.getItem(EVENT_ARENA_DEVICE_TOKEN_KEY)
        || Crypto.randomUUID().replace(/-/g, '');
      await AsyncStorage.setItem(EVENT_ARENA_DEVICE_TOKEN_KEY, savedToken);
      eventArenaDeviceTokenRef.current = savedToken;
      const sourceInstallationId = await getEventArenaParticipantId(
        AsyncStorage,
        getInstallationId,
      );
      eventArenaSourceInstallationIdRef.current = sourceInstallationId;
      const snapshot = buildEventArenaDeviceSnapshot({
        accounts: accountsRef.current,
        positions: positionsRef.current,
        transactions: transactionsRef.current,
        orders: ordersRef.current,
        lots: lotsRef.current,
        activeId: activeIdRef.current,
      }, paperChallengeRef.current, sourceInstallationId);
      if (snapshot.accounts.length === 0) {
        throw new Error('Join an Event Arena event before transferring its account.');
      }
      const storedRevision = Number(await AsyncStorage.getItem(EVENT_ARENA_DEVICE_REVISION_KEY));
      if (Number.isInteger(storedRevision) && storedRevision > 0) {
        eventArenaDeviceRevisionRef.current = storedRevision;
      }
      const headers: Record<string, string> = {
        'X-Event-Arena-Device-Token': savedToken,
      };
      if (eventArenaDeviceRevisionRef.current > 0) {
        headers['X-Event-Arena-Revision'] = String(eventArenaDeviceRevisionRef.current);
      }
      const result = await apiFetch<{ code: string; expiresAt: string; revision: number }>(
        '/api/event-arena/device-pairing',
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ snapshot }),
        },
      );
      eventArenaDeviceRevisionRef.current = result.revision;
      eventArenaDeviceSyncEnabledRef.current = true;
      await Promise.all([
        AsyncStorage.setItem(EVENT_ARENA_DEVICE_REVISION_KEY, String(result.revision)),
        AsyncStorage.setItem(EVENT_ARENA_SOURCE_INSTALLATION_ID_KEY, sourceInstallationId),
        AsyncStorage.setItem(EVENT_ARENA_DEVICE_DIRTY_KEY, 'false'),
      ]);
      setDeviceTransferCode(result.code);
      setDeviceTransferMode('create');
    } catch (error) {
      setDeviceTransferError(error instanceof Error ? error.message : 'Could not create a transfer code.');
    } finally {
      setDeviceTransferBusy(false);
    }
  }, [apiFetch]);

  const createAllDataTransferCode = useCallback(async () => {
    setDeviceTransferBusy(true);
    setDeviceTransferError('');
    try {
      const bundle = await createDeviceTransferBundle(AsyncStorage, Crypto.randomUUID());
      const eventArenaToken = await AsyncStorage.getItem(EVENT_ARENA_DEVICE_TOKEN_KEY);
      const result = await createDeviceTransfer({ bundle }, eventArenaToken
        ? { headers: { 'X-Event-Arena-Device-Token': eventArenaToken } }
        : undefined);
      setDeviceTransferCode(result.code);
      setDeviceTransferMode('create');
    } catch (error) {
      setDeviceTransferError(error instanceof Error ? error.message : 'Could not create a saved-data transfer code.');
    } finally {
      setDeviceTransferBusy(false);
    }
  }, []);

  const restoreLegacyEventArenaTransfer = useCallback(async () => {
    const code = deviceTransferCodeInput.trim();
    if (!code) {
      setDeviceTransferError('Enter the transfer code from your other device.');
      return;
    }
    setDeviceTransferBusy(true);
    setDeviceTransferError('');
    try {
      const deviceToken = eventArenaDeviceTokenRef.current
        || await AsyncStorage.getItem(EVENT_ARENA_DEVICE_TOKEN_KEY)
        || Crypto.randomUUID().replace(/-/g, '');
      await AsyncStorage.setItem(EVENT_ARENA_DEVICE_TOKEN_KEY, deviceToken);
      const restored = await apiFetch<EventArenaDeviceSyncResponse>('/api/event-arena/device-pairing/redeem', {
        method: 'POST',
        body: JSON.stringify({ code, deviceToken }),
      });
      const merged = mergeEventArenaDeviceSnapshot({
        accounts: accountsRef.current,
        positions: positionsRef.current,
        transactions: transactionsRef.current,
        orders: ordersRef.current,
        lots: lotsRef.current,
        activeId: activeIdRef.current,
      }, paperChallengeRef.current, restored.snapshot, { protectConflicts: true });
      const activeEventAccount = restored.snapshot.challengeStore.lightningEnrollment?.accountId
        ?? restored.snapshot.challengeStore.enrollment?.accountId
        ?? restored.snapshot.accounts[0]?.id
        ?? merged.cache.activeId;
      const nextCache = { ...merged.cache, activeId: activeEventAccount };
      const nextChallengeStore = await updatePaperChallengeStore(() => merged.challengeStore, {
        getItem: (key) => AsyncStorage.getItem(key),
        setItem: (key, value) => AsyncStorage.setItem(key, value),
      });
      paperChallengeRef.current = nextChallengeStore;
      setPaperChallenge(nextChallengeStore);
      eventArenaDeviceTokenRef.current = deviceToken;
      eventArenaDeviceRevisionRef.current = restored.revision;
      eventArenaSourceInstallationIdRef.current = restored.snapshot.sourceInstallationId;
      eventArenaDeviceSyncEnabledRef.current = true;
      await Promise.all([
        AsyncStorage.setItem(EVENT_ARENA_DEVICE_REVISION_KEY, String(restored.revision)),
        AsyncStorage.setItem(EVENT_ARENA_SOURCE_INSTALLATION_ID_KEY, restored.snapshot.sourceInstallationId),
        AsyncStorage.setItem(EVENT_ARENA_DEVICE_DIRTY_KEY, 'false'),
      ]);
      await saveAll(
        nextCache.accounts,
        nextCache.positions,
        nextCache.transactions,
        nextCache.orders,
        nextCache.lots,
        nextCache.activeId,
      );
      setDeviceTransferCodeInput('');
      setDeviceTransferMode(null);
      setShowAccountManagement(false);
    } catch (error) {
      setDeviceTransferError(error instanceof Error ? error.message : 'Could not restore the Event Arena account.');
    } finally {
      setDeviceTransferBusy(false);
    }
  }, [apiFetch, deviceTransferCodeInput, saveAll]);

  const applyAndFinishDeviceTransfer = useCallback(async (
    bundle: NonNullable<DeviceTransferPreview['bundle']>,
    choice: 'keep-destination' | 'replace-conflicts' | null,
    eventArenaSync: { sourceInstallationId: string; revision: number } | null,
    restoreCode: string,
    reviewedPreview?: DeviceTransferPreview,
  ) => {
    let bundleToApply = bundle;
    let alertOverride: DeviceTransferCategoryResult | null = null;
    const alertCategory = bundle.categories.find((category) => category.id === 'price-alerts');
    const rawAlerts = alertCategory?.data['@stocksense/price_alerts_v1'];
    if (rawAlerts) {
      const localPreview = await preflightDeviceTransfer(AsyncStorage, bundle);
      if (reviewedPreview && hasDeviceTransferDestinationChanged(reviewedPreview, localPreview)) {
        setDeviceTransferPreview(localPreview);
        setDeviceTransferMode('review');
        setDeviceTransferError('Saved data changed on this phone. Review the updated conflict list before continuing.');
        return;
      }
      const alertPreview = localPreview.categories.find((category) => category.id === 'price-alerts');
      const keepingLocalAlerts = alertPreview?.status === 'conflict' && choice === 'keep-destination';
      const replaceExistingAlerts = alertPreview?.status === 'conflict' && choice === 'replace-conflicts';
      const sourceAlerts = JSON.parse(rawAlerts) as unknown[];
      if (!keepingLocalAlerts && (sourceAlerts.length > 0 || replaceExistingAlerts)) {
        try {
          let destinationPushToken = currentPushToken;
          if (sourceAlerts.length > 0 && !destinationPushToken) {
            destinationPushToken = await requestPermissionAndGetToken();
          }
          if (sourceAlerts.length > 0 && !destinationPushToken) {
            bundleToApply = replaceDeviceTransferCategoryData(bundle, 'price-alerts', {});
            alertOverride = {
              id: 'price-alerts',
              label: 'Price alert rules',
              status: 'skipped',
              reason: 'Price alerts were not copied because this phone did not register notification access.',
            };
          } else {
            const destinationToken = await AsyncStorage.getItem(DEVICE_TRANSFER_DESTINATION_KEY);
            if (!destinationToken) throw new Error('This phone is not linked to the transfer code.');
            const restoredAlerts = await restoreDeviceTransferAlerts({
              code: restoreCode,
              destinationToken,
              installationId: await getInstallationId(),
              ...(destinationPushToken ? { pushToken: destinationPushToken } : {}),
              replaceExisting: replaceExistingAlerts,
            });
            bundleToApply = replaceDeviceTransferCategoryData(bundle, 'price-alerts', {
              '@stocksense/price_alerts_v1': JSON.stringify(restoredAlerts.alerts),
            });
          }
        } catch (error) {
          bundleToApply = replaceDeviceTransferCategoryData(bundle, 'price-alerts', {});
          alertOverride = {
            id: 'price-alerts',
            label: 'Price alert rules',
            status: 'failed',
            reason: error instanceof Error
              ? `Price alerts were not copied: ${error.message}`
              : 'Price alerts could not be registered on this phone.',
          };
        }
      }
    }

    const applied = await applyDeviceTransfer(AsyncStorage, bundleToApply, choice, reviewedPreview);
    if (applied.needsReview) {
      setDeviceTransferPreview(applied.preview);
      setDeviceTransferMode('review');
      setDeviceTransferError('Saved data changed on this phone. Review the updated conflict list before continuing.');
      return;
    }
    const results = alertOverride
      ? applied.results.map((result) => result.id === alertOverride!.id ? alertOverride! : result)
      : applied.results;
    if (results.some((result) => result.status === 'failed')) {
      setDeviceTransferResults(results);
      setDeviceTransferMode('result');
      return;
    }

    const eventArenaResult = results.find((result) => result.id === 'paper-and-event-arena');
    const eventArenaSourceData = bundle.categories.find((category) => category.id === 'paper-and-event-arena')
      ?.data['@stocksense/paper_v2'];
    if (eventArenaSync && eventArenaSourceData
      && eventArenaResult?.status !== 'skipped' && eventArenaResult?.status !== 'failed') {
      const destinationToken = await AsyncStorage.getItem(DEVICE_TRANSFER_DESTINATION_KEY);
      if (destinationToken) {
        eventArenaDeviceTokenRef.current = destinationToken;
        eventArenaDeviceRevisionRef.current = eventArenaSync.revision;
        eventArenaSourceInstallationIdRef.current = eventArenaSync.sourceInstallationId;
        eventArenaDeviceSyncEnabledRef.current = true;
        await Promise.all([
          AsyncStorage.setItem(EVENT_ARENA_DEVICE_TOKEN_KEY, destinationToken),
          AsyncStorage.setItem(EVENT_ARENA_DEVICE_REVISION_KEY, String(eventArenaSync.revision)),
          AsyncStorage.setItem(EVENT_ARENA_SOURCE_INSTALLATION_ID_KEY, eventArenaSync.sourceInstallationId),
          AsyncStorage.setItem(EVENT_ARENA_DEVICE_DIRTY_KEY, 'true'),
        ]);
      }
    }

    const nextChallengeStore = await loadPaperChallengeStore({
      getItem: (key) => AsyncStorage.getItem(key),
    });
    paperChallengeRef.current = nextChallengeStore;
    setPaperChallenge(nextChallengeStore);
    setPaperChallengeReady(true);

    const rawPaperCache = await AsyncStorage.getItem(PAPER_CACHE_KEY);
    if (rawPaperCache) {
      const restoredCache = JSON.parse(rawPaperCache) as PaperCache;
      await saveAll(
        restoredCache.accounts ?? [],
        restoredCache.positions ?? [],
        restoredCache.transactions ?? [],
        restoredCache.orders ?? [],
        restoredCache.lots ?? [],
        restoredCache.activeId ?? '',
      );
    }
    const destinationToken = await AsyncStorage.getItem(DEVICE_TRANSFER_DESTINATION_KEY);
    if (!destinationToken) {
      throw new Error('Saved data is on this phone, but restore confirmation is pending. Re-enter the same transfer code to safely retry.');
    }
    const categoryResults = bundle.categories.map((category) => {
      const result = results.find((item) => item.id === category.id);
      if (!result || result.status === 'failed') {
        throw new Error('Saved data is on this phone, but restore confirmation is pending. Re-enter the same transfer code to safely retry.');
      }
      return { id: category.id, status: result.status };
    });
    try {
      await completeDeviceTransfer({
        code: restoreCode,
        destinationToken,
        bundleId: bundle.bundleId,
        categoryResults,
      });
    } catch (error) {
      const detail = error instanceof Error ? ` ${error.message}` : '';
      throw new Error(`Saved data is on this phone, but the server has not confirmed the restore. Re-enter the same transfer code to safely retry.${detail}`);
    }
    setDeviceTransferResults(results);
    setDeviceTransferPreview(null);
    setDeviceTransferMode('result');
    setDeviceTransferRestoreCode('');
  }, [currentPushToken, requestPermissionAndGetToken, saveAll]);

  const restoreAllDataTransfer = useCallback(async () => {
    const code = deviceTransferCodeInput.trim();
    if (!code) {
      setDeviceTransferError('Enter the transfer code from your other phone.');
      return;
    }
    setDeviceTransferBusy(true);
    setDeviceTransferError('');
    setDeviceTransferPreview(null);
    setDeviceTransferResults([]);
    try {
      // Derive the retry credential from the high-entropy transfer code so
      // reinstalling the app does not lose the server-side restore session.
      const destinationToken = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        `meisner-device-transfer:${code}`,
      );
      await AsyncStorage.setItem(DEVICE_TRANSFER_DESTINATION_KEY, destinationToken);
      const response = await redeemDeviceTransfer({ code, destinationToken });
      const receivedHash = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        stableDeviceTransferJson(response.bundle),
      );
      if (receivedHash !== response.bundleSha256) {
        throw new Error('The saved-data backup failed its integrity check. No data was restored.');
      }
      setDeviceTransferRestoreCode(code);
      const preview = await preflightDeviceTransfer(AsyncStorage, response.bundle);
      setDeviceTransferPreview(preview);
      setDeviceTransferEventArenaSync(response.eventArenaSync ?? null);
      if (preview.categories.some((category) => category.status === 'conflict')) {
        setDeviceTransferMode('review');
      } else {
        await applyAndFinishDeviceTransfer(preview.bundle, null, response.eventArenaSync ?? null, code, preview);
      }
      setDeviceTransferCodeInput('');
    } catch (error) {
      const status = (error as { status?: number; response?: { status?: number } })?.status
        ?? (error as { response?: { status?: number } })?.response?.status;
      if (status === 404) {
        setDeviceTransferBusy(false);
        await restoreLegacyEventArenaTransfer();
        return;
      }
      setDeviceTransferError(error instanceof Error ? error.message : 'Could not restore the saved data.');
    } finally {
      setDeviceTransferBusy(false);
    }
  }, [applyAndFinishDeviceTransfer, deviceTransferCodeInput, restoreLegacyEventArenaTransfer]);

  const confirmAllDataTransfer = useCallback(async (choice: 'keep-destination' | 'replace-conflicts') => {
    if (!deviceTransferPreview) return;
    setDeviceTransferBusy(true);
    setDeviceTransferError('');
    try {
      await applyAndFinishDeviceTransfer(
        deviceTransferPreview.bundle,
        choice,
        deviceTransferEventArenaSync,
        deviceTransferRestoreCode,
        deviceTransferPreview,
      );
    } catch (error) {
      setDeviceTransferError(error instanceof Error ? error.message : 'Could not finish restoring the saved data.');
    } finally {
      setDeviceTransferBusy(false);
    }
  }, [applyAndFinishDeviceTransfer, deviceTransferEventArenaSync, deviceTransferPreview, deviceTransferRestoreCode]);

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
    if (!loaded || !isFocused || !paperChallengeReady) return;
    const enrollments = getPaperChallengeEnrollments(paperChallenge);
    if (enrollments.length === 0) return;
    const prematureSelected = enrollments.some((enrollment) =>
      enrollment.eventType !== 'lightning-round'
      &&
      enrollment.startEquity === null
      && challengeNow < enrollment.eventStartAtMs
      && activeIdRef.current === enrollment.accountId,
    );
    if (prematureSelected) {
      const fallbackAccount = accountsRef.current.find((item) => !isPaperChallengeAccountId(item.id));
      if (fallbackAccount) {
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
    const started = enrollments.filter((enrollment) => shouldEnsurePaperChallengeAccount(enrollment, challengeNow));
    let nextState = {
      accounts: accountsRef.current,
      positions: positionsRef.current,
      transactions: transactionsRef.current,
      orders: ordersRef.current,
      lots: lotsRef.current,
    };
    const newlyCreated: string[] = [];
    for (const enrollment of started) {
      if (nextState.accounts.some((item) => item.id === enrollment.accountId)) continue;
      nextState = ensurePaperChallengeAccount(enrollment, nextState);
      newlyCreated.push(enrollment.accountId);
    }
    if (newlyCreated.length > 0) {
      void saveAll(
        nextState.accounts,
        nextState.positions,
        nextState.transactions,
        nextState.orders,
        nextState.lots,
        newlyCreated[0] ?? activeIdRef.current,
      );
    }
  }, [
    challengeNow,
    isFocused,
    loaded,
    paperChallenge.enrollment,
    paperChallenge.lightningEnrollment,
    paperChallengeReady,
    saveAll,
  ]);

  // ── Init ─────────────────────────────────────────────────────────────────
  const init = useCallback(async (backgroundRefresh = false, allowDeviceSync = true) => {
    setErrorMsg('');
    if (!backgroundRefresh) setLoaded(false);
    if (allowDeviceSync) lastDeviceSyncAtRef.current = Date.now();
    if (backgroundRefresh) {
      await paperCacheWriteQueue.catch(() => {});
    }
    const selectedBeforeRefresh = activeIdRef.current;

    // Paper trading is guest-local: load the exact state used by order
    // execution and never replace it with an unauthenticated server response.
    const [
      cached,
      rawSnapshots,
      rawQuotes,
      storedDeviceToken,
      rawRevision,
      storedSourceInstallationId,
      initialDirty,
    ] = await Promise.all([
      readPaperCache(),
      AsyncStorage.getItem(PAPER_VALUE_SNAPSHOT_KEY).catch(() => null),
      AsyncStorage.getItem(PAPER_QUOTE_CACHE_KEY).catch(() => null),
      AsyncStorage.getItem(EVENT_ARENA_DEVICE_TOKEN_KEY).catch(() => null),
      AsyncStorage.getItem(EVENT_ARENA_DEVICE_REVISION_KEY).catch(() => '0'),
      AsyncStorage.getItem(EVENT_ARENA_SOURCE_INSTALLATION_ID_KEY).catch(() => null),
      AsyncStorage.getItem(EVENT_ARENA_DEVICE_DIRTY_KEY).catch(() => null),
    ]);
    const cachedQuotes = parsePaperQuoteCache(rawQuotes);
    setQuotes(mergePaperPreloadQuotes(cachedQuotes).quotes);
    let savedSnapshots: PaperAccountValueSnapshot[] | null = null;
    try {
      if (rawSnapshots !== null) {
        savedSnapshots = parseAccountValueSnapshots(JSON.parse(rawSnapshots));
      } else if (!backgroundRefresh) {
        savedSnapshots = [];
      }
    } catch {
      // A damaged chart-history record must not block account and trade recovery.
    }
    if (savedSnapshots) {
      accountValueSnapshotsRef.current = savedSnapshots;
      setAccountValueSnapshots(savedSnapshots);
    }
    if (cached && cached.accounts.length > 0) {
      const preferredActiveId = backgroundRefresh
        && cached.accounts.some((item) => item.id === selectedBeforeRefresh)
        ? selectedBeforeRefresh
        : cached.activeId;
      const cachedActiveId = cached.accounts.some((item) => item.id === preferredActiveId)
        ? preferredActiveId
        : cached.accounts[0].id;
      accountsRef.current = cached.accounts;
      positionsRef.current = cached.positions;
      transactionsRef.current = cached.transactions;
      ordersRef.current = cached.orders ?? [];
      lotsRef.current = cached.lots ?? [];
      activeIdRef.current = cachedActiveId;
      setAccounts(cached.accounts);
      setPositions(cached.positions);
      setTransactions(cached.transactions);
      setOrders(cached.orders ?? []);
      setLots(cached.lots ?? []);
      setActiveId(cachedActiveId);
    }
    else if (!backgroundRefresh) {
      const localAccounts = createDefaultPaperCache().accounts;
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
    }

    // Render from the device cache first. Shared Event Arena reconciliation is
    // best-effort and must not hold the whole Paper Trading screen behind a
    // network request.
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
    const id = activeIdRef.current || settledAccounts[0]?.id || '';
    accountsRef.current = settledAccounts;
    transactionsRef.current = finalTxns;
    activeIdRef.current = id;
    setAccounts(settledAccounts);
    setTransactions(finalTxns);
    setActiveId(id);
    const settledCache: PaperCache = {
      accounts: settledAccounts,
      positions: currentPositions,
      transactions: finalTxns,
      orders: ordersRef.current,
      lots: lotsRef.current,
      activeId: id,
    };
    void writePaperCache(settledCache);
    const initialActiveId = id;
    const savedDeviceToken = storedDeviceToken || eventArenaDeviceTokenRef.current;
    if (savedDeviceToken) {
      eventArenaDeviceTokenRef.current = savedDeviceToken;
      const parsedRevision = rawRevision === null ? Number.NaN : Number(rawRevision);
      eventArenaDeviceRevisionRef.current = Number.isInteger(parsedRevision) && parsedRevision >= 0
        ? parsedRevision
        : backgroundRefresh
          ? eventArenaDeviceRevisionRef.current
          : 0;
      if (storedSourceInstallationId) {
        eventArenaSourceInstallationIdRef.current = storedSourceInstallationId;
      }
      // Enable local saves to mark the shared snapshot dirty before the screen
      // becomes interactive; the actual network reconciliation stays async.
      eventArenaDeviceSyncEnabledRef.current = true;
    }
    setErrorMsg('');
    setLoaded(true);

    if (
      (allowDeviceSync || initialDirty === 'true')
      && !eventArenaDeviceSyncInFlightRef.current
    ) {
      const syncPromise = (async () => {
      try {
        if (!savedDeviceToken) return;

        eventArenaSourceInstallationIdRef.current = storedSourceInstallationId
          ?? eventArenaSourceInstallationIdRef.current
          ?? await getInstallationId();

        const currentDirty = await AsyncStorage.getItem(EVENT_ARENA_DEVICE_DIRTY_KEY)
          .catch(() => initialDirty);
        if (currentDirty === 'true') {
          await pushEventArenaSnapshot({
            accounts: accountsRef.current,
            positions: positionsRef.current,
            transactions: transactionsRef.current,
            orders: ordersRef.current,
            lots: lotsRef.current,
            challengeStore: paperChallengeRef.current,
          });
          return;
        }

        const remote = await apiFetch<EventArenaDeviceSyncResponse>('/api/event-arena/device-sync', {
          headers: { 'X-Event-Arena-Device-Token': savedDeviceToken },
        });
        // A local trade made while the fetch was in flight owns the newer
        // account state; its save path will push that state to the server.
        if (await AsyncStorage.getItem(EVENT_ARENA_DEVICE_DIRTY_KEY).catch(() => null) === 'true') return;

        const mergeResult: { current: ReturnType<typeof mergeEventArenaDeviceSnapshot> | null } = {
          current: null,
        };
        const challengeStore = await updatePaperChallengeStore((currentChallengeStore) => {
          mergeResult.current = mergeEventArenaDeviceSnapshot({
            accounts: accountsRef.current,
            positions: positionsRef.current,
            transactions: transactionsRef.current,
            orders: ordersRef.current,
            lots: lotsRef.current,
            activeId: activeIdRef.current,
          }, currentChallengeStore, remote.snapshot);
          return mergeResult.current.challengeStore;
        }, {
          getItem: (key) => AsyncStorage.getItem(key),
          setItem: (key, value) => AsyncStorage.setItem(key, value),
        });
        const merged = mergeResult.current;
        if (!merged) return;
        // Recheck after the asynchronous challenge-store write before applying
        // the account snapshot, so a concurrent local trade is never replaced.
        if (await AsyncStorage.getItem(EVENT_ARENA_DEVICE_DIRTY_KEY).catch(() => null) === 'true') return;

        const hadLocalEventAccount = (cached?.accounts ?? []).some((item) => isPaperChallengeAccountId(item.id));
        const restoredEventAccountId = remote.snapshot.challengeStore.lightningEnrollment?.accountId
          ?? remote.snapshot.challengeStore.enrollment?.accountId
          ?? remote.snapshot.accounts[0]?.id;
        const userChangedAccount = activeIdRef.current !== initialActiveId;
        const savedSelectionStillExists = backgroundRefresh
          && merged.cache.accounts.some((item) => item.id === initialActiveId);
        const nextActiveId = savedSelectionStillExists || hadLocalEventAccount || userChangedAccount
          ? activeIdRef.current
          : restoredEventAccountId ?? merged.cache.activeId;

        // Apply cash settlement/dividend credits to any event account restored
        // from the server, just as the synchronous startup path did before.
        const eventAccountIds = new Set(merged.cache.accounts
          .filter((item) => isPaperChallengeAccountId(item.id))
          .map((item) => item.id));
        let restoredAccounts = merged.cache.accounts;
        const restoredTransactions = [...merged.cache.transactions];
        const syncNowISO = new Date().toISOString();
        for (const restoredAccount of merged.cache.accounts) {
          if (!eventAccountIds.has(restoredAccount.id)) continue;
          const settled = settleCash(restoredAccount, syncNowISO).updated;
          const accountPositions = merged.cache.positions.filter((item) => item.accountId === restoredAccount.id);
          const credited = creditDividends(accountPositions, settled, {}, syncNowISO, uid);
          restoredAccounts = restoredAccounts.map((item) =>
            item.id === credited.updatedAccount.id ? credited.updatedAccount : item,
          );
          restoredTransactions.push(...credited.newTransactions);
        }
        const restoredCache: PaperCache = {
          ...merged.cache,
          accounts: restoredAccounts,
          transactions: restoredTransactions,
          activeId: nextActiveId,
        };

        accountsRef.current = restoredCache.accounts;
        positionsRef.current = restoredCache.positions;
        transactionsRef.current = restoredCache.transactions;
        ordersRef.current = restoredCache.orders;
        lotsRef.current = restoredCache.lots;
        activeIdRef.current = restoredCache.activeId;
        paperChallengeRef.current = challengeStore;
        setAccounts(restoredCache.accounts);
        setPositions(restoredCache.positions);
        setTransactions(restoredCache.transactions);
        setOrders(restoredCache.orders);
        setLots(restoredCache.lots);
        setActiveId(restoredCache.activeId);
        setPaperChallenge(challengeStore);
        eventArenaDeviceRevisionRef.current = remote.revision;
        eventArenaSourceInstallationIdRef.current = remote.snapshot.sourceInstallationId;
        await Promise.all([
          writePaperCache(restoredCache),
          AsyncStorage.setItem(EVENT_ARENA_DEVICE_REVISION_KEY, String(remote.revision)),
          AsyncStorage.setItem(EVENT_ARENA_SOURCE_INSTALLATION_ID_KEY, remote.snapshot.sourceInstallationId),
        ]);
        setDeviceTransferError('');
        await pushEventArenaSnapshot({
          accounts: restoredCache.accounts,
          positions: restoredCache.positions,
          transactions: restoredCache.transactions,
          orders: restoredCache.orders,
          lots: restoredCache.lots,
          challengeStore,
        });
      } catch {
        setDeviceTransferError(
          'The shared Event Arena account could not be refreshed. Existing local data was left unchanged.',
        );
      }
      })();
      eventArenaDeviceSyncInFlightRef.current = syncPromise;
      void syncPromise.finally(() => {
        if (eventArenaDeviceSyncInFlightRef.current === syncPromise) {
          eventArenaDeviceSyncInFlightRef.current = null;
        }
      });
    }
  }, [apiFetch, pushEventArenaSnapshot]);

  useEffect(() => {
    if (paperChallengeReady) void init();
  }, [init, paperChallengeReady]);
  initRef.current = init;

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
      const eventEnrollment = getPaperChallengeEnrollmentForAccount(
        paperChallengeRef.current,
        order.accountId,
      );
      const stagedLightningEnrollment = paperChallengeRef.current.lightningEnrollment;
      const isStagedLightningOrder = isLightningRoundStagedOrder(order);
      const matchingLightningEnrollment = isStagedLightningOrder
        && stagedLightningEnrollment?.eventId === order.lightningRoundEventId
        && stagedLightningEnrollment?.accountId === order.accountId
        ? stagedLightningEnrollment
        : null;
      const eventPurchaseLimit = matchingLightningEnrollment
        ? undefined
        : eventEnrollment?.purchaseLimit
          ?? (eventEnrollment?.eventType === 'penny-stock-mayhem' ? 20 : undefined);
      if (isStagedLightningOrder) {
        if (!matchingLightningEnrollment) continue;
        if (Date.now() >= matchingLightningEnrollment.eventEndAtMs) continue;
        if (!canExecuteLightningRoundStagedOrder(order, matchingLightningEnrollment, Date.now())) {
          // The server worker, not this foreground loop, owns staged fills.
          continue;
        }
        // Avoid a second foreground fill after the server has started processing.
        continue;
      }
      if (
        (
          paperChallengeRef.current.history.some((event) => event.accountId === order.accountId)
          && !isStagedLightningOrder
          && paperChallengeRef.current.lightningEnrollment?.accountId !== order.accountId
        )
        || (!isStagedLightningOrder
          && eventEnrollment?.accountId === order.accountId
          && Date.now() >= eventEnrollment.eventEndAtMs)
      ) {
        updatedOrders = updatedOrders.map((item) =>
          item.id === order.id ? { ...item, status: 'cancelled' as const } : item,
        );
        ordersChanged = true;
        continue;
      }
      const q = newQuotes[order.symbol];
      if (!q) continue;
      if (!canEvaluatePendingOrderQuote(order, q)) continue;
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
      const purchaseLimitRejection = getPurchaseLimitRejectionReason({
        order,
        executionQuotePrice: q.price,
        fillPrice,
        maxPurchasePrice: eventPurchaseLimit,
      });
      if (purchaseLimitRejection) {
        console.warn('[paper] order fill rejected:', order.id, purchaseLimitRejection);
        updatedOrders = updatedOrders.map(item =>
          item.id === order.id
            ? { ...item, status: 'cancelled' as const, rejectionReason: purchaseLimitRejection }
            : item,
        );
        ordersChanged = true;
        continue;
      }
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
          item.id === order.id
            ? { ...item, status: 'cancelled' as const, rejectionReason: executionRiskError }
            : item,
        );
        ordersChanged = true;
        continue;
      }

      const fillResult = fillOrder({
        order,
        fillPrice,
        executionQuotePrice: q.price,
        maxPurchasePrice: eventPurchaseLimit,
        oneStockChallenge: eventEnrollment?.eventType === 'one-stock-challenge',
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
          o.id === order.id
            ? { ...o, status: 'cancelled' as const, rejectionReason: fillResult.reason }
            : o,
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
      if (!isPaperChallengeAccountId(order.accountId)) {
        paperOrderFillHapticNotifierRef.current?.({
          orderId: order.id,
          previousStatus: order.status,
          status: 'filled',
        });
      }
      paperOrderFillAlertNotifierRef.current?.({
        orderId: order.id,
        symbol: order.symbol,
        shares: order.shares,
        previousStatus: order.status,
        status: 'filled',
        isEventAccount: isPaperChallengeAccountId(order.accountId),
        isLightningRoundOrder: isLightningRoundStagedOrder(order) || Boolean(order.lightningRoundEventId),
      });
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
  const fetchQuotes = useCallback((
    pos: PaperPosition[],
    accountId: string,
    evaluateOrders = true,
    forceRefresh = false,
  ): Promise<Record<string, LiveQuote>> => {
    if (evaluateOrders) quoteRefreshEvaluateRequestedRef.current.add(accountId);
    const inFlight = quoteRefreshPromisesRef.current.get(accountId);
    if (inFlight) return inFlight;

    const refresh = async () => {
      // Fetch quotes for positions of the active account PLUS any pending-order symbols.
      const posSymbols = pos.filter(p => p.accountId === accountId).map(p => p.symbol);
      const orderSymbols = ordersRef.current
        .filter(o => o.accountId === accountId && o.status === 'pending')
        .map(o => o.symbol);
      const symbols = [...new Set([...posSymbols, ...orderSymbols])];
      if (symbols.length === 0) {
        await recordAccountValueSnapshot(accountId, {});
        return {};
      }
      quoteRefreshCountRef.current += 1;
      if (!quoteRefreshIndicatorTimerRef.current) {
        quoteRefreshIndicatorTimerRef.current = setTimeout(() => {
          quoteRefreshIndicatorTimerRef.current = null;
          if (quoteRefreshCountRef.current > 0) setLoadingQuotes(true);
        }, 500);
      }
      try {
        const results = await Promise.allSettled(
          symbols.map(async sym => {
            const quote = await requestPaperPreloadQuote(sym, forceRefresh);
            const shared = mergePaperPreloadQuotes({ [sym]: quote });
            setQuotes(shared.quotes);
            return { sym, quote };
          }),
        );
        const next: Record<string, LiveQuote> = {};
        for (const r of results) {
          if (r.status === 'fulfilled') next[r.value.sym] = r.value.quote;
        }
        void persistPaperPreloadQuotes(AsyncStorage, getPaperPortfolioPreloadState().quotes);
        if (quoteRefreshEvaluateRequestedRef.current.has(accountId)) {
          evaluatePendingOrders(next);
        }
        await recordAccountValueSnapshot(accountId, next);
        return next;
      } finally {
        quoteRefreshEvaluateRequestedRef.current.delete(accountId);
        quoteRefreshCountRef.current = Math.max(0, quoteRefreshCountRef.current - 1);
        if (quoteRefreshCountRef.current === 0) {
          if (quoteRefreshIndicatorTimerRef.current) {
            clearTimeout(quoteRefreshIndicatorTimerRef.current);
            quoteRefreshIndicatorTimerRef.current = null;
          }
          setLoadingQuotes(false);
        }
      }
    };

    const promise = refresh();
    quoteRefreshPromisesRef.current.set(accountId, promise);
    void promise.finally(() => {
      if (quoteRefreshPromisesRef.current.get(accountId) === promise) {
        quoteRefreshPromisesRef.current.delete(accountId);
      }
    }).catch(() => {});
    return promise;
  }, [evaluatePendingOrders, recordAccountValueSnapshot]);

  // Keep the selector's equity cards current without evaluating orders from
  // accounts that are not active in the trading workspace.
  const fetchInactiveAccountCardQuotes = useCallback(async (forceRefresh = false) => {
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
      const quote = await requestPaperPreloadQuote(symbol, forceRefresh);
      const shared = mergePaperPreloadQuotes({ [symbol]: quote });
      setQuotes(shared.quotes);
      return [symbol, quote] as const;
    }));
    void persistPaperPreloadQuotes(AsyncStorage, getPaperPortfolioPreloadState().quotes);
    const next: Record<string, LiveQuote> = {};
    for (const result of results) {
      if (result.status === 'fulfilled') next[result.value[0]] = result.value[1];
    }
    for (const inactiveAccount of inactiveAccounts) {
      void recordAccountValueSnapshot(inactiveAccount.id, next);
    }
  }, [accounts, activeId, positions, recordAccountValueSnapshot]);

  useEffect(() => {
    if (!loaded || !isFocused) return;
    let appIsActive = AppState.currentState === 'active';
    const refresh = (forceRefresh = false) => {
      if (appIsActive) void fetchInactiveAccountCardQuotes(forceRefresh).catch(() => {});
    };
    refresh();
    const timer = setInterval(() => refresh(), PAPER_QUOTE_REFRESH_INTERVAL_MS);
    const subscription = AppState.addEventListener('change', (state) => {
      const resumed = !appIsActive && state === 'active';
      appIsActive = state === 'active';
      if (resumed) refresh(true);
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [fetchInactiveAccountCardQuotes, isFocused, loaded]);

  useEffect(() => {
    const enrollment = getPaperChallengeEnrollments(paperChallenge).find((item) =>
      item.startEquity !== null && challengeNow >= item.eventEndAtMs,
    );
    if (
      !paperChallengeReady
      || !loaded
      || !isFocused
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
      const isLightningRound = enrollment.eventType === 'lightning-round';
      const eventTransactions = transactionsRef.current.filter((transaction) =>
        transaction.accountId === enrollment.accountId
          && transaction.lightningRoundEventId === enrollment.eventId,
      );
      const eventOnlyPositions = isLightningRound
        ? getLightningRoundEventPortfolio(
          eventTransactions,
          enrollment.eventId,
          enrollment.accountId,
          {},
          LIGHTNING_ROUND_STARTING_BALANCE,
        )
          .positions.map((position) => ({
            id: `${enrollment.eventId}:${position.symbol}`,
            accountId: enrollment.accountId,
            symbol: position.symbol,
            companyName: position.companyName,
            shares: position.shares,
            positionType: 'long' as const,
            avgCost: position.avgCost,
            openedAt: new Date(enrollment.eventStartAtMs).toISOString(),
            dividendYield: 0,
            sector: '',
          }))
        : positionsRef.current.filter((position) => position.accountId === enrollment.accountId);
      const eventPositions = eventOnlyPositions;
      const freshQuotes = await fetchQuotes(eventPositions, enrollment.accountId, false);
      if (getMissingPaperChallengeQuoteSymbols(eventPositions, freshQuotes).length > 0) {
        throw new Error('Current event quotes are unavailable.');
      }
      const eventPortfolio = isLightningRound
        ? getLightningRoundEventPortfolio(
          eventTransactions,
          enrollment.eventId,
          enrollment.accountId,
          Object.fromEntries(Object.entries(freshQuotes).map(([symbol, quote]) => [symbol, quote.price])),
          LIGHTNING_ROUND_STARTING_BALANCE,
        )
        : null;

      const pendingEventOrders = ordersRef.current.filter((order) =>
        order.accountId === enrollment.accountId
        && order.status === 'pending'
        && (enrollment.eventType !== 'lightning-round'
          || order.lightningRoundEventId === enrollment.eventId)
        && !(paperChallengeRef.current.lightningEnrollment?.accountId === enrollment.accountId
          && isLightningRoundStagedOrder(order, paperChallengeRef.current.lightningEnrollment.eventId)),
      );
      if (pendingEventOrders.length > 0) {
        const pendingIds = new Set(pendingEventOrders.map((order) => order.id));
        await saveOrders(ordersRef.current.map((order) =>
          pendingIds.has(order.id) ? { ...order, status: 'cancelled' as const } : order,
        ));
      }
      const endEquity = eventPortfolio?.equity
        ?? (isLightningRound
          ? LIGHTNING_ROUND_STARTING_BALANCE
          : computePaperEquity(eventAccount, eventPositions, freshQuotes));
      if (!Number.isFinite(endEquity)) throw new Error('Event account data is incomplete.');
      const startEquity = isLightningRound
        ? LIGHTNING_ROUND_STARTING_BALANCE
        : enrollment.startEquity;
      if (startEquity === null) return;
      const completedAtMs = Date.now();
      let finalRank: number | undefined;
      if (enrollment.eventType === 'lightning-round' && enrollment.leaderboardOptedIn) {
        const installationId = await getEventArenaParticipantId(AsyncStorage, getInstallationId);
        const response = await fetch(
          `${BASE_URL}/api/event-arena/${encodeURIComponent(enrollment.eventId)}/leaderboard`,
          { headers: { 'X-Event-Arena-Installation-Id': installationId } },
        );
        if (!response.ok) throw new Error('The final Lightning Round ranking is unavailable.');
        const payload = await response.json() as { entries?: Array<{ rank?: number; isCurrentUser?: boolean }> };
        const rankEntry = payload.entries?.find((entry) => entry.isCurrentUser && Number.isInteger(entry.rank) && (entry.rank ?? 0) > 0);
        finalRank = rankEntry?.rank;
      }
      const eventEquityHistory = isLightningRound
        ? []
        : accountValueSnapshotsRef.current.filter(
          (snapshot) => snapshot.accountId === enrollment.accountId,
        );
      const summary = buildPaperChallengeSummary(
        { ...enrollment, startEquity },
        endEquity,
        isLightningRound ? eventTransactions : transactionsRef.current,
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
          ...(finalRank ? { finalRank } : {}),
        },
      );
      const latestStore = paperChallengeRef.current;
      if (!getPaperChallengeEnrollments(latestStore).some((item) => item.eventId === enrollment.eventId)) return;
      const fallbackAccount = accountsRef.current.find((item) => !isPaperChallengeAccountId(item.id));
      const lightningEnrollmentStillUsesAccount = paperChallengeRef.current.lightningEnrollment?.accountId
        === enrollment.accountId
        && challengeNow < paperChallengeRef.current.lightningEnrollment.eventEndAtMs;
      if (activeIdRef.current === enrollment.accountId && fallbackAccount && !lightningEnrollmentStillUsesAccount) {
        await saveAll(
          accountsRef.current,
          positionsRef.current,
          transactionsRef.current,
          ordersRef.current,
          lotsRef.current,
          fallbackAccount.id,
        );
      }
      await savePaperChallenge((current) =>
        finalizePaperChallengeStore(current, summary, challengeNow),
      );
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
    isFocused,
    loaded,
    paperChallenge.enrollment,
    paperChallenge.lightningEnrollment,
    paperChallengeReady,
    positions,
    quotes,
    saveAll,
    saveOrders,
    savePaperChallenge,
  ]);

  useEffect(() => {
    const enrollments = getPaperChallengeEnrollments(paperChallenge);
    const enrollment = enrollments.find((item) =>
      item.eventType === 'lightning-round'
      && item.startEquity === null
      && challengeNow >= item.eventStartAtMs,
    ) ?? enrollments.find((item) =>
      item.startEquity === null && challengeNow >= item.eventStartAtMs,
    );
    if (!paperChallengeReady || !loaded || !isFocused || !enrollment || enrollment.startEquity !== null) return;

    if (challengeNow >= enrollment.eventEndAtMs) {
      if (challengeFinalizationFailureRef.current === enrollment.eventId) return;
      if (challengeBaselineCapturingRef.current === enrollment.eventId) return;
      challengeBaselineCapturingRef.current = enrollment.eventId;
      setChallengeFinalizationBusy(true);
      const latestStore = paperChallengeRef.current;
      const eventAccount = accountsRef.current.find((item) => item.id === enrollment.accountId);
      if (
        !eventAccount
        || !getPaperChallengeEnrollments(latestStore).some((item) => item.eventId === enrollment.eventId)
      ) {
        challengeFinalizationFailureRef.current = enrollment.eventId;
        setChallengeFinalizationError(true);
        challengeBaselineCapturingRef.current = null;
        setChallengeFinalizationBusy(false);
        return;
      }
      const missedLightningBaseline = enrollment.eventType === 'lightning-round'
        ? getLightningRoundStartEquityFromSnapshots(
          accountValueSnapshotsRef.current,
          enrollment.accountId,
          enrollment.eventStartAtMs,
          enrollment.eventEndAtMs,
        )
        : null;
      if (enrollment.eventType === 'lightning-round' && missedLightningBaseline === null) {
        challengeFinalizationFailureRef.current = enrollment.eventId;
        setChallengeFinalizationError(true);
        challengeBaselineCapturingRef.current = null;
        setChallengeFinalizationBusy(false);
        return;
      }
      void savePaperChallenge((current) => {
        const currentEnrollment = getPaperChallengeEnrollments(current)
          .find((item) => item.eventId === enrollment.eventId);
        if (!currentEnrollment || currentEnrollment.startEquity !== null) return current;
        return updatePaperChallengeEnrollment(
          current,
          currentEnrollment.eventType ?? 'event-arena',
          (item) => item.eventId === enrollment.eventId
            ? capturePaperChallengeBaseline(item, missedLightningBaseline ?? PAPER_CHALLENGE_STARTING_BALANCE)
            : item,
        );
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
    if (getRegularEventCalendarError()) return;
    challengeBaselineCapturingRef.current = enrollment.eventId;
    void (async () => {
      const currentWindow = isLightningRoundEventId(enrollment.eventId)
        ? findLightningRoundWindow(Date.now())
        : getPaperChallengeWindow(Date.now());
      if (!currentWindow || currentWindow.id !== enrollment.eventId || currentWindow.phase !== 'active') return;
      const eventPositions = positionsRef.current.filter((position) => position.accountId === enrollment.accountId);
      const freshQuotes = await fetchQuotes(eventPositions, enrollment.accountId, false);
      const latestWindow = isLightningRoundEventId(enrollment.eventId)
        ? findLightningRoundWindow(Date.now())
        : getPaperChallengeWindow(Date.now());
      if (!latestWindow || latestWindow.id !== enrollment.eventId || latestWindow.phase !== 'active') return;

      const eventAccount = accountsRef.current.find((item) => item.id === enrollment.accountId);
      if (!eventAccount) throw new Error('The event account is unavailable.');
      const latestPositions = positionsRef.current.filter((position) => position.accountId === enrollment.accountId);
      const latestQuotes = { ...quotes, ...freshQuotes };
      const startEquity = computePaperEquity(eventAccount, latestPositions, latestQuotes);
      const latestStore = paperChallengeRef.current;
      const currentEnrollment = getPaperChallengeEnrollments(latestStore)
        .find((item) => item.eventId === enrollment.eventId);
      if (!currentEnrollment || currentEnrollment.startEquity !== null) return;
      await savePaperChallenge((current) => {
        const savedEnrollment = getPaperChallengeEnrollments(current)
          .find((item) => item.eventId === enrollment.eventId);
        if (!savedEnrollment || savedEnrollment.startEquity !== null) return current;
        return updatePaperChallengeEnrollment(
          current,
          savedEnrollment.eventType ?? 'event-arena',
          (item) => item.eventId === enrollment.eventId
            ? capturePaperChallengeBaseline(item, startEquity)
            : item,
        );
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
    isFocused,
    loaded,
    paperChallenge.enrollment,
    paperChallenge.lightningEnrollment,
    paperChallengeReady,
    positions,
    quotes,
    savePaperChallenge,
  ]);

  useEffect(() => {
    if (!loaded || !isFocused || !activeId) return;
    const refreshedAt = Date.now();
    const previousRefresh = autoQuoteRefreshRef.current;
    if (
      previousRefresh.signature === activeQuoteSignature
      && refreshedAt - previousRefresh.refreshedAt < PAPER_FOCUS_REFRESH_MIN_INTERVAL_MS
    ) return;
    autoQuoteRefreshRef.current = { signature: activeQuoteSignature, refreshedAt };
    void fetchQuotes(positionsRef.current, activeIdRef.current)
      .catch(() => {});
  }, [activeQuoteSignature, fetchQuotes, isFocused, loaded]);

  initRef.current = init;
  useFocusEffect(useCallback(() => {
    setIsFocused(true);
    if (didFocusOnceRef.current && loadedRef.current) {
      const allowDeviceSync = Date.now() - lastDeviceSyncAtRef.current
        >= PAPER_FOCUS_REFRESH_MIN_INTERVAL_MS;
      void initRef.current(true, allowDeviceSync).catch(() => {});
    }
    didFocusOnceRef.current = true;
    return () => setIsFocused(false);
  }, []));

  useEffect(() => {
    if (!loaded || !isFocused || !activeId) return;
    let appIsActive = AppState.currentState === 'active';
    let knownOffline: boolean | null = null;
    const refresh = (forceRefresh = false) => {
      if (!appIsActive) return;
      void fetchQuotes(positionsRef.current, activeIdRef.current, false, forceRefresh)
        .catch(() => {});
    };
    const refreshNetworkState = (state: Network.NetworkState) => {
      const offline = isNetworkOffline(state);
      const reconnected = didNetworkReconnect(knownOffline, offline);
      knownOffline = offline;
      if (reconnected && appIsActive) {
        refresh(true);
        void fetchInactiveAccountCardQuotes(true).catch(() => {});
      }
    };
    let receivedNetworkEvent = false;
    const networkSubscription = Network.addNetworkStateListener((state) => {
      receivedNetworkEvent = true;
      refreshNetworkState(state);
    });
    void Network.getNetworkStateAsync().then((state) => {
      if (!receivedNetworkEvent) refreshNetworkState(state);
    }).catch(() => {});
    const timer = setInterval(() => refresh(), PAPER_QUOTE_REFRESH_INTERVAL_MS);
    const subscription = AppState.addEventListener('change', (state) => {
      const resumed = !appIsActive && state === 'active';
      appIsActive = state === 'active';
      if (resumed) refresh(true);
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
      networkSubscription.remove();
    };
  }, [activeId, fetchInactiveAccountCardQuotes, fetchQuotes, isFocused, loaded]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await fetchQuotes(positionsRef.current, activeIdRef.current, true, true);
    } catch {
      // Keep the last available values; no stale-price disclosure is shown.
    } finally {
      setRefreshing(false);
    }
  };

  const refreshOrderQuote = async (symbol: string) => {
    const normalizedSymbol = symbol.trim().toUpperCase();
    if (!normalizedSymbol) throw new Error('Choose a stock before refreshing its quote.');
    const quote = await requestPaperPreloadQuote(normalizedSymbol, true);
    const shared = mergePaperPreloadQuotes({ [normalizedSymbol]: quote });
    setQuotes(shared.quotes);
    void persistPaperPreloadQuotes(AsyncStorage, shared.quotes);
  };

  // ── Account actions ───────────────────────────────────────────────────────
  const switchAccount = async (id: string) => {
    activeIdRef.current = id;
    setActiveId(id);
    setChartRange('ALL');
    setLightningTradeOfferWindow(null);
    setLightningPreparationMessage('');
    // Account selection is local-only and is excluded from the shared snapshot;
    // do not queue a general Event Arena snapshot as part of the transition.
    await flushCache(
      accountsRef.current,
      positionsRef.current,
      transactionsRef.current,
      ordersRef.current,
      lotsRef.current,
      id,
      { syncGeneralDeviceSnapshot: false },
    );
  };

  const handledChallengeRouteRef = useRef<string | null>(null);
  useEffect(() => {
    const requestedId = typeof routeParams.challengeAccountId === 'string' ? routeParams.challengeAccountId : undefined;
    if (!loaded || !requestedId || handledChallengeRouteRef.current === requestedId) return;
    if (!accounts.some((item) => item.id === requestedId)) return;
    handledChallengeRouteRef.current = requestedId;
    if (activeIdRef.current !== requestedId) void switchAccount(requestedId);
  }, [accounts, loaded, routeParams.challengeAccountId]);

  useEffect(() => {
    if (loaded && routeParams.tab === 'positions') setActiveTab('positions');
  }, [loaded, routeParams.tab]);

  const renameAccount = async (id: string, name: string) => {
    const updated = renamePaperAccount(accountsRef.current, id, name);
    await saveAccounts(updated);
    setRenameId('');
  };

  const resetAccount = async (id: string) => {
    const activeEnrollment = getPaperChallengeEnrollmentForAccount(paperChallengeRef.current, id);
    if (activeEnrollment && Date.now() < activeEnrollment.eventEndAtMs) {
      Alert.alert('Account is in a championship', 'This account cannot be reset until its paper trading event is complete.');
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

  const lookUpStock = async (symbolOverride?: string, searchedAssetType?: 'stock' | 'etf') => {
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
      const providerQuoteType = typeof info.quoteType === 'string' ? info.quoteType.toUpperCase() : '';
      const providerAssetType = providerQuoteType === 'EQUITY'
        ? 'stock'
        : providerQuoteType === 'ETF' ? 'etf' : 'unknown';
      const assetType = searchedAssetType && searchedAssetType !== providerAssetType
        ? 'unknown'
        : providerAssetType;
      setStockInfo({
        companyName: info.companyName,
        currentPrice: quote.currentPrice,
        dividendYield: info.dividendYield ?? 0,
        dividendRate: info.dividendRate ?? 0,
        expenseRatio: info.expenseRatio ?? 0,
        sector: info.sector ?? '',
        assetType,
        priceTimestamp: quote.priceTimestamp ?? null,
        marketSession: typeof quote.marketSession === 'string' ? quote.marketSession : undefined,
        priceSource: typeof quote.priceSource === 'string' ? quote.priceSource : undefined,
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
      const lightningEnrollment = paperChallengeRef.current.lightningEnrollment?.accountId === accountId
        ? paperChallengeRef.current.lightningEnrollment
        : null;
      const enrollment = lightningEnrollment
        ?? getPaperChallengeEnrollmentForAccount(paperChallengeRef.current, accountId);
      const preparingLightningOrder = !!lightningEnrollment
        && Date.now() < lightningEnrollment.eventStartAtMs;
      const purchaseLimit = enrollment?.purchaseLimit
        ?? (enrollment?.eventType === 'penny-stock-mayhem' ? 20 : undefined);
      if (enrollment && Date.now() >= enrollment.eventEndAtMs) {
        return {
          status: 'rejected',
          message: 'This championship has ended. Choose another paper account to continue trading.',
        };
      }
      if (enrollment && Date.now() < enrollment.eventStartAtMs && !preparingLightningOrder) {
        return {
          status: 'rejected',
          message: 'This championship has not started yet. Your separate account will be ready at opening.',
        };
      }
      if (preparingLightningOrder && !isLightningRoundPreparationOpen(
        lightningEnrollment.eventStartAtMs,
        Date.now(),
      )) {
        return {
          status: 'rejected',
          message: 'Lightning Round order preparation opens 72 hours before the scheduled start.',
        };
      }
      if (preparingLightningOrder
        && (args.orderType !== 'market' || args.side !== 'buy' || intent)) {
        return {
          status: 'rejected',
          message: 'Lightning Round preparation accepts market buy orders only.',
        };
      }
      if (isPaperChallengeAccountId(accountId) && !enrollment) {
        return {
          status: 'rejected',
          message: 'Completed championship accounts are read-only. Choose another account to trade.',
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
      if (enrollment?.eventType === 'one-stock-challenge') {
        if (intent) {
          return { status: 'rejected', message: 'Short selling is not available in the One-Stock Challenge.' };
        }
        const openPositions = currentPositions.filter((position) =>
          position.accountId === accountId && position.shares > 0.0001,
        );
        if (openPositions.some((position) => position.positionType === 'short')) {
          return { status: 'rejected', message: 'Short selling is not available in the One-Stock Challenge.' };
        }
        if (args.side === 'buy') {
          const existingPosition = openPositions.find((position) => position.symbol === sym);
          const buyAssetType = args.stockInfo?.assetType ?? existingPosition?.assetType;
          if (buyAssetType !== 'stock' && buyAssetType !== 'etf') {
            return { status: 'rejected', message: 'One-Stock Challenge buys require a verified stock or ETF.' };
          }
          const conflictingPendingBuy = currentOrders.some((order) =>
            order.accountId === accountId
            && order.status === 'pending'
            && order.side === 'buy'
            && !order.intent
            && order.id !== args.orderId
            && order.symbol !== sym,
          );
          if (openPositions.some((position) => position.symbol !== sym) || conflictingPendingBuy) {
            return { status: 'rejected', message: ONE_STOCK_CHALLENGE_REJECTION_MESSAGE };
          }
        }
      }
      let currentQuote: LiveQuote;
      try {
        // Account data remains guest-local. Refresh the provider price at submit
        // time so a cached display quote can never authorize an order.
        currentQuote = await requestPaperPreloadQuote(sym, true);
        const shared = mergePaperPreloadQuotes({ [sym]: currentQuote });
        setQuotes(shared.quotes);
        void persistPaperPreloadQuotes(AsyncStorage, shared.quotes);
      } catch {
        return {
          status: 'rejected',
          message: 'A fresh provider quote is unavailable. No order was submitted.',
        };
      }
      const marketClosed = isClosedMarketQuote(currentQuote);
      const marketOrderReferencePrice = marketClosed ? currentQuote.price : args.quotePrice;
      if (args.orderType === 'market') {
        if (getOrderQuoteState(currentQuote) !== 'fresh' && !marketClosed) {
          return {
            status: 'rejected',
            message: 'The provider quote is stale. Refresh it and review the updated price before confirming.',
          };
        }
        const quoteError = getMarketOrderQuoteError(currentQuote, args.quotePrice, marketClosed);
        if (quoteError) return { status: 'rejected', message: quoteError };
      } else if (!currentQuote || !Number.isFinite(currentQuote.price) || currentQuote.price <= 0) {
        return { status: 'rejected', message: 'A provider quote is unavailable. No order was submitted.' };
      }
      const existingLightningOrder = args.orderId
        ? currentOrders.find((order) => order.id === args.orderId
          && isLightningRoundStagedOrder(order, lightningEnrollment?.eventId))
        : undefined;
      if (args.orderType === 'market' && args.orderId && !existingLightningOrder) {
        return { status: 'rejected', message: 'Market orders cannot be edited. Cancel the pending order and place a new market order.' };
      }
      if (preparingLightningOrder && args.orderId && !existingLightningOrder) {
        return { status: 'rejected', message: 'Only this Lightning Round’s queued orders can be edited.' };
      }

      const accountPositions = currentPositions.filter((position) => position.accountId === accountId);
      const riskPendingOrders = preparingLightningOrder
        ? currentOrders.filter((order) => !isLightningRoundStagedOrder(order))
        : currentOrders;
      const riskAccount = intent === 'short'
        ? { ...currentAccount, shortCollateralRatio: args.shortCollateralRatio ?? currentAccount.shortCollateralRatio }
        : currentAccount;
      const riskQuotes = args.orderType === 'market'
        ? { ...quotes, [sym]: { ...currentQuote, price: marketOrderReferencePrice } }
        : quotes;
      if (args.orderType === 'market') {
        const existingLongForType = accountPositions.find((position) =>
          position.symbol === sym && !isShortPosition(position),
        );
        const purchaseLimitRejection = getPurchaseLimitRejectionReason({
          order: {
            side: direction,
            intent,
            assetType: args.stockInfo?.assetType ?? existingLongForType?.assetType,
          },
          executionQuotePrice: marketOrderReferencePrice,
          fillPrice: marketClosed
            ? marketOrderReferencePrice
            : applySlippage(args.quotePrice, args.shares, direction),
          maxPurchasePrice: purchaseLimit,
        });
        if (purchaseLimitRejection) {
          return { status: 'rejected', message: purchaseLimitRejection };
        }
      }

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
        currentPrice: args.orderType === 'market' ? marketOrderReferencePrice : currentQuote.price,
        account: riskAccount,
        accountPositions,
        quotes: riskQuotes,
        pendingOrders: riskPendingOrders,
        excludeOrderId: args.orderId,
      });
      if (riskError) return { status: 'rejected', message: riskError };

      const nowISO = new Date().toISOString();
      if (preparingLightningOrder && lightningEnrollment) {
        const existingOrder = existingLightningOrder;
        const metadata = args.stockInfo ?? (existingOrder ? {
          companyName: existingOrder.companyName,
          dividendYield: existingOrder.dividendYield ?? 0,
          dividendRate: existingOrder.dividendRate ?? 0,
          expenseRatio: existingOrder.expenseRatio ?? 0,
          sector: existingOrder.sector ?? '',
          assetType: existingOrder.assetType ?? 'unknown',
        } : undefined);
        const stagedOrder: PaperOrder = {
          ...(existingOrder ?? {}),
          id: existingOrder?.id ?? uid(),
          accountId,
          lightningRoundEventId: lightningEnrollment.eventId,
          symbol: sym,
          companyName,
          orderType: 'market',
          side: 'buy',
          intent: undefined,
          assetType: metadata?.assetType,
          shares: args.shares,
          dividendYield: metadata?.dividendYield ?? 0,
          dividendRate: metadata?.dividendRate ?? 0,
          expenseRatio: metadata?.expenseRatio ?? 0,
          sector: metadata?.sector ?? '',
          status: 'pending',
          placedAt: existingOrder?.placedAt ?? nowISO,
          rejectionReason: undefined,
          filledPrice: undefined,
          filledAt: undefined,
        };
        const updatedOrders = existingOrder
          ? currentOrders.map((order) => order.id === existingOrder.id ? stagedOrder : order)
          : [...currentOrders, stagedOrder];
        await saveOrders(updatedOrders);
        return {
          status: 'pending',
          message: `${args.shares} ${sym} market buy queued for Lightning Round. It will remain pending until the event starts.`,
        };
      }
      if (args.orderType === 'market' && !marketClosed) {
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
          assetType: metadata?.assetType,
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
          executionQuotePrice: args.quotePrice,
        maxPurchasePrice: purchaseLimit,
          oneStockChallenge: enrollment?.eventType === 'one-stock-challenge',
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
        if (!isPaperChallengeAccountId(accountId)) {
          paperOrderFillHapticNotifierRef.current?.({
            orderId: `market-${syntheticOrder.id}`,
            previousStatus: syntheticOrder.status,
            status: 'filled',
          });
        }
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
        assetType: metadata?.assetType,
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
        if (args.orderType !== 'market') void awardAchievement('first-paper-limit');
        if (args.side === 'sell') void awardAchievement('first-paper-sell');
      }
      if (args.orderType === 'market' && marketClosed) {
        return {
          status: 'pending',
          pendingReason: 'market-open',
          message: 'The regular market is closed. Your market order is pending market open and will fill when the app next gets a fresh quote after the next regular market open. The final fill price may differ from this estimate.',
        };
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
    if (isLightningRoundStagedOrder(order)) {
      const enrollment = paperChallengeRef.current.lightningEnrollment;
      if (!enrollment || enrollment.eventId !== order.lightningRoundEventId) return;
      const otherValidOrders = getLightningRoundQueuedOrders(
        ordersRef.current,
        enrollment.eventId,
        enrollment.accountId,
      ).filter((candidate) => candidate.id !== order.id);
      if (otherValidOrders.length > 0) {
        void saveOrders(ordersRef.current.map((item) => item.id === order.id
          ? { ...item, status: 'cancelled' as const }
          : item));
      } else {
        setFinalLightningCancelError('');
        setFinalLightningCancelOrder(order);
      }
      return;
    }
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

  const confirmFinalLightningCancellation = async () => {
    const order = finalLightningCancelOrder;
    const enrollment = paperChallengeRef.current.lightningEnrollment;
    if (!order || !enrollment || enrollment.eventId !== order.lightningRoundEventId) {
      setFinalLightningCancelOrder(null);
      return;
    }
    try {
      setFinalLightningCancelling(true);
      const installationId = await getEventArenaParticipantId(AsyncStorage, getInstallationId);
      await apiFetch(`/api/event-arena/lightning-round/${encodeURIComponent(enrollment.eventId)}/leave`, {
        method: 'POST',
        headers: { 'X-Event-Arena-Installation-Id': installationId },
      });
      const cancelledOrders = cancelLightningRoundStagedOrders(
        ordersRef.current,
        enrollment.eventId,
        enrollment.accountId,
      );
      await savePaperChallenge((current) => current.lightningEnrollment?.eventId === enrollment.eventId
        ? { ...current, lightningEnrollment: null }
        : current);
      await saveOrders(cancelledOrders);
      setFinalLightningCancelOrder(null);
      setFinalLightningCancelError('');
    } catch {
      setFinalLightningCancelError('Your order and registration could not be cancelled. Nothing else was changed; please try again.');
    } finally {
      setFinalLightningCancelling(false);
    }
  };

  const confirmLeaveLightningRound = async () => {
    const enrollment = paperChallengeRef.current.lightningEnrollment;
    if (!enrollment || enrollment.accountId !== activeIdRef.current) {
      setLeaveLightningOpen(false);
      return;
    }
    try {
      setLeavingLightning(true);
      setLeaveLightningError('');
      const installationId = await getEventArenaParticipantId(AsyncStorage, getInstallationId);
      await apiFetch(`/api/event-arena/lightning-round/${encodeURIComponent(enrollment.eventId)}/leave`, {
        method: 'POST',
        headers: { 'X-Event-Arena-Installation-Id': installationId },
      });
      const cancelledOrders = cancelLightningRoundStagedOrders(
        ordersRef.current,
        enrollment.eventId,
        enrollment.accountId,
      );
      await savePaperChallenge((current) => current.lightningEnrollment?.eventId === enrollment.eventId
        ? { ...current, lightningEnrollment: null }
        : current);
      await saveOrders(cancelledOrders);
      setLeaveLightningOpen(false);
    } catch {
      setLeaveLightningError('We could not remove your registration. Your account and orders were not changed; please try again.');
    } finally {
      setLeavingLightning(false);
    }
  };

  const dismissLightningTradeOffer = () => {
    setLightningTradeOfferWindow(null);
  };

  const requestTradeEntry = (continueTrade: () => void) => {
    const requestedAccountId = account?.id;
    if (!requestedAccountId?.startsWith('paper-event:')) {
      continueTrade();
      return;
    }
    if (tradeEntryCheckInFlightRef.current || lightningTradeOfferWindow) return;

    tradeEntryCheckInFlightRef.current = true;
    void (async () => {
      try {
        const latestStore = await loadPaperChallengeStore({
          getItem: (key) => AsyncStorage.getItem(key),
        });
        paperChallengeRef.current = latestStore;
        setPaperChallenge(latestStore);

        const response = await fetch(`${BASE_URL}/api/event-arena/lightning-round/prepare`, {
          method: 'POST',
        });
        if (!response.ok) {
          continueTrade();
          return;
        }
        const payload = await response.json() as {
          events?: unknown[];
          available?: boolean;
        };
        if (payload.available === false || !Array.isArray(payload.events)) {
          continueTrade();
          return;
        }

        const nowMs = Date.now();
        const event = findPreparedLightningRoundWindow(payload.events, nowMs);
        const enrollment = event
          ? getPaperChallengeEnrollments(latestStore).find((item) =>
            item.eventType === 'lightning-round' && item.eventId === event.id,
          ) ?? null
          : null;
        if (!event || !shouldOfferLightningRoundTradeEnrollment({
          accountId: requestedAccountId,
          event,
          nowMs,
          enrollment,
        })) {
          continueTrade();
          return;
        }

        setLightningTradeOfferNow(nowMs);
        setLightningTradeOfferWindow(event);
      } catch {
        // Keep trade entry available if the schedule or local enrollment cannot be checked.
        continueTrade();
      } finally {
        tradeEntryCheckInFlightRef.current = false;
      }
    })();
  };

  const editOrder = (order: PaperOrder) => {
    if (order.status !== 'pending') return;
    if (isLightningRoundStagedOrder(order) && !isLightningPreparationOpen) return;
    requestTradeEntry(() => {
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
          assetType: order.assetType ?? 'unknown',
        });
      }
      setShowOrderSheet(true);
    });
  };

  const changeLightningOrderSymbol = (order: PaperOrder) => {
    if (
      !isLightningPreparationOpen
      || !activeLightningEnrollment
      || order.lightningRoundEventId !== activeLightningEnrollment.eventId
      || order.status !== 'pending'
    ) return;
    invalidateStockLookup();
    setEditingOrder(order);
    setTradeMode('buy');
    setBuySymbol('');
    setDebouncedBuyQuery('');
    setStockInfo(null);
    setInfoError('');
    setShowTradeModal(true);
  };

  // ── Open modals ───────────────────────────────────────────────────────────
  const openBuyModal = () => {
    requestTradeEntry(() => {
      invalidateStockLookup();
      setEditingOrder(null);
      setTradeMode('buy');
      setBuySymbol('');
      setDebouncedBuyQuery('');
      setStockInfo(null);
      setInfoError('');
      setShowTradeModal(true);
    });
  };

  const openSelectedStockOrder = (intent: OrderIntent) => {
    const symbol = buyOrderDetails.symbol.trim().toUpperCase();
    const position = positionsRef.current.find((item) => item.accountId === activeIdRef.current
      && item.symbol === symbol
      && (intent === 'sell' ? !isShortPosition(item) : isShortPosition(item)));
    if (!editingOrder || !isLightningRoundStagedOrder(editingOrder)) setEditingOrder(null);
    setTradeMode(intent);
    setSelectedPos(intent === 'sell' ? position ?? null : null);
    invalidateStockLookup();
    setShowOrderSheet(true);
    setShowTradeModal(false);
  };

  const openSellModal = (pos: PaperPosition) => {
    requestTradeEntry(() => {
      invalidateStockLookup();
      setEditingOrder(null);
      setTradeMode('sell');
      setSelectedPos(pos);
      // Clear any stale buy-lookup state so it cannot bleed into sell execution
      setBuySymbol('');
      setStockInfo(null);
      setShowOrderSheet(true);
    });
  };

  const openCoverModal = (pos: PaperPosition) => {
    requestTradeEntry(() => {
      invalidateStockLookup();
      setEditingOrder(null);
      setTradeMode('cover');
      setSelectedPos(pos);
      setBuySymbol('');
      setStockInfo(null);
      setShowOrderSheet(true);
    });
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
              <PaperPositionRow
                id={pos.id}
                symbol={pos.symbol}
                companyName={pos.companyName}
                isShort={isShortPosition(pos)}
                shares={pos.shares}
                avgCost={pos.avgCost}
                marketValue={mktVal}
                pnl={pnl}
                pnlPercent={pnlPct}
                color={color}
                expanded={isExpanded}
                onPress={() => setExpandedPosId(isExpanded ? null : pos.id)}
              />

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
          const isLightningStaged = isLightningRoundStagedOrder(o);
          const isMarketOpenPending = !isLightningStaged && o.status === 'pending' && o.orderType === 'market';
          return (
            <View key={o.id} testID={`paper-order-${o.id}`} style={[styles.orderCard, { opacity: o.status === 'cancelled' ? 0.5 : 1 }]}>
              {isLightningStaged && (
                <View style={{ marginBottom: 7 }}>
                  <Text style={{ color: o.status === 'pending' ? colors.primary : colors.mutedForeground, fontFamily: 'Inter_700Bold', fontSize: 10 }}>
                    {o.status === 'pending' ? 'PENDING — EXECUTES AT EVENT START' : o.rejectionReason ? 'ORDER REJECTED' : o.status.toUpperCase()}
                  </Text>
                  {o.status === 'pending' && (
                    <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 10, lineHeight: 15, marginTop: 3 }}>
                      Estimated value: {q ? $fmt(o.shares * q.price) : 'unavailable'} · actual execution price may differ.
                    </Text>
                  )}
                </View>
              )}
              {isMarketOpenPending && (
                <View testID={`paper-order-market-open-${o.id}`} style={{ marginBottom: 7 }}>
                  <Text style={{ color: colors.primary, fontFamily: 'Inter_700Bold', fontSize: 10 }}>
                    PENDING — MARKET OPEN
                  </Text>
                  <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 10, lineHeight: 15, marginTop: 3 }}>
                    Fills when the app next gets a fresh quote after the regular market opens; the final price may differ.
                  </Text>
                </View>
              )}
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
                {(o.orderType === 'limit' || o.orderType === 'stop_limit') && o.limitPrice != null && <View>
                  <Text style={styles.posLabel}>LIMIT</Text>
                  <Text style={styles.posVal}>${o.limitPrice.toFixed(2)}</Text>
                </View>}
                {(o.orderType === 'stop' || o.orderType === 'stop_limit') && o.stopPrice != null && <View>
                  <Text style={styles.posLabel}>STOP</Text>
                  <Text style={styles.posVal}>${o.stopPrice.toFixed(2)}</Text>
                </View>}
                {o.orderType === 'trailing_stop' && o.trailPct != null && <View>
                  <Text style={styles.posLabel}>TRAIL</Text>
                  <Text style={styles.posVal}>{o.trailPct}%</Text>
                </View>}
                {o.orderType === 'trailing_stop' && o.trailAbs != null && <View>
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
                    {!isMarketOpenPending && (
                      <TouchableOpacity
                        testID={`edit-order-${o.id}`}
                        accessibilityLabel={`Edit ${o.symbol} order`}
                        onPress={() => editOrder(o)}
                        style={styles.orderAction}
                      >
                        <Feather name="edit-2" size={14} color={BUY_COLOR} />
                        <Text style={[styles.orderActionText, { color: BUY_COLOR }]}>EDIT</Text>
                      </TouchableOpacity>
                    )}
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
              {o.rejectionReason && (
                <Text testID={`paper-order-rejection-${o.id}`} style={{ color: SELL_COLOR, fontFamily: 'Inter_500Medium', fontSize: 11, lineHeight: 16, marginTop: 5 }}>
                  {o.rejectionReason}
                </Text>
              )}
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
          <View style={[styles.header, { paddingTop: Platform.OS === 'android' ? insets.top + 8 : 0 }]}>
            <MMLogo size={36} />
            <Text numberOfLines={1} style={[styles.headerTitle, { color: colors.heading }]}>PAPER TRADING</Text>
            <View style={{ flex: 1 }} />
            <Text numberOfLines={1} style={styles.headerSub}>Risk-free · $100k start</Text>
          </View>
          <View
            testID="paper-loading-account-skeleton"
            accessibilityLabel="Loading paper account"
            style={styles.loadingAccountCard}
          >
            <View style={styles.loadingSkeletonRow}>
              <View style={[styles.loadingSkeletonBlock, { width: '36%', height: 11 }]} />
              <View style={[styles.loadingSkeletonBlock, { width: '24%', height: 11 }]} />
            </View>
            <View style={[styles.loadingSkeletonBlock, { width: '62%', height: 28, marginTop: 14 }]} />
            <View style={styles.loadingSkeletonDivider} />
            <View style={styles.loadingSkeletonMetrics}>
              {Array.from({ length: 4 }, (_, index) => (
                <View key={index} style={styles.loadingSkeletonMetric}>
                  <View style={[styles.loadingSkeletonBlock, { width: '58%', height: 9 }]} />
                  <View style={[styles.loadingSkeletonBlock, { width: '76%', height: 14, marginTop: 8 }]} />
                </View>
              ))}
            </View>
          </View>
          <View
            testID="paper-loading-positions-skeleton"
            accessibilityLabel="Loading paper positions"
            style={styles.loadingContent}
          >
            <View style={styles.loadingSkeletonRow}>
              <View style={[styles.loadingSkeletonBlock, { width: '25%', height: 13 }]} />
              <View style={[styles.loadingSkeletonBlock, { width: '25%', height: 13 }]} />
            </View>
            <View style={styles.loadingSkeletonRow}>
              <View style={[styles.loadingSkeletonBlock, { width: '32%', height: 36 }]} />
              <View style={[styles.loadingSkeletonBlock, { width: '32%', height: 36 }]} />
            </View>
            {[0, 1].map((row) => (
              <View key={row} style={styles.loadingPositionRow}>
                <View style={[styles.loadingSkeletonBlock, { width: '25%', height: 14 }]} />
                <View style={[styles.loadingSkeletonBlock, { width: '18%', height: 14 }]} />
                <View style={[styles.loadingSkeletonBlock, { width: '22%', height: 14 }]} />
              </View>
            ))}
          </View>
          <View style={{ flex: 1 }} />
          <BottomTabBar />
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
            onPress={() => { void init(); }}
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
        {loadingQuotes && (
          <ActivityIndicator
            testID="paper-refresh-indicator"
            accessibilityLabel="Refreshing paper trading prices"
            size="small"
            color={SILVER}
          />
        )}
        <Text numberOfLines={1} style={styles.headerSub}>Risk-free · $100k start</Text>
      </View>

      {visiblePaperOrderFillAlert && (
        <View
          testID="paper-order-fill-alert"
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          style={styles.paperOrderFillAlert}
        >
          <Feather name="check-circle" size={16} color={BUY_COLOR} />
          <Text style={styles.paperOrderFillAlertText}>{visiblePaperOrderFillAlert.message}</Text>
        </View>
      )}

      <PaperAccountSwipeArea
        style={[
          styles.accountHero,
          screenWidth <= 360 && styles.compactAccountHero,
          isSelectedEventAccount && styles.eventChampionshipHero,
        ]}
        testID="paper-account-hero"
        accounts={visibleAccounts}
        activeId={activeId}
        onSwitchAccount={(id) => { void switchAccount(id); }}
      >
        {isSelectedEventAccount ? (
          <>
            <View style={styles.eventChampionshipTopline}>
              <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.eventHeroLabel, { flex: 1, minWidth: 0 }]}>
                {account?.id.startsWith('paper-lightning:') ? 'LIGHTNING ROUND' : 'EVENT ARENA'}
                {selectedEventDateRange ? ` · ${selectedEventDateRange}` : ''}
              </Text>
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
              eventType={selectedEventEnrollment?.eventType ?? selectedEventSummary?.eventType ?? 'event-arena'}
              lightningRoundPromotionWindow={lightningRoundPromotionWindow}
              isLightningRoundEnrolled={paperChallenge.lightningEnrollment?.eventId === lightningRoundPromotionWindow?.id}
              onOpenLightningRound={() => router.push('/lightning-round')}
              onViewLeaderboard={() => {
                const lightning = (selectedEventEnrollment?.eventType ?? selectedEventSummary?.eventType) === 'lightning-round';
                if (lightning) {
                  router.push({ pathname: '/lightning-round', params: { tab: 'leaderboard' } });
                } else {
                  router.navigate({ pathname: '/event-arena', params: { section: 'leaderboard', eventId: selectedEventId } });
                }
              }}
            />
          </>
        ) : (
          <PaperPortfolioSummary
            accountName={selectedAccountDisplayName}
            accountPosition={selectedAccountPosition}
            accountCount={visibleAccounts.length}
            equity={portfolioValue}
            todayPnL={todayPnL}
            totalReturn={totalReturn}
            buyingPower={account?.cash ?? 0}
            onSwitchAccount={() => setShowAccountManagement(true)}
          />
        )}
        {visibleAccounts.length > 1 && (
          <View
            testID="paper-account-position-indicator"
            accessibilityRole="text"
            accessibilityLabel={`Account ${selectedAccountPosition + 1} of ${visibleAccounts.length}`}
            style={[
              styles.accountPositionIndicators,
            isSelectedEventAccount && styles.eventChampionshipPositionIndicators,
              !isSelectedEventAccount && screenWidth <= 360 && styles.compactAccountPositionIndicators,
            ]}
          >
            {visibleAccounts.map((item, index) => (
              <View
                key={item.id}
                testID={`paper-account-indicator-${index}`}
                style={[
                  styles.accountPositionIndicator,
                  item.id === activeId && styles.accountPositionIndicatorActive,
                  isPaperChallengeAccountId(item.id) && styles.eventPositionIndicator,
                ]}
              />
            ))}
          </View>
        )}
      </PaperAccountSwipeArea>

      {lightningEnrollmentForDisplay && challengeNow < lightningEnrollmentForDisplay.eventStartAtMs && (
        <View
          testID="lightning-round-preparation-banner"
          accessibilityLiveRegion="polite"
          style={{
            marginHorizontal: 16,
            marginTop: 10,
            padding: 14,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: isLightningPreparationAccount ? colors.primary : colors.border,
            backgroundColor: colors.card,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Feather name="zap" size={16} color={colors.primary} />
            <Text style={{ flex: 1, color: colors.primary, fontFamily: 'Inter_700Bold', fontSize: 15, letterSpacing: 0.4 }}>
              ONE MORE STEP TO ENTER!
            </Text>
          </View>
          <Text testID="lightning-round-event-countdown" style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 24, marginTop: 8 }}>
            {lightningCountdownLabel(lightningEnrollmentForDisplay.eventStartAtMs - challengeNow)}
          </Text>
          <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18, marginTop: 6 }}>
            At least one active market order is required to enter. Queued orders stay pending and do not affect cash, buying power, positions, account equity, or P/L until the competition starts. The final execution price may differ from this estimate.
          </Text>
          <View
            testID="lightning-round-qualification-status"
            style={{
              marginTop: 10,
              padding: 10,
              borderRadius: 9,
              backgroundColor: colors.background,
              borderWidth: 1,
              borderColor: lightningIsQualified ? colors.primary : colors.border,
            }}
          >
            <Text style={{
              color: lightningIsQualified ? colors.primary : colors.mutedForeground,
              fontFamily: 'Inter_700Bold',
              fontSize: 11,
              lineHeight: 16,
            }}>
              {!isLightningPreparationOpen
                ? 'ORDER PREPARATION IS NOT OPEN YET.'
                : lightningIsQualified
                  ? "YOU'RE QUALIFIED — YOUR MARKET ORDER IS QUEUED."
                  : 'NOT QUALIFIED — ADD AT LEAST ONE ACTIVE MARKET ORDER.'}
            </Text>
            <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 10, lineHeight: 15, marginTop: 4 }}>
              {challengeNow < lightningEnrollmentForDisplay.eventStartAtMs - 72 * 60 * 60 * 1000
                ? `Order preparation opens in ${lightningCountdownLabel(lightningEnrollmentForDisplay.eventStartAtMs - 72 * 60 * 60 * 1000 - challengeNow)}.`
                : isLightningPreparationAccount
                  ? 'Order preparation is open and closes exactly when the round starts.'
                  : 'Select your Event Arena account to prepare orders.'}
            </Text>
          </View>
          {activeId !== lightningEnrollmentForDisplay.accountId ? (
            <TouchableOpacity
              testID="select-lightning-round-account"
              accessibilityRole="button"
              onPress={() => { void switchAccount(lightningEnrollmentForDisplay.accountId); }}
              style={{ minHeight: 44, marginTop: 10, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: colors.primary }}
            >
              <Text style={{ color: colors.primaryForeground, fontFamily: 'Inter_700Bold', fontSize: 11 }}>OPEN EVENT ARENA ACCOUNT</Text>
            </TouchableOpacity>
          ) : isLightningPreparationOpen ? (
            <TouchableOpacity
              testID="add-lightning-round-order"
              accessibilityRole="button"
              onPress={openBuyModal}
              style={{ minHeight: 44, marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 9, backgroundColor: colors.primary }}
            >
              <Feather name="plus" size={15} color={colors.primaryForeground} />
              <Text style={{ color: colors.primaryForeground, fontFamily: 'Inter_700Bold', fontSize: 11 }}>ADD MARKET ORDER</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            testID="leave-lightning-round"
            accessibilityRole="button"
            onPress={() => {
              setLeaveLightningError('');
              setLeaveLightningOpen(true);
            }}
            style={{ minHeight: 40, marginTop: 8, alignItems: 'center', justifyContent: 'center', borderRadius: 9, borderWidth: 1, borderColor: colors.destructive }}
          >
            <Text style={{ color: colors.destructive, fontFamily: 'Inter_700Bold', fontSize: 10 }}>LEAVE LIGHTNING ROUND</Text>
          </TouchableOpacity>
          {lightningEnrollmentForDisplay.accountId === activeId && orders
            .filter((order) => order.accountId === lightningEnrollmentForDisplay.accountId
              && order.lightningRoundEventId === lightningEnrollmentForDisplay.eventId)
            .sort((left, right) => Date.parse(right.placedAt) - Date.parse(left.placedAt))
            .map((order) => {
              const estimate = quotes[order.symbol]?.price;
              const isQueued = getLightningRoundQueuedOrders(
                [order],
                lightningEnrollmentForDisplay.eventId,
                lightningEnrollmentForDisplay.accountId,
              ).length > 0;
              return (
                <View
                  key={order.id}
                  testID={`lightning-round-prepared-order-${order.id}`}
                  style={{ marginTop: 9, padding: 11, borderRadius: 9, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border }}
                >
                  <Text style={{ color: isQueued ? colors.primary : colors.mutedForeground, fontFamily: 'Inter_700Bold', fontSize: 10, lineHeight: 15 }}>
                    {isQueued ? 'PENDING — EXECUTES AT EVENT START' : order.rejectionReason ? 'ORDER REJECTED' : order.status.toUpperCase()}
                  </Text>
                  <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 13, marginTop: 4 }}>
                    {order.shares} {order.symbol} · estimated {Number.isFinite(estimate) && (estimate ?? 0) > 0
                      ? $fmt(order.shares * (estimate as number))
                      : 'value unavailable'}
                  </Text>
                  {order.rejectionReason && (
                    <Text accessibilityRole="alert" style={{ color: colors.destructive, fontFamily: 'Inter_400Regular', fontSize: 10, lineHeight: 15, marginTop: 4 }}>
                      {order.rejectionReason}
                    </Text>
                  )}
                  {isQueued && (
                    <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 10, lineHeight: 15, marginTop: 3 }}>
                      Estimated value only. Actual execution price may differ.
                    </Text>
                  )}
                  {isQueued && isLightningPreparationAccount && (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 7 }}>
                      <TouchableOpacity
                        testID={`edit-lightning-order-${order.id}`}
                        accessibilityRole="button"
                        onPress={() => editOrder(order)}
                        style={{ minHeight: 36, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', borderRadius: 7, borderWidth: 1, borderColor: colors.border }}
                      >
                        <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 9 }}>EDIT QUANTITY</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        testID={`change-lightning-order-symbol-${order.id}`}
                        accessibilityRole="button"
                        onPress={() => changeLightningOrderSymbol(order)}
                        style={{ minHeight: 36, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', borderRadius: 7, borderWidth: 1, borderColor: colors.border }}
                      >
                        <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 9 }}>CHANGE SYMBOL</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        testID={`cancel-lightning-order-${order.id}`}
                        accessibilityRole="button"
                        onPress={() => requestDeleteOrder(order)}
                        style={{ minHeight: 36, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', borderRadius: 7, borderWidth: 1, borderColor: colors.destructive }}
                      >
                        <Text style={{ color: colors.destructive, fontFamily: 'Inter_700Bold', fontSize: 9 }}>CANCEL ORDER</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })}
        </View>
      )}

      {activeChallengeEnrollment && (
        <PaperEventLiveNotice
          enrollment={activeChallengeEnrollment}
          hasCurrentEventEnrollment={hasCurrentEventEnrollment}
          isEventAccountActive={isEventAccountActive}
          lightningEntryFailure={lightningEntryFailure}
          onSwitchToPaperEventAccount={() => {
            const eventAccount = visibleAccounts.find((item) => item.id === activeChallengeEnrollment.accountId);
            if (eventAccount) void switchAccount(eventAccount.id);
          }}
        />
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
      <PaperPortfolioNavigation
        groups={PAPER_TAB_GROUPS}
        tabs={TABS}
        activeTabGroupId={PAPER_TAB_GROUPS.find((group) => group.tabs.includes(activeTab))?.id ?? 'portfolio'}
        activeTabId={activeTab}
        positionsCount={myPositions.length}
        onSelectGroup={(id) => setActiveTab(id as TabId)}
        onSelectTab={(id) => setActiveTab(id as TabId)}
      />

      {/* Content */}
      <ScrollView
        testID="paper-content"
        ref={paperScroll.ref}
        onScroll={paperScroll.onScroll}
        scrollEventThrottle={paperScroll.scrollEventThrottle}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 24, paddingTop: 10 }}
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
      <PaperTradingAction
        title={isSelectedArchivedEventAccount ? 'Event complete' : isLightningPreparationAccount ? 'Prepare order' : 'Trade'}
        hint={isSelectedArchivedEventAccount
          ? 'Select a strategy account to trade'
          : isLightningPreparationAccount
            ? 'Queue a market buy for event start'
            : `Trade in ${selectedAccountDisplayName}`}
        disabled={isSelectedArchivedEventAccount}
        accessibilityLabel={isSelectedArchivedEventAccount
          ? 'Completed Event Arena account is read-only'
          : `Buy stocks or ETFs in ${account?.name ?? 'selected account'}`}
        onPress={openBuyModal}
      />

      <BottomTabBar />

      <Modal
        visible={lightningTradeOfferWindow !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={dismissLightningTradeOffer}
      >
        <View style={{ flex: 1, justifyContent: 'center', padding: 20, backgroundColor: 'rgba(0,0,0,0.72)' }}>
          <Pressable
            accessibilityLabel="Dismiss Lightning Round enrollment offer"
            style={StyleSheet.absoluteFillObject}
            onPress={dismissLightningTradeOffer}
          />
          {lightningTradeOfferWindow && (
            <View
              testID="lightning-round-trade-offer"
              style={{
                padding: 20,
                borderRadius: 18,
                backgroundColor: colors.card,
                borderWidth: 1,
                borderColor: 'rgba(255,215,0,0.55)',
              }}
            >
              <View style={{ alignItems: 'center', marginBottom: 8 }}>
                <Feather name="zap" size={23} color={GOLD} />
              </View>
              <Text style={{ color: GOLD, fontFamily: 'Inter_700Bold', fontSize: 17, textAlign: 'center', letterSpacing: 0.5 }}>
                LIGHTNING ROUND IS APPROACHING!
              </Text>
              <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 17, textAlign: 'center', marginTop: 14 }}>
                24 hours. One champion.
              </Text>
              <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 6 }}>
                Use your existing Event Arena paper account. The highest percentage return wins.
              </Text>
              <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 10 }}>
                During preparation, you must join before trading in this account. NOT NOW cancels this trade attempt.
              </Text>

              <View style={{ marginTop: 16, padding: 13, borderRadius: 12, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border }}>
                <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 0.9 }}>
                  EVENT STARTS IN
                </Text>
                <Text
                  testID="lightning-round-trade-countdown"
                  accessibilityLiveRegion="polite"
                  style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 22, marginTop: 5 }}
                >
                  {lightningCountdownLabel(lightningTradeOfferWindow.startAtMs - lightningTradeOfferNow)}
                </Text>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginTop: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold', fontSize: 8 }}>STARTING CAPITAL</Text>
                    <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 11, marginTop: 3 }}>$100,000</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold', fontSize: 8 }}>DURATION</Text>
                    <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 11, marginTop: 3 }}>24 hours</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold', fontSize: 8 }}>WINNER</Text>
                    <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 11, marginTop: 3 }}>Highest % return</Text>
                  </View>
                </View>
              </View>

              <TouchableOpacity
                testID="join-lightning-round-from-trade"
                accessibilityRole="button"
                onPress={() => {
                  setLightningTradeOfferWindow(null);
                  router.push({ pathname: '/lightning-round', params: { join: 'trade' } });
                }}
                style={{ minHeight: 48, marginTop: 15, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: colors.primary }}
              >
                <Text style={{ color: colors.primaryForeground, fontFamily: 'Inter_700Bold', fontSize: 12 }}>JOIN LIGHTNING ROUND</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="not-now-lightning-round-from-trade"
                accessibilityRole="button"
                onPress={dismissLightningTradeOffer}
                style={{ minHeight: 44, marginTop: 3, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_700Bold', fontSize: 11 }}>NOT NOW</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Modal>

      <Modal
        visible={finalLightningCancelOrder !== null}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!finalLightningCancelling) {
            setFinalLightningCancelOrder(null);
            setFinalLightningCancelError('');
          }
        }}
      >
        <View
          testID="lightning-round-leave-confirmation"
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
              LEAVE LIGHTNING ROUND?
            </Text>
            <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19, marginTop: 9 }}>
              Cancelling your final valid market order also removes your registration. You will need to join again to enter this round.
            </Text>
            {finalLightningCancelError ? (
              <Text testID="lightning-round-leave-error" accessibilityRole="alert" style={{ color: colors.destructive, fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 17, marginTop: 10 }}>
                {finalLightningCancelError}
              </Text>
            ) : null}
            <View style={{ gap: 9, marginTop: 20 }}>
              <TouchableOpacity
                testID="keep-lightning-round-order"
                accessibilityRole="button"
                disabled={finalLightningCancelling}
                onPress={() => {
                  setFinalLightningCancelOrder(null);
                  setFinalLightningCancelError('');
                }}
                style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: colors.border }}
              >
                <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 12 }}>KEEP MY ORDER</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="confirm-lightning-round-leave"
                accessibilityRole="button"
                disabled={finalLightningCancelling}
                onPress={() => { void confirmFinalLightningCancellation(); }}
                style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: colors.destructive, opacity: finalLightningCancelling ? 0.65 : 1 }}
              >
                <Text style={{ color: colors.primaryForeground, fontFamily: 'Inter_700Bold', fontSize: 12 }}>
                  {finalLightningCancelling ? 'CANCELLING…' : 'CANCEL ORDER & LEAVE'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={leaveLightningOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!leavingLightning) {
            setLeaveLightningOpen(false);
            setLeaveLightningError('');
          }
        }}
      >
        <View
          testID="lightning-round-unenroll-confirmation"
          accessibilityRole="alert"
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, backgroundColor: 'rgba(0,0,0,0.72)' }}
        >
          <View style={{ width: '100%', maxWidth: 420, padding: 20, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card }}>
            <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 18 }}>LEAVE LIGHTNING ROUND?</Text>
            <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19, marginTop: 9 }}>
              You will be removed from this competition and will need to enroll again if registration is still open.
            </Text>
            {leaveLightningError ? (
              <Text testID="lightning-round-unenroll-error" accessibilityRole="alert" style={{ color: colors.destructive, fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 17, marginTop: 10 }}>
                {leaveLightningError}
              </Text>
            ) : null}
            <View style={{ gap: 9, marginTop: 20 }}>
              <TouchableOpacity
                testID="keep-lightning-enrollment"
                accessibilityRole="button"
                disabled={leavingLightning}
                onPress={() => {
                  setLeaveLightningOpen(false);
                  setLeaveLightningError('');
                }}
                style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: colors.border }}
              >
                <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 12 }}>KEEP ME ENROLLED</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="confirm-leave-lightning-enrollment"
                accessibilityRole="button"
                disabled={leavingLightning}
                onPress={() => { void confirmLeaveLightningRound(); }}
                style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: colors.destructive, opacity: leavingLightning ? 0.65 : 1 }}
              >
                <Text style={{ color: colors.primaryForeground, fontFamily: 'Inter_700Bold', fontSize: 12 }}>
                  {leavingLightning ? 'LEAVING…' : 'LEAVE EVENT'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

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
                  const isEventAcct = isPaperChallengeAccountId(acct.id);
                  const eventEnrollment = getPaperChallengeEnrollmentForAccount(paperChallenge, acct.id);
                  const isLightningAcct = acct.id.startsWith('paper-lightning:');
                  const isArchivedEventAccount = isEventAcct
                    && paperChallenge.history.some((event) => event.accountId === acct.id);
                  const isEventAcctResetLocked = isArchivedEventAccount || (isEventAcct
                    && !!eventEnrollment
                    && challengeNow < eventEnrollment.eventEndAtMs);
                  const isActive = acct.id === activeId;
                  const acctPositions = positions.filter((position) => position.accountId === acct.id);
                  const acctValue = computePaperEquity(acct, acctPositions, quotes);
                  const accountIndex = regularAccounts.findIndex((item) => item.id === acct.id);
                  const portfolioLabel = isEventAcct
                    ? isLightningAcct ? 'Lightning Round' : 'Event Arena'
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
                              ? 'Completed championship account is read-only'
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
                {!visibleAccounts.some((item) => isPaperChallengeAccountId(item.id)) && (
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
                <View style={{ gap: 9, paddingTop: 12, paddingBottom: 8 }}>
                  <Text style={{ color: colors.primary, fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 1 }}>
                    SAVED DATA TRANSFER
                  </Text>
                  <TouchableOpacity
                    testID="create-saved-data-transfer-code"
                    accessibilityRole="button"
                    accessibilityLabel="Create a one-time code to transfer saved app data"
                    onPress={() => {
                      setShowAccountManagement(false);
                      void createAllDataTransferCode();
                    }}
                    disabled={deviceTransferBusy}
                    style={{ minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 }}
                  >
                    <Text style={{ color: colors.primary, fontFamily: 'Inter_700Bold', fontSize: 12 }}>
                      {deviceTransferBusy ? 'PREPARING CODE…' : 'TRANSFER SAVED DATA'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    testID="open-event-arena-restore"
                    accessibilityRole="button"
                    accessibilityLabel="Restore saved app data with a transfer code"
                    onPress={() => {
                      setDeviceTransferError('');
                      setDeviceTransferCodeInput('');
                      setDeviceTransferRestoreCode('');
                      setDeviceTransferPreview(null);
                      setDeviceTransferResults([]);
                      setDeviceTransferMode('restore');
                    }}
                    style={{ minHeight: 46, borderRadius: 12, backgroundColor: 'rgba(192,192,192,0.12)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 }}
                  >
                    <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 12 }}>
                      RESTORE WITH A CODE
                    </Text>
                  </TouchableOpacity>
                  {deviceTransferError ? (
                    <Text testID="event-arena-device-sync-error" accessibilityRole="alert" style={{ color: colors.destructive, fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 17 }}>
                      {deviceTransferError}
                    </Text>
                  ) : null}
                </View>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <Modal
        visible={deviceTransferMode !== null}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!deviceTransferBusy) {
            setDeviceTransferMode(null);
            setDeviceTransferRestoreCode('');
            setDeviceTransferPreview(null);
          }
        }}
      >
        <View style={[styles.modalOverlay, { justifyContent: 'center', paddingHorizontal: 20 }]}>
          <Pressable
            testID="close-event-arena-device-transfer-backdrop"
            style={StyleSheet.absoluteFillObject}
            accessibilityLabel="Close Event Arena device transfer"
            onPress={() => {
              if (!deviceTransferBusy) {
                setDeviceTransferMode(null);
                setDeviceTransferRestoreCode('');
                setDeviceTransferPreview(null);
              }
            }}
          />
          <KeyboardControllerAvoidingView behavior="padding" keyboardVerticalOffset={0}>
            <View testID="saved-data-device-transfer" style={{ width: '100%', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 20, gap: 12, maxHeight: screenHeight * 0.88 }}>
              <Text style={{ color: colors.primary, fontFamily: 'Inter_700Bold', fontSize: 18 }}>
                {deviceTransferMode === 'create' ? 'Transfer saved data'
                  : deviceTransferMode === 'review' ? 'Review saved data'
                    : deviceTransferMode === 'result' ? 'Transfer results'
                      : 'Restore with a code'}
              </Text>
              <ScrollView
                style={{ flexShrink: 1, maxHeight: screenHeight * 0.64 }}
                contentContainerStyle={{ gap: 14, paddingBottom: 2 }}
                keyboardShouldPersistTaps="handled"
              >
              {deviceTransferMode === 'create' ? (
                <>
                  <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19 }}>
                    Save this code outside the app before uninstalling. Enter it on the phone you are restoring within 30 days; it can resume after reinstalling Meisner Method. Keep it private because anyone with the code can restore this backup. Your original phone stays unchanged.
                  </Text>
                  <Text
                    testID="saved-data-device-transfer-code"
                    selectable
                    style={{ color: colors.foreground, backgroundColor: 'rgba(192,192,192,0.1)', borderRadius: 10, padding: 14, fontFamily: 'Inter_700Bold', fontSize: 15, textAlign: 'center' }}
                  >
                    {deviceTransferBusy ? 'Preparing secure code…' : deviceTransferCode}
                  </Text>
                </>
              ) : deviceTransferMode === 'restore' ? (
                <>
                  <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19 }}>
                    Enter the code saved from your original phone. It remains valid for 30 days and can resume a restore after reinstalling the app. Restoring price alerts may ask to enable notifications on this phone.
                  </Text>
                  <TextInput
                    testID="saved-data-device-transfer-code-input"
                    accessibilityLabel="One-time saved data transfer code"
                    value={deviceTransferCodeInput}
                    onChangeText={setDeviceTransferCodeInput}
                    placeholder="Paste transfer code"
                    placeholderTextColor={colors.mutedForeground}
                    autoCapitalize="none"
                    autoCorrect={false}
                    maxLength={64}
                    returnKeyType="done"
                    editable={!deviceTransferBusy}
                    style={{ minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, color: colors.foreground, fontFamily: 'Inter_500Medium', fontSize: 14 }}
                  />
                </>
              ) : deviceTransferMode === 'review' ? (
                <>
                  <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19 }}>
                    Some categories already contain data on this phone. Keep that data, or replace only the conflicting categories. Financial histories are never combined.
                  </Text>
                  <View style={{ gap: 8 }}>
                    {deviceTransferPreview?.categories.map((category) => (
                      <View key={category.id} style={{ padding: 10, borderRadius: 10, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border }}>
                        <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>
                          {category.label} · {category.status === 'conflict' ? 'Needs a choice' : category.status === 'ready' ? 'Ready' : 'Unchanged'}
                        </Text>
                        <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 16, marginTop: 3 }}>
                          {category.reason}
                        </Text>
                      </View>
                    ))}
                  </View>
                </>
              ) : (
                <View style={{ gap: 8 }}>
                  <Text
                    testID="saved-data-transfer-result-summary"
                    accessibilityRole="alert"
                    style={{ color: deviceTransferResults.some((result) => result.status === 'failed') ? colors.destructive : colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18 }}
                  >
                    {deviceTransferResults.some((result) => result.status === 'failed')
                      ? 'Some categories could not be restored. Review the results before retrying.'
                      : deviceTransferResults.some((result) => result.status === 'skipped')
                        ? 'This transfer is partial: account data stays with your sign-in, quotes refresh automatically, and this phone registers its own notifications.'
                        : 'Each supported category reports its restore status. Some settings reload after you reopen the app.'}
                  </Text>
                  {deviceTransferResults.map((result) => (
                    <View key={result.id} style={{ padding: 10, borderRadius: 10, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border }}>
                      <Text style={{ color: result.status === 'failed' ? colors.destructive : colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>
                        {result.label} · {result.status}
                      </Text>
                      <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 16, marginTop: 3 }}>
                        {result.reason}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
              </ScrollView>
              {deviceTransferError ? (
                <Text testID="saved-data-device-transfer-error" accessibilityRole="alert" style={{ color: colors.destructive, fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 17 }}>
                  {deviceTransferError}
                </Text>
              ) : null}
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {deviceTransferMode === 'restore' && (
                  <TouchableOpacity
                    testID="submit-saved-data-device-restore"
                    accessibilityRole="button"
                    onPress={() => { void restoreAllDataTransfer(); }}
                    disabled={deviceTransferBusy}
                    style={{ flex: 1, minHeight: 50, borderRadius: 11, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, opacity: deviceTransferBusy ? 0.65 : 1 }}
                  >
                    <Text style={{ color: colors.primaryForeground, fontFamily: 'Inter_700Bold', fontSize: 11, textAlign: 'center' }}>
                      {deviceTransferBusy ? 'CHECKING…' : 'REVIEW RESTORE'}
                    </Text>
                  </TouchableOpacity>
                )}
                {deviceTransferMode === 'review' && (
                  <>
                    <TouchableOpacity
                      testID="keep-destination-transfer-data"
                      accessibilityRole="button"
                      onPress={() => { void confirmAllDataTransfer('keep-destination'); }}
                      disabled={deviceTransferBusy}
                      style={{ flex: 1, minHeight: 50, borderRadius: 11, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, opacity: deviceTransferBusy ? 0.65 : 1 }}
                    >
                      <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 10, textAlign: 'center' }}>KEEP THIS PHONE</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      testID="replace-conflicting-transfer-data"
                      accessibilityRole="button"
                      onPress={() => { void confirmAllDataTransfer('replace-conflicts'); }}
                      disabled={deviceTransferBusy}
                      style={{ flex: 1, minHeight: 50, borderRadius: 11, backgroundColor: colors.destructive, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, opacity: deviceTransferBusy ? 0.65 : 1 }}
                    >
                      <Text style={{ color: colors.primaryForeground, fontFamily: 'Inter_700Bold', fontSize: 10, textAlign: 'center' }}>REPLACE CONFLICTS</Text>
                    </TouchableOpacity>
                  </>
                )}
                <TouchableOpacity
                  testID="close-saved-data-device-transfer"
                  accessibilityRole="button"
                  onPress={() => {
                    if (deviceTransferBusy) return;
                    setDeviceTransferMode(null);
                    setDeviceTransferError('');
                    setDeviceTransferPreview(null);
                    setDeviceTransferRestoreCode('');
                  }}
                  style={{ flex: 1, minHeight: 50, borderRadius: 11, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 }}
                >
                  <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 12, textAlign: 'center' }}>
                    {deviceTransferMode === 'review' ? 'CANCEL' : 'DONE'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardControllerAvoidingView>
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
                        if (selectedSymbol) void lookUpStock(selectedSymbol, suggestion.instrumentType);
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
                        {isPennyStockMayhemFlow && (() => {
                          const quote = searchQuotes[suggestion.symbol];
                          const quoteStatus = getPennyQuoteStatus(quote);
                          const eligible = isPennyStockMayhemEligible(suggestion.instrumentType, quote);
                          return (
                            <Text
                              testID={`paper-penny-search-quote-${suggestion.symbol}`}
                              style={[styles.searchResultExchange, { marginTop: 4, color: eligible ? BUY_COLOR : DIM }]}
                              numberOfLines={2}
                            >
                              {quote
                                ? `${eligible ? 'ELIGIBLE' : 'NOT ELIGIBLE'} · $${quote.price.toFixed(2)} · ${quoteStatus.toUpperCase()} · ${formatProviderPriceSource(quote.priceSource) ?? 'Provider source unavailable'} · ${formatProviderTimestamp(quote.priceTimestamp)}`
                                : 'Quote unavailable · eligibility unknown'}
                            </Text>
                          );
                        })()}
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
                    {isPennyStockMayhemFlow && (() => {
                      const quote = quotes[buyTicker];
                      const quoteStatus = getPennyQuoteStatus(quote);
                      const eligible = isPennyStockMayhemEligible(stockInfo.assetType, quote);
                      return (
                        <View testID="paper-penny-stock-eligibility" style={{ gap: 4, marginBottom: 8 }}>
                          <Text style={{ color: eligible ? BUY_COLOR : SELL_COLOR, fontFamily: 'Inter_700Bold', fontSize: 11 }}>
                            {eligible
                              ? 'ELIGIBLE FOR A LONG BUY'
                              : stockInfo.assetType === 'unknown'
                                ? 'ASSET TYPE UNVERIFIED · LONG BUY UNAVAILABLE'
                                : quoteStatus === 'unavailable'
                                  ? 'QUOTE UNAVAILABLE · ELIGIBILITY UNKNOWN'
                                  : quoteStatus === 'stale'
                                    ? 'STALE QUOTE · ELIGIBILITY UNKNOWN'
                                    : quoteStatus === 'delayed'
                                      ? 'DELAYED QUOTE · RECHECK BEFORE BUY'
                                      : 'NOT ELIGIBLE · PRICE MUST BE BELOW $20.00'}
                          </Text>
                          <Text style={styles.searchResultExchange}>
                            {quote ? `Latest provider quote: $${quote.price.toFixed(2)}` : 'Latest provider quote unavailable'}
                            {' · '}{stockInfo.assetType === 'stock' ? 'Verified stock' : stockInfo.assetType === 'etf' ? 'Verified ETF' : 'Unsupported or unverified asset'}
                            {' · '}{quoteStatus.toUpperCase()}
                            {' · '}{formatProviderPriceSource(quote?.priceSource) ?? 'Provider source unavailable'}
                            {' · '}{formatProviderTimestamp(quote?.priceTimestamp ?? stockInfo.priceTimestamp)}
                          </Text>
                          <Text style={styles.searchResultExchange}>
                            Long-buy limit: execution quote and fill must both be under $20.00. Sell or reduce long positions at any price. Existing short-selling rules are unchanged.
                          </Text>
                        </View>
                      );
                    })()}
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
          purchaseLimit={activePurchaseLimit}
          selectedPos={tradeMode === 'sell' || tradeMode === 'cover' ? selectedPos : null}
          existingOrder={editingOrder}
          pendingOrders={orders.filter((order) =>
            order.accountId === activeId
            && !(isLightningPreparationAccount && isLightningRoundStagedOrder(order)),
          )}
          marketOnly={isLightningPreparationAccount}
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
  loadingAccountCard: {
    marginHorizontal: 16,
    marginTop: 10,
    padding: 16,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 15,
    backgroundColor: 'rgba(192,192,192,0.04)',
  },
  loadingContent: {
    gap: 13,
    marginHorizontal: 16,
    marginTop: 13,
  },
  loadingSkeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
  },
  loadingSkeletonBlock: {
    borderRadius: 6,
    backgroundColor: 'rgba(192,192,192,0.12)',
  },
  loadingSkeletonDivider: {
    height: StyleSheet.hairlineWidth,
    marginTop: 15,
    backgroundColor: BORDER,
  },
  loadingSkeletonMetrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 6,
  },
  loadingSkeletonMetric: {
    width: '50%',
    minHeight: 52,
    justifyContent: 'center',
    paddingRight: 10,
  },
  loadingPositionRow: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 11,
    backgroundColor: 'rgba(192,192,192,0.04)',
  },
  paperOrderFillAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginHorizontal: 16,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,229,160,0.38)',
    backgroundColor: 'rgba(0,229,160,0.1)',
  },
  paperOrderFillAlertText: {
    flex: 1,
    color: SILVER,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    lineHeight: 17,
  },

  // Account bar
  accountSelectorHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 4,
  },
  selectorSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: DIM,
    marginTop: 3,
  },
  accountHero: {
    flexShrink: 0,
    marginHorizontal: 16,
    marginTop: 6,
    marginBottom: 6,
    paddingHorizontal: 16,
    paddingTop: 7,
    paddingBottom: 5,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: 'rgba(214,179,91,0.46)',
    backgroundColor: 'rgba(28,27,23,0.96)',
  },
  compactAccountHero: {
    marginTop: 4,
    marginBottom: 3,
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 4,
  },
  eventChampionshipHero: {
    backgroundColor: 'rgba(24,24,25,0.98)',
    borderColor: 'rgba(231,198,106,0.62)',
  },
  eventChampionshipTopline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 2,
  },
  eventChampionshipSwitchButton: { minHeight: 30, paddingHorizontal: 9 },
  eventChampionshipPositionIndicators: { marginTop: 3 },
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
  accountPositionIndicators: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 5, marginTop: 4 },
  compactAccountPositionIndicators: { marginTop: 4 },
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
  chartNote: {
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
    color: 'rgba(192,192,192,0.3)',
    marginBottom: 10,
    marginTop: -6,
  },

  orderCard: {
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    padding: 11,
  },
  posColorBar: { width: 3, height: '100%', borderRadius: 2, minHeight: 44 },
  posAccentBar: { width: 3, borderRadius: 2, minHeight: 30, marginRight: 2 },
  posSymbol: { fontFamily: 'Inter_700Bold', fontSize: 15, color: '#fff' },
  posLabel: { fontFamily: 'Inter_400Regular', fontSize: 10, color: 'rgba(192,192,192,0.38)', letterSpacing: 1 },
  posVal: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: '#fff', marginTop: 1 },

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
