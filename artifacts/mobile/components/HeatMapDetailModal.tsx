import React, { useEffect, useState } from 'react';
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
  getHeatMapCryptoSupplyChartModel,
  getHeatMapCryptoSupplyChangeSummary,
  getHeatMapDetailStatRows,
  getHeatMapRangePosition,
  parseHeatMapCryptoSupplyHistory,
  parseHeatMapDetailStats,
  type HeatMapEtfProfile,
  type HeatMapDetailStats,
} from '@/lib/heatMapDetail';
import {
  getCommodityContractNotional,
  getCommodityContractSpec,
  getCommodityContractTickValue,
} from '@/lib/heatMapInstrumentDisplay';
import { formatHeatMapQuoteAge } from '@/lib/heatMapQuoteDisplay';

const DETAIL_CACHE_TTL_MS = 5 * 60_000;
const DETAIL_STATS_REQUEST_TIMEOUT_MS = 10_000;
const detailCache = new Map<string, { stats: HeatMapDetailStats; expiresAt: number }>();

function formatPrice(value: number, quoteCurrency: 'USD' | 'USC' = 'USD') {
  const absolute = Math.abs(value);
  const fractionDigits = absolute >= 1 ? 2 : absolute >= 0.01 ? 4 : 6;
  const sign = value < 0 ? '-' : '';
  const formatted = absolute.toLocaleString('en-US', {
    minimumFractionDigits: quoteCurrency === 'USC' ? 2 : fractionDigits,
    maximumFractionDigits: quoteCurrency === 'USC' ? 3 : fractionDigits,
  });
  return quoteCurrency === 'USC' ? `${sign}${formatted}¢` : `${sign}$${formatted}`;
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

export function HeatMapDetailModal({
  quote,
  visible,
  onClose,
}: {
  quote: HeatMapQuote | null;
  visible: boolean;
  onClose: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { apiFetch } = useApi();
  const [statsEntry, setStatsEntry] = useState<{ symbol: string; stats: HeatMapDetailStats } | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (!visible || !quote) return;
    let isCurrent = true;
    const cacheKey = quote.symbol.toUpperCase();
    const cached = detailCache.get(cacheKey);
    const hasFreshCache = cached !== undefined && cached.expiresAt > Date.now();

    setStatsEntry(cached ? { symbol: cacheKey, stats: cached.stats } : null);
    setLoadError(false);
    if (hasFreshCache) {
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

    void apiFetch<unknown>(`/api/stocks/info/${encodeURIComponent(quote.symbol)}`, {
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
  }, [apiFetch, quote?.symbol, retryCount, visible]);

  if (!quote) return null;

  const stats = statsEntry?.symbol === quote.symbol.toUpperCase() ? statsEntry.stats : null;
  const marketCap = stats?.marketCap ?? quote.marketCapUsd;
  const change = quote.priceChangePercent;
  const changeColor = change >= 0 ? colors.buyColor : colors.sellColor;
  const isEtf = quote.assetType === 'etf';
  const isCommodity = quote.assetType === 'commodity';
  const isCrypto = quote.assetType === 'cryptocurrency';
  const commodityContract = isCommodity ? getCommodityContractSpec(quote.symbol) : null;
  const commodityNotional = commodityContract
    ? getCommodityContractNotional(quote.symbol, quote.price)
    : null;
  const commodityTickValue = commodityContract
    ? getCommodityContractTickValue(quote.symbol)
    : null;
  const displayedStats = getHeatMapDetailStatRows(
    quote.assetType,
    stats,
    marketCap,
    loading,
  );

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
                <Text style={[styles.kicker, { color: colors.gold }]}>{getAssetLabel(quote.assetType)}  ·  MARKET STORY</Text>
                <Text testID="heat-map-detail-title" accessibilityRole="header" numberOfLines={2} style={[styles.title, { color: colors.heading }]}>
                  {quote.name || quote.symbol}
                </Text>
                <Text style={[styles.symbolLine, { color: colors.mutedForeground }]}>
                  {quote.symbol}{quote.exchange ? `  ·  ${quote.exchange}` : ''}
                </Text>
              </View>
              <Pressable
                testID="heat-map-detail-close"
                accessibilityRole="button"
                accessibilityLabel={`Close ${quote.symbol} details`}
                onPress={onClose}
                hitSlop={8}
                style={[styles.closeButton, { borderColor: colors.border, backgroundColor: colors.card }]}
              >
                <MaterialCommunityIcons name="close" size={19} color={colors.foreground} />
              </Pressable>
            </View>

            <View style={styles.priceRow}>
              <Text testID="heat-map-detail-price" style={[styles.price, { color: colors.foreground }]}>
                {formatPrice(quote.price, commodityContract?.quoteCurrency)}
              </Text>
              <View style={[styles.changeBadge, { backgroundColor: change >= 0 ? colors.buyBg : colors.sellBg }]}>
                <MaterialCommunityIcons name={change >= 0 ? 'arrow-top-right' : 'arrow-bottom-right'} size={15} color={changeColor} />
                <Text style={[styles.changeText, { color: changeColor }]}>
                  {change > 0 ? '+' : ''}{change.toFixed(2)}% today
                </Text>
              </View>
            </View>
            <Text style={[styles.quoteAge, { color: colors.mutedForeground }]}>
              Quote {formatHeatMapQuoteAge(quote.priceTimestamp)}
            </Text>

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
                formatValue={(value) => formatPrice(value, commodityContract?.quoteCurrency)}
              />
              <RangeBar
                testID="heat-map-detail-range-year"
                title="52 Week Range"
                low={stats?.fiftyTwoWeekLow ?? null}
                high={stats?.fiftyTwoWeekHigh ?? null}
                price={quote.price}
                loading={loading}
                colors={colors}
                formatValue={(value) => formatPrice(value, commodityContract?.quoteCurrency)}
              />
            </View>

            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                {isEtf ? 'ETF essentials' : isCommodity ? 'Commodity snapshot' : 'Key statistics'}
              </Text>
              {loading && <Text style={[styles.loadingLabel, { color: colors.mutedForeground }]}>Updating</Text>}
            </View>
            {loadError && (
              <View testID="heat-map-detail-error" style={[styles.errorPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.errorText, { color: colors.mutedForeground }]}>
                  {stats ? 'Some figures may be out of date.' : 'Market statistics could not be loaded.'}
                </Text>
                <Pressable
                  testID="heat-map-detail-retry"
                  accessibilityRole="button"
                  onPress={() => setRetryCount((current) => current + 1)}
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
                symbol={quote.symbol}
                visible={visible}
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
              <CommodityPriceDrivers symbol={quote.symbol} colors={colors} />
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
  titleBlock: { flex: 1, minWidth: 0 },
  kicker: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1.15, marginBottom: 5 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 24, lineHeight: 30, letterSpacing: -0.45 },
  symbolLine: { fontFamily: 'Inter_500Medium', fontSize: 12, marginTop: 4 },
  closeButton: { width: 36, height: 36, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  priceRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginTop: 18 },
  price: { fontFamily: 'Inter_700Bold', fontSize: 28, letterSpacing: -0.6 },
  changeBadge: { minHeight: 29, flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 9, borderRadius: 10 },
  changeText: { fontFamily: 'Inter_700Bold', fontSize: 11 },
  quoteAge: { fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 3, marginBottom: 20 },
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
  sectionTitle: { fontFamily: 'Inter_700Bold', fontSize: 15, letterSpacing: -0.15 },
  loadingLabel: { fontFamily: 'Inter_500Medium', fontSize: 10 },
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
  supplyHistoryCaption: { fontFamily: 'Inter_500Medium', fontSize: 9, marginBottom: 10 },
  supplyHistoryChange: { borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 12 },
  supplyHistoryChangeLabel: { fontFamily: 'Inter_500Medium', fontSize: 9, lineHeight: 13 },
  supplyHistoryChangeValue: { fontFamily: 'Inter_700Bold', fontSize: 15, marginTop: 4 },
  supplyHistoryChangeDates: { fontFamily: 'Inter_400Regular', fontSize: 9, lineHeight: 13, marginTop: 3 },
  supplyHistoryEmpty: { fontFamily: 'Inter_400Regular', fontSize: 10, lineHeight: 15 },
  supplyHistoryEmptyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  supplyHistoryChart: { flexDirection: 'row', alignItems: 'stretch', gap: 7 },
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
  colors,
}: {
  symbol: string;
  visible: boolean;
  colors: ReturnType<typeof useColors>;
}) {
  const historyQuery = useGetCryptoSupplyHistory(symbol, {
    query: {
      queryKey: getGetCryptoSupplyHistoryQueryKey(symbol),
      enabled: visible,
      staleTime: 6 * 60 * 60 * 1000,
    },
  });
  const history = parseHeatMapCryptoSupplyHistory(historyQuery.data);
  const chart = history ? getHeatMapCryptoSupplyChartModel(history.points) : null;
  const changeSummary = history
    ? getHeatMapCryptoSupplyChangeSummary(history.points)
    : null;
  const hasHistory = !!history?.points.length;

  return (
    <View testID="heat-map-crypto-supply-history" style={styles.supplyHistory}>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
          Circulating supply history
        </Text>
        {historyQuery.isFetching && (
          <ActivityIndicator testID="heat-map-crypto-supply-loading" size="small" color={colors.gold} />
        )}
      </View>
      <View style={[styles.supplyHistoryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.supplyHistoryCaption, { color: colors.mutedForeground }]}>
          Coin Metrics on-chain supply · Daily · Past year
        </Text>
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
            </View>
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
