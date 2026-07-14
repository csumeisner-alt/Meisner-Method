import React, { useState, useEffect, useCallback, useRef } from 'react';
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

const STORAGE_KEY = 'meisner_portfolio_trades';
const BASE_URL = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtCurrency = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

const fmtPct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
const fmtNum = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ onAdd, colors }: { onAdd: () => void; colors: any }) {
  return (
    <View style={emptyStyles.wrap}>
      <Feather name="briefcase" size={44} color="rgba(192,192,192,0.2)" />
      <Text style={[emptyStyles.title, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
        No trades yet
      </Text>
      <Text style={[emptyStyles.sub, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
        Add your first trade to start tracking your portfolio performance.
      </Text>
      <TouchableOpacity
        style={[emptyStyles.btn, { borderColor: colors.primary }]}
        onPress={onAdd}
        activeOpacity={0.75}
      >
        <Feather name="plus" size={16} color={colors.primary} />
        <Text style={[emptyStyles.btnText, { color: colors.primary, fontFamily: 'Inter_600SemiBold' }]}>
          ADD TRADE
        </Text>
      </TouchableOpacity>
    </View>
  );
}
const emptyStyles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 12 },
  title: { fontSize: 18, marginTop: 12 },
  sub: { fontSize: 13, textAlign: 'center', lineHeight: 20 },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 8, paddingHorizontal: 20, paddingVertical: 10, marginTop: 8 },
  btnText: { fontSize: 13, letterSpacing: 0.5 },
});

// ─── Trade Card ───────────────────────────────────────────────────────────────

