/**
 * OrderSheet — bottom-sheet trade form supporting market, limit, stop,
 * stop-limit, and trailing-stop order types with inline risk-check feedback.
 */
import React, { useState, useEffect } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { type PaperAccount, type PaperOrder, type PaperPosition, type LiveQuote, type OrderType } from '@/lib/paperMath';
import { checkRisk } from '@/lib/paperEngine';

// ── Palette ────────────────────────────────────────────────────────────────
const SILVER = '#c0c0c0';
const DIM = 'rgba(192,192,192,0.38)';
const BUY_COLOR = '#00e5a0';
const SELL_COLOR = '#ff3b3b';
const CARD_BG = 'rgba(192,192,192,0.08)';
const BORDER = 'rgba(192,192,192,0.28)';

// ── Order-type display config ──────────────────────────────────────────────
const ORDER_TYPES: { type: OrderType; label: string; short: string }[] = [
  { type: 'market',        label: 'Market',       short: 'MKT' },
  { type: 'limit',         label: 'Limit',        short: 'LMT' },
  { type: 'stop',          label: 'Stop',         short: 'STP' },
  { type: 'stop_limit',    label: 'Stop Limit',   short: 'S/L' },
  { type: 'trailing_stop', label: 'Trail Stop',   short: 'TRL' },
];

const ORDER_TYPE_HINT: Record<OrderType, string> = {
  market:        'Executes immediately at the next quoted price.',
  limit:         'Fills when price reaches your limit (buy ≤ limit; sell ≥ limit).',
  stop:          'Triggers when price hits your stop, then executes at market.',
  stop_limit:    'Triggers at stop, then fills at limit or better.',
  trailing_stop: 'Stop level trails the price by a set % or $.',
};

