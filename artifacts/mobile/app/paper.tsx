/**
 * Paper Trading Screen — risk-free trading with $100,000 virtual cash.
 * Supports 3 independent strategy accounts with live P&L, charts, and tracking.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
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
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApi, ApiError } from '@/hooks/useApi';
import { Feather } from '@expo/vector-icons';
import { MMLogo } from '@/components/MMLogo';
import { BottomTabBar } from '@/components/BottomTabBar';
import {
  AllocationBar,
  DividendBarChart,
  GrowthProjectionChart,
  POSITION_COLORS,
  PortfolioLineChart,
} from '@/components/PaperCharts';
import OrderSheet, { type ConfirmOrderArgs } from '@/components/OrderSheet';
import {
  INITIAL_BALANCE,
  buildValueHistory,
  computeRealizedPnL,
  computeSellResult,
  computeSellWinRate,
  fundFee,
  type LiveQuote,
  type PaperAccount,
  type PaperLot,
  type PaperOrder,
  type PaperPosition,
  type PaperTransaction,
  type OrderType,
} from '@/lib/paperMath';
import {
  applySlippage,
  evaluateOrder,
  fillOrder,
  settleCash,
  creditDividends,
  fifoSell,
} from '@/lib/paperEngine';

// ── Types ──────────────────────────────────────────────────────────────────
type TabId = 'positions' | 'orders' | 'analytics' | 'dividends' | 'growth';
type StockInfo = {
  companyName: string;
  currentPrice: number;
  dividendYield: number;
  dividendRate: number;
  expenseRatio: number;
  sector: string;
};

// ── Local cache ─────────────────────────────────────────────────────────────
// Bumped to v2: adds orders, lots, and extended account fields.
const PAPER_CACHE_KEY = '@stocksense/paper_v2';

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
  try { await AsyncStorage.setItem(PAPER_CACHE_KEY, JSON.stringify(data)); } catch { /* non-fatal */ }
}

// ── Dividend helpers ────────────────────────────────────────────────────────
/**
 * Normalise dividendYield to a true decimal fraction (0–1).
 * yfinance occasionally returns the value in percent-like form (e.g. 0.99
 * meaning 0.99%) rather than as a decimal (0.0099). No real stock sustains a
 * yield above 50 %, so any value > 0.5 is divided by 100.
 */
function normYield(y: number): number {
  return y > 0.5 ? y / 100 : y;
}

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
  return pos.shares * price * normYield(pos.dividendYield);
}

// ── Constants ──────────────────────────────────────────────────────────────
const BASE_URL = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

const SILVER = '#c0c0c0';
const DIM = 'rgba(192,192,192,0.38)';
const BUY_COLOR = '#00e5a0';
const SELL_COLOR = '#ff3b3b';
const CARD_BG = 'rgba(192,192,192,0.08)';
const BORDER = 'rgba(192,192,192,0.28)';

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'positions', label: 'POSITIONS', icon: 'list' },
  { id: 'orders',    label: 'ORDERS',    icon: 'clock' },
  { id: 'analytics', label: 'ANALYTICS', icon: 'bar-chart-2' },
  { id: 'dividends', label: 'DIVIDENDS', icon: 'dollar-sign' },
  { id: 'growth',    label: 'GROWTH',    icon: 'trending-up' },
];

