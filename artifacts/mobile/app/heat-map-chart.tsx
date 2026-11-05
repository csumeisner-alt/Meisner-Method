import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Keyboard, Platform, Pressable, ScrollView, StyleSheet,
  Text, TextInput, View, useWindowDimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useApi } from '@/hooks/useApi';
import { getHeatMapCryptoQuoteCurrency } from '@/lib/heatMapCryptoPrice';
import { formatCommodityQuotePrice, getCommodityContractSpec } from '@/lib/heatMapInstrumentDisplay';
import { formatHeatMapQuoteAge } from '@/lib/heatMapQuoteDisplay';
import { StockChart, type Candle } from '@/components/StockChart';
import { ComparisonChart } from '@/components/ComparisonChart';
import {
  buildChartHistoryUrl, CHART_HISTORY_RANGES, detectHeatMapPriceLevels,
  getHeatMapChartDrawingsStorageKey, parseHeatMapChartTrendLines,
  type HeatMapChartTrendLine,
} from '@/lib/heatMapChart';

type History = { symbol: string; candles: Candle[] };
type Comparison = { symbol: string; candles: Candle[]; loading: boolean; error: boolean };

function cleanCandles(rows: unknown): Candle[] {
  if (!Array.isArray(rows)) return [];
  return rows.filter((item): item is Candle => {
    if (!item || typeof item !== 'object') return false;
    const candle = item as Partial<Candle>;
    return Number.isFinite(candle.t) && typeof candle.date === 'string'
      && Number.isFinite(candle.o) && Number.isFinite(candle.h)
      && Number.isFinite(candle.l) && Number.isFinite(candle.c);
  }).map((candle) => ({
    ...candle,
    v: Number.isFinite(candle.v) ? candle.v : 0,
  }));
}

function ChartButton({ label, onPress, active, disabled, colors, testID, compact }: {
  label: string; onPress: () => void; active?: boolean; disabled?: boolean;
  colors: ReturnType<typeof useColors>; testID: string; compact?: boolean;
}) {
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityState={{ selected: !!active, disabled: !!disabled }}
      disabled={disabled} onPress={onPress}
      style={[styles.smallButton, compact && styles.rangeButton, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary + '20' : colors.card, opacity: disabled ? 0.45 : 1 }]}>
      <Text style={[styles.smallButtonText, compact && styles.rangeButtonText, { color: active ? colors.primary : colors.foreground }]}>{label}</Text>
    </Pressable>
  );
}

