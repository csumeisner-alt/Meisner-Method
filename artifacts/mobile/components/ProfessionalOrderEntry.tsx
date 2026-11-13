import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import OrderEntryReview from './OrderEntryReview';
import type { LiveQuote, OrderType, PaperAccount, PaperOrder, PaperPosition } from '@/lib/paperMath';
import { checkRisk, getAvailableSettledBuyingPower } from '@/lib/paperEngine';
import {
  calculateSharesForBuyingPower,
  formatProviderMarketSession,
  getAvailableSellShares,
  getOrderEstimatePrice,
  getOrderQuoteState,
} from '@/lib/paperOrderEntry';

const SILVER = '#c0c0c0';
const DIM = 'rgba(192,192,192,0.55)';
const BUY_COLOR = '#00e5a0';
const SELL_COLOR = '#ff3b3b';
const GOLD = '#ffd700';
const CARD_BG = 'rgba(192,192,192,0.08)';
const BORDER = 'rgba(192,192,192,0.24)';

const ORDER_TYPES: { type: OrderType; label: string; short: string }[] = [
  { type: 'market', label: 'Market', short: 'MKT' },
  { type: 'limit', label: 'Limit', short: 'LMT' },
  { type: 'stop', label: 'Stop', short: 'STP' },
  { type: 'stop_limit', label: 'Stop limit', short: 'S/L' },
  { type: 'trailing_stop', label: 'Trailing stop', short: 'TRL' },
];

const ORDER_TYPE_HINT: Record<OrderType, string> = {
  market: 'Executes at the next available paper quote. Final fill may differ slightly.',
  limit: 'Limit orders are not guaranteed to fill. A buy fills at or below your limit; a sell at or above.',
  stop: 'Triggers at your stop price, then executes at the next paper quote.',
  stop_limit: 'Triggers at your stop price and fills only at your limit or better.',
  trailing_stop: 'The stop level follows the market by the percentage or dollar amount you set.',
};

export type ConfirmOrderArgs = {
  orderId?: string;
  accountId: string;
  symbol: string;
  companyName: string;
  orderType: OrderType;
  side: 'buy' | 'sell';
  shares: number;
  limitPrice?: number;
  stopPrice?: number;
  trailPct?: number;
  trailAbs?: number;
  quotePrice: number;
  stockInfo?: {
    companyName: string;
    dividendYield: number;
    dividendRate: number;
    expenseRatio: number;
    sector: string;
  };
};

export type OrderSubmissionResult =
  | { status: 'filled'; message: string; fillPrice: number }
  | { status: 'pending'; message: string }
  | { status: 'rejected'; message: string };

export type ReviewSnapshot = {
  args: ConfirmOrderArgs;
  accountName: string;
  equity: number;
  buyingPower: number;
  cash: number;
  estimatedValue: number;
  quoteNote: string;
};

type Props = {
  visible: boolean;
  side: 'buy' | 'sell';
  symbol: string;
  companyName: string;
  currentPrice: number;
  account: PaperAccount;
  accountEquity: number;
  accountPositions: PaperPosition[];
  quotes: Record<string, LiveQuote>;
  stockInfo?: {
    companyName: string;
    currentPrice: number;
    dividendYield: number;
    dividendRate: number;
    expenseRatio: number;
    sector: string;
  };
  selectedPos?: PaperPosition | null;
  existingOrder?: PaperOrder | null;
  pendingOrders?: PaperOrder[];
  onClose: () => void;
  onRefreshQuote: (symbol: string) => Promise<void>;
  onSearchStock: () => void;
  onConfirm: (args: ConfirmOrderArgs) => Promise<OrderSubmissionResult>;
};