const SCREEN_W = Dimensions.get('window').width;

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
  const insets = useSafeAreaInsets();

  // Persisted state
  const [accounts, setAccounts] = useState<PaperAccount[]>([]);
  const [activeId, setActiveId] = useState('');
  const [positions, setPositions] = useState<PaperPosition[]>([]);
  const [transactions, setTransactions] = useState<PaperTransaction[]>([]);
  const [orders, setOrders] = useState<PaperOrder[]>([]);
  const [lots, setLots] = useState<PaperLot[]>([]);

  // Load state
  const [loaded, setLoaded] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Live quotes
  const [quotes, setQuotes] = useState<Record<string, LiveQuote>>({});
  const [loadingQuotes, setLoadingQuotes] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // UI
  const [activeTab, setActiveTab] = useState<TabId>('positions');
  const [showAccountDropdown, setShowAccountDropdown] = useState(false);
  const [showTradeModal, setShowTradeModal] = useState(false);
  const [showOrderSheet, setShowOrderSheet] = useState(false);
  const [tradeMode, setTradeMode] = useState<'buy' | 'sell'>('buy');
  const [selectedPos, setSelectedPos] = useState<PaperPosition | null>(null);

  // Buy modal state
  const [buySymbol, setBuySymbol] = useState('');
  const [stockInfo, setStockInfo] = useState<StockInfo | null>(null);
  const [infoLoading, setInfoLoading] = useState(false);
  const [infoError, setInfoError] = useState('');

  // Rename state
  const [renameId, setRenameId] = useState('');
  const [renameDraft, setRenameDraft] = useState('');

  // ── Derived ──────────────────────────────────────────────────────────────
  const account = accounts.find(a => a.id === activeId);
  const myPositions = positions.filter(p => p.accountId === activeId);
  const myTxns = transactions.filter(t => t.accountId === activeId);

  // Total equity includes settled cash + unsettled T+2 proceeds + market value of positions.
  // Buying power is restricted to settled cash only (enforced in fillOrder / OrderSheet risk check).
  const portfolioValue = account
    ? account.cash
      + (account.unsettledCash ?? 0)
      + myPositions.reduce((s, p) => s + p.shares * (quotes[p.symbol]?.price ?? p.avgCost), 0)
    : 0;
  const unrealizedPnL = myPositions.reduce(
    (s, p) => s + p.shares * ((quotes[p.symbol]?.price ?? p.avgCost) - p.avgCost), 0,
  );
  // Realized P&L is net of fund fees: gross realized minus fees charged at close.
  const realizedPnL = computeRealizedPnL(myTxns);
  const totalPnL = unrealizedPnL + realizedPnL;
  const totalReturn = ((portfolioValue - INITIAL_BALANCE) / INITIAL_BALANCE) * 100;

  const dayChange = myPositions.reduce(
    (s, p) => s + p.shares * (quotes[p.symbol]?.change ?? 0), 0,
  );

  const { apiFetch } = useApi();
  const accountsRef = useRef<PaperAccount[]>([]);
  const positionsRef = useRef<PaperPosition[]>([]);
  const transactionsRef = useRef<PaperTransaction[]>([]);
  const ordersRef = useRef<PaperOrder[]>([]);
  const lotsRef = useRef<PaperLot[]>([]);
  const activeIdRef = useRef<string>('');

  // ── Sync helper ───────────────────────────────────────────────────────────
  const syncToServer = useCallback(async (
    accts: PaperAccount[], pos: PaperPosition[], txns: PaperTransaction[],
    ords: PaperOrder[], ls: PaperLot[], aid: string,
  ) => {
    await apiFetch('/api/user/paper/sync', {
      method: 'POST',
      body: JSON.stringify({
        accounts: accts, positions: pos, transactions: txns,
        orders: ords, lots: ls, activeId: aid,
      }),
    });
  }, [apiFetch]);

  // ── Storage helpers ───────────────────────────────────────────────────────
  const flushCache = useCallback((
    accts: PaperAccount[], pos: PaperPosition[], txns: PaperTransaction[],
    ords: PaperOrder[], ls: PaperLot[], aid: string,
  ) => {
    void writePaperCache({ accounts: accts, positions: pos, transactions: txns, orders: ords, lots: ls, activeId: aid });
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
    flushCache(accts, pos, txns, ords, ls, aid);
    await syncToServer(accts, pos, txns, ords, ls, aid).catch(() => {});
  }, [syncToServer, flushCache]);

  const saveAccounts = useCallback(async (data: PaperAccount[]) => {
    accountsRef.current = data;
    setAccounts(data);
    flushCache(data, positionsRef.current, transactionsRef.current, ordersRef.current, lotsRef.current, activeIdRef.current);
    await syncToServer(data, positionsRef.current, transactionsRef.current, ordersRef.current, lotsRef.current, activeIdRef.current).catch(() => {});
  }, [syncToServer, flushCache]);
  const savePositions = useCallback(async (data: PaperPosition[]) => {
    positionsRef.current = data;
    setPositions(data);
    flushCache(accountsRef.current, data, transactionsRef.current, ordersRef.current, lotsRef.current, activeIdRef.current);
    await syncToServer(accountsRef.current, data, transactionsRef.current, ordersRef.current, lotsRef.current, activeIdRef.current).catch(() => {});
  }, [syncToServer, flushCache]);
  const saveTransactions = useCallback(async (data: PaperTransaction[]) => {
    transactionsRef.current = data;
    setTransactions(data);
    flushCache(accountsRef.current, positionsRef.current, data, ordersRef.current, lotsRef.current, activeIdRef.current);
    await syncToServer(accountsRef.current, positionsRef.current, data, ordersRef.current, lotsRef.current, activeIdRef.current).catch(() => {});
  }, [syncToServer, flushCache]);
  const saveOrders = useCallback(async (data: PaperOrder[]) => {
    ordersRef.current = data;
    setOrders(data);
    flushCache(accountsRef.current, positionsRef.current, transactionsRef.current, data, lotsRef.current, activeIdRef.current);
    await syncToServer(accountsRef.current, positionsRef.current, transactionsRef.current, data, lotsRef.current, activeIdRef.current).catch(() => {});
  }, [syncToServer, flushCache]);

  // ── Init ─────────────────────────────────────────────────────────────────
  const init = useCallback(async () => {
    setErrorMsg('');
    setLoaded(false);

    // Seed from local cache so data appears before the API responds,
    // and survives offline / signed-out launches.
    const cached = await readPaperCache();
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

    const loadAll = async () => {
      const [accts, pos, txns, ords, ls, active] = await Promise.all([
        apiFetch<PaperAccount[]>('/api/user/paper/accounts'),
        apiFetch<PaperPosition[]>('/api/user/paper/positions'),
        apiFetch<PaperTransaction[]>('/api/user/paper/transactions'),
        apiFetch<PaperOrder[]>('/api/user/paper/orders').catch(() => [] as PaperOrder[]),
        apiFetch<PaperLot[]>('/api/user/paper/lots').catch(() => [] as PaperLot[]),
        apiFetch<{ activeId: string | null }>('/api/user/paper/active'),
      ]);
      return { accts, pos, txns, ords, ls, active };
    };

    try {
      let data;
      try {
        data = await loadAll();
      } catch (e) {
        if (e instanceof ApiError && e.status === 503) {
          await new Promise((r) => setTimeout(r, 2000));
          data = await loadAll();
        } else {
          throw e;
        }
      }
      const { accts, pos, txns, ords, ls, active } = data;
      let finalAccounts = accts;
      if (finalAccounts.length === 0) {
        finalAccounts = defaultAccounts();
        await syncToServer(finalAccounts, [], [], [], [], finalAccounts[0].id).catch(() => {});
      }

      const id = active.activeId ?? finalAccounts[0].id;
      const nowISO = new Date().toISOString();

      // Run T+2 settlement and monthly dividend credits for every account.
      let settledAccounts = finalAccounts;
      let extraTxns: PaperTransaction[] = [];
      settledAccounts = settledAccounts.map((a) => {
        const { updated } = settleCash(a, nowISO);
        return updated;
      });
      for (const a of settledAccounts) {
        const accountPositions = pos.filter(p => p.accountId === a.id);
        const { updatedAccount, newTransactions } = creditDividends(accountPositions, a, {}, nowISO, uid);
        settledAccounts = settledAccounts.map(sa => sa.id === updatedAccount.id ? updatedAccount : sa);
        extraTxns = [...extraTxns, ...newTransactions];
      }
      const finalTxns = extraTxns.length > 0 ? [...txns, ...extraTxns] : txns;

      accountsRef.current = settledAccounts;
      positionsRef.current = pos;
      transactionsRef.current = finalTxns;
      ordersRef.current = ords;
      lotsRef.current = ls;
      activeIdRef.current = id;
      setAccounts(settledAccounts);
      setPositions(pos);
      setTransactions(finalTxns);
      setOrders(ords);
      setLots(ls);
      setActiveId(id);
      void writePaperCache({ accounts: settledAccounts, positions: pos, transactions: finalTxns, orders: ords, lots: ls, activeId: id });
      if (extraTxns.length > 0) {
        // Persist settlement results to server
        await syncToServer(settledAccounts, pos, finalTxns, ords, ls, id).catch(() => {});
      }
    } catch (e) {
      console.error('Failed to load paper data:', e);
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        if (!cached || cached.accounts.length === 0) {
          setErrorMsg('Please sign in to access your paper trading account.');
        }
      } else if (e instanceof ApiError && e.status === 503) {
        setErrorMsg('The server is finishing an update. Please try again in a moment.');
      } else if (e instanceof ApiError) {
        setErrorMsg('Something went wrong loading your paper trading data. Please try again.');
      } else {
        setErrorMsg('Could not reach the server. Check your connection and try again.');
      }
    } finally {
      setLoaded(true);
    }
  }, [apiFetch, syncToServer]);

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
      const q = newQuotes[order.symbol];
      if (!q) continue;
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
      const fillPrice = applySlippage(q.price, order.shares, order.side);
      const account = updatedAccounts.find(a => a.id === order.accountId);
      if (!account) continue;

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
  const fetchQuotes = useCallback(async (pos: PaperPosition[], accountId: string) => {
    // Fetch quotes for positions of the active account PLUS any pending-order symbols
    const posSymbols = pos.filter(p => p.accountId === accountId).map(p => p.symbol);
    const orderSymbols = ordersRef.current
      .filter(o => o.accountId === accountId && o.status === 'pending')
      .map(o => o.symbol);
    const symbols = [...new Set([...posSymbols, ...orderSymbols])];
    if (symbols.length === 0) return;
    setLoadingQuotes(true);
    try {
      const results = await Promise.allSettled(
        symbols.map(async sym => {
          const res = await fetch(`${BASE_URL}/api/stocks/quote/${sym}`);
          const data = await res.json();
          return { sym, data };
        }),
      );
      const next: Record<string, LiveQuote> = {};
      setQuotes(prev => {
        Object.assign(next, prev);
        for (const r of results) {
          if (r.status === 'fulfilled' && r.value.data.currentPrice) {
            const { sym, data } = r.value;
            next[sym] = { price: data.currentPrice, change: data.priceChange, pct: data.priceChangePercent };
          }
        }
        return next;
      });
      // Evaluate pending orders with the freshly-fetched quotes
      evaluatePendingOrders(next);
    } finally {
      setLoadingQuotes(false);
    }
  }, [evaluatePendingOrders]);

  useEffect(() => {
    const hasPendingOrders = orders.some(o => o.accountId === activeId && o.status === 'pending');
    // Fire even when there are no positions — pending limit/stop orders need quote polling too.
    if ((positions.length > 0 || hasPendingOrders) && activeId) {
      fetchQuotes(positions, activeId);
    }
  }, [activeId, positions.length, orders.length]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchQuotes(positions, activeId);
    setRefreshing(false);
  };

  // ── Account actions ───────────────────────────────────────────────────────
  const switchAccount = async (id: string) => {
    activeIdRef.current = id;
    setActiveId(id);
    setShowAccountDropdown(false);
    syncToServer(accountsRef.current, positionsRef.current, transactionsRef.current, ordersRef.current, lotsRef.current, id).catch(() => {});
    fetchQuotes(positions, id);
  };

  const renameAccount = async (id: string, name: string) => {
    const updated = accounts.map(a => (a.id === id ? { ...a, name } : a));
    await saveAccounts(updated);
    setRenameId('');
  };

  const resetAccount = async (id: string) => {
    const updatedAccounts = accounts.map(a =>
      a.id === id ? { ...a, cash: INITIAL_BALANCE, unsettledCash: 0, unsettledItems: [], createdAt: new Date().toISOString() } : a,
    );
    const updatedPositions = positions.filter(p => p.accountId !== id);
    const updatedTxns = transactions.filter(t => t.accountId !== id);
    const updatedOrders = orders.filter(o => o.accountId !== id);
    const updatedLots = lots.filter(l => l.accountId !== id);
    await saveAll(updatedAccounts, updatedPositions, updatedTxns, updatedOrders, updatedLots, activeIdRef.current);
    setQuotes(prev => {
      const remaining = new Set(updatedPositions.map(p => p.symbol));
      const next: Record<string, LiveQuote> = {};
      for (const [k, v] of Object.entries(prev)) {
        if (remaining.has(k)) next[k] = v;
      }
      return next;
    });
  };

  // ── Buy ───────────────────────────────────────────────────────────────────
  const lookUpStock = async () => {
    const sym = buySymbol.trim().toUpperCase();
    if (!sym) return;
    setInfoLoading(true);
    setInfoError('');
    setStockInfo(null);
    try {
      const [infoRes, quoteRes] = await Promise.all([
        fetch(`${BASE_URL}/api/stocks/info/${sym}`),
        fetch(`${BASE_URL}/api/stocks/quote/${sym}`),
      ]);
      const info = await infoRes.json();
      const quote = await quoteRes.json();
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
        [sym]: { price: quote.currentPrice, change: quote.priceChange, pct: quote.priceChangePercent },
      }));
    } catch (e: any) {
      setInfoError(e.message ?? 'Could not fetch stock info');
    } finally {
      setInfoLoading(false);
    }
  };

  /**
   * Unified order handler called by OrderSheet.onConfirm for both buy and sell.
   * Market orders execute immediately (with slippage).
   * Non-market orders are added to the pending-orders queue.
   */
  const handleConfirmOrder = async (args: ConfirmOrderArgs) => {
    if (!account) return;
    // Symbol is resolved exclusively from its source — buy uses the looked-up ticker,
    // sell uses the selected position — with no cross-flow fallback so stale buy state
    // can never silently redirect a sell to the wrong symbol.
    const sym = args.side === 'sell'
      ? (selectedPos?.symbol ?? '')
      : buySymbol.trim().toUpperCase();
    if (!sym) return;
    const companyName = args.side === 'sell'
      ? (selectedPos?.companyName ?? sym)
      : (args.stockInfo?.companyName ?? sym);
    const nowISO = new Date().toISOString();

    if (args.orderType === 'market') {
      // Execute immediately at a slippage-adjusted price
      const basePrice = args.side === 'buy'
        ? (stockInfo?.currentPrice ?? quotes[sym]?.price ?? 0)
        : (quotes[sym]?.price ?? selectedPos?.avgCost ?? 0);

      const fillPrice = applySlippage(basePrice, args.shares, args.side);

      // Build a synthetic PaperOrder for fillOrder()
      const syntheticOrder: PaperOrder = {
        id: uid(),
        accountId: activeId,
        symbol: sym,
        companyName,
        orderType: 'market',
        side: args.side,
        shares: args.shares,
        status: 'pending',
        placedAt: nowISO,
      };

      const fillResult = fillOrder({
        order: syntheticOrder,
        fillPrice,
        filledAt: nowISO,
        account,
        positions,
        lots,
        uid,
      });

      if (!fillResult.ok) {
        // Execution-time constraint violation — surface as an alert (rare: e.g. price gap)
        Alert.alert('Order rejected', fillResult.reason);
        setShowOrderSheet(false);
        setShowTradeModal(false);
        return;
      }

      const { updatedAccount, updatedPositions, updatedLots, newTransaction } = fillResult;

      // For buys, update stock metadata on the position (dividend yield, etc.)
      let finalPositions = updatedPositions;
      if (args.side === 'buy' && args.stockInfo) {
        const { dividendYield, dividendRate, expenseRatio, sector } = args.stockInfo;
        finalPositions = updatedPositions.map(p =>
          p.symbol === sym && p.accountId === activeId
            ? { ...p, dividendYield, dividendRate, expenseRatio, sector }
            : p,
        );
      }

      await saveAll(
        accounts.map(a => a.id === activeId ? updatedAccount : a),
        finalPositions,
        [...transactions, newTransaction],
        orders,
        updatedLots,
        activeIdRef.current,
      );
    } else {
      // Non-market: create a pending order
      const newOrder: PaperOrder = {
        id: uid(),
        accountId: activeId,
        symbol: sym,
        companyName,
        orderType: args.orderType,
        side: args.side,
        shares: args.shares,
        limitPrice: args.limitPrice,
        stopPrice: args.stopPrice,
        trailPct: args.trailPct,
        trailAbs: args.trailAbs,
        trailRef: args.side === 'sell'
          ? (quotes[sym]?.price ?? selectedPos?.avgCost)
          : (quotes[sym]?.price ?? stockInfo?.currentPrice),
        status: 'pending',
        placedAt: nowISO,
      };
      await saveOrders([...orders, newOrder]);
    }

    setShowOrderSheet(false);
    setShowTradeModal(false);
    setSelectedPos(null);
    setStockInfo(null);
    setBuySymbol('');
  };

  // ── Cancel order ──────────────────────────────────────────────────────────
  const cancelOrder = async (orderId: string) => {
    const updated = orders.map(o =>
      o.id === orderId ? { ...o, status: 'cancelled' as const } : o,
    );
    await saveOrders(updated);
  };

  // ── Open modals ───────────────────────────────────────────────────────────
  const openBuyModal = () => {
    setTradeMode('buy');
    setBuySymbol('');
    setStockInfo(null);
    setInfoError('');
    setShowTradeModal(true);
  };

  const openSellModal = (pos: PaperPosition) => {
    setTradeMode('sell');
    setSelectedPos(pos);
    // Clear any stale buy-lookup state so it cannot bleed into sell execution
    setBuySymbol('');
    setStockInfo(null);
    setShowOrderSheet(true);
  };

  // ── Tab views ─────────────────────────────────────────────────────────────
  const renderPositions = () => {
    if (myPositions.length === 0) {
      return (
        <View style={styles.emptyWrap}>
          <Feather name="activity" size={40} color={DIM} />
          <Text style={styles.emptyTitle}>No open positions</Text>
          <Text style={styles.emptyHint}>Tap BUY to place your first paper trade</Text>
        </View>
      );
    }
    return (
      <View style={{ gap: 10, paddingHorizontal: 16 }}>
        {myPositions.map((pos, i) => {
          const q = quotes[pos.symbol];
          const price = q?.price ?? pos.avgCost;
          const pnl = pos.shares * (price - pos.avgCost);
          const pnlPct = ((price - pos.avgCost) / pos.avgCost) * 100;
          const mktVal = pos.shares * price;
          const color = POSITION_COLORS[i % POSITION_COLORS.length];
          return (
            <TouchableOpacity
              key={pos.id}
              style={styles.posCard}
              onPress={() => openSellModal(pos)}
              activeOpacity={0.7}
            >
              <View style={[styles.posColorBar, { backgroundColor: color }]} />
              <View style={{ flex: 1 }}>
                <View style={styles.posRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.posSymbol}>{pos.symbol}</Text>
                    <Text style={styles.posName} numberOfLines={1}>{pos.companyName}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.posMktVal}>{$fmt(mktVal)}</Text>
                    <Text style={[styles.posPnl, { color: pnlColor(pnl) }]}>
                      {pnl >= 0 ? '+' : ''}{$fmt(pnl)} ({pctFmt(pnlPct)})
                    </Text>
                  </View>
                </View>
                <View style={styles.posMetaRow}>
                  <Text style={styles.posMeta}>{pos.shares} shares</Text>
                  <Text style={styles.posMeta}>Avg cost {$fmt(pos.avgCost)}</Text>
                  <Text style={styles.posMeta}>
                    {q ? (
                      <Text style={{ color: pnlColor(q.change) }}>
                        ${price.toFixed(2)} ({q.pct >= 0 ? '+' : ''}{q.pct.toFixed(2)}%)
                      </Text>
                    ) : `$${price.toFixed(2)}`}
                  </Text>
                </View>
              </View>
              <Feather name="chevron-right" size={14} color={DIM} style={{ marginLeft: 8 }} />
            </TouchableOpacity>
          );
        })}

        {/* Transaction history */}
        {myTxns.length > 0 && (
          <View style={[styles.card, { marginTop: 8 }]}>
            <Text style={styles.sectionTitle}>TRADE HISTORY</Text>
            {[...myTxns].reverse().slice(0, 20).map(tx => (
              <View key={tx.id} style={styles.txRow}>
                <View style={[styles.txBadge, { backgroundColor: tx.action === 'BUY' ? 'rgba(0,229,160,0.15)' : 'rgba(255,59,59,0.15)' }]}>
                  <Text style={[styles.txBadgeText, { color: tx.action === 'BUY' ? BUY_COLOR : SELL_COLOR }]}>
                    {tx.action}
                  </Text>
                </View>
                <Text style={styles.txSym}>{tx.symbol}</Text>
                <Text style={styles.txDetail}>{tx.shares}@ ${tx.price.toFixed(2)}</Text>
                <View style={{ flex: 1 }} />
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.txTotal}>{$fmt(tx.total)}</Text>
                  {tx.realizedPnL != null && (() => {
                    const net = tx.realizedPnL - (tx.fee ?? 0);
                    return (
                      <>
                        <Text style={{ color: pnlColor(net), fontSize: 10, fontFamily: 'Inter_500Medium' }}>
                          {net >= 0 ? '+' : ''}{$fmt(net)}
                        </Text>
                        {tx.fee != null && tx.fee > 0 && (
                          <Text style={{ color: DIM, fontSize: 9, fontFamily: 'Inter_400Regular' }}>
                            fee {$fmt(tx.fee)}
                          </Text>
                        )}
                      </>
                    );
                  })()}
                </View>
              </View>
            ))}
          </View>
        )}
      </View>
    );
  };

  const renderAnalytics = () => {
    const valueHistory = account
      ? buildValueHistory(account, myTxns, account.cash, myPositions, quotes)
      : [];
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
          <Text style={styles.sectionTitle}>PORTFOLIO VALUE OVER TIME</Text>
          <Text style={styles.chartNote}>Approximate — uses trade prices for historical points</Text>
          <PortfolioLineChart points={valueHistory} width={SCREEN_W - 64} height={180} />
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>ALLOCATION</Text>
          <AllocationBar segments={segments} width={SCREEN_W - 64} />
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
              { label: 'Unrealized P&L', val: $fmt(unrealizedPnL), color: pnlColor(unrealizedPnL) },
              { label: 'Realized P&L', val: $fmt(realizedPnL), color: pnlColor(realizedPnL) },
              { label: "Today's Change", val: $fmt(dayChange), color: pnlColor(dayChange) },
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
          <View style={styles.divRow}>
            <Text style={styles.divDetail}>{$fmt(totalAnnualDiv / 4)} / quarter</Text>
            <Text style={styles.divDetail}>{$fmt(totalAnnualDiv / 12)} / month</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>ANNUAL INCOME BY STOCK</Text>
          <DividendBarChart items={items} width={SCREEN_W - 64} height={180} />
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
                  <Text style={styles.divYield}>{(normYield(p.dividendYield) * 100).toFixed(2)}% yield</Text>
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
          Starting from current portfolio value of {$fmt(portfolioValue)}
        </Text>
        <GrowthProjectionChart startValue={portfolioValue} width={SCREEN_W - 64} height={220} />
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
      <View style={{ gap: 10, paddingHorizontal: 16 }}>
        {accountOrders.map(o => {
          const q = quotes[o.symbol];
          return (
            <View key={o.id} style={[styles.posCard, { opacity: o.status === 'cancelled' ? 0.5 : 1 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                <View style={[styles.posAccentBar, { backgroundColor: o.side === 'buy' ? BUY_COLOR : SELL_COLOR }]} />
                <Text style={styles.posSymbol}>{o.symbol}</Text>
                <View style={{ flex: 1 }} />
                <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 11, color: o.side === 'buy' ? BUY_COLOR : SELL_COLOR, letterSpacing: 1 }}>
                  {o.side.toUpperCase()}
                </Text>
                <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11, color: DIM, marginLeft: 8 }}>
                  {typeLabel[o.orderType] ?? o.orderType}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 6 }}>
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
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={[styles.posLabel, { color: statusColor(o.status) }]}>{o.status.toUpperCase()}</Text>
                {o.filledPrice != null && (
                  <Text style={[styles.posLabel, { marginLeft: 8 }]}>@ ${o.filledPrice.toFixed(2)}</Text>
                )}
                <View style={{ flex: 1 }} />
                {o.status === 'pending' && (
                  <TouchableOpacity
                    onPress={() => Alert.alert('Cancel Order', `Cancel ${o.side} ${o.shares} ${o.symbol}?`, [
                      { text: 'No', style: 'cancel' },
                      { text: 'Cancel Order', style: 'destructive', onPress: () => cancelOrder(o.id) },
                    ])}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Feather name="x" size={18} color={SELL_COLOR} />
                  </TouchableOpacity>
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
      <SafeAreaView style={styles.screen}>
        <ActivityIndicator color={SILVER} size="large" style={{ flex: 1 }} />
      </SafeAreaView>
    );
  }

  if (errorMsg) {
    return (
      <SafeAreaView style={styles.screen}>
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
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: Platform.OS === 'android' ? insets.top + 8 : 0 }]}>
        <MMLogo size={36} />
        <Text style={styles.headerTitle}>PAPER TRADE</Text>
        <View style={{ flex: 1 }} />
        <Text style={styles.headerSub}>Risk-free · $100k start</Text>
      </View>

      {/* Account Switcher */}
      <TouchableOpacity
        style={styles.accountBar}
        onPress={() => setShowAccountDropdown(true)}
        activeOpacity={0.7}
      >
        <View style={styles.accountDot} />
        <Text style={styles.accountName}>{account?.name ?? '—'}</Text>
        <Text style={styles.accountVal}>{$fmt(portfolioValue)}</Text>
        <Feather name="chevron-down" size={16} color={SILVER} style={{ marginLeft: 6 }} />
      </TouchableOpacity>

      {/* Summary Strip */}
      <View style={styles.summaryStrip}>
        {[
          {
            label: (account?.unsettledCash ?? 0) > 0 ? 'CASH+T+2' : 'CASH',
            val: $short((account?.cash ?? 0) + (account?.unsettledCash ?? 0)),
            color: SILVER,
            sub: (account?.unsettledCash ?? 0) > 0 ? `${$short(account!.cash)} settled` : undefined,
          },
          { label: 'TOTAL P&L', val: (totalPnL >= 0 ? '+' : '') + $short(totalPnL), color: pnlColor(totalPnL) },
          { label: 'RETURN', val: pctFmt(totalReturn), color: pnlColor(totalReturn) },
          { label: 'TODAY', val: (dayChange >= 0 ? '+' : '') + $short(dayChange), color: pnlColor(dayChange) },
        ].map((m, i) => (
          <View key={m.label} style={[styles.summaryCell, i > 0 && { borderLeftWidth: 1, borderLeftColor: BORDER }]}>
            <Text style={[styles.summaryVal, { color: m.color }]}>{m.val}</Text>
            <Text style={styles.summaryLabel}>{m.label}</Text>
            {m.sub ? <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 9, color: DIM }}>{m.sub}</Text> : null}
          </View>
        ))}
      </View>

      {/* Tab Bar */}
      <View style={styles.tabBar}>
        {TABS.map(tab => (
          <TouchableOpacity
            key={tab.id}
            style={[styles.tabBtn, activeTab === tab.id && styles.tabBtnActive]}
            onPress={() => setActiveTab(tab.id)}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabLabel, activeTab === tab.id && styles.tabLabelActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 120, paddingTop: 12 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={SILVER} />}
        showsVerticalScrollIndicator={false}
      >
        {activeTab === 'positions' && renderPositions()}
        {activeTab === 'orders' && renderOrders()}
        {activeTab === 'analytics' && renderAnalytics()}
        {activeTab === 'dividends' && renderDividends()}
        {activeTab === 'growth' && renderGrowth()}
      </ScrollView>

      {/* BUY FAB — show on positions and orders tab */}
      {(activeTab === 'positions' || activeTab === 'orders') && (
        <TouchableOpacity style={styles.fab} onPress={openBuyModal} activeOpacity={0.85}>
          <Feather name="plus" size={18} color="#000" />
          <Text style={styles.fabText}>BUY</Text>
        </TouchableOpacity>
      )}

      <BottomTabBar />

      {/* ── Account Dropdown Modal ────────────────────────────────── */}
      <Modal visible={showAccountDropdown} transparent animationType="slide" onRequestClose={() => setShowAccountDropdown(false)}>
        <TouchableOpacity style={styles.modalOverlay} onPress={() => setShowAccountDropdown(false)} activeOpacity={1}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <TouchableOpacity activeOpacity={1}>
              <View style={styles.bottomSheet}>
                <View style={styles.sheetHandle} />
                <Text style={styles.sheetTitle}>TRADING ACCOUNTS</Text>

                {accounts.map(acct => (
                  <View key={acct.id}>
                    <TouchableOpacity
                      style={[styles.acctRow, acct.id === activeId && styles.acctRowActive]}
                      onPress={() => switchAccount(acct.id)}
                      activeOpacity={0.7}
                    >
                      <View style={{ flex: 1 }}>
                        {renameId === acct.id ? (
                          <TextInput
                            style={styles.renameInput}
                            value={renameDraft}
                            onChangeText={setRenameDraft}
                            autoFocus
                            onSubmitEditing={() => { renameAccount(acct.id, renameDraft); }}
                            onBlur={() => { renameAccount(acct.id, renameDraft); }}
                          />
                        ) : (
                          <Text style={styles.acctName}>{acct.name}</Text>
                        )}
                        <Text style={styles.acctCash}>
                          Cash: {$fmt(acct.cash)} ·{' '}
                          {(() => {
                            const val = acct.cash + positions
                              .filter(p => p.accountId === acct.id)
                              .reduce((s, p) => s + p.shares * (quotes[p.symbol]?.price ?? p.avgCost), 0);
                            return `Total: ${$fmt(val)}`;
                          })()}
                        </Text>
                      </View>
                      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                        <TouchableOpacity
                          onPress={() => { setRenameId(acct.id); setRenameDraft(acct.name); }}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Feather name="edit-2" size={14} color={DIM} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() =>
                            Alert.alert(
                              'Reset Account',
                              `Reset "${acct.name}" to $100,000? All positions and trade history will be lost.`,
                              [
                                { text: 'Cancel', style: 'cancel' },
                                {
                                  text: 'Reset', style: 'destructive',
                                  onPress: () => { resetAccount(acct.id); setShowAccountDropdown(false); },
                                },
                              ],
                            )
                          }
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Feather name="refresh-ccw" size={14} color={SELL_COLOR} />
                        </TouchableOpacity>
                        {acct.id === activeId && <Feather name="check" size={16} color={BUY_COLOR} />}
                      </View>
                    </TouchableOpacity>
                  </View>
                ))}

                <TouchableOpacity
                  style={styles.closeSheetBtn}
                  onPress={() => setShowAccountDropdown(false)}
                >
                  <Text style={styles.closeSheetText}>CLOSE</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </KeyboardAvoidingView>
        </TouchableOpacity>
      </Modal>

      {/* ── Buy Lookup Modal (ticker search only) ────────────────── */}
      <Modal
        visible={showTradeModal}
        transparent
        animationType="slide"
        onRequestClose={() => { setShowTradeModal(false); setStockInfo(null); }}
      >
        <KeyboardAvoidingView
          style={{ flex: 1, justifyContent: 'flex-end' }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => { setShowTradeModal(false); setStockInfo(null); }} />
          <ScrollView
            style={styles.bottomSheet}
            contentContainerStyle={{ paddingBottom: 8 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <View>
              <View style={styles.sheetHandle} />
              <Text style={styles.sheetTitle}>BUY STOCK</Text>
              <Text style={styles.sheetSub}>Buying power: {$fmt(account?.cash ?? 0)}</Text>

              {/* Symbol lookup */}
              <View style={styles.lookupRow}>
                <TextInput
                  style={styles.symbolInput}
                  value={buySymbol}
                  onChangeText={t => { setBuySymbol(t.toUpperCase()); setStockInfo(null); setInfoError(''); }}
                  placeholder="Ticker (e.g. AAPL)"
                  placeholderTextColor={DIM}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  returnKeyType="search"
                  onSubmitEditing={lookUpStock}
                />
                <TouchableOpacity
                  style={[styles.lookupBtn, infoLoading && { opacity: 0.5 }]}
                  onPress={lookUpStock}
                  disabled={infoLoading || !buySymbol.trim()}
                >
                  {infoLoading
                    ? <ActivityIndicator size="small" color="#000" />
                    : <Text style={styles.lookupBtnText}>LOOK UP</Text>}
                </TouchableOpacity>
              </View>

              {infoError ? (
                <Text style={styles.errorText}>{infoError}</Text>
              ) : stockInfo ? (
                <>
                  <View style={styles.stockInfoCard}>
                    <Text style={styles.stockInfoName}>{stockInfo.companyName}</Text>
                    {stockInfo.sector ? <Text style={styles.stockInfoSector}>{stockInfo.sector}</Text> : null}
                    <Text style={styles.stockInfoPrice}>${stockInfo.currentPrice.toFixed(2)}</Text>
                    {stockInfo.dividendYield > 0 && (
                      <Text style={styles.stockInfoDiv}>
                        Dividend yield: {(normYield(stockInfo.dividendYield) * 100).toFixed(2)}%
                      </Text>
                    )}
                  </View>

                  {/* PLACE ORDER opens the full OrderSheet with order-type picker */}
                  <TouchableOpacity
                    style={[styles.confirmBtn, styles.buyBtn]}
                    onPress={() => { setShowOrderSheet(true); setShowTradeModal(false); }}
                  >
                    <Text style={styles.confirmBtnText}>PLACE ORDER →</Text>
                  </TouchableOpacity>
                </>
              ) : null}

              <TouchableOpacity style={styles.cancelBtn} onPress={() => { setShowTradeModal(false); setStockInfo(null); }}>
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
          symbol={tradeMode === 'buy' ? buySymbol.trim().toUpperCase() : (selectedPos?.symbol ?? '')}
          companyName={tradeMode === 'buy' ? (stockInfo?.companyName ?? '') : (selectedPos?.companyName ?? '')}
          currentPrice={tradeMode === 'buy' ? (stockInfo?.currentPrice ?? 0) : (quotes[selectedPos?.symbol ?? '']?.price ?? selectedPos?.avgCost ?? 0)}
          account={account}
          accountPositions={myPositions}
          quotes={quotes}
          stockInfo={tradeMode === 'buy' ? stockInfo ?? undefined : undefined}
          selectedPos={tradeMode === 'sell' ? selectedPos : null}
          onClose={() => { setShowOrderSheet(false); if (tradeMode === 'sell') setSelectedPos(null); }}
          onConfirm={handleConfirmOrder}
        />
      )}
    </SafeAreaView>
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
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  headerTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    color: SILVER,
    letterSpacing: 2,
  },
  headerSub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
    color: DIM,
    letterSpacing: 0.5,
  },

  // Account bar
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
  accountDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: BUY_COLOR },
  accountName: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: SILVER, flex: 1 },
  accountVal: { fontFamily: 'Inter_700Bold', fontSize: 14, color: '#fff' },

  // Summary strip
  summaryStrip: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: BORDER },
  summaryCell: { flex: 1, alignItems: 'center', paddingVertical: 10 },
  summaryVal: { fontFamily: 'Inter_700Bold', fontSize: 12, letterSpacing: 0.3 },
  summaryLabel: { fontFamily: 'Inter_400Regular', fontSize: 9, color: DIM, marginTop: 2, letterSpacing: 0.5 },

  // Tab bar
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    backgroundColor: '#000',
  },
  tabBtn: { flex: 1, alignItems: 'center', paddingVertical: 10 },
  tabBtnActive: { borderBottomWidth: 2, borderBottomColor: SILVER },
  tabLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 8, color: DIM, letterSpacing: 1 },
  tabLabelActive: { color: SILVER },

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
    borderRadius: 12,
    padding: 14,
    gap: 10,
  },
  posColorBar: { width: 3, height: '100%', borderRadius: 2, minHeight: 50 },
  posAccentBar: { width: 3, borderRadius: 2, minHeight: 40, marginRight: 2 },
  posRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 },
  posSymbol: { fontFamily: 'Inter_700Bold', fontSize: 16, color: '#fff' },
  posLabel: { fontFamily: 'Inter_400Regular', fontSize: 10, color: 'rgba(192,192,192,0.38)', letterSpacing: 1 },
  posVal: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: '#fff', marginTop: 1 },
  posName: { fontFamily: 'Inter_400Regular', fontSize: 11, color: DIM, marginTop: 2 },
  posMktVal: { fontFamily: 'Inter_700Bold', fontSize: 14, color: '#fff' },
  posPnl: { fontFamily: 'Inter_500Medium', fontSize: 11, marginTop: 2 },
  posMetaRow: { flexDirection: 'row', gap: 10 },
  posMeta: { fontFamily: 'Inter_400Regular', fontSize: 10, color: DIM },

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
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  metricBox: { width: '30%', backgroundColor: 'rgba(192,192,192,0.04)', borderRadius: 8, padding: 10 },
  metricVal: { fontFamily: 'Inter_700Bold', fontSize: 13 },
  metricLabel: { fontFamily: 'Inter_400Regular', fontSize: 10, color: DIM, marginTop: 4 },

  // Dividends
  divSummary: { flexDirection: 'row', marginBottom: 10 },
  divBig: { fontFamily: 'Inter_700Bold', fontSize: 22, color: '#fff' },
  divLabel: { fontFamily: 'Inter_400Regular', fontSize: 11, color: DIM, marginTop: 4 },
  divRow: { flexDirection: 'row', gap: 20 },
  divDetail: { fontFamily: 'Inter_400Regular', fontSize: 12, color: DIM },
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

  // Empty state
  emptyWrap: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 16, color: DIM },
  emptyHint: { fontFamily: 'Inter_400Regular', fontSize: 13, color: 'rgba(192,192,192,0.25)', textAlign: 'center', maxWidth: 240 },

  // FAB
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 108,
    backgroundColor: BUY_COLOR,
    borderRadius: 28,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 15,
    gap: 6,
    shadowColor: BUY_COLOR,
    shadowOpacity: 0.45,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  fabText: { fontFamily: 'Inter_700Bold', fontSize: 14, color: '#000', letterSpacing: 1 },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
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
  acctRowActive: { borderColor: 'rgba(192,192,192,0.3)', backgroundColor: CARD_BG },
  acctName: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#fff', marginBottom: 3 },
  acctCash: { fontFamily: 'Inter_400Regular', fontSize: 11, color: DIM },
  renameInput: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: SILVER,
    paddingVertical: 2,
    marginBottom: 3,
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
});