export default function HeatMapChartScreen() {
  const params = useLocalSearchParams<{ symbol?: string; name?: string; assetType?: string }>();
  const symbol = typeof params.symbol === 'string' ? params.symbol.toUpperCase() : '';
  const name = typeof params.name === 'string' ? params.name : symbol;
  const assetType = typeof params.assetType === 'string' ? params.assetType : 'Instrument';
  const commoditySpec = assetType === 'commodity' ? getCommodityContractSpec(symbol) : null;
  const priceCurrency = commoditySpec?.quoteCurrency ?? (assetType === 'cryptocurrency'
    ? getHeatMapCryptoQuoteCurrency(symbol) ?? 'USD'
    : 'USD');
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { apiFetch } = useApi();
  const { width } = useWindowDimensions();
  const [rangeIndex, setRangeIndex] = useState(2);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [comparisons, setComparisons] = useState<Comparison[]>([]);
  const [tickerInput, setTickerInput] = useState('');
  const [tickerError, setTickerError] = useState('');
  const [showLevels, setShowLevels] = useState(false);
  const [chartMode, setChartMode] = useState<'line' | 'candles'>('line');
  const [drawing, setDrawing] = useState(false);
  const [pendingPoint, setPendingPoint] = useState<{ t: number; price: number } | null>(null);
  const [trendLines, setTrendLines] = useState<HeatMapChartTrendLine[]>([]);
  const [trendLinesLoadedFor, setTrendLinesLoadedFor] = useState<string | null>(null);
  const [trendLinesLoadError, setTrendLinesLoadError] = useState(false);
  const trendLineWriteQueue = useRef(Promise.resolve());
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState(0);
  const [retryToken, setRetryToken] = useState(0);
  const range = CHART_HISTORY_RANGES[rangeIndex]!;
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const plotWidth = Math.max(280, width - 32);

  useEffect(() => {
    if (!symbol) {
      setCandles([]);
      setLoading(false);
      setLoadError(true);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    setCandles([]);
    void apiFetch<History>(buildChartHistoryUrl(symbol, range))
      .then((result) => {
        if (cancelled) return;
        setCandles(cleanCandles(result.candles));
      })
      .catch(() => { if (!cancelled) setLoadError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [apiFetch, symbol, range.period, range.interval, retryToken]);

  useEffect(() => {
    setComparisons([]);
    setTrendLines([]);
    setTrendLinesLoadedFor(null);
    setTrendLinesLoadError(false);
    setDrawing(false);
    setPendingPoint(null);
    setZoom(1);
    setPan(0);
  }, [symbol]);

  useEffect(() => {
    if (!symbol) return;
    let cancelled = false;
    const storageKey = getHeatMapChartDrawingsStorageKey(symbol);
    void AsyncStorage.getItem(storageKey).then((raw) => {
      if (cancelled) return;
      setTrendLines(parseHeatMapChartTrendLines(raw));
      setTrendLinesLoadedFor(symbol);
      setTrendLinesLoadError(false);
    }).catch(() => {
      if (!cancelled) setTrendLinesLoadError(true);
      // Keep writes gated when storage cannot be read, so an empty state cannot erase saved drawings.
    });
    return () => { cancelled = true; };
  }, [symbol]);

  useEffect(() => {
    if (trendLinesLoadedFor !== symbol || !symbol) return;
    const storageKey = getHeatMapChartDrawingsStorageKey(symbol);
    const serialized = JSON.stringify(trendLines);
    trendLineWriteQueue.current = trendLineWriteQueue.current
      .catch(() => {})
      .then(() => AsyncStorage.setItem(storageKey, serialized));
  }, [symbol, trendLines, trendLinesLoadedFor]);

  const comparisonSymbols = comparisons.map((item) => item.symbol);
  useEffect(() => {
    let cancelled = false;
    void Promise.all(comparisonSymbols.map(async (ticker) => {
      try {
        const result = await apiFetch<History>(buildChartHistoryUrl(ticker, range));
        return { symbol: ticker, candles: cleanCandles(result.candles), loading: false, error: false };
      } catch {
        return { symbol: ticker, candles: [], loading: false, error: true };
      }
    })).then((results) => {
      if (!cancelled) setComparisons((current) =>
        results.map((next) => ({ ...next, loading: false }))
          .filter((next) => current.some((item) => item.symbol === next.symbol)));
    });
    if (comparisonSymbols.length) {
      setComparisons((current) => current.map((item) => ({ ...item, loading: true, error: false, candles: [] })));
    }
    return () => { cancelled = true; };
  }, [apiFetch, range.period, range.interval, JSON.stringify(comparisonSymbols)]);

  const addComparison = useCallback(() => {
    Keyboard.dismiss();
    const ticker = tickerInput.trim().toUpperCase();
    if (!ticker) return;
    if (ticker === symbol || comparisons.some((item) => item.symbol === ticker)) {
      setTickerError('Choose a different ticker.');
      return;
    }
    if (comparisons.length >= 2) {
      setTickerError('You can compare up to two additional tickers.');
      return;
    }
    setTickerError('');
    setComparisons((current) => [...current, { symbol: ticker, candles: [], loading: true, error: false }]);
    setTickerInput('');
  }, [comparisons, symbol, tickerInput]);

  const zoomCount = candles.length ? Math.max(8, Math.floor(candles.length / zoom)) : 0;
  const maxStart = Math.max(0, candles.length - zoomCount);
  const start = Math.max(0, Math.min(maxStart, maxStart - pan));
  const visibleCandles = candles.slice(start, start + zoomCount);
  const levels = useMemo(() => detectHeatMapPriceLevels(visibleCandles), [visibleCandles]);
  const readyComparisons = comparisons.filter((item) => !item.loading && !item.error && item.candles.length > 0);
  const comparisonSlices = readyComparisons.map((item) => {
    if (!visibleCandles.length) return { ...item, visibleCandles: [] };
    const firstT = visibleCandles[0]!.t;
    const lastT = visibleCandles[visibleCandles.length - 1]!.t;
    const matching = item.candles.filter((candle) => candle.t >= firstT && candle.t <= lastT);
    return { ...item, visibleCandles: matching };
  }).filter((item) => item.visibleCandles.length > 0);
  const firstRangeClose = candles[0]?.c;
  const lastRangeClose = candles[candles.length - 1]?.c;
  const rangeChange = firstRangeClose && lastRangeClose
    ? ((lastRangeClose - firstRangeClose) / firstRangeClose) * 100
    : null;
  const onChartPoint = useCallback((point: { t: number; price: number }) => {
    if (!drawing) return;
    if (!pendingPoint) setPendingPoint(point);
    else {
      setTrendLines((current) => [...current, {
        id: `${Date.now()}-${current.length}`,
        startT: pendingPoint.t, startPrice: pendingPoint.price,
        endT: point.t, endPrice: point.price,
      }]);
      setPendingPoint(null);
      setDrawing(false);
    }
  }, [drawing, pendingPoint]);

  if (!symbol) {
    return <View style={[styles.screen, { backgroundColor: colors.background }]}><Text style={{ color: colors.foreground }}>Chart symbol is missing.</Text></View>;
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 8, borderBottomColor: colors.border }]}>
        <Pressable testID="heat-map-chart-back" onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back to heat map" style={styles.backButton}>
          <Feather name="arrow-left" size={21} color={colors.primary} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={[styles.symbol, { color: colors.heading }]}>{symbol}</Text>
          <Text numberOfLines={1} style={[styles.name, { color: colors.mutedForeground }]}>{name} · {assetType}</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: Math.max(insets.bottom, 24) + 16 }} keyboardShouldPersistTaps="handled">
        <View style={[styles.chartCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.cardHeading}>
            <View>
              <Text style={[styles.eyebrow, { color: colors.mutedForeground }]}>
                {comparisonSlices.length ? 'PRICE HISTORY + COMPARISONS' : 'PRICE HISTORY'}
              </Text>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>{symbol}</Text>
            </View>
            {candles.length > 0 && <View style={styles.priceSummary}>
              <Text style={[styles.lastPrice, { color: colors.primary }]}>
                {commoditySpec
                  ? formatCommodityQuotePrice(symbol, candles[candles.length - 1]!.c)
                  : `$${candles[candles.length - 1]!.c.toLocaleString('en-US', { maximumFractionDigits: 4 })}`}
              </Text>
              {rangeChange !== null && <Text style={[styles.rangeReturn, { color: rangeChange >= 0 ? colors.buyColor : colors.sellColor }]}>
                {range.label} {rangeChange >= 0 ? '+' : ''}{rangeChange.toFixed(2)}%
              </Text>}
            </View>}
          </View>
          {assetType === 'commodity' && (
            <Text
              testID="heat-map-chart-continuous-futures-note"
              style={[styles.disclaimer, { color: colors.mutedForeground }]}
            >
              Continuous-futures history, not one tradable contract. Contract month, expiry, settlement, and roll adjustments are not verified here.
              {candles.length > 0 ? ` Last bar ${candles[candles.length - 1]!.date} · ${formatHeatMapQuoteAge(candles[candles.length - 1]!.t)}.` : ''}
            </Text>
          )}
          <ScrollView testID="heat-map-chart-range-strip" horizontal showsHorizontalScrollIndicator={false}
            accessibilityHint="Swipe horizontally to see all history ranges"
            contentContainerStyle={styles.rangeRow}>
            {CHART_HISTORY_RANGES.map((item, index) => <ChartButton key={item.label} testID={`heat-map-chart-range-${item.label}`}
              label={item.label} active={rangeIndex === index} colors={colors} compact onPress={() => { setRangeIndex(index); setZoom(1); setPan(0); }} />)}
          </ScrollView>
          {comparisonSlices.length === 0 && <View style={styles.controlsRow}>
            <ChartButton testID="heat-map-chart-mode-line" label="Line" active={chartMode === 'line'} colors={colors} onPress={() => setChartMode('line')} />
            <ChartButton testID="heat-map-chart-mode-candles" label="Candles" active={chartMode === 'candles'} colors={colors} onPress={() => setChartMode('candles')} />
          </View>}
          <View style={styles.controlsRow}>
            <ChartButton testID="heat-map-chart-zoom-in" label="Zoom +" colors={colors} disabled={zoom >= 8 || candles.length < 12} onPress={() => setZoom((value) => Math.min(8, value * 1.5))} />
            <ChartButton testID="heat-map-chart-zoom-out" label="Zoom −" colors={colors} disabled={zoom <= 1} onPress={() => { setZoom((value) => Math.max(1, value / 1.5)); setPan(0); }} />
            <ChartButton testID="heat-map-chart-pan-left" label="← Pan" colors={colors} disabled={start <= 0} onPress={() => setPan((value) => Math.min(maxStart, value + Math.max(1, Math.floor(zoomCount / 4))))} />
            <ChartButton testID="heat-map-chart-pan-right" label="Pan →" colors={colors} disabled={start >= maxStart} onPress={() => setPan((value) => Math.max(0, value - Math.max(1, Math.floor(zoomCount / 4))))} />
          </View>
          {loading ? <View style={styles.state}><ActivityIndicator color={colors.primary} /><Text style={{ color: colors.mutedForeground }}>Loading price history…</Text></View>
            : loadError ? <View style={styles.state}><Text style={{ color: colors.sellColor }}>Price history is temporarily unavailable.</Text><ChartButton testID="heat-map-chart-retry" label="Retry" colors={colors} onPress={() => setRetryToken((token) => token + 1)} /></View>
                : !candles.length ? <View style={styles.state}><Text style={{ color: colors.mutedForeground }}>No historical prices are available for {symbol}.</Text></View>
                : comparisonSlices.length > 0 ? (
                  <ComparisonChart
                    primaryCandles={visibleCandles}
                    primarySymbol={symbol}
                    compCandles={comparisonSlices[0]!.visibleCandles}
                    compSymbol={comparisonSlices[0]!.symbol}
                    secondCompCandles={comparisonSlices[1]?.visibleCandles}
                    secondCompSymbol={comparisonSlices[1]?.symbol}
                    width={plotWidth - 8}
                    height={300}
                  />
                ) : <StockChart candles={visibleCandles} priceCurrency={priceCurrency} chartMode={chartMode} width={plotWidth - 8} height={300} showMA50={false}
                  supportLevels={showLevels ? levels.support : []} resistanceLevels={showLevels ? levels.resistance : []}
                  trendLines={trendLines} onChartPoint={onChartPoint} />}
          {!loading && !loadError && candles.length > 0 && (
            <>
              {comparisonSlices.length === 0 && (
                <>
                  <View style={styles.controlsRow}>
                    <ChartButton testID="heat-map-chart-levels" label={showLevels ? 'Hide support / resistance' : 'Find support / resistance'} active={showLevels} colors={colors} onPress={() => setShowLevels((value) => !value)} />
                    <ChartButton testID="heat-map-chart-draw-line"
                      label={drawing ? 'Tap chart twice…' : trendLinesLoadError ? 'Drawings unavailable' : trendLinesLoadedFor !== symbol ? 'Loading drawings…' : 'Draw trend line'}
                      active={drawing} disabled={trendLinesLoadedFor !== symbol || trendLinesLoadError} colors={colors}
                      onPress={() => { setPendingPoint(null); setDrawing((value) => !value); }} />
                  </View>
                  {trendLinesLoadError && <Text style={[styles.disclaimer, { color: colors.sellColor }]}>
                    Saved drawings could not be loaded. Reopen the chart to try again.
                  </Text>}
                  {showLevels && <Text style={[styles.disclaimer, { color: colors.mutedForeground }]}>
                    {levels.support.length || levels.resistance.length
                      ? 'Estimated from repeated swing highs and lows in this visible range. Historical levels can fail and are not predictions.'
                      : 'No repeated swing levels were found in this visible range. Try a wider time range.'}
                  </Text>}
                  {drawing && <Text style={[styles.disclaimer, { color: colors.primary }]}>
                    Tap two points on the chart to place a trend line. {pendingPoint ? 'Choose the second point.' : 'Choose the first point.'}
                  </Text>}
                </>
              )}
              {comparisonSlices.length === 0 && !!trendLines.length && <View style={styles.linesList}>
                <Text style={[styles.linesTitle, { color: colors.foreground }]}>Your trend lines</Text>
                {trendLines.map((line, index) => <View key={line.id} style={styles.lineRow}>
                  <Text style={[styles.disclaimer, { color: colors.mutedForeground }]}>Line {index + 1}</Text>
                  <Pressable testID={`heat-map-chart-remove-line-${index}`} accessibilityRole="button" accessibilityLabel={`Remove trend line ${index + 1}`} onPress={() => setTrendLines((current) => current.filter((item) => item.id !== line.id))}>
                    <Text style={{ color: colors.primary }}>Remove</Text>
                  </Pressable>
                </View>)}
                <ChartButton testID="heat-map-chart-clear-lines" label="Clear all lines" colors={colors} onPress={() => setTrendLines([])} />
              </View>}
            </>
          )}
          <View style={styles.compareSection}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>Compare instruments</Text>
          <Text style={[styles.disclaimer, { color: colors.mutedForeground }]}>Add up to two tickers. Relative performance will appear in the chart above.</Text>
          <View style={styles.inputRow}>
            <TextInput testID="heat-map-chart-ticker-input" value={tickerInput} onChangeText={setTickerInput}
              placeholder="Ticker (e.g. AAPL or GC=F)" placeholderTextColor={colors.mutedForeground}
              autoCapitalize="characters" autoCorrect={false} returnKeyType="done" onSubmitEditing={addComparison}
              style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]} />
            <Pressable testID="heat-map-chart-add-comparison" accessibilityRole="button" onPress={addComparison}
              style={[styles.addButton, { backgroundColor: colors.primary }]}>
              <MaterialCommunityIcons name="plus" size={19} color={colors.primaryForeground} />
            </Pressable>
          </View>
          {tickerError ? <Text style={{ color: colors.sellColor, marginTop: 8 }}>{tickerError}</Text> : null}
          {comparisons.map((item, index) => (
            <View key={item.symbol} style={[styles.comparisonItem, { borderTopColor: colors.border }]}>
              <View style={styles.comparisonHeader}>
                <Text style={[styles.comparisonSymbol, { color: colors.foreground }]}>{item.symbol}</Text>
                <Pressable testID={`heat-map-chart-remove-comparison-${index}`} accessibilityRole="button" accessibilityLabel={`Remove ${item.symbol} comparison`} onPress={() => setComparisons((current) => current.filter((other) => other.symbol !== item.symbol))}>
                  <Text style={{ color: colors.primary }}>Remove</Text>
                </Pressable>
              </View>
              {item.loading ? <View style={styles.state}><ActivityIndicator size="small" color={colors.primary} /><Text style={{ color: colors.mutedForeground }}>Loading {item.symbol}…</Text></View>
                : item.error || !item.candles.length ? <Text style={[styles.disclaimer, { color: colors.sellColor }]}>No history available for {item.symbol}. Your main chart is unchanged.</Text>
                  : <Text style={[styles.disclaimer, { color: colors.mutedForeground }]}>Comparison data loaded.</Text>}
            </View>
          ))}
          {comparisons.length >= 2 && <Text style={[styles.disclaimer, { color: colors.mutedForeground }]}>Maximum of two comparison tickers reached.</Text>}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, paddingBottom: 12 },
  backButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1 },
  symbol: { fontFamily: 'Inter_700Bold', fontSize: 18 },
  name: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 2 },
  chartCard: { borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 14 },
  cardHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  eyebrow: { fontFamily: 'Inter_700Bold', letterSpacing: 1, fontSize: 9 },
  cardTitle: { fontFamily: 'Inter_700Bold', fontSize: 17, marginBottom: 6 },
  lastPrice: { fontFamily: 'Inter_700Bold', fontSize: 16 },
  priceSummary: { alignItems: 'flex-end' },
  rangeReturn: { fontFamily: 'Inter_600SemiBold', fontSize: 11, marginTop: 2 },
  rangeRow: { flexDirection: 'row', gap: 7, paddingBottom: 9 },
  controlsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 9 },
  smallButton: { minHeight: 34, paddingHorizontal: 10, borderWidth: 1, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  smallButtonText: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  rangeButton: { minHeight: 32, paddingHorizontal: 7 },
  rangeButtonText: { fontSize: 10 },
  state: { minHeight: 96, gap: 9, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  disclaimer: { fontSize: 11, lineHeight: 16, marginTop: 4, marginBottom: 8 },
  linesList: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(128,128,128,.25)', paddingTop: 8, gap: 6 },
  linesTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  lineRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  compareSection: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(128,128,128,.25)', paddingTop: 12, marginTop: 10 },
  inputRow: { flexDirection: 'row', gap: 8 },
  input: { flex: 1, borderWidth: 1, borderRadius: 9, paddingHorizontal: 12, minHeight: 42, fontSize: 13 },
  addButton: { width: 44, height: 42, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  comparisonItem: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 10, paddingTop: 10 },
  comparisonHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  comparisonSymbol: { fontFamily: 'Inter_700Bold', fontSize: 13 },
});