function $fmt(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Props ──────────────────────────────────────────────────────────────────
export type ConfirmOrderArgs = {
  orderId?: string;
  orderType: OrderType;
  side: 'buy' | 'sell';
  shares: number;
  limitPrice?: number;
  stopPrice?: number;
  trailPct?: number;
  trailAbs?: number;
  /** Only for buy market: stock meta needed to create/update position */
  stockInfo?: {
    companyName: string;
    dividendYield: number;
    dividendRate: number;
    expenseRatio: number;
    sector: string;
  };
};

type Props = {
  visible: boolean;
  side: 'buy' | 'sell';
  symbol: string;
  companyName: string;
  currentPrice: number;
  account: PaperAccount;
  accountPositions: PaperPosition[];
  quotes: Record<string, LiveQuote>;
  /** Only required in buy mode — the stock info from the lookup */
  stockInfo?: {
    companyName: string;
    currentPrice: number;
    dividendYield: number;
    dividendRate: number;
    expenseRatio: number;
    sector: string;
  };
  selectedPos?: PaperPosition | null;
  /** Existing pending order when the user is editing it. */
  existingOrder?: PaperOrder | null;
  /** Other pending orders used to reserve cash and shares. */
  pendingOrders?: PaperOrder[];
  onClose: () => void;
  onConfirm: (args: ConfirmOrderArgs) => void;
};

// ── Component ──────────────────────────────────────────────────────────────
export default function OrderSheet({
  visible, side, symbol, companyName,
  currentPrice, account, accountPositions, quotes,
  stockInfo, selectedPos, existingOrder, pendingOrders = [], onClose, onConfirm,
}: Props) {
  const [orderType, setOrderType] = useState<OrderType>('market');
  const [shares, setShares] = useState('');
  const [limitPrice, setLimitPrice] = useState('');
  const [stopPrice, setStopPrice] = useState('');
  const [trailPct, setTrailPct] = useState('5');
  const [trailMode, setTrailMode] = useState<'pct' | 'abs'>('pct');
  const [trailAbs, setTrailAbs] = useState('');
  const [riskError, setRiskError] = useState('');

  // Reset when reopened or mode changes
  useEffect(() => {
    if (visible) {
      setOrderType(existingOrder?.orderType ?? 'market');
      setShares(String(existingOrder?.shares ?? (side === 'sell' ? selectedPos?.shares ?? '' : '')));
      setLimitPrice(String(existingOrder?.limitPrice ?? currentPrice.toFixed(2)));
      setStopPrice(String(existingOrder?.stopPrice ?? currentPrice.toFixed(2)));
      setTrailPct(String(existingOrder?.trailPct ?? 5));
      setTrailMode(existingOrder?.trailAbs != null ? 'abs' : 'pct');
      setTrailAbs(String(existingOrder?.trailAbs ?? ''));
      setRiskError('');
    }
  }, [visible, side, symbol, existingOrder?.id]);

  // Re-run risk check whenever relevant inputs change
  useEffect(() => {
    const n = parseFloat(shares);
    if (!n || n <= 0) { setRiskError(''); return; }
    const lp = parseFloat(limitPrice) || undefined;
    const err = checkRisk({
      side,
      shares: n,
      orderType,
      limitPrice: lp,
      stopPrice: parseFloat(stopPrice) || undefined,
      trailPct: parseFloat(trailPct) || undefined,
      trailAbs: parseFloat(trailAbs) || undefined,
      symbol,
      currentPrice,
      account,
      accountPositions,
      quotes,
      pendingOrders,
      excludeOrderId: existingOrder?.id,
    });
    setRiskError(err ?? '');
  }, [
    shares, orderType, limitPrice, stopPrice, trailPct, trailAbs, side, symbol, currentPrice,
    account, accountPositions, quotes, pendingOrders, existingOrder?.id,
  ]);

  const numShares = parseFloat(shares) || 0;
  const estPrice =
    orderType === 'limit' && parseFloat(limitPrice)
      ? parseFloat(limitPrice)
      : currentPrice;
  const estCost = numShares * estPrice;
  const afterCash = account.cash - (side === 'buy' ? estCost : 0);

  const canPlace = numShares > 0 && !riskError && (
    orderType === 'market' ? true :
    orderType === 'limit' ? !!parseFloat(limitPrice) :
    orderType === 'stop' ? !!parseFloat(stopPrice) :
    orderType === 'stop_limit' ? !!(parseFloat(stopPrice) && parseFloat(limitPrice)) :
    orderType === 'trailing_stop' ? (
      trailMode === 'pct' ? parseFloat(trailPct) > 0 : parseFloat(trailAbs) > 0
    ) : false
  );

  const handleConfirm = () => {
    if (!canPlace) return;
    onConfirm({
      orderId: existingOrder?.id,
      orderType,
      side,
      shares: numShares,
      limitPrice: parseFloat(limitPrice) || undefined,
      stopPrice: parseFloat(stopPrice) || undefined,
      trailPct: trailMode === 'pct' ? parseFloat(trailPct) || undefined : undefined,
      trailAbs: trailMode === 'abs' ? parseFloat(trailAbs) || undefined : undefined,
      stockInfo: side === 'buy' ? stockInfo : undefined,
    });
  };

  const accentColor = side === 'buy' ? BUY_COLOR : SELL_COLOR;
  const pendingLabel = orderType === 'market' ? 'CONFIRM' : 'PLACE ORDER';
  const isPending = orderType !== 'market';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1, justifyContent: 'flex-end' }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
        <ScrollView
          style={s.sheet}
          contentContainerStyle={{ paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <View style={s.handle} />
          <Text style={s.title}>
            {side === 'buy' ? `BUY ${symbol}` : `SELL ${symbol}`}
          </Text>
          <Text style={s.sub}>{companyName} · ${currentPrice.toFixed(2)}</Text>

          {/* Order type selector */}
          <Text style={s.label}>ORDER TYPE</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', gap: 8, paddingRight: 8 }}>
              {ORDER_TYPES.map(ot => (
                <TouchableOpacity
                  key={ot.type}
                  style={[s.typeChip, orderType === ot.type && { borderColor: accentColor, backgroundColor: `${accentColor}18` }]}
                  onPress={() => {
                    if (existingOrder && ot.type === 'market') return;
                    setOrderType(ot.type);
                  }}
                  disabled={!!existingOrder && ot.type === 'market'}
                >
                  <Text style={[
                    s.typeChipText,
                    existingOrder && ot.type === 'market' && { color: DIM },
                    orderType === ot.type && { color: accentColor },
                  ]}>{ot.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          {/* Order type hint */}
          <Text style={s.hint}>{ORDER_TYPE_HINT[orderType]}</Text>

          {/* Shares input */}
          <Text style={s.label}>SHARES</Text>
          <View style={s.row}>
            <TextInput
              style={[s.input, { flex: 1 }]}
              value={shares}
              onChangeText={setShares}
              placeholder="0"
              placeholderTextColor={DIM}
              keyboardType="decimal-pad"
            />
            {side === 'sell' && selectedPos && (
              <TouchableOpacity
                style={s.allBtn}
                onPress={() => setShares(String(selectedPos.shares))}
              >
                <Text style={s.allBtnText}>ALL</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Limit price */}
          {(orderType === 'limit' || orderType === 'stop_limit') && (
            <>
              <Text style={s.label}>LIMIT PRICE</Text>
              <TextInput
                style={s.input}
                value={limitPrice}
                onChangeText={setLimitPrice}
                keyboardType="decimal-pad"
                placeholderTextColor={DIM}
              />
            </>
          )}

          {/* Stop price */}
          {(orderType === 'stop' || orderType === 'stop_limit') && (
            <>
              <Text style={s.label}>STOP PRICE</Text>
              <TextInput
                style={s.input}
                value={stopPrice}
                onChangeText={setStopPrice}
                keyboardType="decimal-pad"
                placeholderTextColor={DIM}
              />
            </>
          )}

          {/* Trailing stop inputs */}
          {orderType === 'trailing_stop' && (
            <>
              <Text style={s.label}>TRAIL BY</Text>
              <View style={s.row}>
                <TouchableOpacity
                  style={[s.trailToggle, trailMode === 'pct' && { borderColor: accentColor }]}
                  onPress={() => setTrailMode('pct')}
                >
                  <Text style={[s.trailToggleText, trailMode === 'pct' && { color: accentColor }]}>%</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.trailToggle, trailMode === 'abs' && { borderColor: accentColor }]}
                  onPress={() => setTrailMode('abs')}
                >
                  <Text style={[s.trailToggleText, trailMode === 'abs' && { color: accentColor }]}>$</Text>
                </TouchableOpacity>
                <TextInput
                  style={[s.input, { flex: 1 }]}
                  value={trailMode === 'pct' ? trailPct : trailAbs}
                  onChangeText={trailMode === 'pct' ? setTrailPct : setTrailAbs}
                  keyboardType="decimal-pad"
                  placeholderTextColor={DIM}
                  placeholder={trailMode === 'pct' ? '5' : '2.00'}
                />
              </View>
            </>
          )}

          {/* Summary */}
          {numShares > 0 && (
            <View style={s.summary}>
              <Row label="Est. cost" val={$fmt(estCost)} />
              <Row
                label={side === 'buy' ? 'Buying power after' : 'Shares held'}
                val={side === 'buy' ? $fmt(afterCash) : String(selectedPos?.shares ?? 0)}
                color={side === 'buy' ? (afterCash >= 0 ? BUY_COLOR : SELL_COLOR) : SILVER}
              />
              {isPending && (
                <Row label="Settlement" val="Pending order — fills on trigger" color={SILVER} />
              )}
              {side === 'sell' && !isPending && (
                <Row label="T+2 settlement" val="Cash available in 2 days" color={DIM} />
              )}
            </View>
          )}

          {/* Risk error */}
          {riskError ? (
            <View style={s.errorBox}>
              <Feather name="alert-circle" size={14} color={SELL_COLOR} />
              <Text style={s.errorText}>{riskError}</Text>
            </View>
          ) : null}

          {/* Action buttons */}
          <TouchableOpacity
            style={[s.confirmBtn, { backgroundColor: accentColor }, !canPlace && { opacity: 0.4 }]}
            onPress={handleConfirm}
            disabled={!canPlace}
          >
            <Text style={s.confirmBtnText}>
              {pendingLabel} {orderType !== 'market' ? '· PENDING' : `· ${$fmt(estCost)}`}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.cancelBtn} onPress={onClose}>
            <Text style={s.cancelBtnText}>CANCEL</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Row({ label, val, color = SILVER }: { label: string; val: string; color?: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
      <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: DIM }}>{label}</Text>
      <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 13, color }}>{val}</Text>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  sheet: {
    backgroundColor: '#111',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: BORDER,
    padding: 20,
    maxHeight: '92%',
  },
  handle: { width: 36, height: 4, backgroundColor: BORDER, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 17, color: '#fff', letterSpacing: 1, marginBottom: 4 },
  sub: { fontFamily: 'Inter_400Regular', fontSize: 12, color: DIM, marginBottom: 16 },
  label: { fontFamily: 'Inter_600SemiBold', fontSize: 10, color: DIM, letterSpacing: 1.5, marginBottom: 8 },
  hint: { fontFamily: 'Inter_400Regular', fontSize: 11, color: 'rgba(192,192,192,0.4)', marginBottom: 14, marginTop: -4 },
  row: { flexDirection: 'row', gap: 10, marginBottom: 12, alignItems: 'center' },
  input: {
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#fff',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 18,
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
  typeChip: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  typeChipText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: DIM, letterSpacing: 0.5 },
  trailToggle: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 52,
  },
  trailToggleText: { fontFamily: 'Inter_700Bold', fontSize: 14, color: DIM },
  summary: {
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  errorText: { fontFamily: 'Inter_400Regular', fontSize: 12, color: SELL_COLOR, flex: 1 },
  confirmBtn: { borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginBottom: 8 },
  confirmBtnText: { fontFamily: 'Inter_700Bold', fontSize: 14, color: '#000', letterSpacing: 0.5 },
  cancelBtn: { paddingVertical: 12, alignItems: 'center' },
  cancelBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: DIM, letterSpacing: 1 },
});
