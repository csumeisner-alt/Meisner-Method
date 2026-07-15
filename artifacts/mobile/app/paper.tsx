/**
 * Paper Trading Screen — risk-free trading with $100,000 virtual cash.
 * Supports 3 independent strategy accounts with live P&L, charts, and tracking.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { useApi } from '@/hooks/useApi';
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

// ── Types ──────────────────────────────────────────────────────────────────
type PaperAccount = {
  id: string;
  name: string;
  cash: number;
  createdAt: string;
};
type PaperPosition = {
  id: string;
  accountId: string;
  symbol: string;
  companyName: string;
  shares: number;
  avgCost: number;
  openedAt: string;
  dividendYield: number;
  sector: string;
};
type PaperTransaction = {
  id: string;
  accountId: string;
  symbol: string;
  companyName: string;
  action: 'BUY' | 'SELL';
  shares: number;
  price: number;
  total: number;
  date: string;
  realizedPnL?: number;
};
type LiveQuote = { price: number; change: number; pct: number };
type TabId = 'positions' | 'analytics' | 'dividends' | 'growth';
type StockInfo = {
  companyName: string;
  currentPrice: number;
  dividendYield: number;
  sector: string;
};

// ── Constants ──────────────────────────────────────────────────────────────
const INITIAL_BALANCE = 100_000;
const BASE_URL = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

const SILVER = '#c0c0c0';
const DIM = 'rgba(192,192,192,0.38)';
const BUY_COLOR = '#00e5a0';
const SELL_COLOR = '#ff3b3b';
const CARD_BG = 'rgba(192,192,192,0.08)';
const BORDER = 'rgba(192,192,192,0.28)';

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'positions', label: 'POSITIONS', icon: 'list' },
  { id: 'analytics', label: 'ANALYTICS', icon: 'bar-chart-2' },
  { id: 'dividends', label: 'DIVIDENDS', icon: 'dollar-sign' },
  { id: 'growth', label: 'GROWTH', icon: 'trending-up' },
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


function buildValueHistory(
  account: PaperAccount,
  txns: PaperTransaction[],
  currentCash: number,
  currentPositions: PaperPosition[],
  quotes: Record<string, LiveQuote>,
): { date: string; value: number }[] {
  const sorted = [...txns].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );
  const points: { date: string; value: number }[] = [
    { date: account.createdAt, value: INITIAL_BALANCE },
  ];
  let cash = INITIAL_BALANCE;
  const posMap: Record<string, { shares: number; avgCost: number; lastPrice: number }> = {};

  for (const tx of sorted) {
    if (tx.action === 'BUY') {
      cash -= tx.total;
      if (!posMap[tx.symbol]) {
        posMap[tx.symbol] = { shares: tx.shares, avgCost: tx.price, lastPrice: tx.price };
      } else {
        const p = posMap[tx.symbol];
        const total = p.shares + tx.shares;
        p.avgCost = (p.shares * p.avgCost + tx.shares * tx.price) / total;
        p.shares = total;
        p.lastPrice = tx.price;
      }
    } else {
      cash += tx.total;
      if (posMap[tx.symbol]) {
        posMap[tx.symbol].shares -= tx.shares;
        posMap[tx.symbol].lastPrice = tx.price;
        if (posMap[tx.symbol].shares <= 0) delete posMap[tx.symbol];
      }
    }
    const posValue = Object.values(posMap).reduce(
      (s, p) => s + p.shares * p.lastPrice, 0,
    );
    points.push({ date: tx.date, value: cash + posValue });
  }

  const livePosValue = currentPositions.reduce(
    (s, p) => s + p.shares * (quotes[p.symbol]?.price ?? p.avgCost), 0,
  );
  points.push({ date: new Date().toISOString(), value: currentCash + livePosValue });
  return points;
}

// ── Main Screen ────────────────────────────────────────────────────────────
export default function PaperScreen() {
  const insets = useSafeAreaInsets();

  // Persisted state
  const [accounts, setAccounts] = useState<PaperAccount[]>([]);
  const [activeId, setActiveId] = useState('');
  const [positions, setPositions] = useState<PaperPosition[]>([]);
  const [transactions, setTransactions] = useState<PaperTransaction[]>([]);

  // Live quotes
  const [quotes, setQuotes] = useState<Record<string, LiveQuote>>({});
  const [loadingQuotes, setLoadingQuotes] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // UI
  const [activeTab, setActiveTab] = useState<TabId>('positions');
  const [showAccountDropdown, setShowAccountDropdown] = useState(false);
  const [showTradeModal, setShowTradeModal] = useState(false);
  const [tradeMode, setTradeMode] = useState<'buy' | 'sell'>('buy');
  const [selectedPos, setSelectedPos] = useState<PaperPosition | null>(null);

  // Buy modal state
  const [buySymbol, setBuySymbol] = useState('');
  const [buyShares, setBuyShares] = useState('');
  const [stockInfo, setStockInfo] = useState<StockInfo | null>(null);
  const [infoLoading, setInfoLoading] = useState(false);
  const [infoError, setInfoError] = useState('');

  // Sell modal state
  const [sellShares, setSellShares] = useState('');

  // Rename state
  const [renameId, setRenameId] = useState('');
  const [renameDraft, setRenameDraft] = useState('');

  // ── Derived ──────────────────────────────────────────────────────────────
  const account = accounts.find(a => a.id === activeId);
  const myPositions = positions.filter(p => p.accountId === activeId);
  const myTxns = transactions.filter(t => t.accountId === activeId);

  const portfolioValue = account
    ? account.cash + myPositions.reduce((s, p) => s + p.shares * (quotes[p.symbol]?.price ?? p.avgCost), 0)
    : 0;
  const unrealizedPnL = myPositions.reduce(
    (s, p) => s + p.shares * ((quotes[p.symbol]?.price ?? p.avgCost) - p.avgCost), 0,
  );
  const realizedPnL = myTxns
    .filter(t => t.action === 'SELL')
    .reduce((s, t) => s + (t.realizedPnL ?? 0), 0);
  const totalPnL = unrealizedPnL + realizedPnL;
  const totalReturn = ((portfolioValue - INITIAL_BALANCE) / INITIAL_BALANCE) * 100;

  const dayChange = myPositions.reduce(
    (s, p) => s + p.shares * (quotes[p.symbol]?.change ?? 0), 0,
  );

  const { apiFetch } = useApi();
  const accountsRef = useRef<PaperAccount[]>([]);
  const positionsRef = useRef<PaperPosition[]>([]);
  const transactionsRef = useRef<PaperTransaction[]>([]);
  const activeIdRef = useRef<string>('');

  // ── Sync helper ───────────────────────────────────────────────────────────
  const syncToServer = useCallback(async (
    accts: PaperAccount[], pos: PaperPosition[], txns: PaperTransaction[], aid: string,
  ) => {
    await apiFetch('/api/user/paper/sync', {
      method: 'POST',
      body: JSON.stringify({ accounts: accts, positions: pos, transactions: txns, activeId: aid }),
    });
  }, [apiFetch]);

  // ── Storage helpers ───────────────────────────────────────────────────────
  const saveAccounts = useCallback(async (data: PaperAccount[]) => {
    accountsRef.current = data;
    setAccounts(data);
    await syncToServer(data, positionsRef.current, transactionsRef.current, activeIdRef.current).catch(() => {});
  }, [syncToServer]);
  const savePositions = useCallback(async (data: PaperPosition[]) => {
    positionsRef.current = data;
    setPositions(data);
    await syncToServer(accountsRef.current, data, transactionsRef.current, activeIdRef.current).catch(() => {});
  }, [syncToServer]);
  const saveTransactions = useCallback(async (data: PaperTransaction[]) => {
    transactionsRef.current = data;
    setTransactions(data);
    await syncToServer(accountsRef.current, positionsRef.current, data, activeIdRef.current).catch(() => {});
  }, [syncToServer]);

  // ── Init ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      try {
        const [accts, pos, txns, active] = await Promise.all([
          apiFetch<PaperAccount[]>('/api/user/paper/accounts'),
          apiFetch<PaperPosition[]>('/api/user/paper/positions'),
          apiFetch<PaperTransaction[]>('/api/user/paper/transactions'),
          apiFetch<{ activeId: string | null }>('/api/user/paper/active'),
        ]);
        let finalAccounts = accts;
        if (finalAccounts.length === 0) {
          finalAccounts = defaultAccounts();
          await syncToServer(finalAccounts, [], [], finalAccounts[0].id).catch(() => {});
        }
        accountsRef.current = finalAccounts;
        positionsRef.current = pos;
        transactionsRef.current = txns;
        const id = active.activeId ?? finalAccounts[0].id;
        activeIdRef.current = id;
        setAccounts(finalAccounts);
        setPositions(pos);
        setTransactions(txns);
        setActiveId(id);
      } catch (e) {
        console.error('Failed to load paper data:', e);
      }
    }
    init();
  }, [apiFetch, syncToServer]);

  // ── Fetch quotes ──────────────────────────────────────────────────────────
  const fetchQuotes = useCallback(async (positions: PaperPosition[], accountId: string) => {
    const symbols = [...new Set(positions.filter(p => p.accountId === accountId).map(p => p.symbol))];
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
      setQuotes(prev => {
        const next = { ...prev };
        for (const r of results) {
          if (r.status === 'fulfilled' && r.value.data.currentPrice) {
            const { sym, data } = r.value;
            next[sym] = { price: data.currentPrice, change: data.priceChange, pct: data.priceChangePercent };
          }
        }
        return next;
      });
    } finally {
      setLoadingQuotes(false);
    }
  }, []);

  useEffect(() => {
    if (positions.length > 0 && activeId) fetchQuotes(positions, activeId);
  }, [activeId, positions.length]);

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
    syncToServer(accountsRef.current, positionsRef.current, transactionsRef.current, id).catch(() => {});
    fetchQuotes(positions, id);
  };

  const renameAccount = async (id: string, name: string) => {
    const updated = accounts.map(a => (a.id === id ? { ...a, name } : a));
    await saveAccounts(updated);
    setRenameId('');
  };

  const resetAccount = async (id: string) => {
    const updatedAccounts = accounts.map(a =>
      a.id === id ? { ...a, cash: INITIAL_BALANCE, createdAt: new Date().toISOString() } : a,
    );
    const updatedPositions = positions.filter(p => p.accountId !== id);
    const updatedTxns = transactions.filter(t => t.accountId !== id);
    await Promise.all([
      saveAccounts(updatedAccounts),
      savePositions(updatedPositions),
      saveTransactions(updatedTxns),
    ]);
    setQuotes(prev => {
      // Remove quotes for symbols no longer held in any account
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

  const confirmBuy = async () => {
    if (!account || !stockInfo) return;
    const sym = buySymbol.trim().toUpperCase();
    const numShares = parseFloat(buyShares);
    if (!numShares || numShares <= 0) return Alert.alert('Invalid', 'Enter a valid share count.');
    const total = numShares * stockInfo.currentPrice;
    if (total > account.cash) return Alert.alert('Insufficient funds', `You need ${$fmt(total)} but have ${$fmt(account.cash)}.`);

    const now = new Date().toISOString();
    const existingPos = positions.find(p => p.accountId === activeId && p.symbol === sym);
    let newPositions: PaperPosition[];

    if (existingPos) {
      const totalShares = existingPos.shares + numShares;
      const newAvg = (existingPos.shares * existingPos.avgCost + numShares * stockInfo.currentPrice) / totalShares;
      newPositions = positions.map(p =>
        p.id === existingPos.id ? { ...p, shares: totalShares, avgCost: newAvg } : p,
      );
    } else {
      newPositions = [
        ...positions,
        {
          id: uid(),
          accountId: activeId,
          symbol: sym,
          companyName: stockInfo.companyName,
          shares: numShares,
          avgCost: stockInfo.currentPrice,
          openedAt: now,
          dividendYield: stockInfo.dividendYield,
          sector: stockInfo.sector,
        },
      ];
    }

    const tx: PaperTransaction = {
      id: uid(), accountId: activeId, symbol: sym,
      companyName: stockInfo.companyName, action: 'BUY',
      shares: numShares, price: stockInfo.currentPrice,
      total, date: now,
    };

    const updatedAccounts = accounts.map(a =>
      a.id === activeId ? { ...a, cash: a.cash - total } : a,
    );

    await Promise.all([
      saveAccounts(updatedAccounts),
      savePositions(newPositions),
      saveTransactions([...transactions, tx]),
    ]);

    setShowTradeModal(false);
    setBuySymbol('');
    setBuyShares('');
    setStockInfo(null);
  };

  // ── Sell ──────────────────────────────────────────────────────────────────
  const confirmSell = async () => {
    if (!account || !selectedPos) return;
    const numShares = parseFloat(sellShares);
    if (!numShares || numShares <= 0) return Alert.alert('Invalid', 'Enter a valid share count.');
    if (numShares > selectedPos.shares) return Alert.alert('Too many', `You only hold ${selectedPos.shares} shares.`);

    const quote = quotes[selectedPos.symbol];
    const price = quote?.price ?? selectedPos.avgCost;
    const total = numShares * price;
    const realizedPnL = numShares * (price - selectedPos.avgCost);
    const now = new Date().toISOString();

    let newPositions: PaperPosition[];
    const remaining = selectedPos.shares - numShares;
    if (remaining <= 0.0001) {
      newPositions = positions.filter(p => p.id !== selectedPos.id);
    } else {
      newPositions = positions.map(p =>
        p.id === selectedPos.id ? { ...p, shares: remaining } : p,
      );
    }

    const tx: PaperTransaction = {
      id: uid(), accountId: activeId, symbol: selectedPos.symbol,
      companyName: selectedPos.companyName, action: 'SELL',
      shares: numShares, price, total, date: now, realizedPnL,
    };

    const updatedAccounts = accounts.map(a =>
      a.id === activeId ? { ...a, cash: a.cash + total } : a,
    );

    await Promise.all([
      saveAccounts(updatedAccounts),
      savePositions(newPositions),
      saveTransactions([...transactions, tx]),
    ]);

    setShowTradeModal(false);
    setSelectedPos(null);
    setSellShares('');
  };

  // ── Open modals ───────────────────────────────────────────────────────────
  const openBuyModal = () => {
    setTradeMode('buy');
    setBuySymbol('');
    setBuyShares('');
    setStockInfo(null);
    setInfoError('');
    setShowTradeModal(true);
  };

  const openSellModal = (pos: PaperPosition) => {
    setTradeMode('sell');
    setSelectedPos(pos);
    setSellShares(String(pos.shares));
    setShowTradeModal(true);
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
                  {tx.realizedPnL != null && (
                    <Text style={{ color: pnlColor(tx.realizedPnL), fontSize: 10, fontFamily: 'Inter_500Medium' }}>
                      {tx.realizedPnL >= 0 ? '+' : ''}{$fmt(tx.realizedPnL)}
                    </Text>
                  )}
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

    const winTrades = myTxns.filter(t => t.action === 'SELL' && (t.realizedPnL ?? 0) > 0).length;
    const lossTrades = myTxns.filter(t => t.action === 'SELL' && (t.realizedPnL ?? 0) <= 0).length;
    const winRate = winTrades + lossTrades > 0
      ? ((winTrades / (winTrades + lossTrades)) * 100).toFixed(0)
      : '—';

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
    const divPositions = myPositions.filter(p => p.dividendYield > 0);
    const totalAnnualDiv = divPositions.reduce(
      (s, p) => s + p.shares * (quotes[p.symbol]?.price ?? p.avgCost) * p.dividendYield, 0,
    );
    const portfolioYield = portfolioValue > 0 ? (totalAnnualDiv / portfolioValue) * 100 : 0;
    const items = divPositions.map(p => ({
      symbol: p.symbol,
      annual: p.shares * (quotes[p.symbol]?.price ?? p.avgCost) * p.dividendYield,
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
              const annual = p.shares * price * p.dividendYield;
              return (
                <View key={p.id} style={styles.divDetailRow}>
                  <View style={[styles.allocDot, { backgroundColor: POSITION_COLORS[i % POSITION_COLORS.length] }]} />
                  <Text style={styles.divSym}>{p.symbol}</Text>
                  <Text style={styles.divYield}>{(p.dividendYield * 100).toFixed(2)}% yield</Text>
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

  // ── Modals ────────────────────────────────────────────────────────────────
  const sellPrice = selectedPos ? (quotes[selectedPos.symbol]?.price ?? selectedPos.avgCost) : 0;
  const sellTotal = parseFloat(sellShares || '0') * sellPrice;
  const sellPnL = selectedPos ? parseFloat(sellShares || '0') * (sellPrice - selectedPos.avgCost) : 0;

  const buyTotal = stockInfo ? parseFloat(buyShares || '0') * stockInfo.currentPrice : 0;
  const buyAfterCash = account ? account.cash - buyTotal : 0;

  // ── Render ────────────────────────────────────────────────────────────────
  if (accounts.length === 0) {
    return (
      <SafeAreaView style={styles.screen}>
        <ActivityIndicator color={SILVER} size="large" style={{ flex: 1 }} />
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
          { label: 'CASH', val: $short(account?.cash ?? 0), color: SILVER },
          { label: 'TOTAL P&L', val: (totalPnL >= 0 ? '+' : '') + $short(totalPnL), color: pnlColor(totalPnL) },
          { label: 'RETURN', val: pctFmt(totalReturn), color: pnlColor(totalReturn) },
          { label: 'TODAY', val: (dayChange >= 0 ? '+' : '') + $short(dayChange), color: pnlColor(dayChange) },
        ].map((m, i) => (
          <View key={m.label} style={[styles.summaryCell, i > 0 && { borderLeftWidth: 1, borderLeftColor: BORDER }]}>
            <Text style={[styles.summaryVal, { color: m.color }]}>{m.val}</Text>
            <Text style={styles.summaryLabel}>{m.label}</Text>
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
        {activeTab === 'analytics' && renderAnalytics()}
        {activeTab === 'dividends' && renderDividends()}
        {activeTab === 'growth' && renderGrowth()}
      </ScrollView>

      {/* BUY FAB */}
      {activeTab === 'positions' && (
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

      {/* ── Trade Modal ───────────────────────────────────────────── */}
      <Modal
        visible={showTradeModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowTradeModal(false)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1, justifyContent: 'flex-end' }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setShowTradeModal(false)} />
          <ScrollView
            style={styles.bottomSheet}
            contentContainerStyle={{ paddingBottom: 8 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
              <View>
                <View style={styles.sheetHandle} />

                {tradeMode === 'buy' ? (
                  <>
                    <Text style={styles.sheetTitle}>BUY STOCK</Text>
                    <Text style={styles.sheetSub}>Available: {$fmt(account?.cash ?? 0)}</Text>

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
                              Dividend yield: {(stockInfo.dividendYield * 100).toFixed(2)}%
                            </Text>
                          )}
                        </View>

                        <Text style={styles.inputLabel}>NUMBER OF SHARES</Text>
                        <TextInput
                          style={styles.sharesInput}
                          value={buyShares}
                          onChangeText={setBuyShares}
                          placeholder="0"
                          placeholderTextColor={DIM}
                          keyboardType="decimal-pad"
                        />

                        {parseFloat(buyShares) > 0 && (
                          <View style={styles.tradeCalc}>
                            <View style={styles.calcRow}>
                              <Text style={styles.calcLabel}>Total Cost</Text>
                              <Text style={[styles.calcVal, { color: SILVER }]}>{$fmt(buyTotal)}</Text>
                            </View>
                            <View style={styles.calcRow}>
                              <Text style={styles.calcLabel}>Cash After</Text>
                              <Text style={[styles.calcVal, { color: buyAfterCash >= 0 ? BUY_COLOR : SELL_COLOR }]}>
                                {$fmt(buyAfterCash)}
                              </Text>
                            </View>
                          </View>
                        )}

                        <TouchableOpacity
                          style={[styles.confirmBtn, styles.buyBtn, (!buyShares || buyAfterCash < 0) && { opacity: 0.4 }]}
                          onPress={confirmBuy}
                          disabled={!buyShares || buyAfterCash < 0}
                        >
                          <Text style={styles.confirmBtnText}>CONFIRM BUY · {$fmt(buyTotal)}</Text>
                        </TouchableOpacity>
                      </>
                    ) : null}
                  </>
                ) : (
                  /* SELL MODE */
                  <>
                    <Text style={styles.sheetTitle}>SELL {selectedPos?.symbol}</Text>
                    <Text style={styles.sheetSub}>{selectedPos?.companyName}</Text>

                    <View style={styles.stockInfoCard}>
                      <View style={styles.calcRow}>
                        <Text style={styles.calcLabel}>Avg Cost</Text>
                        <Text style={styles.calcVal}>${selectedPos?.avgCost.toFixed(2)}</Text>
                      </View>
                      <View style={styles.calcRow}>
                        <Text style={styles.calcLabel}>Current Price</Text>
                        <Text style={styles.calcVal}>${sellPrice.toFixed(2)}</Text>
                      </View>
                      <View style={styles.calcRow}>
                        <Text style={styles.calcLabel}>Shares Held</Text>
                        <Text style={styles.calcVal}>{selectedPos?.shares}</Text>
                      </View>
                    </View>

                    <Text style={styles.inputLabel}>SHARES TO SELL</Text>
                    <View style={styles.lookupRow}>
                      <TextInput
                        style={[styles.sharesInput, { flex: 1 }]}
                        value={sellShares}
                        onChangeText={setSellShares}
                        placeholder="0"
                        placeholderTextColor={DIM}
                        keyboardType="decimal-pad"
                      />
                      <TouchableOpacity
                        style={styles.allBtn}
                        onPress={() => setSellShares(String(selectedPos?.shares ?? 0))}
                      >
                        <Text style={styles.allBtnText}>ALL</Text>
                      </TouchableOpacity>
                    </View>

                    {parseFloat(sellShares) > 0 && (
                      <View style={styles.tradeCalc}>
                        <View style={styles.calcRow}>
                          <Text style={styles.calcLabel}>Proceeds</Text>
                          <Text style={[styles.calcVal, { color: SILVER }]}>{$fmt(sellTotal)}</Text>
                        </View>
                        <View style={styles.calcRow}>
                          <Text style={styles.calcLabel}>Realized P&L</Text>
                          <Text style={[styles.calcVal, { color: pnlColor(sellPnL) }]}>
                            {sellPnL >= 0 ? '+' : ''}{$fmt(sellPnL)}
                          </Text>
                        </View>
                      </View>
                    )}

                    <TouchableOpacity
                      style={[styles.confirmBtn, styles.sellBtn, !sellShares && { opacity: 0.4 }]}
                      onPress={confirmSell}
                      disabled={!sellShares}
                    >
                      <Text style={styles.confirmBtnText}>CONFIRM SELL · {$fmt(sellTotal)}</Text>
                    </TouchableOpacity>
                  </>
                )}

                <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowTradeModal(false)}>
                  <Text style={styles.cancelBtnText}>CANCEL</Text>
                </TouchableOpacity>
              </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
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
  posRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 },
  posSymbol: { fontFamily: 'Inter_700Bold', fontSize: 16, color: '#fff' },
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
    bottom: 90,
    backgroundColor: BUY_COLOR,
    borderRadius: 28,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 13,
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
