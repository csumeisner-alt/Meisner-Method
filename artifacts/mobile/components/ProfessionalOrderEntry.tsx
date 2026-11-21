import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import OrderEntryReview from './OrderEntryReview';
import type { LiveQuote, OrderType, PaperAccount, PaperOrder, PaperPosition } from '@/lib/paperMath';
import { checkRisk, getAvailableSettledBuyingPower } from '@/lib/paperEngine';
import { isPaperChallengeAccountId } from '@/lib/paperChallenge';
import {
  calculateSharesForBuyingPower,
  formatProviderMarketSession,
  formatProviderPriceSource,
  getAvailableSellShares,
  getAvailableShortShares,
  getOrderEstimatePrice,
  getOrderQuoteState,
  isClosedMarketQuote,
  type OrderQuoteState,
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
  market: 'During market hours, it fills at the next quote. When closed, it waits for the next regular market open.',
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
  side: OrderIntent;
  shortCollateralRatio?: number;
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
    assetType: 'stock' | 'etf' | 'unknown';
  };
};

export type OrderIntent = 'buy' | 'sell' | 'short' | 'cover';

export type OrderSubmissionResult =
  | { status: 'filled'; message: string; fillPrice: number }
  | { status: 'pending'; message: string; pendingReason?: 'market-open' }
  | { status: 'rejected'; message: string };

export type ReviewSnapshot = {
  args: ConfirmOrderArgs;
  quoteState: OrderQuoteState;
  accountName: string;
  equity: number;
  buyingPower: number;
  cash: number;
  estimatedValue: number;
  marginImpact: number;
  collateralRatio: number;
  quoteNote: string;
  lightningPreparation: boolean;
  marketClosed: boolean;
  purchaseLimit?: number;
};