function TradeCard({
  trade,
  quote,
  loading,
  onEdit,
  onDelete,
  colors,
}: {
  trade: Trade;
  quote: Quote | null | undefined;
  loading: boolean;
  onEdit: () => void;
  onDelete: () => void;
  colors: any;
}) {
  const isBuy = trade.type === 'buy';
  const costBasis = trade.shares * trade.pricePerShare;
  const currentVal = quote ? trade.shares * quote.currentPrice : null;
  const pl = currentVal != null ? (isBuy ? currentVal - costBasis : costBasis - currentVal) : null;
  const plPct = pl != null && costBasis > 0 ? (pl / costBasis) * 100 : null;
  const isGain = pl != null && pl >= 0;

  const plColor = pl == null ? colors.mutedForeground : isGain ? colors.buyColor : colors.sellColor;

  return (
    <View style={[cardStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={cardStyles.top}>
        <View style={cardStyles.left}>
          <Text style={[cardStyles.symbol, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
            {trade.symbol}
          </Text>
          <View style={[cardStyles.badge, { backgroundColor: isBuy ? colors.buyBg : colors.sellBg, borderColor: isBuy ? colors.buyColor : colors.sellColor }]}>
            <Text style={[cardStyles.badgeText, { color: isBuy ? colors.buyColor : colors.sellColor, fontFamily: 'Inter_700Bold' }]}>
              {isBuy ? 'BUY' : 'SELL'}
            </Text>
          </View>
        </View>
        <View style={cardStyles.actions}>
          <TouchableOpacity onPress={onEdit} style={cardStyles.actionBtn} activeOpacity={0.7}>
            <Feather name="edit-2" size={14} color={colors.mutedForeground} />
          </TouchableOpacity>
          <TouchableOpacity onPress={onDelete} style={[cardStyles.actionBtn, { marginLeft: 4 }]} activeOpacity={0.7}>
            <Feather name="trash-2" size={14} color={colors.sellColor} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={[cardStyles.divider, { backgroundColor: colors.border }]} />

      <View style={cardStyles.grid}>
        <View style={cardStyles.cell}>
          <Text style={[cardStyles.cellLabel, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>SHARES</Text>
          <Text style={[cardStyles.cellVal, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>
            {fmtNum(trade.shares)}
          </Text>
        </View>
        <View style={cardStyles.cell}>
          <Text style={[cardStyles.cellLabel, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>YOUR PRICE</Text>
          <Text style={[cardStyles.cellVal, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>
            {fmtCurrency(trade.pricePerShare)}
          </Text>
        </View>
        <View style={cardStyles.cell}>
          <Text style={[cardStyles.cellLabel, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>CURRENT</Text>
          {loading ? (
            <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 2 }} />
          ) : (
            <Text style={[cardStyles.cellVal, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>
              {quote ? fmtCurrency(quote.currentPrice) : '—'}
            </Text>
          )}
        </View>
        <View style={cardStyles.cell}>
          <Text style={[cardStyles.cellLabel, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>P&amp;L</Text>
          {loading ? (
            <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 2 }} />
          ) : (
            <Text style={[cardStyles.cellVal, { color: plColor, fontFamily: 'Inter_700Bold' }]}>
              {pl != null ? `${pl >= 0 ? '+' : ''}${fmtCurrency(pl)}` : '—'}
            </Text>
          )}
        </View>
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
  card: { borderRadius: 12, borderWidth: 1, marginBottom: 12, overflow: 'hidden' },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, paddingBottom: 12 },
  left: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  symbol: { fontSize: 18 },
  badge: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 7, paddingVertical: 2 },
  badgeText: { fontSize: 10, letterSpacing: 0.5 },
  actions: { flexDirection: 'row', alignItems: 'center' },
  actionBtn: { padding: 6 },
  divider: { height: 1, marginHorizontal: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', padding: 14, gap: 14 },
  cell: { width: '44%' },
  cellLabel: { fontSize: 9, letterSpacing: 0.8, marginBottom: 3 },
  cellVal: { fontSize: 14 },
  plBar: { paddingHorizontal: 14, paddingVertical: 8, marginTop: 2 },
  plBarText: { fontSize: 13 },
});

// ─── Add/Edit Modal ───────────────────────────────────────────────────────────

interface TradeForm {
  symbol: string;
  type: 'buy' | 'sell';
  shares: string;
  price: string;
}

function TradeModal({
  visible,
  initial,
  onSave,
  onClose,
  colors,
}: {
  visible: boolean;
  initial?: Trade | null;
  onSave: (t: Omit<Trade, 'id' | 'date'>) => void;
  onClose: () => void;
  colors: any;
}) {
  const [form, setForm] = useState<TradeForm>({
    symbol: '',
    type: 'buy',
    shares: '',
    price: '',
  });
  const [errors, setErrors] = useState<Partial<TradeForm>>({});

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
        setForm({ symbol: '', type: 'buy', shares: '', price: '' });
      }
    }
  }, [visible, initial]);

  function validate() {
    const e: Partial<TradeForm> = {};
    if (!form.symbol.trim()) e.symbol = 'Required';
    const s = parseFloat(form.shares);
    if (!form.shares || isNaN(s) || s <= 0) e.shares = 'Enter valid shares';
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
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={modalStyles.overlay} onPress={onClose}>
          <Pressable style={[modalStyles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[modalStyles.title, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
              {initial ? 'Edit Trade' : 'Add Trade'}
            </Text>

            {/* Symbol */}
            <Text style={[modalStyles.label, { color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }]}>TICKER SYMBOL</Text>
            <TextInput
              style={[modalStyles.input, {
                color: colors.foreground,
                backgroundColor: colors.background,
                borderColor: errors.symbol ? colors.sellColor : colors.border,
                fontFamily: 'Inter_600SemiBold',
              }]}
              value={form.symbol}
              onChangeText={(v) => setForm({ ...form, symbol: v.toUpperCase() })}
              placeholder="AAPL"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            {errors.symbol && (
              <Text style={[modalStyles.error, { color: colors.sellColor }]}>{errors.symbol}</Text>
            )}

            {/* Type toggle */}
            <Text style={[modalStyles.label, { color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }]}>TYPE</Text>
            <View style={modalStyles.toggle}>
              {(['buy', 'sell'] as const).map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[
                    modalStyles.toggleBtn,
                    {
                      backgroundColor: form.type === t
                        ? (t === 'buy' ? colors.buyBg : colors.sellBg)
                        : 'transparent',
                      borderColor: form.type === t
                        ? (t === 'buy' ? colors.buyColor : colors.sellColor)
                        : colors.border,
                    },
                  ]}
                  onPress={() => setForm({ ...form, type: t })}
                  activeOpacity={0.75}
                >
                  <Text style={[modalStyles.toggleText, {
                    color: form.type === t ? (t === 'buy' ? colors.buyColor : colors.sellColor) : colors.mutedForeground,
                    fontFamily: 'Inter_700Bold',
                  }]}>
                    {t.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Shares & Price */}
            <View style={modalStyles.row}>
              <View style={{ flex: 1 }}>
                <Text style={[modalStyles.label, { color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }]}>SHARES</Text>
                <TextInput
                  style={[modalStyles.input, {
                    color: colors.foreground,
                    backgroundColor: colors.background,
                    borderColor: errors.shares ? colors.sellColor : colors.border,
                    fontFamily: 'Inter_600SemiBold',
                  }]}
                  value={form.shares}
                  onChangeText={(v) => setForm({ ...form, shares: v })}
                  placeholder="10"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="decimal-pad"
                />
                {errors.shares && (
                  <Text style={[modalStyles.error, { color: colors.sellColor }]}>{errors.shares}</Text>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[modalStyles.label, { color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }]}>PRICE / SHARE</Text>
                <TextInput
                  style={[modalStyles.input, {
                    color: colors.foreground,
                    backgroundColor: colors.background,
                    borderColor: errors.price ? colors.sellColor : colors.border,
                    fontFamily: 'Inter_600SemiBold',
                  }]}
                  value={form.price}
                  onChangeText={(v) => setForm({ ...form, price: v })}
                  placeholder="150.00"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="decimal-pad"
                />
                {errors.price && (
                  <Text style={[modalStyles.error, { color: colors.sellColor }]}>{errors.price}</Text>
                )}
              </View>
            </View>

            {/* Buttons */}
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
  title: { fontSize: 18, marginBottom: 10 },
  label: { fontSize: 10, letterSpacing: 0.8, marginBottom: 6, marginTop: 10 },
  input: {
    height: 46,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 15,
  },
  error: { fontSize: 11, marginTop: 3 },
  row: { flexDirection: 'row', gap: 12 },
  toggle: { flexDirection: 'row', gap: 10 },
  toggleBtn: {
    flex: 1,
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleText: { fontSize: 14, letterSpacing: 1 },
  btnRow: { flexDirection: 'row', gap: 12, marginTop: 16 },
  cancelBtn: { flex: 1, height: 48, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontSize: 14 },
  saveBtn: { flex: 2, height: 48, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  saveText: { fontSize: 14, letterSpacing: 0.5 },
});

// ─── Summary Card ─────────────────────────────────────────────────────────────

function SummaryCard({
  trades,
  quotes,
  loadingQuotes,
  colors,
}: {
  trades: Trade[];
  quotes: Record<string, Quote | null>;
  loadingQuotes: boolean;
  colors: any;
}) {
  let totalCost = 0;
  let totalValue = 0;
  let hasAllPrices = true;

  for (const t of trades) {
    const cost = t.shares * t.pricePerShare;
    const q = quotes[t.symbol];
    if (!q) { hasAllPrices = false; continue; }
    const val = t.shares * q.currentPrice;
    const pl = t.type === 'buy' ? val - cost : cost - val;
    totalCost += cost;
    totalValue += t.type === 'buy' ? val : cost + pl;
  }

  const totalPL = totalValue - totalCost;
  const totalPLPct = totalCost > 0 ? (totalPL / totalCost) * 100 : 0;
  const isGain = totalPL >= 0;

  return (
    <View style={[summaryStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[summaryStyles.heading, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>
        PORTFOLIO SUMMARY
      </Text>

      <View style={summaryStyles.row}>
        <View style={summaryStyles.col}>
          <Text style={[summaryStyles.colLabel, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
            TOTAL INVESTED
          </Text>
          <Text style={[summaryStyles.colVal, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
            {fmtCurrency(totalCost)}
          </Text>
        </View>
        <View style={summaryStyles.col}>
          <Text style={[summaryStyles.colLabel, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
            CURRENT VALUE
          </Text>
          {loadingQuotes && !hasAllPrices ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Text style={[summaryStyles.colVal, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
              {hasAllPrices ? fmtCurrency(totalValue) : '—'}
            </Text>
          )}
        </View>
      </View>

      <View style={[summaryStyles.plRow, { backgroundColor: isGain ? colors.buyBg : colors.sellBg, borderColor: isGain ? colors.buyColor : colors.sellColor }]}>
        <Text style={[summaryStyles.plLabel, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
          TOTAL P&amp;L
        </Text>
        {loadingQuotes && !hasAllPrices ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <Text style={[summaryStyles.plVal, { color: isGain ? colors.buyColor : colors.sellColor, fontFamily: 'Inter_700Bold' }]}>
            {hasAllPrices
              ? `${totalPL >= 0 ? '+' : ''}${fmtCurrency(totalPL)} (${fmtPct(totalPLPct)})`
              : '—'}
          </Text>
        )}
      </View>
    </View>
  );
}

const summaryStyles = StyleSheet.create({
  card: { borderRadius: 12, borderWidth: 1, padding: 16, marginBottom: 20 },
  heading: { fontSize: 10, letterSpacing: 1, marginBottom: 14 },
  row: { flexDirection: 'row', gap: 16, marginBottom: 14 },
  col: { flex: 1, gap: 4 },
  colLabel: { fontSize: 9, letterSpacing: 0.6 },
  colVal: { fontSize: 18 },
  plRow: { borderRadius: 8, borderWidth: 1, padding: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  plLabel: { fontSize: 9, letterSpacing: 0.6 },
  plVal: { fontSize: 15 },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function PortfolioScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [trades, setTrades] = useState<Trade[]>([]);
  const [quotes, setQuotes] = useState<Record<string, Quote | null>>({});
  const [loadingQuotes, setLoadingQuotes] = useState(false);

  const [modalVisible, setModalVisible] = useState(false);
  const [editTarget, setEditTarget] = useState<Trade | null>(null);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  // Load trades from storage
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((v) => {
      if (v) setTrades(JSON.parse(v));
    });
  }, []);

  // Persist trades
  const saveTrades = useCallback(async (next: Trade[]) => {
    setTrades(next);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  // Fetch quotes for all unique symbols
  const fetchAllQuotes = useCallback(async (tradeList: Trade[]) => {
    const symbols = [...new Set(tradeList.map((t) => t.symbol))];
    if (!symbols.length) return;
    setLoadingQuotes(true);
    const results = await Promise.all(
      symbols.map((sym) =>
        fetchQuote(sym).catch(() => null)
      )
    );
    const map: Record<string, Quote | null> = {};
    symbols.forEach((sym, i) => { map[sym] = results[i] ?? null; });
    setQuotes(map);
    setLoadingQuotes(false);
  }, []);

  useEffect(() => {
    if (trades.length) fetchAllQuotes(trades);
  }, [trades.length]);

  // Add or edit trade
  function handleSave(data: Omit<Trade, 'id' | 'date'>) {
    if (editTarget) {
      const next = trades.map((t) =>
        t.id === editTarget.id ? { ...t, ...data } : t
      );
      saveTrades(next);
    } else {
      const next: Trade[] = [
        ...trades,
        { id: uid(), date: new Date().toISOString(), ...data },
      ];
      saveTrades(next);
    }
    setModalVisible(false);
    setEditTarget(null);
  }

  function handleEdit(trade: Trade) {
    setEditTarget(trade);
    setModalVisible(true);
  }

  function handleDelete(id: string) {
    const doDelete = () => saveTrades(trades.filter((t) => t.id !== id));
    if (Platform.OS === 'web') {
      if (window.confirm('Remove this trade?')) doDelete();
    } else {
      Alert.alert('Remove Trade', 'Are you sure you want to remove this trade?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: doDelete },
      ]);
    }
  }

  function openAdd() {
    setEditTarget(null);
    setModalVisible(true);
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 16 }]}>
        <View style={styles.headerRow}>
          <Text style={[styles.title, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
            PORTFOLIO
          </Text>
          <View style={styles.headerRight}>
            <TouchableOpacity
              style={styles.refreshBtn}
              onPress={() => fetchAllQuotes(trades)}
              disabled={loadingQuotes || trades.length === 0}
              activeOpacity={0.7}
            >
              <Feather name="refresh-cw" size={16} color={loadingQuotes ? colors.mutedForeground : colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.addBtn, { backgroundColor: colors.primary }]}
              onPress={openAdd}
              activeOpacity={0.8}
            >
              <Feather name="plus" size={16} color={colors.primaryForeground} />
              <Text style={[styles.addBtnText, { color: colors.primaryForeground, fontFamily: 'Inter_700Bold' }]}>
                ADD
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Content */}
      {trades.length === 0 ? (
        <EmptyState onAdd={openAdd} colors={colors} />
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.list, { paddingBottom: 24 }]}
          showsVerticalScrollIndicator={false}
        >
          <SummaryCard trades={trades} quotes={quotes} loadingQuotes={loadingQuotes} colors={colors} />

          <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>
            TRADES ({trades.length})
          </Text>

          {trades.map((trade) => (
            <TradeCard
              key={trade.id}
              trade={trade}
              quote={quotes[trade.symbol]}
              loading={loadingQuotes && quotes[trade.symbol] === undefined}
              onEdit={() => handleEdit(trade)}
              onDelete={() => handleDelete(trade.id)}
              colors={colors}
            />
          ))}
        </ScrollView>
      )}

      {/* Tab bar */}
      <BottomTabBar />

      {/* Add/Edit modal */}
      <TradeModal
        visible={modalVisible}
        initial={editTarget}
        onSave={handleSave}
        onClose={() => { setModalVisible(false); setEditTarget(null); }}
        colors={colors}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 16 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 22, letterSpacing: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  refreshBtn: { padding: 8 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  addBtnText: { fontSize: 13, letterSpacing: 0.5 },
  list: { paddingHorizontal: 20, paddingTop: 4 },
  sectionLabel: { fontSize: 10, letterSpacing: 1, marginBottom: 12 },
});
