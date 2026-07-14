import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Modal,
  Pressable,
  Platform,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { BottomTabBar } from '@/components/BottomTabBar';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Trade {
  id: string;
  symbol: string;
  type: 'buy' | 'sell';
  shares: number;
  pricePerShare: number;
  date: string;
}

interface Quote {
  currentPrice: number;
  priceChange: number;
  priceChangePercent: number;
}

interface Position {
  symbol: string;
  netShares: number;
  avgCost: number;
  avgSellPrice: number;
  totalBuyShares: number;
  totalSellShares: number;
  realizedPnL: number;
  unrealizedPnL: number;
  marketValue: number;
  costBasis: number;
  currentPrice: number | null;
  pctChange: number | null;
  trades: Trade[];
}

type PortfolioTab = 'positions' | 'trades';

const STORAGE_KEY = 'meisner_portfolio_trades';
const BASE_URL = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtCurrency = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
const fmtPct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
const fmtNum = (n: number, d = 4) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: d });

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

async function fetchQuote(symbol: string): Promise<Quote> {
  const res = await fetch(`${BASE_URL}/api/stocks/quote/${symbol}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json() as Quote & { error?: string };
  if (data.error) throw new Error(data.error);
  return data;
}

function computePositions(trades: Trade[], quotes: Record<string, Quote | null>): Position[] {
  const bySymbol: Record<string, Trade[]> = {};
  for (const t of trades) {
    if (!bySymbol[t.symbol]) bySymbol[t.symbol] = [];
    bySymbol[t.symbol].push(t);
  }

  return Object.entries(bySymbol).map(([symbol, sysTrades]) => {
    const sorted = [...sysTrades].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    let buyShares = 0, buyTotal = 0;
    let sellShares = 0, sellTotal = 0;

    for (const t of sorted) {
      if (t.type === 'buy') {
        buyShares += t.shares;
        buyTotal += t.shares * t.pricePerShare;
      } else {
        sellShares += t.shares;
        sellTotal += t.shares * t.pricePerShare;
      }
    }

    const netShares = buyShares - sellShares;
    const avgCost = buyShares > 0 ? buyTotal / buyShares : 0;
    const avgSellPrice = sellShares > 0 ? sellTotal / sellShares : 0;
    const realizedPnL = sellShares > 0 ? sellShares * (avgSellPrice - avgCost) : 0;

    const q = quotes[symbol];
    const currentPrice = q?.currentPrice ?? null;
    const costBasis = netShares * avgCost;
    const marketValue = currentPrice != null ? netShares * currentPrice : 0;
    const unrealizedPnL = currentPrice != null ? netShares * (currentPrice - avgCost) : 0;
    const pctChange =
      avgCost > 0 && currentPrice != null
        ? ((currentPrice - avgCost) / avgCost) * 100
        : null;

    return {
      symbol,
      netShares,
      avgCost,
      avgSellPrice,
      totalBuyShares: buyShares,
      totalSellShares: sellShares,
      realizedPnL,
      unrealizedPnL,
      marketValue,
      costBasis,
      currentPrice,
      pctChange,
      trades: sorted,
    };
  });
}

function availableToSell(symbol: string, trades: Trade[], excludeId?: string): number {
  return trades
    .filter(t => t.symbol === symbol && t.id !== excludeId)
    .reduce((n, t) => (t.type === 'buy' ? n + t.shares : n - t.shares), 0);
}

// ─── Compact Position Row ─────────────────────────────────────────────────────

function PositionRow({
  position,
  onSell,
  onBuyMore,
  colors,
}: {
  position: Position;
  onSell: () => void;
  onBuyMore: () => void;
  colors: any;
}) {
  const isLong = position.netShares > 0;
  const isShort = position.netShares < 0;
  const hasPrice = position.currentPrice != null;
  const pnl = position.unrealizedPnL;
  const pct = position.pctChange;
  const pnlColor =
    !hasPrice
      ? colors.mutedForeground
      : pnl > 0
      ? colors.buyColor
      : pnl < 0
      ? colors.sellColor
      : colors.mutedForeground;

  return (
    <View style={[rowStyles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {/* Symbol + badge */}
      <View style={rowStyles.leftCol}>
        <Text style={[rowStyles.sym, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
          {position.symbol}
        </Text>
        <View
          style={[
            rowStyles.badge,
            {
              backgroundColor: isLong ? colors.buyBg : colors.sellBg,
              borderColor: isLong ? colors.buyColor : colors.sellColor,
            },
          ]}
        >
          <Text
            style={[
              rowStyles.badgeTxt,
              { color: isLong ? colors.buyColor : colors.sellColor, fontFamily: 'Inter_700Bold' },
            ]}
          >
            {isLong ? 'LONG' : 'SHORT'}
          </Text>
        </View>
      </View>

      {/* Shares + avg cost */}
      <View style={rowStyles.midCol}>
        <Text style={[rowStyles.midTop, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>
          {fmtNum(Math.abs(position.netShares), 2)} sh
        </Text>
        <Text style={[rowStyles.midBot, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
          avg {fmtCurrency(position.avgCost)}
        </Text>
      </View>

      {/* Unrealized P&L */}
      <View style={rowStyles.pnlCol}>
        <Text style={[rowStyles.pnlTop, { color: pnlColor, fontFamily: 'Inter_700Bold' }]}>
          {hasPrice ? `${pnl >= 0 ? '+' : ''}${fmtCurrency(pnl)}` : '—'}
        </Text>
        <Text style={[rowStyles.pnlBot, { color: pnlColor, fontFamily: 'Inter_400Regular' }]}>
          {hasPrice && pct != null ? fmtPct(pct) : '—'}
        </Text>
      </View>

      {/* Action */}
      <TouchableOpacity
        style={[
          rowStyles.actionBtn,
          { borderColor: isLong ? colors.sellColor : colors.buyColor },
        ]}
        onPress={isLong ? onSell : onBuyMore}
        activeOpacity={0.7}
      >
        <Text
          style={[
            rowStyles.actionTxt,
            {
              color: isLong ? colors.sellColor : colors.buyColor,
              fontFamily: 'Inter_700Bold',
            },
          ]}
        >
          {isLong ? 'SELL' : 'CLOSE'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const rowStyles = StyleSheet.create({
  row: {
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 9,
    gap: 8,
  },
  leftCol: { width: 60, gap: 4 },
  sym: { fontSize: 15 },
  badge: {
    borderWidth: 1,
    borderRadius: 3,
    paddingHorizontal: 5,
    paddingVertical: 1,
    alignSelf: 'flex-start',
  },
  badgeTxt: { fontSize: 7, letterSpacing: 0.4 },
  midCol: { flex: 1, gap: 3 },
  midTop: { fontSize: 12 },
  midBot: { fontSize: 10 },
  pnlCol: { alignItems: 'flex-end', gap: 3, minWidth: 86 },
  pnlTop: { fontSize: 12 },
  pnlBot: { fontSize: 10 },
  actionBtn: {
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    minWidth: 40,
    alignItems: 'center',
  },
  actionTxt: { fontSize: 9, letterSpacing: 0.5 },
});

// ─── Trade History Card ────────────────────────────────────────────────────────

function TradeCard({
  trade,
  quote,
  onEdit,
  onDelete,
  colors,
}: {
  trade: Trade;
  quote: Quote | null | undefined;
  onEdit: () => void;
  onDelete: () => void;
  colors: any;
}) {
  const isBuy = trade.type === 'buy';
  const costBasis = trade.shares * trade.pricePerShare;
  const currentVal = quote ? trade.shares * quote.currentPrice : null;
  const pl = currentVal != null
    ? isBuy ? currentVal - costBasis : costBasis - currentVal
    : null;
  const plPct = pl != null && costBasis > 0 ? (pl / costBasis) * 100 : null;
  const isGain = pl != null && pl >= 0;
  const plColor = pl == null ? colors.mutedForeground : isGain ? colors.buyColor : colors.sellColor;

  return (
    <View style={[cardStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={cardStyles.top}>
        <View style={cardStyles.topLeft}>
          <Text style={[cardStyles.symbol, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
            {trade.symbol}
          </Text>
          <View
            style={[
              cardStyles.badge,
              {
                backgroundColor: isBuy ? colors.buyBg : colors.sellBg,
                borderColor: isBuy ? colors.buyColor : colors.sellColor,
              },
            ]}
          >
            <Text
              style={[
                cardStyles.badgeText,
                { color: isBuy ? colors.buyColor : colors.sellColor, fontFamily: 'Inter_700Bold' },
              ]}
            >
              {isBuy ? 'BUY' : 'SELL'}
            </Text>
          </View>
          <Text style={[cardStyles.date, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
            {new Date(trade.date).toLocaleDateString()}
          </Text>
        </View>
        <View style={cardStyles.actions}>
          <TouchableOpacity onPress={onEdit} style={cardStyles.actionBtn} activeOpacity={0.7}>
            <Feather name="edit-2" size={14} color={colors.mutedForeground} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onDelete}
            style={[cardStyles.actionBtn, { marginLeft: 4 }]}
            activeOpacity={0.7}
          >
            <Feather name="trash-2" size={14} color={colors.sellColor} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={[cardStyles.divider, { backgroundColor: colors.border }]} />

      <View style={cardStyles.grid}>
        {[
          { label: 'SHARES', value: fmtNum(trade.shares) },
          { label: 'YOUR PRICE', value: fmtCurrency(trade.pricePerShare) },
          { label: 'CURRENT', value: quote ? fmtCurrency(quote.currentPrice) : '—' },
          {
            label: 'P&L',
            value: pl != null ? `${pl >= 0 ? '+' : ''}${fmtCurrency(pl)}` : '—',
            color: plColor,
          },
        ].map(c => (
          <View key={c.label} style={cardStyles.cell}>
            <Text style={[cardStyles.cellLabel, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
              {c.label}
            </Text>
            <Text style={[cardStyles.cellVal, { color: c.color ?? colors.foreground, fontFamily: c.color ? 'Inter_700Bold' : 'Inter_600SemiBold' }]}>
              {c.value}
            </Text>
          </View>
        ))}
      </View>

      {pl != null && plPct != null && (
        <View style={[cardStyles.plBar, { backgroundColor: isGain ? colors.buyBg : colors.sellBg }]}>
          <Text style={[cardStyles.plBarText, { color: plColor, fontFamily: 'Inter_600SemiBold' }]}>
            {pl >= 0 ? '▲' : '▼'} {fmtPct(plPct)} · {fmtCurrency(Math.abs(pl))}
          </Text>
        </View>
      )}
    </View>
  );
}

const cardStyles = StyleSheet.create({
  card: { borderRadius: 12, borderWidth: 1, marginBottom: 10, overflow: 'hidden' },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, paddingBottom: 10 },
  topLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  symbol: { fontSize: 16 },
  badge: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { fontSize: 9, letterSpacing: 0.5 },
  date: { fontSize: 10 },
  actions: { flexDirection: 'row', alignItems: 'center' },
  actionBtn: { padding: 5 },
  divider: { height: 1, marginHorizontal: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', padding: 12, gap: 12 },
  cell: { width: '44%' },
  cellLabel: { fontSize: 9, letterSpacing: 0.8, marginBottom: 2 },
  cellVal: { fontSize: 13 },
  plBar: { paddingHorizontal: 12, paddingVertical: 7 },
  plBarText: { fontSize: 12 },
});

// ─── Add/Edit Trade Modal ─────────────────────────────────────────────────────

interface TradeForm {
  symbol: string;
  type: 'buy' | 'sell';
  shares: string;
  price: string;
}

function TradeModal({
  visible,
  initial,
  defaultType,
  defaultSymbol,
  allTrades,
  onSave,
  onClose,
  colors,
}: {
  visible: boolean;
  initial?: Trade | null;
  defaultType?: 'buy' | 'sell';
  defaultSymbol?: string;
  allTrades: Trade[];
  onSave: (t: Omit<Trade, 'id' | 'date'>) => void;
  onClose: () => void;
  colors: any;
}) {
  const [form, setForm] = useState<TradeForm>({ symbol: '', type: 'buy', shares: '', price: '' });
  const [errors, setErrors] = useState<Partial<Record<keyof TradeForm, string>>>({});

  useEffect(() => {
    if (visible) {
      setErrors({});
      if (initial) {
        setForm({
          symbol: initial.symbol,
          type: initial.type,
          shares: String(initial.shares),
          price: String(initial.pricePerShare),
        });
      } else {
        setForm({ symbol: defaultSymbol ?? '', type: defaultType ?? 'buy', shares: '', price: '' });
      }
    }
  }, [visible, initial, defaultType, defaultSymbol]);

  const available =
    form.type === 'sell' && form.symbol
      ? availableToSell(form.symbol.trim().toUpperCase(), allTrades, initial?.id)
      : null;

  function validate(): boolean {
    const e: Partial<Record<keyof TradeForm, string>> = {};
    if (!form.symbol.trim()) e.symbol = 'Required';
    const s = parseFloat(form.shares);
    if (!form.shares || isNaN(s) || s <= 0) {
      e.shares = 'Enter valid shares';
    } else if (form.type === 'sell' && available != null && s > available) {
      e.shares =
        available <= 0
          ? `No long position in ${form.symbol.trim().toUpperCase()}`
          : `Max ${fmtNum(available, 2)} shares available`;
    }
    const p = parseFloat(form.price);
    if (!form.price || isNaN(p) || p <= 0) e.price = 'Enter valid price';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function submit() {
    if (!validate()) return;
    onSave({
      symbol: form.symbol.trim().toUpperCase(),
      type: form.type,
      shares: parseFloat(form.shares),
      pricePerShare: parseFloat(form.price),
    });
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={modalStyles.overlay} onPress={onClose}>
          <Pressable style={[modalStyles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[modalStyles.title, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
              {initial ? 'Edit Trade' : 'Add Trade'}
            </Text>

            <Text style={[modalStyles.label, { color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }]}>
              TICKER SYMBOL
            </Text>
            <TextInput
              style={[modalStyles.input, {
                color: colors.foreground, backgroundColor: colors.background,
                borderColor: errors.symbol ? colors.sellColor : colors.border,
                fontFamily: 'Inter_600SemiBold',
              }]}
              value={form.symbol}
              onChangeText={v => setForm({ ...form, symbol: v.toUpperCase() })}
              placeholder="AAPL"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            {errors.symbol && (
              <Text style={[modalStyles.error, { color: colors.sellColor }]}>{errors.symbol}</Text>
            )}

            <Text style={[modalStyles.label, { color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }]}>
              TYPE
            </Text>
            <View style={modalStyles.toggle}>
              {(['buy', 'sell'] as const).map(t => (
                <TouchableOpacity
                  key={t}
                  style={[
                    modalStyles.toggleBtn,
                    {
                      backgroundColor:
                        form.type === t
                          ? t === 'buy' ? colors.buyBg : colors.sellBg
                          : 'transparent',
                      borderColor:
                        form.type === t
                          ? t === 'buy' ? colors.buyColor : colors.sellColor
                          : colors.border,
                    },
                  ]}
                  onPress={() => setForm({ ...form, type: t })}
                  activeOpacity={0.75}
                >
                  <Text
                    style={[
                      modalStyles.toggleText,
                      {
                        color:
                          form.type === t
                            ? t === 'buy' ? colors.buyColor : colors.sellColor
                            : colors.mutedForeground,
                        fontFamily: 'Inter_700Bold',
                      },
                    ]}
                  >
                    {t.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {form.type === 'sell' && form.symbol.trim() && available != null && (
              <Text
                style={[
                  modalStyles.hint,
                  { color: available > 0 ? colors.buyColor : colors.sellColor },
                ]}
              >
                {available > 0
                  ? `Available to sell: ${fmtNum(available, 2)} shares`
                  : `No long position in ${form.symbol.trim().toUpperCase()} — buy first`}
              </Text>
            )}

            <View style={modalStyles.row}>
              <View style={{ flex: 1 }}>
                <Text style={[modalStyles.label, { color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }]}>
                  SHARES
                </Text>
                <TextInput
                  style={[modalStyles.input, {
                    color: colors.foreground, backgroundColor: colors.background,
                    borderColor: errors.shares ? colors.sellColor : colors.border,
                    fontFamily: 'Inter_600SemiBold',
                  }]}
                  value={form.shares}
                  onChangeText={v => setForm({ ...form, shares: v })}
                  placeholder="10"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="decimal-pad"
                />
                {errors.shares && (
                  <Text style={[modalStyles.error, { color: colors.sellColor }]}>{errors.shares}</Text>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[modalStyles.label, { color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }]}>
                  PRICE / SHARE
                </Text>
                <TextInput
                  style={[modalStyles.input, {
                    color: colors.foreground, backgroundColor: colors.background,
                    borderColor: errors.price ? colors.sellColor : colors.border,
                    fontFamily: 'Inter_600SemiBold',
                  }]}
                  value={form.price}
                  onChangeText={v => setForm({ ...form, price: v })}
                  placeholder="150.00"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="decimal-pad"
                />
                {errors.price && (
                  <Text style={[modalStyles.error, { color: colors.sellColor }]}>{errors.price}</Text>
                )}
              </View>
            </View>

            <View style={modalStyles.btnRow}>
              <TouchableOpacity
                style={[modalStyles.cancelBtn, { borderColor: colors.border }]}
                onPress={onClose}
                activeOpacity={0.7}
              >
                <Text style={[modalStyles.cancelText, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[modalStyles.saveBtn, { backgroundColor: colors.primary }]}
                onPress={submit}
                activeOpacity={0.8}
              >
                <Text style={[modalStyles.saveText, { color: colors.primaryForeground, fontFamily: 'Inter_700Bold' }]}>
                  {initial ? 'Save Changes' : 'Add Trade'}
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const modalStyles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.7)' },
  sheet: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 1,
    borderBottomWidth: 0,
    padding: 24,
    paddingBottom: Platform.OS === 'web' ? 24 : 40,
    gap: 6,
  },
  title: { fontSize: 18, marginBottom: 8 },
  label: { fontSize: 10, letterSpacing: 0.8, marginBottom: 5, marginTop: 10 },
  hint: { fontSize: 11, marginTop: -2, marginBottom: 4, fontFamily: 'Inter_500Medium' },
  input: { height: 46, borderRadius: 8, borderWidth: 1, paddingHorizontal: 12, fontSize: 15 },
  error: { fontSize: 11, marginTop: 3, fontFamily: 'Inter_400Regular' },
  row: { flexDirection: 'row', gap: 12 },
  toggle: { flexDirection: 'row', gap: 10 },
  toggleBtn: { flex: 1, height: 44, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  toggleText: { fontSize: 14, letterSpacing: 1 },
  btnRow: { flexDirection: 'row', gap: 12, marginTop: 16 },
  cancelBtn: { flex: 1, height: 48, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontSize: 14 },
  saveBtn: { flex: 2, height: 48, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  saveText: { fontSize: 14, letterSpacing: 0.5 },
});

// ─── Summary Card ─────────────────────────────────────────────────────────────

function SummaryCard({
  positions,
  onReset,
  colors,
}: {
  positions: Position[];
  onReset: () => void;
  colors: any;
}) {
  const openPositions = positions.filter(p => p.netShares !== 0);
  const totalCostBasis = openPositions.reduce((s, p) => s + Math.max(p.costBasis, 0), 0);
  const totalMarketValue = openPositions.reduce((s, p) => s + p.marketValue, 0);
  const totalUnrealized = openPositions.reduce((s, p) => s + p.unrealizedPnL, 0);
  const totalRealized = positions.reduce((s, p) => s + p.realizedPnL, 0);
  const totalPnL = totalUnrealized + totalRealized;
  const totalPct = totalCostBasis > 0 ? (totalUnrealized / totalCostBasis) * 100 : 0;
  const isGain = totalPnL >= 0;
  const unrealColor = totalUnrealized >= 0 ? colors.buyColor : colors.sellColor;
  const realColor = totalRealized > 0 ? colors.buyColor : totalRealized < 0 ? colors.sellColor : colors.mutedForeground;

  return (
    <View style={[sumStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {/* Title row */}
      <View style={sumStyles.titleRow}>
        <Text style={[sumStyles.heading, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>
          PORTFOLIO SUMMARY
        </Text>
        <TouchableOpacity style={sumStyles.resetBtn} onPress={onReset} activeOpacity={0.7}>
          <Feather name="trash-2" size={12} color={colors.sellColor} />
          <Text style={[sumStyles.resetTxt, { color: colors.sellColor, fontFamily: 'Inter_600SemiBold' }]}>
            RESET
          </Text>
        </TouchableOpacity>
      </View>

      {/* Metrics */}
      <View style={sumStyles.metricsRow}>
        <View style={sumStyles.metricCell}>
          <Text style={[sumStyles.metricLabel, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
            COST BASIS
          </Text>
          <Text style={[sumStyles.metricVal, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
            {fmtCurrency(totalCostBasis)}
          </Text>
        </View>
        <View style={[sumStyles.metricDivider, { backgroundColor: colors.border }]} />
        <View style={sumStyles.metricCell}>
          <Text style={[sumStyles.metricLabel, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
            MKT VALUE
          </Text>
          <Text style={[sumStyles.metricVal, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
            {fmtCurrency(totalMarketValue)}
          </Text>
        </View>
        <View style={[sumStyles.metricDivider, { backgroundColor: colors.border }]} />
        <View style={sumStyles.metricCell}>
          <Text style={[sumStyles.metricLabel, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
            REALIZED
          </Text>
          <Text style={[sumStyles.metricVal, { color: realColor, fontFamily: 'Inter_700Bold' }]}>
            {totalRealized >= 0 ? '+' : ''}{fmtCurrency(totalRealized)}
          </Text>
        </View>
      </View>

      {/* P&L strip */}
      <View
        style={[
          sumStyles.plStrip,
          {
            backgroundColor: isGain ? colors.buyBg : colors.sellBg,
            borderColor: isGain ? colors.buyColor : colors.sellColor,
          },
        ]}
      >
        <Text style={[sumStyles.plLabel, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
          UNREALIZED
        </Text>
        <Text style={[sumStyles.plVal, { color: unrealColor, fontFamily: 'Inter_700Bold' }]}>
          {totalUnrealized >= 0 ? '+' : ''}{fmtCurrency(totalUnrealized)}
          {totalPct !== 0 ? `  ${fmtPct(totalPct)}` : ''}
        </Text>
        <Text style={[sumStyles.plTotal, { color: isGain ? colors.buyColor : colors.sellColor, fontFamily: 'Inter_700Bold' }]}>
          TOTAL  {totalPnL >= 0 ? '+' : ''}{fmtCurrency(totalPnL)}
        </Text>
      </View>
    </View>
  );
}

const sumStyles = StyleSheet.create({
  card: { borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 12 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  heading: { fontSize: 9, letterSpacing: 1 },
  resetBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  resetTxt: { fontSize: 10, letterSpacing: 0.5 },
  metricsRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  metricCell: { flex: 1, gap: 3 },
  metricDivider: { width: 1, height: 32, marginHorizontal: 8 },
  metricLabel: { fontSize: 8, letterSpacing: 0.6 },
  metricVal: { fontSize: 13 },
  plStrip: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
  },
  plLabel: { fontSize: 8, letterSpacing: 0.6 },
  plVal: { fontSize: 12 },
  plTotal: { fontSize: 12 },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function PortfolioScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [trades, setTrades] = useState<Trade[]>([]);
  const [quotes, setQuotes] = useState<Record<string, Quote | null>>({});
  const [loadingQuotes, setLoadingQuotes] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [portfolioTab, setPortfolioTab] = useState<PortfolioTab>('positions');
  const [modalVisible, setModalVisible] = useState(false);
  const [editTarget, setEditTarget] = useState<Trade | null>(null);
  const [defaultType, setDefaultType] = useState<'buy' | 'sell'>('buy');
  const [defaultSymbol, setDefaultSymbol] = useState<string | undefined>(undefined);

  const topPad = Platform.OS === 'web' ? 16 : insets.top;

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(v => {
      if (v) setTrades(JSON.parse(v));
    });
  }, []);

  const saveTrades = useCallback(async (next: Trade[]) => {
    setTrades(next);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const fetchAllQuotes = useCallback(async (tradeList: Trade[]) => {
    const symbols = [...new Set(tradeList.map(t => t.symbol))];
    if (!symbols.length) return;
    setLoadingQuotes(true);
    const results = await Promise.all(symbols.map(sym => fetchQuote(sym).catch(() => null)));
    const map: Record<string, Quote | null> = {};
    symbols.forEach((sym, i) => { map[sym] = results[i] ?? null; });
    setQuotes(map);
    setLoadingQuotes(false);
  }, []);

  useEffect(() => {
    if (trades.length) fetchAllQuotes(trades);
  }, [trades.length]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAllQuotes(trades);
    setRefreshing(false);
  };

  // All positions (including closed ones for trade history math)
  const allPositions = computePositions(trades, quotes);
  // Only open positions for the Positions tab
  const openPositions = allPositions.filter(p => p.netShares !== 0);

  function handleReset() {
    Alert.alert(
      'Reset Portfolio',
      'This will permanently delete ALL trades, positions, and trade history. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Everything',
          style: 'destructive',
          onPress: async () => {
            setTrades([]);
            setQuotes({});
            await AsyncStorage.removeItem(STORAGE_KEY);
          },
        },
      ]
    );
  }

  function handleSave(data: Omit<Trade, 'id' | 'date'>) {
    if (data.type === 'sell') {
      const avail = availableToSell(data.symbol, trades, editTarget?.id ?? undefined);
      if (avail <= 0) {
        Alert.alert('No Position', `You don't have any shares of ${data.symbol} to sell.`);
        return;
      }
      if (data.shares > avail) {
        Alert.alert('Too Many Shares', `You only hold ${fmtNum(avail, 2)} shares of ${data.symbol}.`);
        return;
      }
    }

    if (editTarget) {
      saveTrades(trades.map(t => (t.id === editTarget.id ? { ...t, ...data } : t)));
    } else {
      saveTrades([...trades, { id: uid(), date: new Date().toISOString(), ...data }]);
    }
    setModalVisible(false);
    setEditTarget(null);
  }

  function openAdd(type: 'buy' | 'sell' = 'buy', symbol?: string) {
    setEditTarget(null);
    setDefaultType(type);
    setDefaultSymbol(symbol);
    setModalVisible(true);
  }

  function handleEdit(trade: Trade) {
    setEditTarget(trade);
    setDefaultType(trade.type);
    setDefaultSymbol(trade.symbol);
    setModalVisible(true);
  }

  function handleDelete(id: string) {
    Alert.alert('Remove Trade', 'Remove this trade from history?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => saveTrades(trades.filter(t => t.id !== id)) },
    ]);
  }

  const isEmpty = trades.length === 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <View style={[styles.header, { paddingTop: topPad + 10, borderBottomColor: colors.border }]}>
        <View style={styles.headerRow}>
          <Text style={[styles.title, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
            PORTFOLIO
          </Text>
          <View style={styles.headerRight}>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={onRefresh}
              disabled={loadingQuotes || isEmpty}
              activeOpacity={0.7}
            >
              {loadingQuotes ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Feather name="refresh-cw" size={16} color={isEmpty ? colors.mutedForeground : colors.primary} />
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.addBtn, { backgroundColor: colors.primary }]}
              onPress={() => openAdd('buy')}
              activeOpacity={0.8}
            >
              <Feather name="plus" size={15} color={colors.primaryForeground} />
              <Text style={[styles.addBtnText, { color: colors.primaryForeground, fontFamily: 'Inter_700Bold' }]}>
                ADD TRADE
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Tab selector */}
        {!isEmpty && (
          <View style={[styles.tabRow, { borderBottomColor: colors.border }]}>
            {(['positions', 'trades'] as PortfolioTab[]).map(tab => (
              <TouchableOpacity
                key={tab}
                style={[
                  styles.tabBtn,
                  portfolioTab === tab && { borderBottomColor: colors.primary, borderBottomWidth: 2 },
                ]}
                onPress={() => setPortfolioTab(tab)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.tabLabel,
                    {
                      color: portfolioTab === tab ? colors.primary : colors.mutedForeground,
                      fontFamily: portfolioTab === tab ? 'Inter_700Bold' : 'Inter_400Regular',
                    },
                  ]}
                >
                  {tab === 'positions'
                    ? `POSITIONS (${openPositions.length})`
                    : `HISTORY (${trades.length})`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* ── Content ────────────────────────────────────────────────────── */}
      {isEmpty ? (
        <View style={styles.emptyWrap}>
          <Feather name="briefcase" size={40} color="rgba(192,192,192,0.18)" />
          <Text style={[styles.emptyTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
            No trades yet
          </Text>
          <Text style={[styles.emptySub, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
            Add a BUY trade to start tracking your real portfolio.
          </Text>
          <TouchableOpacity
            style={[styles.emptyBtn, { borderColor: colors.primary }]}
            onPress={() => openAdd('buy')}
            activeOpacity={0.75}
          >
            <Feather name="plus" size={15} color={colors.primary} />
            <Text style={[styles.emptyBtnText, { color: colors.primary, fontFamily: 'Inter_600SemiBold' }]}>
              ADD TRADE
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.list, { paddingBottom: 24 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
        >
          <SummaryCard positions={allPositions} onReset={handleReset} colors={colors} />

          {portfolioTab === 'positions' ? (
            <>
              {openPositions.length === 0 ? (
                <View style={styles.closedNotice}>
                  <Feather name="check-circle" size={28} color={colors.buyColor} />
                  <Text style={[styles.closedTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
                    All positions closed
                  </Text>
                  <Text style={[styles.closedSub, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                    Your realized P&L is shown above. Switch to History to see all trades.
                  </Text>
                </View>
              ) : (
                openPositions.map(pos => (
                  <PositionRow
                    key={pos.symbol}
                    position={pos}
                    onSell={() => openAdd('sell', pos.symbol)}
                    onBuyMore={() => openAdd('buy', pos.symbol)}
                    colors={colors}
                  />
                ))
              )}
            </>
          ) : (
            [...trades]
              .reverse()
              .map(trade => (
                <TradeCard
                  key={trade.id}
                  trade={trade}
                  quote={quotes[trade.symbol]}
                  onEdit={() => handleEdit(trade)}
                  onDelete={() => handleDelete(trade.id)}
                  colors={colors}
                />
              ))
          )}
        </ScrollView>
      )}

      <BottomTabBar />

      <TradeModal
        visible={modalVisible}
        initial={editTarget}
        defaultType={defaultType}
        defaultSymbol={defaultSymbol}
        allTrades={trades}
        onSave={handleSave}
        onClose={() => {
          setModalVisible(false);
          setEditTarget(null);
        }}
        colors={colors}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 0, borderBottomWidth: 1 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  title: { fontSize: 18, letterSpacing: 2 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: { padding: 6 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 7,
  },
  addBtnText: { fontSize: 11, letterSpacing: 0.5 },
  tabRow: { flexDirection: 'row', borderBottomWidth: 1 },
  tabBtn: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabLabel: { fontSize: 10, letterSpacing: 0.8 },
  list: { paddingHorizontal: 14, paddingTop: 12 },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 10 },
  emptyTitle: { fontSize: 17, marginTop: 10 },
  emptySub: { fontSize: 13, textAlign: 'center', lineHeight: 19 },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 18,
    paddingVertical: 9,
    marginTop: 6,
  },
  emptyBtnText: { fontSize: 13, letterSpacing: 0.5 },
  closedNotice: { alignItems: 'center', paddingVertical: 32, gap: 8 },
  closedTitle: { fontSize: 16, marginTop: 4 },
  closedSub: { fontSize: 12, textAlign: 'center', lineHeight: 18, paddingHorizontal: 20 },
});
