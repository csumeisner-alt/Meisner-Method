import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import {
  getGetCryptoSupplyHistoryQueryKey,
  useGetCryptoSupplyHistory,
  type HeatMapQuote,
} from '@workspace/api-client-react';
import { CommodityPriceDrivers } from '@/components/CommodityPriceDrivers';
import { useApi } from '@/hooks/useApi';
import { useColors } from '@/hooks/useColors';
import {
  formatHeatMapRegimeReturn,
  formatHeatMapCompact,
  getHeatMapCryptoSupplyDiscrepancy,
  getHeatMapCryptoSupplyChartModel,
  getHeatMapCryptoSupplyChangeSummary,
  getHeatMapDetailStatRows,
  getHeatMapRangePosition,
  parseHeatMapCryptoSupplyHistory,
  parseHeatMapDetailStats,
  HEAT_MAP_CRYPTO_SUPPLY_RANGES,
  type HeatMapEtfProfile,
  type HeatMapCryptoSupplyRangeDays,
  type HeatMapDetailStats,
} from '@/lib/heatMapDetail';
import {
  getCommodityContractNotional,
  getCommodityContractSpec,
  getCommodityContractTickValue,
} from '@/lib/heatMapInstrumentDisplay';
import { formatHeatMapQuoteAge } from '@/lib/heatMapQuoteDisplay';
import { formatHeatMapCryptoPrice } from '@/lib/heatMapCryptoPrice';

const DETAIL_CACHE_TTL_MS = 5 * 60_000;
const DETAIL_STATS_REQUEST_TIMEOUT_MS = 10_000;
const detailCache = new Map<string, { stats: HeatMapDetailStats; expiresAt: number }>();

function formatPrice(value: number, quoteCurrency: string = 'USD') {
  const absolute = Math.abs(value);
  const fractionDigits = absolute >= 1 ? 2 : absolute >= 0.01 ? 4 : 6;
  const sign = value < 0 ? '-' : '';
  const formatted = absolute.toLocaleString('en-US', {
    minimumFractionDigits: quoteCurrency === 'USC' ? 2 : fractionDigits,
    maximumFractionDigits: quoteCurrency === 'USC' ? 3 : fractionDigits,
  });
  if (quoteCurrency === 'USC') return `${sign}${formatted}¢`;
  if (quoteCurrency !== 'USD') return `${sign}${formatted} ${quoteCurrency}`;
  return `${sign}$${formatted}`;
}

function formatCommodityPriceIncrement(value: number, quoteCurrency: 'USD' | 'USC') {
  const formatted = value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });
  return quoteCurrency === 'USC' ? `${formatted}¢` : `$${formatted}`;
}
function getAssetLabel(assetType: HeatMapQuote['assetType']) {
  switch (assetType) {
    case 'stock': return 'STOCK';
    case 'etf': return 'ETF';
    case 'commodity': return 'COMMODITY';
    case 'future': return 'FUTURE';
    case 'cryptocurrency': return 'CRYPTOCURRENCY';
  }
}

function RangeBar({
  title,
  low,
  high,
  price,
  loading,
  colors,
  testID,
  formatValue = formatPrice,
}: {
  title: string;
  low: number | null;
  high: number | null;
  price: number;
  loading: boolean;
  colors: ReturnType<typeof useColors>;
  testID: string;
  formatValue?: (value: number) => string;
}) {
  const position = getHeatMapRangePosition(price, low, high);
  const hasRange = position !== null;

  return (
    <View testID={testID} style={[styles.rangeCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.rangeTitle, { color: colors.foreground }]}>{title}</Text>
      {hasRange ? (
        <>
          <View style={[styles.rangeTrack, { backgroundColor: colors.secondary }]}>
            <View style={[styles.rangeProgress, { backgroundColor: colors.gold, width: `${position}%` }]} />
            <View style={[styles.rangeMarker, { backgroundColor: colors.gold, borderColor: colors.card, left: `${position}%` }]} />
          </View>
          <View style={styles.rangeLabels}>
            <Text style={[styles.rangeValue, { color: colors.mutedForeground }]}>{formatValue(low!)}</Text>
            <Text style={[styles.rangeValue, { color: colors.mutedForeground }]}>{formatValue(high!)}</Text>
          </View>
        </>
      ) : (
        <Text style={[styles.rangeUnavailable, { color: colors.mutedForeground }]}>
          {loading ? 'Loading range…' : 'Range unavailable'}
        </Text>
      )}
    </View>
  );
}

const ETF_REGIME_ORDER = ['bull', 'bear', 'mixed'] as const;

function getRegimeTitle(regime: typeof ETF_REGIME_ORDER[number]) {
  return regime.charAt(0).toUpperCase() + regime.slice(1);
}

function formatRegimeThreshold(value: number) {
  const formatted = `${Math.abs(value * 100).toFixed(0)}%`;
  return value < 0 ? `−${formatted}` : `+${formatted}`;
}

