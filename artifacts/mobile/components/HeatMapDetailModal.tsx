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
import type { HeatMapQuote } from '@workspace/api-client-react';
import { useApi } from '@/hooks/useApi';
import { useColors } from '@/hooks/useColors';
import {
  getHeatMapDetailStatRows,
  getHeatMapRangePosition,
  parseHeatMapDetailStats,
  type HeatMapDetailStats,
} from '@/lib/heatMapDetail';
import { formatHeatMapQuoteAge } from '@/lib/heatMapQuoteDisplay';

const DETAIL_CACHE_TTL_MS = 5 * 60_000;
const detailCache = new Map<string, { stats: HeatMapDetailStats; expiresAt: number }>();

function formatPrice(value: number) {
  const absolute = Math.abs(value);
  const fractionDigits = absolute >= 1 ? 2 : absolute >= 0.01 ? 4 : 6;
  const sign = value < 0 ? '-' : '';
  return `${sign}$${absolute.toLocaleString('en-US', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })}`;
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
}: {
  title: string;
  low: number | null;
  high: number | null;
  price: number;
  loading: boolean;
  colors: ReturnType<typeof useColors>;
  testID: string;
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
            <Text style={[styles.rangeValue, { color: colors.mutedForeground }]}>{formatPrice(low!)}</Text>
            <Text style={[styles.rangeValue, { color: colors.mutedForeground }]}>{formatPrice(high!)}</Text>
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
  const [stats, setStats] = useState<HeatMapDetailStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (!visible || !quote) return;
    let isCurrent = true;
    const cacheKey = quote.symbol.toUpperCase();
    const cached = detailCache.get(cacheKey);
    const hasFreshCache = cached !== undefined && cached.expiresAt > Date.now();

    setStats(cached?.stats ?? null);
    setLoadError(false);
    if (hasFreshCache) {
      setLoading(false);
      return () => { isCurrent = false; };
    }

    setLoading(true);
    void apiFetch<unknown>(`/api/stocks/info/${encodeURIComponent(quote.symbol)}`)
      .then((payload) => {
        const parsed = parseHeatMapDetailStats(payload);
        if (!parsed) throw new Error('Unexpected market detail response');
        detailCache.set(cacheKey, { stats: parsed, expiresAt: Date.now() + DETAIL_CACHE_TTL_MS });
        if (detailCache.size > 32) {
          const oldestKey = detailCache.keys().next().value;
          if (oldestKey !== undefined) detailCache.delete(oldestKey);
        }
        if (isCurrent) {
          setStats(parsed);
          setLoadError(false);
        }
      })
      .catch(() => {
        if (isCurrent) setLoadError(true);
      })
      .finally(() => {
        if (isCurrent) setLoading(false);
      });

    return () => { isCurrent = false; };
  }, [apiFetch, quote?.symbol, retryCount, visible]);

  if (!quote) return null;

  const marketCap = stats?.marketCap ?? quote.marketCapUsd;
  const change = quote.priceChangePercent;
  const changeColor = change >= 0 ? colors.buyColor : colors.sellColor;
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
              <Text testID="heat-map-detail-price" style={[styles.price, { color: colors.foreground }]}>{formatPrice(quote.price)}</Text>
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
              />
              <RangeBar
                testID="heat-map-detail-range-year"
                title="52 Week Range"
                low={stats?.fiftyTwoWeekLow ?? null}
                high={stats?.fiftyTwoWeekHigh ?? null}
                price={quote.price}
                loading={loading}
                colors={colors}
              />
            </View>

            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Key statistics</Text>
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
                </View>
              ))}
            </View>
            <Text style={[styles.disclaimer, { color: colors.mutedForeground }]}>
              — means the data provider does not report that figure for this instrument. Figures may be delayed.
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
  errorPanel: { borderWidth: 1, borderRadius: 11, padding: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 9 },
  errorText: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 10, lineHeight: 14 },
  retryButton: { minHeight: 28, borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 4 },
  retryText: { fontFamily: 'Inter_700Bold', fontSize: 10 },
  disclaimer: { fontFamily: 'Inter_400Regular', fontSize: 9, lineHeight: 13, marginTop: 11 },
});