type Props = {
  visible: boolean;
  side: OrderIntent;
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
    assetType: 'stock' | 'etf' | 'unknown';
  };
  purchaseLimit?: number;
  selectedPos?: PaperPosition | null;
  existingOrder?: PaperOrder | null;
  /** Restrict this sheet to long market buys during Lightning preparation. */
  marketOnly?: boolean;
  pendingOrders?: PaperOrder[];
  onClose: () => void;
  onRefreshQuote: (symbol: string) => Promise<void>;
  onSearchStock: () => void;
  onSetShortCollateralRatio: (ratio: number) => void;
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
  purchaseLimit,
  selectedPos,
  existingOrder,
  marketOnly = false,
  pendingOrders = [],
  onClose,
  onRefreshQuote,
  onSearchStock,
  onSetShortCollateralRatio,
  onConfirm,
}: Props) {
  const { width: screenWidth, fontScale } = useWindowDimensions();
  const compactSideButtons = screenWidth <= 360 || fontScale >= 1.3;
  const [activeSide, setActiveSide] = useState<OrderIntent>(side);
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
  const quotePrice = quote?.price ?? 0;
  const quoteState = getOrderQuoteState(quote, quoteNowMs);
  const sessionLabel = formatProviderMarketSession(quote?.marketSession);
  const sourceLabel = formatProviderPriceSource(quote?.priceSource);
  const timestamp = Number.isFinite(quote?.priceTimestamp) && (quote?.priceTimestamp ?? 0) > 0
    ? new Date((quote?.priceTimestamp ?? 0) * 1000)
    : null;
  const sellPosition = selectedPos
    ?? accountPositions.find((position) => position.accountId === account.id && position.symbol === symbol)
    ?? null;
  const availableSellShares = getAvailableSellShares(
    sellPosition?.positionType === 'short' ? null : sellPosition,
    pendingOrders,
    account.id,
    symbol,
    existingOrder?.id,
  );
  const shortPosition = selectedPos
    ?? accountPositions.find((position) => position.accountId === account.id
      && position.symbol === symbol && position.positionType === 'short')
    ?? null;
  const availableCoverShares = getAvailableShortShares(
    shortPosition,
    pendingOrders,
    account.id,
    symbol,
    existingOrder?.id,
  );
  const buyingPower = useMemo(
    () => getAvailableSettledBuyingPower(account, pendingOrders, quotes, existingOrder?.id, accountPositions),
    [account, pendingOrders, quotes, existingOrder?.id, accountPositions],
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
  else if (activeSide === 'cover' && availableCoverShares <= 0) inputError = `No ${symbol} short shares are available in ${account.name} after pending covers.`;
  const riskError = sharesValid && !inputError
    ? checkRisk({
        side: activeSide === 'buy' || activeSide === 'cover' ? 'buy' : 'sell',
        intent: activeSide === 'short' ? 'short' : activeSide === 'cover' ? 'cover' : undefined,
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

  useEffect(() => {
    if (!visible) return;
    setActiveSide(marketOnly ? 'buy' : side);
    setOrderType(marketOnly ? 'market' : existingOrder?.orderType ?? 'market');
    setSharesText(String(existingOrder?.shares ?? (side === 'sell' ? selectedPos?.shares ?? '' : side === 'cover' ? selectedPos?.shares ?? '' : '')));
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

  const chooseSide = (nextSide: OrderIntent) => {
    if (existingOrder) return;
    setActiveSide(nextSide);
    setSharesText(nextSide === 'sell' ? String(availableSellShares || '')
      : nextSide === 'cover' ? String(availableCoverShares || '') : '');
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
      shortCollateralRatio: activeSide === 'short' ? account.shortCollateralRatio ?? 1.5 : undefined,
      shares: numericShares,
      limitPrice,
      stopPrice,
      trailPct: activeTrailPct,
      trailAbs: activeTrailAbs,
      quotePrice,
      stockInfo: (activeSide === 'buy' || activeSide === 'short') && stockInfo ? {
        companyName: stockInfo.companyName,
        dividendYield: stockInfo.dividendYield,
        dividendRate: stockInfo.dividendRate,
        expenseRatio: stockInfo.expenseRatio,
        sector: stockInfo.sector,
        assetType: stockInfo.assetType,
      } : undefined,
    };
    setReview({
      args,
      quoteState,
      accountName: account.name,
      equity: accountEquity,
      buyingPower,
      cash: account.cash,
      estimatedValue,
      marginImpact: activeSide === 'short'
        ? estimatedValue * Math.max(0, (account.shortCollateralRatio ?? 1.5) - 1)
        : 0,
      collateralRatio: account.shortCollateralRatio ?? 1.5,
      quoteNote: freshnessNote,
      lightningPreparation: marketOnly,
      marketClosed: isClosedMarketQuote(quote),
      purchaseLimit: activeSide === 'buy' ? purchaseLimit : undefined,
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
    ? 'LIVE'
    : quoteState === 'stale'
      ? 'STALE'
      : 'NO QUOTE';
  const quoteTime = timestamp && Number.isFinite(timestamp.getTime())
    ? timestamp.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
    : null;
  const freshnessNote = quoteState === 'stale'
    ? `Last available provider price${sourceLabel || sessionLabel ? ` · ${sourceLabel ?? sessionLabel}` : ''} · freshness unverified${quoteTime ? ` · reported ${quoteTime}` : ''}.`
    : quoteState === 'unavailable'
      ? 'No provider price is available. No estimated or illustrative price is shown.'
      : quoteTime
        ? `Provider quote · ${quoteTime}${sourceLabel || sessionLabel ? ` · ${sourceLabel ?? sessionLabel}` : ''}`
        : 'Provider quote is current.';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={() => { if (!submitting) onClose(); }}
    >
      <SafeAreaView style={styles.safeArea}>
        <View testID="paper-order-top-bar" style={styles.topBar}>
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
          {!review && !result && (activeSide === 'buy' || activeSide === 'short') && !existingOrder && (
            <TouchableOpacity
              testID="paper-order-search-stock"
              accessibilityRole="button"
              accessibilityLabel="Search ticker or company"
              accessibilityHint="Choose a stock for this order"
              style={styles.iconButton}
              onPress={onSearchStock}
              disabled={submitting}
            >
              <Feather name="search" size={19} color={SILVER} />
            </TouchableOpacity>
          )}
          <View testID="paper-order-activity-mark" style={styles.orderMark}>
            <Feather name="activity" size={17} color={GOLD} />
          </View>
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
            <View testID="paper-order-account-summary" style={styles.accountCard}>
              <View style={styles.accountTitleRow}>
                <Feather name="briefcase" size={16} color={GOLD} />
                <Text testID="order-sheet-active-account" style={styles.accountName} numberOfLines={1}>{account.name}</Text>
                <Text style={styles.accountIdTag}>PAPER</Text>
              </View>
              <View testID="paper-order-account-metrics" style={styles.metricsRow}>
                <Metric label="EQUITY" value={money(accountEquity)} />
                <Metric label="SETTLED B.P." value={money(buyingPower)} />
                <Metric label="CASH" value={money(account.cash)} />
              </View>
              {(account.unsettledCash ?? 0) > 0 && (
                <Text style={styles.unsettledNote}>+ {money(account.unsettledCash ?? 0)} unsettled · not available to buy</Text>
              )}
              {activeSide === 'short' && (account.shortCollateral ?? 0) > 0 && (
                <Text style={styles.unsettledNote}>{money(account.shortCollateral ?? 0)} restricted short collateral · not spendable cash</Text>
              )}
              {activeSide === 'short' && (
                <View testID="paper-short-collateral-settings">
                  <Text style={[styles.unsettledNote, { marginTop: 9 }]}>SIMULATED SHORT COLLATERAL</Text>
                  <View style={styles.metricsRow}>
                    {[1.25, 1.5, 2].map((ratio) => {
                      const selected = (account.shortCollateralRatio ?? 1.5) === ratio;
                      return (
                        <TouchableOpacity
                          key={ratio}
                          testID={`paper-short-collateral-${Math.round(ratio * 100)}`}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          style={[styles.trailToggle, selected && { borderColor: GOLD }]}
                          onPress={() => onSetShortCollateralRatio(ratio)}
                          disabled={selected || submitting || !!existingOrder}
                        >
                          <Text style={[styles.trailToggleText, selected && { color: GOLD }]}>{Math.round(ratio * 100)}%</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <Text testID="paper-short-collateral-explanation" style={styles.unsettledNote}>
                    Applies to new shorts; open positions keep their reserved collateral.
                  </Text>
                </View>
              )}
            </View>

            <View testID="paper-order-quote" style={styles.quoteCard}>
              <View style={styles.quoteTopRow}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.quoteName} numberOfLines={1}>{companyName || stockInfo?.companyName || symbol}</Text>
                  <Text style={styles.quoteSymbol} numberOfLines={1}>{symbol} · {quoteStatus}</Text>
                </View>
                <View style={styles.quotePriceWrap}>
                  <Text style={styles.quotePrice} numberOfLines={1} adjustsFontSizeToFit>{quotePrice > 0 ? money(quotePrice) : '—'}</Text>
                  {quote && Number.isFinite(quote.change) && Number.isFinite(quote.pct) && (
                    <Text style={[styles.quoteChange, { color: quote.change >= 0 ? BUY_COLOR : SELL_COLOR }]}>
                      {quote.change >= 0 ? '+' : ''}{money(quote.change)} ({quote.pct >= 0 ? '+' : ''}{quote.pct.toFixed(2)}%)
                    </Text>
                  )}
                </View>
                {quoteState !== 'fresh' && (
                  <TouchableOpacity
                    testID="paper-order-refresh-quote"
                    accessibilityRole="button"
                    accessibilityLabel={refreshingQuote ? 'Refreshing provider quote' : 'Refresh provider quote'}
                    accessibilityState={{ disabled: refreshingQuote, busy: refreshingQuote }}
                    style={styles.quoteRefreshButton}
                    onPress={() => { void refreshQuote(); }}
                    disabled={refreshingQuote}
                  >
                    {refreshingQuote
                      ? <ActivityIndicator testID="paper-order-refresh-spinner" size="small" color={SILVER} />
                      : <Feather name="refresh-cw" size={17} color={SILVER} />}
                  </TouchableOpacity>
                )}
              </View>
              {!!quoteRefreshError && <Text style={styles.quoteRefreshError}>{quoteRefreshError}</Text>}
            </View>

            {!marketOnly && <Text style={styles.sectionLabel}>TRADE SIDE</Text>}
            {!marketOnly && <View style={styles.sideSwitch}>
              {(activeSide === 'cover' ? ['cover'] as const : ['buy', 'sell', 'short'] as const).map((item) => {
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
                      <View
                        testID={`paper-order-side-${item}-main`}
                        style={[
                          styles.sideButtonMain,
                          compactSideButtons && styles.sideButtonMainCompact,
                        ]}
                      >
                        <Feather name={item === 'buy' ? 'trending-up' : 'trending-down'} size={16} color={selected ? '#000' : color} />
                        <Text
                          testID={`paper-order-side-${item}-label`}
                          style={[styles.sideButtonText, { color: selected ? '#000' : color }]}
                        >
                          {item === 'short' ? 'SHORT SELL' : item === 'cover' ? 'BUY TO COVER' : item.toUpperCase()}
                        </Text>
                      </View>
                    {item === 'sell' && (
                        <Text
                          testID={`paper-order-side-${item}-detail`}
                          style={[styles.sideShares, { color: selected ? '#000' : color }]}
                        >
                        {availableSellShares.toLocaleString('en-US', { maximumFractionDigits: 4 })} available
                      </Text>
                    )}
                      {item === 'short' && (
                        <Text testID={`paper-order-side-${item}-detail`} style={[styles.sideShares, { color: selected ? '#000' : color }]}>
                          simulated borrow
                        </Text>
                      )}
                  </TouchableOpacity>
                );
              })}
            </View>}

            <Text style={styles.sectionLabel}>ORDER TYPE</Text>
            <ScrollView testID="paper-order-type-scroller" horizontal showsHorizontalScrollIndicator={false} style={styles.typeScroller}>
              <View style={styles.typeRow}>
                {ORDER_TYPES.filter((item) => !marketOnly || item.type === 'market').map((item) => (
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
                    disabled={!!existingOrder && item.type === 'market' && !marketOnly}
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
              {(activeSide === 'sell' || activeSide === 'cover') && (
                <TouchableOpacity
                  testID="paper-order-all-shares"
                  accessibilityRole="button"
                  style={styles.allButton}
                  onPress={() => setSharesText(String(activeSide === 'sell' ? availableSellShares : availableCoverShares))}
                  disabled={(activeSide === 'sell' ? availableSellShares : availableCoverShares) <= 0}
                >
                  <Text style={styles.allButtonText}>ALL</Text>
                </TouchableOpacity>
              )}
            </View>
            <View style={styles.quickRow}>
              {[1, 5, 10].map((quantity) => (
                <QuickButton
                  key={quantity}
                  label={`${activeSide === 'sell' ? Math.min(quantity, availableSellShares) : activeSide === 'cover' ? Math.min(quantity, availableCoverShares) : quantity} share${quantity === 1 ? '' : 's'}`}
                  testID={`paper-order-quick-shares-${quantity}`}
                  onPress={() => setSharesText(String(activeSide === 'sell' ? Math.min(quantity, availableSellShares) : activeSide === 'cover' ? Math.min(quantity, availableCoverShares) : quantity))}
                  disabled={(activeSide === 'sell' && availableSellShares <= 0) || (activeSide === 'cover' && availableCoverShares <= 0)}
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
              <EstimateRow
                label={orderType === 'market' && quoteState === 'stale' ? 'Last available · stale' : 'Reference price'}
                value={quotePrice > 0 ? money(quotePrice) : 'Unavailable'}
              />
              <EstimateRow
                label={activeSide === 'buy' || activeSide === 'cover' ? 'Estimated cost' : 'Estimated proceeds'}
                value={sharesValid && estimatePrice > 0 ? money(estimatedValue) : '—'}
                strong
              />
              <EstimateRow
                label={marketOnly
                  ? 'Buying power now'
                  : activeSide === 'buy' ? 'Buying power after' : activeSide === 'short' ? 'Margin reserved' : 'Shares remaining'}
                value={marketOnly
                  ? money(buyingPower)
                  : activeSide === 'buy'
                  ? (sharesValid ? money(buyingPower - estimatedValue) : money(buyingPower))
                  : activeSide === 'short'
                    ? money(sharesValid ? estimatedValue * Math.max(0, (account.shortCollateralRatio ?? 1.5) - 1) : 0)
                    : `${Math.max(0, (activeSide === 'sell' ? availableSellShares : availableCoverShares) - (sharesValid ? numericShares : 0)).toLocaleString('en-US', { maximumFractionDigits: 4 })}`}
              />
              {activeSide === 'sell' && (
                <Text style={styles.pendingNote}>
                  {isPaperChallengeAccountId(account.id)
                    ? 'Event portfolio sell proceeds are available immediately.'
                    : 'Sell proceeds settle the next market business day (T+1) and are not immediately available to buy.'}
                </Text>
              )}
              {activeSide === 'short' && (
                <Text style={styles.pendingNote}>
                  Simulated {Math.round((account.shortCollateralRatio ?? 1.5) * 100)}% collateral: proceeds stay restricted, plus {Math.round(Math.max(0, (account.shortCollateralRatio ?? 1.5) - 1) * 100)}% cash margin. Borrow availability is simulated; no real shares are borrowed. Losses can exceed your initial margin with no fixed upper limit.
                </Text>
              )}
              {activeSide === 'cover' && (
                <Text style={styles.pendingNote}>Buying power impact is estimated using released short collateral. Final cost uses the actual fill price.</Text>
              )}
              {marketOnly && (
                <Text testID="lightning-round-order-pending-note" style={styles.pendingNote}>
                  PENDING — EXECUTES AT EVENT START. No cash or buying power is reserved now. The actual execution price may differ.
                </Text>
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
              <Text style={styles.primaryActionText}>
                {activeSide === 'buy' ? 'REVIEW BUY' : activeSide === 'sell' ? 'REVIEW SELL' : activeSide === 'short' ? 'REVIEW SHORT SELL' : 'REVIEW BUY TO COVER'}
              </Text>
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
    gap: 8,
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
  quoteCard: { borderWidth: 1, borderColor: BORDER, backgroundColor: '#11151a', borderRadius: 12, padding: 9, marginBottom: 12 },
  quoteTopRow: { flexDirection: 'row', gap: 6, alignItems: 'center', minWidth: 0 },
  quoteName: { color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  quoteSymbol: { color: DIM, fontFamily: 'Inter_600SemiBold', fontSize: 9, letterSpacing: 0.7, marginTop: 2 },
  quotePriceWrap: { alignItems: 'flex-end', flexShrink: 0, maxWidth: '42%' },
  quotePrice: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 19 },
  quoteChange: { fontFamily: 'Inter_600SemiBold', fontSize: 10, marginTop: 1 },
  quoteRefreshButton: { width: 44, height: 44, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 11, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD_BG },
  quoteRefreshError: { color: SELL_COLOR, fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 6 },
  sectionLabel: { color: DIM, fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1.5, marginBottom: 8, marginTop: 2 },
  sideSwitch: { flexDirection: 'row', flexWrap: 'nowrap', gap: 7, marginBottom: 18 },
  sideButton: { flex: 1, minWidth: 0, minHeight: 68, flexDirection: 'column', flexWrap: 'nowrap', alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 1, borderColor: BORDER, borderRadius: 11, paddingHorizontal: 3, paddingVertical: 8 },
  sideButtonMain: { width: '100%', minWidth: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  sideButtonMainCompact: { flexDirection: 'column', gap: 2 },
  sideButtonText: { maxWidth: '100%', flexShrink: 0, textAlign: 'center', fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 0.3 },
  sideShares: { maxWidth: '100%', textAlign: 'center', fontFamily: 'Inter_400Regular', fontSize: 9 },
  typeScroller: { marginBottom: 8 },
  typeRow: { flexDirection: 'row', gap: 8, paddingRight: 6 },
  typeChip: { minHeight: 44, borderWidth: 1, borderColor: BORDER, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  typeChipText: { color: DIM, fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  typeHint: { color: DIM, fontFamily: 'Inter_400Regular', fontSize: 10, lineHeight: 15, marginBottom: 17 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  quantityInput: { minHeight: 48, minWidth: 0, backgroundColor: CARD_BG, borderWidth: 1, borderColor: BORDER, borderRadius: 10, paddingHorizontal: 14, color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 20, flex: 1 },
  allButton: { minHeight: 48, paddingHorizontal: 16, justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD_BG },
  allButtonText: { color: SILVER, fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 0.9 },
  quickRow: { flexDirection: 'row', gap: 7, marginBottom: 12 },
  quickButton: { flex: 1, minWidth: 0, minHeight: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: '#15191e', borderWidth: 1, borderColor: BORDER, borderRadius: 8, paddingHorizontal: 6 },
  quickButtonText: { color: SILVER, fontFamily: 'Inter_600SemiBold', fontSize: 10 },
  shortcutLabel: { color: DIM, fontFamily: 'Inter_600SemiBold', fontSize: 8, letterSpacing: 1.1, marginBottom: 7, marginTop: 1 },
  formInput: { minHeight: 46, minWidth: 0, maxWidth: '100%', backgroundColor: CARD_BG, borderWidth: 1, borderColor: BORDER, borderRadius: 10, paddingHorizontal: 14, color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 17, marginBottom: 12 },
  trailToggle: { width: 44, height: 46, borderWidth: 1, borderColor: BORDER, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  trailToggleText: { color: DIM, fontFamily: 'Inter_700Bold', fontSize: 14 },
  estimateCard: { minWidth: 0, backgroundColor: '#13171c', borderWidth: 1, borderColor: BORDER, borderRadius: 12, padding: 13, marginTop: 5, marginBottom: 12 },
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