function money(value: number) {
  if (!Number.isFinite(value)) return '—';
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function parsePositive(value: string): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export default function ProfessionalOrderEntry({
  visible,
  side,
  symbol,
  companyName,
  currentPrice,
  account,
  accountEquity,
  accountPositions,
  quotes,
  stockInfo,
  selectedPos,
  existingOrder,
  pendingOrders = [],
  onClose,
  onRefreshQuote,
  onSearchStock,
  onConfirm,
}: Props) {
  const [activeSide, setActiveSide] = useState<'buy' | 'sell'>(side);
  const [orderType, setOrderType] = useState<OrderType>('market');
  const [sharesText, setSharesText] = useState('');
  const [limitPriceText, setLimitPriceText] = useState('');
  const [stopPriceText, setStopPriceText] = useState('');
  const [trailPctText, setTrailPctText] = useState('5');
  const [trailMode, setTrailMode] = useState<'pct' | 'abs'>('pct');
  const [trailAbsText, setTrailAbsText] = useState('');
  const [review, setReview] = useState<ReviewSnapshot | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<OrderSubmissionResult | null>(null);
  const [refreshingQuote, setRefreshingQuote] = useState(false);
  const [quoteRefreshError, setQuoteRefreshError] = useState('');
  const [quoteNowMs, setQuoteNowMs] = useState(Date.now());
  const submittingRef = useRef(false);

  const quote = quotes[symbol];
  const fallbackQuote: LiveQuote | undefined = quote ?? (
    Number.isFinite(currentPrice) && currentPrice > 0
      ? { price: currentPrice, change: 0, pct: 0 }
      : undefined
  );
  const quotePrice = fallbackQuote?.price ?? 0;
  const quoteState = getOrderQuoteState(fallbackQuote, quoteNowMs);
  const sessionLabel = quoteState === 'fresh'
    ? formatProviderMarketSession(quote?.marketSession)
    : null;
  const timestamp = quote?.priceTimestamp ? new Date(quote.priceTimestamp * 1000) : null;
  const sellPosition = selectedPos
    ?? accountPositions.find((position) => position.accountId === account.id && position.symbol === symbol)
    ?? null;
  const availableSellShares = getAvailableSellShares(
    sellPosition,
    pendingOrders,
    account.id,
    symbol,
    existingOrder?.id,
  );
  const buyingPower = useMemo(
    () => getAvailableSettledBuyingPower(account, pendingOrders, quotes, existingOrder?.id),
    [account, pendingOrders, quotes, existingOrder?.id],
  );
  const numericShares = Number(sharesText);
  const sharesValid = Number.isFinite(numericShares) && numericShares > 0;
  const limitPrice = parsePositive(limitPriceText);
  const stopPrice = parsePositive(stopPriceText);
  const trailPct = parsePositive(trailPctText);
  const trailAbs = parsePositive(trailAbsText);
  const activeTrailPct = trailMode === 'pct' ? trailPct : undefined;
  const activeTrailAbs = trailMode === 'abs' ? trailAbs : undefined;
  const estimatePrice = getOrderEstimatePrice({
    orderType,
    currentPrice: quotePrice,
    limitPrice,
    stopPrice,
    trailPct: activeTrailPct,
    trailAbs: activeTrailAbs,
  });
  const estimatedValue = numericShares * estimatePrice;

  let inputError = '';
  if (!sharesValid) inputError = 'Enter a positive share quantity.';
  else if (quoteState === 'unavailable') inputError = 'A provider quote is unavailable. Refresh it before submitting an order.';
  else if (!Number.isFinite(estimatedValue) || estimatePrice <= 0) inputError = 'A valid provider quote and order price are required.';
  else if (orderType === 'limit' && !limitPrice) inputError = 'Enter a limit price greater than zero.';
  else if (orderType === 'stop' && !stopPrice) inputError = 'Enter a stop price greater than zero.';
  else if (orderType === 'stop_limit' && (!limitPrice || !stopPrice)) inputError = 'Enter positive stop and limit prices.';
  else if (orderType === 'trailing_stop' && !(activeTrailPct || activeTrailAbs)) inputError = 'Enter a positive trailing amount.';
  else if (activeSide === 'sell' && availableSellShares <= 0) inputError = `No ${symbol} shares are available in ${account.name} after pending sells.`;
  else if (orderType === 'market' && quoteState !== 'fresh') inputError = quoteState === 'stale'
    ? 'The quote is stale. Refresh it before placing a market order.'
    : 'A current provider quote is required for a market order.';

  const riskError = sharesValid && !inputError
    ? checkRisk({
        side: activeSide,
        shares: numericShares,
        orderType,
        limitPrice,
        stopPrice,
        trailPct: activeTrailPct,
        trailAbs: activeTrailAbs,
        symbol,
        currentPrice: quotePrice,
        account,
        accountPositions,
        quotes,
        pendingOrders,
        excludeOrderId: existingOrder?.id,
      })
    : null;
  const validationMessage = inputError || riskError || '';
  const canReview = visible && !!symbol && !validationMessage && !result && !submitting;
  const accent = activeSide === 'buy' ? BUY_COLOR : SELL_COLOR;
  const heldShares = sellPosition?.shares ?? 0;

  useEffect(() => {
    if (!visible) return;
    setActiveSide(side);
    setOrderType(existingOrder?.orderType ?? 'market');
    setSharesText(String(existingOrder?.shares ?? (side === 'sell' ? selectedPos?.shares ?? '' : '')));
    setLimitPriceText(String(existingOrder?.limitPrice ?? (currentPrice > 0 ? currentPrice.toFixed(2) : '')));
    setStopPriceText(String(existingOrder?.stopPrice ?? (currentPrice > 0 ? currentPrice.toFixed(2) : '')));
    setTrailPctText(String(existingOrder?.trailPct ?? 5));
    setTrailMode(existingOrder?.trailAbs != null ? 'abs' : 'pct');
    setTrailAbsText(String(existingOrder?.trailAbs ?? ''));
    setReview(null);
    setResult(null);
    setSubmitting(false);
    setRefreshingQuote(false);
    setQuoteRefreshError('');
    submittingRef.current = false;
  }, [visible, symbol, existingOrder?.id]);

  useEffect(() => {
    if (!visible) return;
    setQuoteNowMs(Date.now());
    const timer = setInterval(() => setQuoteNowMs(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, [visible]);

  const chooseSide = (nextSide: 'buy' | 'sell') => {
    if (existingOrder) return;
    setActiveSide(nextSide);
    setSharesText(nextSide === 'sell' ? String(availableSellShares || '') : '');
    setReview(null);
    setResult(null);
  };

  const openReview = () => {
    if (!canReview) return;
    const args: ConfirmOrderArgs = {
      orderId: existingOrder?.id,
      accountId: account.id,
      symbol,
      companyName: companyName || stockInfo?.companyName || symbol,
      orderType,
      side: activeSide,
      shares: numericShares,
      limitPrice,
      stopPrice,
      trailPct: activeTrailPct,
      trailAbs: activeTrailAbs,
      quotePrice,
      stockInfo: activeSide === 'buy' && stockInfo ? {
        companyName: stockInfo.companyName,
        dividendYield: stockInfo.dividendYield,
        dividendRate: stockInfo.dividendRate,
        expenseRatio: stockInfo.expenseRatio,
        sector: stockInfo.sector,
      } : undefined,
    };
    setReview({
      args,
      accountName: account.name,
      equity: accountEquity,
      buyingPower,
      cash: account.cash,
      estimatedValue,
      quoteNote: freshnessNote,
    });
  };

  const submitReviewedOrder = async () => {
    if (!review || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      setResult(await onConfirm(review.args));
    } catch (error) {
      setResult({
        status: 'rejected',
        message: error instanceof Error ? error.message : 'The order could not be submitted.',
      });
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const refreshQuote = async () => {
    if (refreshingQuote) return;
    setRefreshingQuote(true);
    setQuoteRefreshError('');
    try {
      await onRefreshQuote(symbol);
    } catch (error) {
      setQuoteRefreshError(error instanceof Error ? error.message : 'Could not refresh this quote.');
    } finally {
      setRefreshingQuote(false);
    }
  };

  const updateSharesToBudget = (fraction: number) => {
    setSharesText(String(calculateSharesForBuyingPower(buyingPower, quotePrice, fraction)));
  };

  const quoteStatus = quoteState === 'fresh'
    ? 'PROVIDER QUOTE'
    : quoteState === 'stale'
      ? 'STALE · LAST REPORTED QUOTE'
      : 'QUOTE UNAVAILABLE';
  const quoteTime = timestamp && Number.isFinite(timestamp.getTime())
    ? timestamp.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : null;
  const freshnessNote = quoteState === 'stale'
    ? `Provider quote is stale or cannot be verified${quoteTime ? ` · last reported ${quoteTime}` : ''}.`
    : quoteState === 'unavailable'
      ? 'No provider price is available. No estimated or illustrative price is shown.'
      : quoteTime
        ? `Provider quote · ${quoteTime}${sessionLabel ? ` · ${sessionLabel}` : ''}`
        : 'Provider quote is current.';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={() => { if (!submitting) onClose(); }}
    >
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.topBar}>
          <TouchableOpacity
            testID="paper-order-close"
            accessibilityRole="button"
            accessibilityLabel="Close order entry"
            style={styles.iconButton}
            onPress={onClose}
            disabled={submitting}
          >
            <Feather name="x" size={22} color={SILVER} />
          </TouchableOpacity>
          <View style={styles.topHeading}>
            <Text style={styles.eyebrow}>{review ? 'ORDER REVIEW' : 'PAPER ORDER'}</Text>
            <Text style={styles.topTitle}>{symbol || 'Select a stock'}</Text>
          </View>
          <View style={styles.orderMark}><Feather name="activity" size={17} color={GOLD} /></View>
        </View>

        {result || review ? (
          <OrderEntryReview
            review={review}
            result={result}
            submitting={submitting}
            onSubmit={() => { void submitReviewedOrder(); }}
            onBack={() => setReview(null)}
            onClose={onClose}
            onEdit={() => { setResult(null); setReview(null); }}
          />
        ) : (
          <KeyboardAwareScrollViewCompat
            testID="paper-order-form"
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            bottomOffset={20}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.accountCard}>
              <View style={styles.accountTitleRow}>
                <Feather name="briefcase" size={16} color={GOLD} />
                <Text testID="order-sheet-active-account" style={styles.accountName} numberOfLines={1}>{account.name}</Text>
                <Text style={styles.accountIdTag}>PAPER</Text>
              </View>
              <View style={styles.metricsRow}>
                <Metric label="EQUITY" value={money(accountEquity)} />
                <Metric label="SETTLED B.P." value={money(buyingPower)} />
                <Metric label="CASH" value={money(account.cash)} />
              </View>
              {(account.unsettledCash ?? 0) > 0 && (
                <Text style={styles.unsettledNote}>+ {money(account.unsettledCash ?? 0)} unsettled · not available to buy</Text>
              )}
            </View>

            <View testID="paper-order-quote" style={styles.quoteCard}>
              <View style={styles.quoteTopRow}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.quoteName} numberOfLines={1}>{companyName || stockInfo?.companyName || symbol}</Text>
                  <Text style={styles.quoteSymbol}>{symbol} · {quoteStatus}</Text>
                </View>
                <View style={styles.quotePriceWrap}>
                  <Text style={styles.quotePrice}>{quotePrice > 0 ? money(quotePrice) : '—'}</Text>
                  {quote && Number.isFinite(quote.change) && Number.isFinite(quote.pct) && (
                    <Text style={[styles.quoteChange, { color: quote.change >= 0 ? BUY_COLOR : SELL_COLOR }]}>
                      {quote.change >= 0 ? '+' : ''}{money(quote.change)} ({quote.pct >= 0 ? '+' : ''}{quote.pct.toFixed(2)}%)
                    </Text>
                  )}
                </View>
              </View>
              <Text style={[styles.smallNote, quoteState === 'stale' && styles.staleNote]}>{freshnessNote}</Text>
              {quoteState !== 'fresh' && (
                <TouchableOpacity
                  testID="paper-order-refresh-quote"
                  accessibilityRole="button"
                  accessibilityLabel="Refresh provider quote"
                  style={styles.quoteRefreshButton}
                  onPress={() => { void refreshQuote(); }}
                  disabled={refreshingQuote}
                >
                  <Feather name={refreshingQuote ? 'clock' : 'refresh-cw'} size={13} color={SILVER} />
                  <Text style={styles.quoteRefreshLabel}>{refreshingQuote ? 'REFRESHING…' : 'REFRESH QUOTE'}</Text>
                </TouchableOpacity>
              )}
              {!!quoteRefreshError && <Text style={styles.quoteRefreshError}>{quoteRefreshError}</Text>}
              {activeSide === 'buy' && !existingOrder && (
                <TouchableOpacity
                  testID="paper-order-search-stock"
                  accessibilityRole="button"
                  style={styles.quoteRefreshButton}
                  onPress={onSearchStock}
                >
                  <Feather name="search" size={13} color={SILVER} />
                  <Text style={styles.quoteRefreshLabel}>SEARCH TICKER OR COMPANY</Text>
                </TouchableOpacity>
              )}
            </View>

            <Text style={styles.sectionLabel}>TRADE SIDE</Text>
            <View style={styles.sideSwitch}>
              {(['buy', 'sell'] as const).map((item) => {
                const selected = activeSide === item;
                const color = item === 'buy' ? BUY_COLOR : SELL_COLOR;
                return (
                  <TouchableOpacity
                    key={item}
                    testID={`paper-order-side-${item}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    style={[
                      styles.sideButton,
                      selected && { backgroundColor: color, borderColor: color },
                    ]}
                    onPress={() => chooseSide(item)}
                    disabled={!!existingOrder || submitting}
                  >
                    <Feather name={item === 'buy' ? 'trending-up' : 'trending-down'} size={16} color={selected ? '#000' : color} />
                    <Text style={[styles.sideButtonText, { color: selected ? '#000' : color }]}>
                      {item.toUpperCase()}
                    </Text>
                    {item === 'sell' && (
                      <Text style={[styles.sideShares, { color: selected ? '#000' : color }]}>
                        {availableSellShares.toLocaleString('en-US', { maximumFractionDigits: 4 })} available
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.sectionLabel}>ORDER TYPE</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.typeScroller}>
              <View style={styles.typeRow}>
                {ORDER_TYPES.map((item) => (
                  <TouchableOpacity
                    key={item.type}
                    testID={`paper-order-type-${item.type}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: orderType === item.type }}
                    style={[
                      styles.typeChip,
                      orderType === item.type && { borderColor: accent, backgroundColor: `${accent}16` },
                    ]}
                    onPress={() => { setOrderType(item.type); setReview(null); }}
                    disabled={!!existingOrder && item.type === 'market'}
                  >
                    <Text style={[styles.typeChipText, orderType === item.type && { color: accent }]}>{item.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
            <Text style={styles.typeHint}>{ORDER_TYPE_HINT[orderType]}</Text>

            <Text style={styles.sectionLabel}>SHARES</Text>
            <View style={styles.inputRow}>
              <TextInput
                testID="paper-order-shares"
                style={styles.quantityInput}
                value={sharesText}
                onChangeText={(value) => { setSharesText(value); setReview(null); }}
                placeholder="0"
                placeholderTextColor={DIM}
                keyboardType="decimal-pad"
                accessibilityLabel="Number of shares"
                maxLength={14}
              />
              {activeSide === 'sell' && (
                <TouchableOpacity
                  testID="paper-order-all-shares"
                  accessibilityRole="button"
                  style={styles.allButton}
                  onPress={() => setSharesText(String(availableSellShares))}
                  disabled={availableSellShares <= 0}
                >
                  <Text style={styles.allButtonText}>ALL</Text>
                </TouchableOpacity>
              )}
            </View>
            <View style={styles.quickRow}>
              {[1, 5, 10].map((quantity) => (
                <QuickButton
                  key={quantity}
                  label={`${activeSide === 'sell' ? Math.min(quantity, availableSellShares) : quantity} share${quantity === 1 ? '' : 's'}`}
                  testID={`paper-order-quick-shares-${quantity}`}
                  onPress={() => setSharesText(String(activeSide === 'sell' ? Math.min(quantity, availableSellShares) : quantity))}
                  disabled={activeSide === 'sell' && availableSellShares <= 0}
                />
              ))}
            </View>
            {activeSide === 'buy' && (
              <>
                <Text style={styles.shortcutLabel}>BUY WITH SETTLED BUYING POWER</Text>
                <View style={styles.quickRow}>
                  {[0.25, 0.5, 1].map((fraction) => (
                    <QuickButton
                      key={fraction}
                      label={`${fraction * 100}% · ${calculateSharesForBuyingPower(buyingPower, quotePrice, fraction).toLocaleString('en-US', { maximumFractionDigits: 4 })}`}
                      testID={`paper-order-buying-power-${fraction}`}
                      onPress={() => updateSharesToBudget(fraction)}
                      disabled={quoteState === 'unavailable' || buyingPower <= 0}
                    />
                  ))}
                </View>
              </>
            )}

            {orderType === 'limit' || orderType === 'stop_limit' ? (
              <Field
                testID="paper-order-limit-price"
                label="LIMIT PRICE"
                value={limitPriceText}
                onChangeText={(value) => { setLimitPriceText(value); setReview(null); }}
              />
            ) : null}
            {orderType === 'stop' || orderType === 'stop_limit' ? (
              <Field
                testID="paper-order-stop-price"
                label="STOP TRIGGER"
                value={stopPriceText}
                onChangeText={(value) => { setStopPriceText(value); setReview(null); }}
              />
            ) : null}
            {orderType === 'trailing_stop' && (
              <>
                <Text style={styles.sectionLabel}>TRAIL DISTANCE</Text>
                <View style={styles.inputRow}>
                  <TouchableOpacity
                    style={[styles.trailToggle, trailMode === 'pct' && { borderColor: accent }]}
                    onPress={() => setTrailMode('pct')}
                  >
                    <Text style={[styles.trailToggleText, trailMode === 'pct' && { color: accent }]}>%</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.trailToggle, trailMode === 'abs' && { borderColor: accent }]}
                    onPress={() => setTrailMode('abs')}
                  >
                    <Text style={[styles.trailToggleText, trailMode === 'abs' && { color: accent }]}>$</Text>
                  </TouchableOpacity>
                  <TextInput
                    testID="paper-order-trail-amount"
                    style={[styles.quantityInput, { flex: 1 }]}
                    value={trailMode === 'pct' ? trailPctText : trailAbsText}
                    onChangeText={trailMode === 'pct' ? setTrailPctText : setTrailAbsText}
                    placeholder={trailMode === 'pct' ? '5' : '2.00'}
                    placeholderTextColor={DIM}
                    keyboardType="decimal-pad"
                  />
                </View>
              </>
            )}

            <View testID="paper-order-estimate" style={styles.estimateCard}>
              <View style={styles.estimateTitleRow}>
                <Text style={styles.sectionLabel}>ORDER ESTIMATE</Text>
                {quoteState === 'fresh' && <View style={styles.liveDot} />}
              </View>
              <EstimateRow label="Reference price" value={quotePrice > 0 ? money(quotePrice) : 'Unavailable'} />
              <EstimateRow
                label={activeSide === 'buy' ? 'Estimated cost' : 'Estimated proceeds'}
                value={sharesValid && estimatePrice > 0 ? money(estimatedValue) : '—'}
                strong
              />
              <EstimateRow
                label={activeSide === 'buy' ? 'Buying power after' : 'Shares remaining'}
                value={activeSide === 'buy'
                  ? (sharesValid ? money(buyingPower - estimatedValue) : money(buyingPower))
                  : `${Math.max(0, availableSellShares - (sharesValid ? numericShares : 0)).toLocaleString('en-US', { maximumFractionDigits: 4 })}`}
              />
              {activeSide === 'sell' && (
                <Text style={styles.pendingNote}>Sell proceeds settle T+2 and are not immediately available to buy.</Text>
              )}
              {orderType !== 'market' && <Text style={styles.pendingNote}>Pending · fills only when the engine's trigger conditions are met</Text>}
            </View>

            {!!validationMessage && (
              <View testID="paper-order-validation-error" style={styles.errorBox}>
                <Feather name="alert-circle" size={15} color={SELL_COLOR} />
                <Text style={styles.errorText}>{validationMessage}</Text>
              </View>
            )}

            <TouchableOpacity
              testID="paper-order-review-button"
              accessibilityRole="button"
              style={[styles.primaryAction, { backgroundColor: accent }, !canReview && styles.disabledButton]}
              onPress={openReview}
              disabled={!canReview}
            >
              <Text style={styles.primaryActionText}>{activeSide === 'buy' ? 'REVIEW BUY' : 'REVIEW SELL'}</Text>
              <Feather name="arrow-right" size={17} color="#000" />
            </TouchableOpacity>
            <Text style={styles.footerDisclaimer}>Paper trading only · no real brokerage order is sent</Text>
          </KeyboardAwareScrollViewCompat>
        )}
      </SafeAreaView>
    </Modal>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    </View>
  );
}

function EstimateRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.estimateRow}>
      <Text style={styles.estimateLabel}>{label}</Text>
      <Text style={[styles.estimateValue, strong && styles.estimateValueStrong]}>{value}</Text>
    </View>
  );
}

function QuickButton({
  label,
  testID,
  onPress,
  disabled,
}: {
  label: string;
  testID: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      testID={testID}
      accessibilityRole="button"
      style={[styles.quickButton, disabled && styles.disabledButton]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={styles.quickButtonText} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

function Field({
  testID,
  label,
  value,
  onChangeText,
}: {
  testID: string;
  label: string;
  value: string;
  onChangeText: (value: string) => void;
}) {
  return (
    <>
      <Text style={styles.sectionLabel}>{label}</Text>
      <TextInput
        testID={testID}
        style={styles.formInput}
        value={value}
        onChangeText={onChangeText}
        placeholder="0.00"
        placeholderTextColor={DIM}
        keyboardType="decimal-pad"
        accessibilityLabel={label}
        maxLength={14}
      />
    </>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#090b0e' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    gap: 12,
  },
  iconButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  topHeading: { flex: 1, minWidth: 0 },
  eyebrow: { fontFamily: 'Inter_600SemiBold', color: GOLD, fontSize: 9, letterSpacing: 1.7 },
  topTitle: { fontFamily: 'Inter_700Bold', color: '#fff', fontSize: 20, marginTop: 2 },
  orderMark: { width: 36, height: 36, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,215,0,0.35)', backgroundColor: 'rgba(255,215,0,0.08)', alignItems: 'center', justifyContent: 'center' },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 28 },
  accountCard: { backgroundColor: '#15191e', borderWidth: 1, borderColor: 'rgba(214,173,84,0.32)', borderRadius: 14, padding: 13, marginBottom: 12 },
  accountTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0, marginBottom: 13 },
  accountName: { color: '#f3df91', fontFamily: 'Inter_700Bold', fontSize: 13, flex: 1, minWidth: 0 },
  accountIdTag: { color: GOLD, fontFamily: 'Inter_700Bold', fontSize: 8, letterSpacing: 1.1, borderWidth: 1, borderColor: 'rgba(255,215,0,0.35)', paddingHorizontal: 7, paddingVertical: 4, borderRadius: 6 },
  metricsRow: { flexDirection: 'row', gap: 8 },
  metric: { flex: 1, minWidth: 0 },
  metricLabel: { fontFamily: 'Inter_600SemiBold', color: DIM, fontSize: 8, letterSpacing: 0.8, marginBottom: 5 },
  metricValue: { fontFamily: 'Inter_700Bold', color: '#fff', fontSize: 12 },
  unsettledNote: { color: '#b6a36e', fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 10 },
  quoteCard: { borderWidth: 1, borderColor: BORDER, backgroundColor: '#11151a', borderRadius: 14, padding: 13, marginBottom: 18 },
  quoteTopRow: { flexDirection: 'row', gap: 10, alignItems: 'center', marginBottom: 8 },
  quoteName: { color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  quoteSymbol: { color: DIM, fontFamily: 'Inter_600SemiBold', fontSize: 9, letterSpacing: 0.7, marginTop: 4 },
  quotePriceWrap: { alignItems: 'flex-end' },
  quotePrice: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 19 },
  quoteChange: { fontFamily: 'Inter_600SemiBold', fontSize: 10, marginTop: 3 },
  smallNote: { color: DIM, fontFamily: 'Inter_400Regular', fontSize: 10, lineHeight: 15 },
  staleNote: { color: GOLD },
  quoteRefreshButton: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 8, paddingRight: 10, marginTop: 3 },
  quoteRefreshLabel: { color: SILVER, fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 0.8 },
  quoteRefreshError: { color: SELL_COLOR, fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 4 },
  sectionLabel: { color: DIM, fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1.5, marginBottom: 8, marginTop: 2 },
  sideSwitch: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  sideButton: { flex: 1, minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderWidth: 1, borderColor: BORDER, borderRadius: 11, paddingHorizontal: 8 },
  sideButtonText: { fontFamily: 'Inter_700Bold', fontSize: 13, letterSpacing: 0.8 },
  sideShares: { fontFamily: 'Inter_400Regular', fontSize: 9 },
  typeScroller: { marginBottom: 8 },
  typeRow: { flexDirection: 'row', gap: 8, paddingRight: 6 },
  typeChip: { minHeight: 36, borderWidth: 1, borderColor: BORDER, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  typeChipText: { color: DIM, fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  typeHint: { color: DIM, fontFamily: 'Inter_400Regular', fontSize: 10, lineHeight: 15, marginBottom: 17 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  quantityInput: { minHeight: 48, backgroundColor: CARD_BG, borderWidth: 1, borderColor: BORDER, borderRadius: 10, paddingHorizontal: 14, color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 20, flex: 1 },
  allButton: { minHeight: 48, paddingHorizontal: 16, justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD_BG },
  allButtonText: { color: SILVER, fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 0.9 },
  quickRow: { flexDirection: 'row', gap: 7, marginBottom: 12 },
  quickButton: { flex: 1, minWidth: 0, minHeight: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: '#15191e', borderWidth: 1, borderColor: BORDER, borderRadius: 8, paddingHorizontal: 6 },
  quickButtonText: { color: SILVER, fontFamily: 'Inter_600SemiBold', fontSize: 10 },
  shortcutLabel: { color: DIM, fontFamily: 'Inter_600SemiBold', fontSize: 8, letterSpacing: 1.1, marginBottom: 7, marginTop: 1 },
  formInput: { minHeight: 46, backgroundColor: CARD_BG, borderWidth: 1, borderColor: BORDER, borderRadius: 10, paddingHorizontal: 14, color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 17, marginBottom: 12 },
  trailToggle: { width: 44, height: 46, borderWidth: 1, borderColor: BORDER, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  trailToggleText: { color: DIM, fontFamily: 'Inter_700Bold', fontSize: 14 },
  estimateCard: { backgroundColor: '#13171c', borderWidth: 1, borderColor: BORDER, borderRadius: 12, padding: 13, marginTop: 5, marginBottom: 12 },
  estimateTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 6 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: BUY_COLOR, marginTop: -6 },
  estimateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 5 },
  estimateLabel: { color: DIM, fontFamily: 'Inter_400Regular', fontSize: 11 },
  estimateValue: { color: SILVER, fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  estimateValueStrong: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 14 },
  pendingNote: { color: GOLD, fontFamily: 'Inter_600SemiBold', fontSize: 9, marginTop: 7 },
  errorBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderWidth: 1, borderColor: 'rgba(255,59,59,0.35)', backgroundColor: 'rgba(255,59,59,0.08)', borderRadius: 9, padding: 10, marginBottom: 12 },
  errorText: { color: SELL_COLOR, fontFamily: 'Inter_500Medium', fontSize: 11, lineHeight: 16, flex: 1 },
  primaryAction: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderRadius: 11, paddingHorizontal: 16, marginTop: 3 },
  primaryActionText: { color: '#000', fontFamily: 'Inter_700Bold', fontSize: 13, letterSpacing: 0.75 },
  disabledButton: { opacity: 0.42 },
  footerDisclaimer: { color: 'rgba(192,192,192,0.42)', fontFamily: 'Inter_400Regular', fontSize: 9, textAlign: 'center', marginTop: 11 },
});