function EtfAdditionalDetails({
  profile,
  loading,
  colors,
}: {
  profile: HeatMapEtfProfile | null;
  loading: boolean;
  colors: ReturnType<typeof useColors>;
}) {
  const regime = profile?.marketRegime ?? null;
  const comparableRegimeCount = regime
    ? ETF_REGIME_ORDER.filter((key) => regime.periods[key].years >= 2).length
    : 0;
  const bestRegime = regime?.bestRegime ?? null;
  const headline = bestRegime
    ? `Best observed in ${getRegimeTitle(bestRegime)} years`
    : regime && comparableRegimeCount >= 2
      ? 'No clear standout'
      : regime
        ? 'Not enough full-year history'
        : 'History comparison unavailable';
  const methodology = regime
    ? `${regime.firstYear}–${regime.lastYear} complete calendar years. ${regime.benchmarkSymbol} (an S&P 500 proxy) annual total returns define the groups: bull ≥ ${formatRegimeThreshold(regime.bullThreshold)}, bear ≤ ${formatRegimeThreshold(regime.bearThreshold)}, mixed otherwise. ETF returns use dividend-adjusted monthly closes. Historical only—not a forecast.`
    : 'Uses complete calendar years of dividend-adjusted ETF returns grouped by annual SPY returns, an S&P 500 proxy. This historical comparison is not a forecast.';

  return (
    <View style={styles.etfDetails}>
      <View>
        <View style={styles.etfSubsectionHeader}>
          <View style={styles.etfSubsectionTitleBlock}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Largest holdings</Text>
            <Text style={[styles.etfSubsectionCaption, { color: colors.mutedForeground }]}>
              Top positions by fund weight
            </Text>
          </View>
        </View>
        <View style={[styles.holdingsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {profile?.topHoldings.length ? profile.topHoldings.map((holding, index) => (
            <View
              key={holding.symbol}
              style={[
                styles.holdingRow,
                index < profile.topHoldings.length - 1 && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
              ]}
            >
              <View style={styles.holdingIdentity}>
                <Text numberOfLines={1} style={[styles.holdingName, { color: colors.foreground }]}>
                  {holding.name}
                </Text>
                <Text style={[styles.holdingSymbol, { color: colors.mutedForeground }]}>
                  {holding.symbol}
                </Text>
              </View>
              <Text style={[styles.holdingWeight, { color: colors.foreground }]}>
                {formatHeatMapRegimeReturn(holding.weight)}
              </Text>
            </View>
          )) : (
            <Text style={[styles.etfEmptyText, { color: colors.mutedForeground }]}>
              {loading && !profile ? 'Loading holdings…' : profile ? 'Holdings breakdown not reported.' : 'Holdings data unavailable.'}
            </Text>
          )}
        </View>
      </View>

      <View>
        <View style={styles.etfSubsectionHeader}>
          <View style={styles.etfSubsectionTitleBlock}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Market-history fit</Text>
            <Text style={[styles.etfSubsectionCaption, { color: colors.mutedForeground }]}>
              Average annual ETF return by market type
            </Text>
          </View>
          <View style={[styles.regimeBadge, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.regimeBadgeText, { color: bestRegime ? colors.gold : colors.mutedForeground }]}>
              {headline}
            </Text>
          </View>
        </View>
        <View style={styles.regimeGrid}>
          {ETF_REGIME_ORDER.map((key) => {
            const period = regime?.periods[key];
            const averageReturn = period?.averageAnnualReturn ?? null;
            return (
              <View
                key={key}
                testID={`heat-map-etf-regime-${key}`}
                style={[styles.regimeCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <Text style={[styles.regimeLabel, { color: colors.mutedForeground }]}>
                  {getRegimeTitle(key)}
                </Text>
                <Text style={[
                  styles.regimeReturn,
                  { color: averageReturn === null ? colors.mutedForeground : averageReturn >= 0 ? colors.buyColor : colors.sellColor },
                ]}>
                  {formatHeatMapRegimeReturn(averageReturn)}
                </Text>
                <Text style={[styles.regimeSample, { color: colors.mutedForeground }]}>
                  {period?.years ? `${period.years} ${period.years === 1 ? 'year' : 'years'}` : 'No years'}
                </Text>
              </View>
            );
          })}
        </View>
        <Text style={[styles.methodology, { color: colors.mutedForeground }]}>{methodology}</Text>
      </View>
    </View>
  );
}

function formatSupplyDate(date: string) {
  const timestamp = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(timestamp)
    ? new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    })
    : date;
}

function formatSupplyChangeAmount(value: number) {
  const magnitude = Math.abs(value);
  const formatted = magnitude >= 1_000
    ? formatHeatMapCompact(magnitude)
    : magnitude.toLocaleString('en-US', { maximumSignificantDigits: 6 });
  return value > 0 ? `+${formatted}` : value < 0 ? `-${formatted}` : formatted;
}

function formatExactSupply(value: number) {
  return value.toLocaleString('en-US', { maximumFractionDigits: 20 });
}

export function HeatMapDetailModal({
  quote,
  unavailableCommodity,
  isWatched,
  onAddToWatchlist,
  quoteUnavailable,
  visible,
  onClose,
  onRefreshQuote,
  onOpenChart,
  canAnalyzeStock,
  onAnalyzeStock,
  canAnalyzeEtf,
  onAnalyzeEtf,
  canAnalyzeCommodity,
  onAnalyzeCommodity,
}: {
  quote: HeatMapQuote | null;
  unavailableCommodity?: { symbol: string; name: string } | null;
  isWatched: boolean;
  onAddToWatchlist: () => void;
  quoteUnavailable: boolean;
  visible: boolean;
  onClose: () => void;
  onRefreshQuote: (symbol: string) => Promise<HeatMapQuote | null>;
  onOpenChart: () => void;
  canAnalyzeStock: boolean;
  onAnalyzeStock: () => void;
  canAnalyzeEtf: boolean;
  onAnalyzeEtf: () => void;
  canAnalyzeCommodity: boolean;
  onAnalyzeCommodity: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { apiFetch } = useApi();
  const [statsEntry, setStatsEntry] = useState<{ symbol: string; stats: HeatMapDetailStats } | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const forceRefreshRef = useRef(false);
  const [quoteRefreshLoading, setQuoteRefreshLoading] = useState(false);
  const [quoteRefreshError, setQuoteRefreshError] = useState(false);
  const quoteRefreshAttemptRef = useRef(0);
  const quoteRefreshInFlightRef = useRef(false);
  const symbol = quote?.symbol ?? unavailableCommodity?.symbol ?? null;
  const name = quote?.name ?? unavailableCommodity?.name ?? symbol;
  const isCommodity = quote?.assetType === 'commodity' || unavailableCommodity !== null && unavailableCommodity !== undefined;

  useEffect(() => {
    quoteRefreshAttemptRef.current += 1;
    quoteRefreshInFlightRef.current = false;
    setQuoteRefreshLoading(false);
    setQuoteRefreshError(false);
  }, [quote?.symbol, unavailableCommodity?.symbol, visible]);

  useEffect(() => {
    if (!quoteUnavailable) setQuoteRefreshError(false);
  }, [quoteUnavailable]);

  const refreshQuote = async () => {
    if (!quote || quoteRefreshInFlightRef.current) return;
    const symbol = quote.symbol;
    const attempt = ++quoteRefreshAttemptRef.current;
    quoteRefreshInFlightRef.current = true;
    setQuoteRefreshLoading(true);
    setQuoteRefreshError(false);
    try {
      const refreshedQuote = await onRefreshQuote(symbol);
      if (attempt !== quoteRefreshAttemptRef.current) return;
      setQuoteRefreshError(
        !refreshedQuote || refreshedQuote.symbol.toUpperCase() !== symbol.toUpperCase(),
      );
    } catch {
      if (attempt === quoteRefreshAttemptRef.current) setQuoteRefreshError(true);
    } finally {
      if (attempt === quoteRefreshAttemptRef.current) {
        quoteRefreshInFlightRef.current = false;
        setQuoteRefreshLoading(false);
      }
    }
  };

  const refreshDetailStats = () => {
    if (loading) return;
    forceRefreshRef.current = true;
    setRetryCount((current) => current + 1);
  };

  useEffect(() => {
    if (!visible || !symbol) return;
    let isCurrent = true;
    const forceRefresh = forceRefreshRef.current;
    forceRefreshRef.current = false;
    const cacheKey = symbol.toUpperCase();
    const cached = detailCache.get(cacheKey);
    const hasFreshCache = cached !== undefined && cached.expiresAt > Date.now();

    setStatsEntry((current) => current?.symbol === cacheKey
      ? current
      : cached ? { symbol: cacheKey, stats: cached.stats } : null);
    setLoadError(false);
    if (hasFreshCache && !forceRefresh) {
      setLoading(false);
      return () => { isCurrent = false; };
    }

    setLoading(true);
    const controller = new AbortController();
    let didTimeout = false;
    const timeoutId = setTimeout(() => {
      if (!isCurrent) return;
      didTimeout = true;
      controller.abort();
      setLoadError(true);
      setLoading(false);
    }, DETAIL_STATS_REQUEST_TIMEOUT_MS);

    void apiFetch<unknown>(`/api/stocks/info/${encodeURIComponent(symbol)}`, {
      signal: controller.signal,
    })
      .then((payload) => {
        if (!isCurrent || didTimeout) return;
        const parsed = parseHeatMapDetailStats(payload);
        if (!parsed) throw new Error('Unexpected market detail response');
        detailCache.set(cacheKey, { stats: parsed, expiresAt: Date.now() + DETAIL_CACHE_TTL_MS });
        if (detailCache.size > 32) {
          const oldestKey = detailCache.keys().next().value;
          if (oldestKey !== undefined) detailCache.delete(oldestKey);
        }
        setStatsEntry({ symbol: cacheKey, stats: parsed });
        setLoadError(false);
      })
      .catch(() => {
        if (isCurrent && (didTimeout || !controller.signal.aborted)) setLoadError(true);
      })
      .finally(() => {
        clearTimeout(timeoutId);
        if (isCurrent) setLoading(false);
      });

    return () => {
      isCurrent = false;
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [apiFetch, retryCount, symbol, visible]);

  if (!quote && !unavailableCommodity) return null;

  const stats = symbol !== null && statsEntry !== null && statsEntry.symbol === symbol.toUpperCase()
    ? statsEntry.stats
    : null;
  const marketCap = stats?.marketCap ?? quote?.marketCapUsd ?? null;
  const change = quote?.priceChangePercent ?? 0;
  const changeColor = quote === null ? colors.mutedForeground : change >= 0 ? colors.buyColor : colors.sellColor;
  const isEtf = quote?.assetType === 'etf';
  const isCrypto = quote?.assetType === 'cryptocurrency';
  const commodityContract = isCommodity && symbol ? getCommodityContractSpec(symbol) : null;
  const commodityNotional = commodityContract && quote
    ? getCommodityContractNotional(quote.symbol, quote.price)
    : null;
  const commodityTickValue = commodityContract
    ? getCommodityContractTickValue(symbol!)
    : null;
  const displayedStats = getHeatMapDetailStatRows(
    quote?.assetType ?? 'commodity',
    stats,
    marketCap,
    loading,
  );
  const formatQuotePrice = (value: number) => quote?.assetType === 'cryptocurrency'
    ? formatHeatMapCryptoPrice(value, symbol ?? '', 6)
    : formatPrice(value, commodityContract?.quoteCurrency);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.modalRoot}>
        <Pressable
          testID="heat-map-detail-backdrop"
          accessibilityRole="button"
          accessibilityLabel="Close market details"
          onPress={onClose}
          style={styles.scrim}
        />
        <View
          testID="heat-map-detail-modal"
          accessibilityViewIsModal
          style={[
            styles.panel,
            {
              backgroundColor: colors.background,
              borderColor: colors.border,
              paddingBottom: Math.max(insets.bottom, 14),
            },
          ]}
        >
          <View style={[styles.grabber, { backgroundColor: colors.border }]} />
          <ScrollView
            testID="heat-map-detail-scroll"
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator
          >
            <View style={styles.header}>
              <View style={styles.titleBlock}>
                <Text style={[styles.kicker, { color: colors.gold }]}>{getAssetLabel(quote?.assetType ?? 'commodity')}  ·  MARKET STORY</Text>
                <Text testID="heat-map-detail-title" accessibilityRole="header" numberOfLines={2} style={[styles.title, { color: colors.heading }]}>
                  {name || symbol}
                </Text>
                <Text style={[styles.symbolLine, { color: colors.mutedForeground }]}>
                  {symbol}{quote?.exchange ? `  ·  ${quote.exchange}` : ''}
                </Text>
              </View>
              <Pressable
                testID="heat-map-detail-close"
                accessibilityRole="button"
                accessibilityLabel={`Close ${symbol} details`}
                onPress={onClose}
                hitSlop={8}
                style={[styles.closeButton, { borderColor: colors.border, backgroundColor: colors.card }]}
              >
                <MaterialCommunityIcons name="close" size={19} color={colors.foreground} />
              </Pressable>
            </View>
            <Pressable
              testID="heat-map-detail-add-watchlist"
              accessibilityRole="button"
              accessibilityLabel={isWatched ? `${symbol} is in your watchlist` : `Add ${symbol} to watchlist`}
              accessibilityState={{ disabled: isWatched }}
              disabled={isWatched}
              onPress={onAddToWatchlist}
              style={[styles.watchlistButton, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <MaterialCommunityIcons name={isWatched ? 'check' : 'star-plus-outline'} size={17} color={isWatched ? colors.mutedForeground : colors.primary} />
              <Text style={[styles.watchlistButtonText, { color: isWatched ? colors.mutedForeground : colors.primary }]}>
                {isWatched ? 'In watchlist' : 'Add to watchlist'}
              </Text>
            </Pressable>
            {canAnalyzeStock && quote?.assetType === 'stock' && (
              <Pressable
                testID="heat-map-detail-analyze-stock"
                accessibilityRole="button"
                accessibilityLabel={`Run AI stock analysis for ${symbol}`}
                onPress={onAnalyzeStock}
                style={[styles.analyzeStockButton, { backgroundColor: colors.primary }]}
              >
                <MaterialCommunityIcons name="chart-box-outline" size={18} color={colors.primaryForeground} />
                <Text style={[styles.analyzeStockText, { color: colors.primaryForeground }]}>Run AI stock analysis</Text>
                <MaterialCommunityIcons name="arrow-right" size={16} color={colors.primaryForeground} />
              </Pressable>
            )}
            {canAnalyzeEtf && quote?.assetType === 'etf' && (
              <Pressable
                testID="heat-map-detail-analyze-etf"
                accessibilityRole="button"
                accessibilityLabel={`Run AI ETF analysis for ${symbol}`}
                onPress={onAnalyzeEtf}
                style={[styles.analyzeStockButton, { backgroundColor: colors.primary }]}
              >
                <MaterialCommunityIcons name="chart-box-outline" size={18} color={colors.primaryForeground} />
                <Text style={[styles.analyzeStockText, { color: colors.primaryForeground }]}>Run AI ETF analysis</Text>
                <MaterialCommunityIcons name="arrow-right" size={16} color={colors.primaryForeground} />
              </Pressable>
            )}
            {canAnalyzeCommodity && isCommodity && (
              <Pressable
                testID="heat-map-detail-analyze-commodity"
                accessibilityRole="button"
                accessibilityLabel={`Run AI commodity analysis for ${symbol}`}
                onPress={onAnalyzeCommodity}
                style={[styles.analyzeStockButton, { backgroundColor: colors.primary }]}
              >
                <MaterialCommunityIcons name="chart-box-outline" size={18} color={colors.primaryForeground} />
                <Text style={[styles.analyzeStockText, { color: colors.primaryForeground }]}>Run AI commodity analysis</Text>
                <MaterialCommunityIcons name="arrow-right" size={16} color={colors.primaryForeground} />
              </Pressable>
            )}
            <Pressable
              testID="heat-map-detail-open-chart"
              accessibilityRole="button"
              accessibilityLabel={`Open full chart for ${symbol}`}
              onPress={onOpenChart}
              style={[styles.openChartButton, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <MaterialCommunityIcons name="chart-line" size={17} color={colors.primary} />
              <Text style={[styles.openChartText, { color: colors.primary }]}>Open full chart</Text>
              <MaterialCommunityIcons name="arrow-top-right" size={15} color={colors.primary} />
            </Pressable>

            {quote ? <View style={styles.priceRow}>
              <Text testID="heat-map-detail-price" style={[styles.price, { color: colors.foreground }]}>
                {formatQuotePrice(quote.price)}
              </Text>
              <View style={[styles.changeBadge, { backgroundColor: change >= 0 ? colors.buyBg : colors.sellBg }]}>
                <MaterialCommunityIcons name={change >= 0 ? 'arrow-top-right' : 'arrow-bottom-right'} size={15} color={changeColor} />
                <Text style={[styles.changeText, { color: changeColor }]}>
                  {change > 0 ? '+' : ''}{change.toFixed(2)}% today
                </Text>
              </View>
            </View> : <Text testID="heat-map-detail-no-current-quote" style={[styles.emptyStats, { color: colors.mutedForeground }]}>
              No fresh quote is available. Contract details and historical analysis are shown without a current price.
            </Text>}
            {quote && <View style={styles.quoteAgeRow}>
              <Text style={[styles.quoteAge, { color: colors.mutedForeground }]}>
                Quote {formatHeatMapQuoteAge(quote.priceTimestamp)}
              </Text>
              <Pressable
                testID="heat-map-detail-refresh-quote"
                accessibilityRole="button"
                accessibilityLabel={quoteRefreshLoading ? 'Refreshing selected market quote' : 'Refresh selected market quote'}
                accessibilityState={{ disabled: quoteRefreshLoading }}
                disabled={quoteRefreshLoading}
                onPress={() => { void refreshQuote(); }}
                style={[styles.quoteRefreshButton, { borderColor: colors.border }]}
              >
                {quoteRefreshLoading
                  ? <ActivityIndicator size="small" color={colors.primary} />
                  : <MaterialCommunityIcons name="refresh" size={14} color={colors.primary} />}
                <Text style={[styles.retryText, { color: colors.primary }]}>
                  {quoteRefreshLoading ? 'Refreshing' : 'Refresh quote'}
                </Text>
              </Pressable>
            </View>}
            {quote && (quoteUnavailable || quoteRefreshError) && (
              <View testID="heat-map-detail-quote-refresh-error" style={[styles.quoteRefreshError, { borderColor: colors.border }]}>
                <Text style={[styles.errorText, { color: colors.mutedForeground }]}>
                  {quoteUnavailable
                    ? "This quote isn't in the latest batch. Showing the last displayed price."
                    : "Couldn't refresh this quote. Showing the last displayed price."}
                </Text>
                <Pressable
                  testID="heat-map-detail-quote-refresh-retry"
                  accessibilityRole="button"
                  accessibilityLabel="Retry refreshing market quote"
                  onPress={() => { void refreshQuote(); }}
                  style={[styles.retryButton, { borderColor: colors.border }]}
                >
                  <Text style={[styles.retryText, { color: colors.primary }]}>Try again</Text>
                </Pressable>
              </View>
            )}

            {commodityContract && (
              <View
                testID="heat-map-commodity-contract-spec"
                style={[styles.contractSummary, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <View style={styles.contractFactsRow}>
                  <View style={styles.contractFact}>
                    <Text style={[styles.contractLabel, { color: colors.mutedForeground }]}>QUOTE UNIT</Text>
                    <Text testID="heat-map-commodity-quote-unit" style={[styles.contractValue, { color: colors.foreground }]}>
                      {commodityContract.quoteUnit}
                    </Text>
                  </View>
                  <View style={styles.contractFact}>
                    <Text style={[styles.contractLabel, { color: colors.mutedForeground }]}>STANDARD CONTRACT</Text>
                    <Text testID="heat-map-commodity-contract-size" style={[styles.contractValue, { color: colors.foreground }]}>
                      {`${commodityContract.contractMultiplier.toLocaleString('en-US')} ${commodityContract.contractUnit}`}
                    </Text>
                  </View>
                </View>
                <View style={[styles.contractTickBlock, { borderTopColor: colors.border }]}>
                  <View style={styles.contractTickRow}>
                    <View style={styles.contractTickFact}>
                      <Text style={[styles.contractLabel, { color: colors.mutedForeground }]}>MINIMUM PRICE INCREMENT</Text>
                      <Text testID="heat-map-commodity-minimum-increment" style={[styles.contractValue, { color: colors.foreground }]}>
                        {formatCommodityPriceIncrement(commodityContract.minimumPriceIncrement, commodityContract.quoteCurrency)}
                      </Text>
                    </View>
                    <View style={styles.contractTickFact}>
                      <Text style={[styles.contractLabel, { color: colors.mutedForeground }]}>PER-CONTRACT TICK VALUE</Text>
                      <Text testID="heat-map-commodity-tick-value" style={[styles.contractTickAmount, { color: colors.foreground }]}>
                        {commodityTickValue === null ? '—' : formatPrice(commodityTickValue)}
                      </Text>
                    </View>
                  </View>
                  <Text style={[styles.contractNotionalNote, { color: colors.mutedForeground }]}>
                    USD value change for one minimum exchange-price move on one standard contract.
                  </Text>
                </View>
                <View style={[styles.contractNotionalBlock, { borderTopColor: colors.border }]}>
                  <Text style={[styles.contractLabel, { color: colors.mutedForeground }]}>EST. FULL-CONTRACT NOTIONAL</Text>
                  <Text testID="heat-map-commodity-contract-notional" style={[styles.contractNotional, { color: colors.foreground }]}>
                    {commodityNotional === null ? '—' : formatPrice(commodityNotional)}
                  </Text>
                  <Text style={[styles.contractNotionalNote, { color: colors.mutedForeground }]}>
                    One standard contract at the quoted price; this is not the margin or cash required to trade.
                  </Text>
                </View>
                <Text style={[styles.contractSource, { color: colors.mutedForeground }]}>
                  Contract specification: {commodityContract.exchange}
                </Text>
              </View>
            )}

            {quote && <>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Price ranges</Text>
              {loading && <ActivityIndicator testID="heat-map-detail-loading" size="small" color={colors.gold} />}
            </View>
            <View style={styles.rangeStack}>
              <RangeBar
                testID="heat-map-detail-range-day"
                title="Day’s Range"
                low={stats?.dayLow ?? null}
                high={stats?.dayHigh ?? null}
                price={quote.price}
                loading={loading}
                colors={colors}
                formatValue={formatQuotePrice}
              />
              <RangeBar
                testID="heat-map-detail-range-year"
                title="52 Week Range"
                low={stats?.fiftyTwoWeekLow ?? null}
                high={stats?.fiftyTwoWeekHigh ?? null}
                price={quote.price}
                loading={loading}
                colors={colors}
                formatValue={formatQuotePrice}
              />
            </View>
            </>}

            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                {isEtf ? 'ETF essentials' : isCommodity ? 'Commodity snapshot' : 'Key statistics'}
              </Text>
              <View style={styles.statsHeaderActions}>
                {loading && (
                  <Text testID="heat-map-detail-refresh-loading" style={[styles.loadingLabel, { color: colors.mutedForeground }]}>
                    Refreshing…
                  </Text>
                )}
                <Pressable
                  testID="heat-map-detail-refresh"
                  accessibilityRole="button"
                  accessibilityLabel={loading ? 'Refreshing market statistics' : 'Refresh market statistics'}
                  accessibilityState={{ disabled: loading }}
                  disabled={loading}
                  onPress={refreshDetailStats}
                  style={[styles.refreshButton, { borderColor: colors.border }]}
                >
                  {loading
                    ? <ActivityIndicator size="small" color={colors.primary} />
                    : <MaterialCommunityIcons name="refresh" size={14} color={colors.primary} />}
                  <Text style={[styles.retryText, { color: colors.primary }]}>
                    {loading ? 'Refreshing' : 'Refresh'}
                  </Text>
                </Pressable>
              </View>
            </View>
            {loadError && (
              <View testID="heat-map-detail-error" style={[styles.errorPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.errorText, { color: colors.mutedForeground }]}>
                  {stats ? 'Some figures may be out of date.' : 'Market statistics could not be loaded.'}
                </Text>
                <Pressable
                  testID="heat-map-detail-retry"
                  accessibilityRole="button"
                  accessibilityLabel="Retry loading market statistics"
                  onPress={refreshDetailStats}
                  style={[styles.retryButton, { borderColor: colors.border }]}
                >
                  <MaterialCommunityIcons name="refresh" size={14} color={colors.primary} />
                  <Text style={[styles.retryText, { color: colors.primary }]}>Retry</Text>
                </Pressable>
              </View>
            )}
            {displayedStats.length > 0 ? (
              <View testID="heat-map-detail-stats" style={styles.statsGrid}>
                {displayedStats.map((item) => (
                  <View key={item.label} style={[styles.statCell, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{item.label}</Text>
                    <Text
                      testID={`heat-map-detail-stat-${item.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.78}
                      style={[styles.statValue, { color: colors.foreground }]}
                    >
                      {item.value}
                    </Text>
                    {item.detail && (
                      <Text
                        testID={`heat-map-detail-stat-detail-${item.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`}
                        numberOfLines={2}
                        style={[styles.statDetail, { color: colors.mutedForeground }]}
                      >
                        {item.detail}
                      </Text>
                    )}
                  </View>
                ))}
              </View>
            ) : isCommodity && !loading && !loadError ? (
              <Text testID="heat-map-commodity-stats-unavailable" style={[styles.emptyStats, { color: colors.mutedForeground }]}>
                No additional trading statistics were reported for this commodity.
              </Text>
            ) : null}
            {isCrypto && (
              <CryptoSupplyHistory
                symbol={symbol ?? ''}
                visible={visible}
                currentSupply={stats?.circulatingSupply ?? null}
                colors={colors}
              />
            )}
            {isEtf && (
              <EtfAdditionalDetails
                profile={stats?.etfProfile ?? null}
                loading={loading}
                colors={colors}
              />
            )}
            {isCommodity && (
              <CommodityPriceDrivers symbol={symbol ?? ''} visible={visible} colors={colors} />
            )}
            <Text style={[styles.disclaimer, { color: colors.mutedForeground }]}>
              {isEtf
                ? 'ETF details reflect the latest provider data. Distribution yield and beta can change.'
                : isCommodity
                  ? 'Commodity prices can respond to several forces at once. The drivers above are educational context, not buy/sell signals.'
                : '— means the data provider does not report that figure for this instrument. Figures may be delayed.'}
            </Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.72)' },
  panel: {
    width: '100%',
    maxWidth: 680,
    maxHeight: '94%',
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    paddingTop: 10,
    overflow: 'hidden',
  },
  grabber: { alignSelf: 'center', width: 38, height: 4, borderRadius: 2, marginBottom: 15 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 16 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  watchlistButton: { minHeight: 42, borderWidth: 1, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 14 },
  watchlistButtonText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  analyzeStockButton: { minHeight: 46, borderRadius: 11, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 14 },
  analyzeStockText: { fontSize: 13, fontFamily: 'Inter_700Bold', flex: 1 },
  openChartButton: { minHeight: 42, borderWidth: 1, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 14 },
  openChartText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  titleBlock: { flex: 1, minWidth: 0 },
  kicker: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1.15, marginBottom: 5 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 24, lineHeight: 30, letterSpacing: -0.45 },
  symbolLine: { fontFamily: 'Inter_500Medium', fontSize: 12, marginTop: 4 },
  closeButton: { width: 36, height: 36, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  priceRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginTop: 18 },
  price: { fontFamily: 'Inter_700Bold', fontSize: 28, letterSpacing: -0.6 },
  changeBadge: { minHeight: 29, flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 9, borderRadius: 10 },
  changeText: { fontFamily: 'Inter_700Bold', fontSize: 11 },
  quoteAge: { fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 3 },
  quoteAgeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 20 },
  quoteRefreshButton: { minHeight: 30, borderWidth: 1, borderRadius: 9, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', gap: 5 },
  quoteRefreshError: { borderWidth: 1, borderRadius: 10, padding: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 9, marginBottom: 8 },
  contractSummary: { borderWidth: 1, borderRadius: 13, padding: 12, marginTop: -8, marginBottom: 20 },
  contractFactsRow: { flexDirection: 'row', gap: 12 },
  contractFact: { flex: 1, minWidth: 0 },
  contractLabel: { fontFamily: 'Inter_700Bold', fontSize: 8, letterSpacing: 0.65, lineHeight: 11 },
  contractValue: { fontFamily: 'Inter_600SemiBold', fontSize: 11, lineHeight: 15, marginTop: 4 },
  contractTickBlock: { borderTopWidth: 1, marginTop: 10, paddingTop: 9 },
  contractTickRow: { flexDirection: 'row', gap: 12 },
  contractTickFact: { flex: 1, minWidth: 0 },
  contractTickAmount: { fontFamily: 'Inter_700Bold', fontSize: 17, lineHeight: 21, marginTop: 3 },
  contractNotionalBlock: { borderTopWidth: 1, marginTop: 10, paddingTop: 9 },
  contractNotional: { fontFamily: 'Inter_700Bold', fontSize: 17, marginTop: 3 },
  contractNotionalNote: { fontFamily: 'Inter_400Regular', fontSize: 8, lineHeight: 11, marginTop: 3 },
  contractSource: { fontFamily: 'Inter_500Medium', fontSize: 8, marginTop: 7, textAlign: 'right' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 },
  statsHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { fontFamily: 'Inter_700Bold', fontSize: 15, letterSpacing: -0.15 },
  loadingLabel: { fontFamily: 'Inter_500Medium', fontSize: 10 },
  refreshButton: { minHeight: 30, borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 5 },
  rangeStack: { gap: 8, marginBottom: 20 },
  rangeCard: { borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, paddingVertical: 10 },
  rangeTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 11, marginBottom: 10 },
  rangeTrack: { height: 4, borderRadius: 2, position: 'relative', marginHorizontal: 2, marginBottom: 9 },
  rangeProgress: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 2 },
  rangeMarker: { position: 'absolute', width: 10, height: 10, top: -3, marginLeft: -5, borderRadius: 5, borderWidth: 2 },
  rangeLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  rangeValue: { fontFamily: 'Inter_500Medium', fontSize: 10 },
  rangeUnavailable: { fontFamily: 'Inter_400Regular', fontSize: 11, paddingVertical: 1 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 8 },
  statCell: { width: '48.5%', minHeight: 58, borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 9, justifyContent: 'space-between' },
  statLabel: { fontFamily: 'Inter_500Medium', fontSize: 9, lineHeight: 13 },
  statValue: { fontFamily: 'Inter_700Bold', fontSize: 14, marginTop: 5 },
  statDetail: { fontFamily: 'Inter_400Regular', fontSize: 8, lineHeight: 10, marginTop: 4 },
  emptyStats: { fontFamily: 'Inter_400Regular', fontSize: 10, lineHeight: 15 },
  etfDetails: { gap: 18, marginTop: 21 },
  etfSubsectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 },
  etfSubsectionTitleBlock: { flex: 1 },
  etfSubsectionCaption: { fontFamily: 'Inter_400Regular', fontSize: 9, lineHeight: 13, marginTop: 2 },
  holdingsCard: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 11 },
  holdingRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 8 },
  holdingIdentity: { flex: 1, minWidth: 0 },
  holdingName: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  holdingSymbol: { fontFamily: 'Inter_500Medium', fontSize: 9, marginTop: 3 },
  holdingWeight: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  etfEmptyText: { fontFamily: 'Inter_400Regular', fontSize: 10, lineHeight: 15, paddingVertical: 11 },
  regimeBadge: { maxWidth: '48%', borderWidth: 1, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 5 },
  regimeBadgeText: { fontFamily: 'Inter_700Bold', fontSize: 9, textAlign: 'center' },
  regimeGrid: { flexDirection: 'row', gap: 7 },
  regimeCard: { flex: 1, minWidth: 0, borderWidth: 1, borderRadius: 12, paddingHorizontal: 9, paddingVertical: 10 },
  regimeLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 9 },
  regimeReturn: { fontFamily: 'Inter_700Bold', fontSize: 15, marginTop: 5 },
  regimeSample: { fontFamily: 'Inter_400Regular', fontSize: 8, marginTop: 2 },
  methodology: { fontFamily: 'Inter_400Regular', fontSize: 9, lineHeight: 13, marginTop: 8 },
  supplyHistory: { marginTop: 18 },
  supplyHistoryCard: { borderWidth: 1, borderRadius: 13, padding: 12 },
  supplyHistoryCaption: { fontFamily: 'Inter_500Medium', fontSize: 9, marginBottom: 8 },
  supplyHistoryWarning: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 11 },
  supplyHistoryWarningCopy: { flex: 1, gap: 3 },
  supplyHistoryWarningTitle: { fontFamily: 'Inter_700Bold', fontSize: 10 },
  supplyHistoryWarningText: { fontFamily: 'Inter_400Regular', fontSize: 9, lineHeight: 13 },
  supplyHistoryRangeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8 },
  supplyHistoryRangeLabel: { fontFamily: 'Inter_500Medium', fontSize: 9 },
  supplyHistoryRanges: { flexDirection: 'row', borderWidth: 1, borderRadius: 9, overflow: 'hidden', marginBottom: 11 },
  supplyHistoryRangeButton: { flex: 1, minHeight: 32, alignItems: 'center', justifyContent: 'center', borderRightWidth: StyleSheet.hairlineWidth },
  supplyHistoryRangeText: { fontFamily: 'Inter_700Bold', fontSize: 10 },
  supplyHistoryChange: { borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 12 },
  supplyHistoryChangeLabel: { fontFamily: 'Inter_500Medium', fontSize: 9, lineHeight: 13 },
  supplyHistoryChangeValue: { fontFamily: 'Inter_700Bold', fontSize: 15, marginTop: 4 },
  supplyHistoryChangeDates: { fontFamily: 'Inter_400Regular', fontSize: 9, lineHeight: 13, marginTop: 3 },
  supplyHistoryEmpty: { fontFamily: 'Inter_400Regular', fontSize: 10, lineHeight: 15 },
  supplyHistoryEmptyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  supplyHistoryChart: { flexDirection: 'row', alignItems: 'stretch', gap: 7 },
  supplyHistoryPlot: { flex: 1, height: 112, position: 'relative' },
  supplyHistoryObservationList: { gap: 6, paddingTop: 10 },
  supplyHistoryObservationButton: { minHeight: 36, minWidth: 64, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderRadius: 9, paddingHorizontal: 9 },
  supplyHistoryObservationDate: { fontFamily: 'Inter_500Medium', fontSize: 9 },
  supplyHistorySelection: { borderWidth: 1, borderRadius: 10, padding: 10, marginTop: 10 },
  supplyHistoryAxisLabels: { width: 35, justifyContent: 'space-between', paddingVertical: 3 },
  supplyHistoryAxisText: { fontFamily: 'Inter_400Regular', fontSize: 8 },
  supplyHistoryDateLabels: { flexDirection: 'row', justifyContent: 'space-between', marginLeft: 42, marginTop: 4 },
  supplyHistoryNote: { fontFamily: 'Inter_400Regular', fontSize: 8, lineHeight: 12, marginTop: 8 },
  errorPanel: { borderWidth: 1, borderRadius: 11, padding: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 9 },
  errorText: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 10, lineHeight: 14 },
  retryButton: { minHeight: 28, borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 4 },
  retryText: { fontFamily: 'Inter_700Bold', fontSize: 10 },
  disclaimer: { fontFamily: 'Inter_400Regular', fontSize: 9, lineHeight: 13, marginTop: 11 },
});

function CryptoSupplyHistory({
  symbol,
  visible,
  currentSupply,
  colors,
}: {
  symbol: string;
  visible: boolean;
  currentSupply: number | null;
  colors: ReturnType<typeof useColors>;
}) {
  const [rangeDays, setRangeDays] = useState<HeatMapCryptoSupplyRangeDays>(365);
  const historyQuery = useGetCryptoSupplyHistory(symbol, rangeDays, {
    query: {
      queryKey: getGetCryptoSupplyHistoryQueryKey(symbol, rangeDays),
      enabled: visible,
      staleTime: 6 * 60 * 60 * 1000,
    },
  });
  const parsedHistory = parseHeatMapCryptoSupplyHistory(historyQuery.data);
  const history = parsedHistory?.rangeDays === rangeDays ? parsedHistory : null;
  const chart = history ? getHeatMapCryptoSupplyChartModel(history.points) : null;
  const [selectedObservation, setSelectedObservation] = useState<{ symbol: string; date: string } | null>(null);
  const [plotWidth, setPlotWidth] = useState(0);
  const selectedPoint = selectedObservation?.symbol === symbol
    ? history?.points.find((point) => point.date === selectedObservation.date) ?? null
    : null;
  const changeSummary = history
    ? getHeatMapCryptoSupplyChangeSummary(history.points)
    : null;
  const discrepancy = getHeatMapCryptoSupplyDiscrepancy(currentSupply, history?.points ?? []);
  const hasHistory = !!history?.points.length;

  return (
    <View testID="heat-map-crypto-supply-history" style={styles.supplyHistory}>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
          Circulating supply history
        </Text>
        <View style={styles.statsHeaderActions}>
          {historyQuery.isFetching && (
            <ActivityIndicator testID="heat-map-crypto-supply-loading" size="small" color={colors.gold} />
          )}
          <Pressable
            testID="heat-map-crypto-supply-refresh"
            accessibilityRole="button"
            accessibilityLabel={historyQuery.isFetching ? 'Refreshing supply history' : 'Refresh supply history'}
            accessibilityState={{ disabled: historyQuery.isFetching }}
            disabled={historyQuery.isFetching}
            onPress={() => { void historyQuery.refetch(); }}
            style={[styles.refreshButton, { borderColor: colors.border }]}
          >
            {historyQuery.isFetching
              ? <ActivityIndicator size="small" color={colors.primary} />
              : <MaterialCommunityIcons name="refresh" size={14} color={colors.primary} />}
            <Text style={[styles.retryText, { color: colors.primary }]}>
              {historyQuery.isFetching ? 'Refreshing' : 'Refresh'}
            </Text>
          </Pressable>
        </View>
      </View>
      <View style={[styles.supplyHistoryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.supplyHistoryRangeHeader}>
          <Text style={[styles.supplyHistoryRangeLabel, { color: colors.mutedForeground }]}>
            HISTORY WINDOW
          </Text>
          <Text style={[styles.supplyHistoryCaption, { color: colors.mutedForeground, marginBottom: 0 }]}>
            Coin Metrics · Daily · {rangeDays === 30 ? 'Past month' : rangeDays === 90 ? 'Past 3 months' : 'Past year'}
          </Text>
        </View>
        {discrepancy && (
          <View
            testID="heat-map-crypto-supply-discrepancy"
            accessibilityRole="alert"
            style={[styles.supplyHistoryWarning, { backgroundColor: colors.card, borderColor: colors.gold }]}
          >
            <MaterialCommunityIcons name="alert-circle-outline" size={15} color={colors.gold} />
            <View style={styles.supplyHistoryWarningCopy}>
              <Text style={[styles.supplyHistoryWarningTitle, { color: colors.foreground }]}>
                Provider supply figures differ
              </Text>
              <Text style={[styles.supplyHistoryWarningText, { color: colors.mutedForeground }]}>
                Current reported supply {formatExactSupply(discrepancy.currentSupply)} differs by {discrepancy.differencePercent.toFixed(1)}% from Coin Metrics’ on-chain SplyCur on {formatSupplyDate(discrepancy.historicalDate)} ({formatExactSupply(discrepancy.historicalSupply)}). A shared 5% cutoff flags a material provider difference, not unexpected issuance: circulating-supply definitions can differ by asset. Both values are preserved as reported.
              </Text>
            </View>
          </View>
        )}
        <View
          testID="heat-map-crypto-supply-ranges"
          style={[styles.supplyHistoryRanges, { borderColor: colors.border }]}
          accessibilityRole="radiogroup"
          accessibilityLabel="Supply history window"
        >
          {HEAT_MAP_CRYPTO_SUPPLY_RANGES.map(({ label, days }, index) => {
            const selected = days === rangeDays;
            return (
              <Pressable
                key={days}
                testID={`heat-map-crypto-supply-range-${days}`}
                accessibilityRole="radio"
                accessibilityLabel={`${label} supply history`}
                accessibilityState={{ selected }}
                onPress={() => setRangeDays(days)}
                style={[
                  styles.supplyHistoryRangeButton,
                  index < HEAT_MAP_CRYPTO_SUPPLY_RANGES.length - 1 && { borderRightColor: colors.border },
                  selected && { backgroundColor: colors.primary },
                ]}
              >
                <Text style={[
                  styles.supplyHistoryRangeText,
                  { color: selected ? colors.primaryForeground : colors.mutedForeground },
                ]}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {historyQuery.isError && hasHistory && (
          <View testID="heat-map-crypto-supply-refresh-error" accessibilityRole="alert" style={[styles.supplyHistoryEmptyRow, { marginBottom: 10 }]}>
            <Text style={[styles.supplyHistoryEmpty, { color: colors.mutedForeground }]}>
              Couldn’t refresh supply history. Showing the last available data.
            </Text>
            <Pressable
              testID="heat-map-crypto-supply-retry"
              accessibilityRole="button"
              accessibilityLabel="Retry supply history"
              onPress={() => { void historyQuery.refetch(); }}
              hitSlop={8}
            >
              <MaterialCommunityIcons name="refresh" size={17} color={colors.primary} />
            </Pressable>
          </View>
        )}
        {historyQuery.isLoading ? (
          <Text style={[styles.supplyHistoryEmpty, { color: colors.mutedForeground }]}>
            Loading provider history…
          </Text>
        ) : historyQuery.isError && !hasHistory ? (
          <View style={styles.supplyHistoryEmptyRow}>
            <Text testID="heat-map-crypto-supply-error" style={[styles.supplyHistoryEmpty, { color: colors.mutedForeground }]}>
              Historical supply could not be loaded.
            </Text>
            <Pressable
              testID="heat-map-crypto-supply-retry"
              accessibilityRole="button"
              accessibilityLabel="Retry supply history"
              onPress={() => { void historyQuery.refetch(); }}
              hitSlop={8}
            >
              <MaterialCommunityIcons name="refresh" size={17} color={colors.primary} />
            </Pressable>
          </View>
        ) : !hasHistory ? (
          <Text testID="heat-map-crypto-supply-unavailable" style={[styles.supplyHistoryEmpty, { color: colors.mutedForeground }]}>
            Coin Metrics does not report daily on-chain supply for this asset.
          </Text>
        ) : history.points.length === 1 ? (
          <Text style={[styles.supplyHistoryEmpty, { color: colors.mutedForeground }]}>
            One dated observation: {formatSupplyDate(history.points[0]!.date)} · {formatHeatMapCompact(history.points[0]!.supply)}. A trend needs more observations.
          </Text>
        ) : chart && changeSummary ? (
          <>
            <View
              testID="heat-map-crypto-supply-change"
              style={[styles.supplyHistoryChange, { backgroundColor: colors.background, borderColor: colors.border }]}
            >
              <Text style={[styles.supplyHistoryChangeLabel, { color: colors.mutedForeground }]}>
                Observed change in Coin Metrics on-chain supply
              </Text>
              <Text testID="heat-map-crypto-supply-change-value" style={[styles.supplyHistoryChangeValue, { color: colors.foreground }]}>
                {formatSupplyChangeAmount(changeSummary.absoluteChange)}
                {' · '}
                {formatHeatMapRegimeReturn(changeSummary.percentChange / 100)}
              </Text>
              <Text testID="heat-map-crypto-supply-change-dates" style={[styles.supplyHistoryChangeDates, { color: colors.mutedForeground }]}>
                {formatSupplyDate(changeSummary.startDate)} → {formatSupplyDate(changeSummary.endDate)}
              </Text>
            </View>
            <View style={styles.supplyHistoryChart}>
              <View style={styles.supplyHistoryAxisLabels}>
                <Text style={[styles.supplyHistoryAxisText, { color: colors.mutedForeground }]}>
                  {formatHeatMapCompact(chart.maxSupply)}
                </Text>
                <Text style={[styles.supplyHistoryAxisText, { color: colors.mutedForeground }]}>
                  {formatHeatMapCompact(chart.minSupply)}
                </Text>
              </View>
              <Pressable
                testID="heat-map-crypto-supply-plot"
                accessible={false}
                onLayout={({ nativeEvent }) => setPlotWidth(nativeEvent.layout.width)}
                onPress={(event) => {
                  if (plotWidth <= 0) return;
                  const tappedX = (event.nativeEvent.locationX / plotWidth) * 320;
                  const nearestPoint = chart.points.reduce((nearest, point) =>
                    Math.abs(point.x - tappedX) < Math.abs(nearest.x - tappedX) ? point : nearest,
                  );
                  setSelectedObservation({ symbol, date: nearestPoint.date });
                }}
                style={styles.supplyHistoryPlot}
              >
                <Svg
                  testID="heat-map-crypto-supply-chart"
                  accessible={false}
                  width="100%"
                  height={112}
                  viewBox="0 0 320 112"
                  preserveAspectRatio="none"
                >
                  <Path d="M12,8 H308 M12,56 H308 M12,104 H308" fill="none" stroke={colors.border} strokeWidth={1} />
                  {chart.segments.map((segment, index) => (
                    <Path
                      key={`supply-segment-${index}`}
                      d={segment}
                      fill="none"
                      stroke={colors.gold}
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ))}
                  {chart.points.map((point) => (
                    <Circle
                      key={point.date}
                      cx={point.x}
                      cy={point.y}
                      r={1.7}
                      fill={colors.gold}
                    />
                  ))}
                </Svg>
              </Pressable>
            </View>
            <ScrollView
              horizontal
              accessibilityLabel="Reported supply observations"
              showsHorizontalScrollIndicator
              contentContainerStyle={styles.supplyHistoryObservationList}
            >
              {chart.points.map((point) => (
                <Pressable
                  key={`supply-observation-${point.date}`}
                  testID={`heat-map-crypto-supply-point-${point.date}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Select supply observation for ${formatSupplyDate(point.date)}: ${formatExactSupply(point.supply)}`}
                  accessibilityState={{
                    selected: selectedObservation?.symbol === symbol && selectedObservation.date === point.date,
                  }}
                  onPress={() => setSelectedObservation({ symbol, date: point.date })}
                  style={[
                    styles.supplyHistoryObservationButton,
                    {
                      backgroundColor: selectedObservation?.symbol === symbol && selectedObservation.date === point.date
                        ? colors.secondary
                        : colors.card,
                      borderColor: selectedObservation?.symbol === symbol && selectedObservation.date === point.date
                        ? colors.gold
                        : colors.border,
                    },
                  ]}
                >
                  <Text style={[styles.supplyHistoryObservationDate, { color: colors.foreground }]}>
                    {point.date.slice(5)}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            {selectedPoint && (
              <View
                testID="heat-map-crypto-supply-selected-point"
                accessibilityLiveRegion="polite"
                style={[styles.supplyHistorySelection, { backgroundColor: colors.background, borderColor: colors.border }]}
              >
                <Text style={[styles.supplyHistoryChangeLabel, { color: colors.mutedForeground }]}>
                  Selected observation · {formatSupplyDate(selectedPoint.date)}
                </Text>
                <Text testID="heat-map-crypto-supply-selected-value" style={[styles.supplyHistoryChangeValue, { color: colors.foreground }]}>
                  {formatExactSupply(selectedPoint.supply)}
                </Text>
              </View>
            )}
            <View style={styles.supplyHistoryDateLabels}>
              <Text style={[styles.supplyHistoryAxisText, { color: colors.mutedForeground }]}>
                {formatSupplyDate(history.startDate!)}
              </Text>
              <Text style={[styles.supplyHistoryAxisText, { color: colors.mutedForeground }]}>
                {formatSupplyDate(history.endDate!)}
              </Text>
            </View>
          </>
        ) : null}
        <Text style={[styles.supplyHistoryNote, { color: colors.mutedForeground }]}>
          Change compares the first and last reported observations only; missing dates are not filled in. This daily on-chain metric can differ from the live circulating-supply figure above; it is not the maximum-supply share.
        </Text>
      </View>
    </View>
  );
}
