import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Platform, ActivityIndicator, useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { StockChart, type Candle } from '@/components/StockChart';
import type { Pick } from '@/app/picks';

const BASE_URL = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

// Timeframe options → { period, interval } for the API
const TIMEFRAMES = [
  { label: '1W', period: '5d', interval: '1h' },
  { label: '1M', period: '1mo', interval: '1d' },
  { label: '3M', period: '3mo', interval: '1d' },
  { label: '6M', period: '6mo', interval: '1d' },
  { label: '1Y', period: '1y', interval: '1d' },
  { label: '2Y', period: '2y', interval: '1wk' },
];

function fmtPrice(p: number) {
  if (p >= 1000) return `$${p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (p >= 1) return `$${p.toFixed(2)}`;
  return `$${p.toFixed(4)}`;
}

function ScoreBar({ label, value, color }: { label: string; value: number; color: string }) {
  const colors = useColors();
  return (
    <View style={scoreStyles.row}>
      <Text style={[scoreStyles.label, { color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }]}>{label}</Text>
      <View style={[scoreStyles.track, { backgroundColor: colors.muted }]}>
        <View style={[scoreStyles.fill, { width: `${value}%` as any, backgroundColor: color }]} />
      </View>
      <Text style={[scoreStyles.val, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>{value}</Text>
    </View>
  );
}

const scoreStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  label: { fontSize: 12, width: 90 },
  track: { flex: 1, height: 5, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 5, borderRadius: 3 },
  val: { fontSize: 12, width: 28, textAlign: 'right' },
});

export default function PickDetailScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ symbol: string; data: string }>();

  const pick: Pick | null = params.data ? JSON.parse(params.data) : null;
  const symbol = params.symbol ?? '';

  const [tfIdx, setTfIdx] = useState(2); // default: 3M
  const [candles, setCandles] = useState<Candle[]>([]);
  const [chartLoading, setChartLoading] = useState(true);
  const [chartError, setChartError] = useState(false);
  const [showMA20, setShowMA20] = useState(false);
  const [showMA50, setShowMA50] = useState(true);
  const [showMA200, setShowMA200] = useState(false);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const fetchChart = useCallback(async (idx: number) => {
    const tf = TIMEFRAMES[idx]!;
    setChartLoading(true);
    setChartError(false);
    try {
      const res = await fetch(
        `${BASE_URL}/api/stocks/chart/${symbol}?period=${tf.period}&interval=${tf.interval}`
      );
      if (!res.ok) throw new Error();
      const data = await res.json();
      setCandles(data.candles ?? []);
    } catch {
      setChartError(true);
    } finally {
      setChartLoading(false);
    }
  }, [symbol]);

  useEffect(() => { fetchChart(tfIdx); }, [fetchChart, tfIdx]);

  if (!pick) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={[{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>No data</Text>
      </View>
    );
  }

  const upColor = '#00e5a0';
  const todayUp = pick.priceChangePercent >= 0;
  const todayColor = todayUp ? upColor : colors.sellColor;

  const chartPad = 32;
  const chartWidth = width - chartPad;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
          <Feather name="arrow-left" size={20} color={colors.primary} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={[styles.headerSymbol, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
            {pick.symbol}
          </Text>
          <Text style={[styles.headerName, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]} numberOfLines={1}>
            {pick.name}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.analyzeBtn, { borderColor: colors.border }]}
          onPress={() => router.push(`/analysis/${pick.symbol}`)}
          activeOpacity={0.7}
        >
          <Text style={[styles.analyzeBtnText, { color: colors.primary, fontFamily: 'Inter_600SemiBold' }]}>
            Full AI
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Price + Target Card */}
        <View style={[styles.section, styles.priceCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {/* Current price */}
          <View style={styles.priceRow}>
            <View>
              <Text style={[styles.priceLabel, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                CURRENT PRICE
              </Text>
              <Text style={[styles.priceValue, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
                {fmtPrice(pick.currentPrice)}
              </Text>
              <Text style={[styles.pricePct, { color: todayColor, fontFamily: 'Inter_500Medium' }]}>
                {todayUp ? '+' : ''}{pick.priceChangePercent.toFixed(2)}% today
              </Text>
            </View>

            <Feather name="arrow-right" size={18} color={colors.border} />

            {/* Target price */}
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[styles.priceLabel, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                AI TARGET
              </Text>
              <Text style={[styles.priceValue, { color: upColor, fontFamily: 'Inter_700Bold' }]}>
                {fmtPrice(pick.priceTarget)}
              </Text>
              <Text style={[styles.pricePct, { color: upColor, fontFamily: 'Inter_500Medium' }]}>
                +{pick.upside.toFixed(1)}% upside
              </Text>
            </View>
          </View>

          {/* Target range */}
          {(pick.targetLowPrice || pick.targetHighPrice) && (
            <View style={[styles.targetRange, { borderTopColor: colors.border }]}>
              <Text style={[styles.rangeLabel, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                Analyst Range
              </Text>
              <Text style={[styles.rangeVal, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>
                {pick.targetLowPrice ? fmtPrice(pick.targetLowPrice) : '—'} →{' '}
                {pick.targetHighPrice ? fmtPrice(pick.targetHighPrice) : '—'}
              </Text>
              {pick.numberOfAnalysts > 0 && (
                <Text style={[styles.rangeLabel, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                  {pick.numberOfAnalysts} analysts
                </Text>
              )}
            </View>
          )}

          {/* Confidence meter */}
          <View style={[styles.confRow, { borderTopColor: colors.border }]}>
            <Text style={[styles.confLabel, { color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }]}>
              AI CONFIDENCE
            </Text>
            <View style={[styles.confTrack, { backgroundColor: colors.muted }]}>
              <View style={[styles.confFill, {
                width: `${pick.confidence}%` as any,
                backgroundColor: pick.confidence >= 80 ? upColor : pick.confidence >= 65 ? '#f59e0b' : '#c0c0c0',
              }]} />
            </View>
            <Text style={[styles.confPct, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
              {pick.confidence}%
            </Text>
          </View>
        </View>

        {/* Score Breakdown */}
        <View style={[styles.section, styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>
            SCORE BREAKDOWN
          </Text>
          <View style={{ marginTop: 12 }}>
            <ScoreBar label="Technical" value={pick.technicalScore} color="#60a5fa" />
            <ScoreBar label="Fundamental" value={pick.fundamentalScore} color="#34d399" />
            <ScoreBar label="Momentum" value={pick.momentumScore} color="#c084fc" />
            <ScoreBar label="Analyst" value={pick.analystScore} color="#f59e0b" />
          </View>
          <View style={[styles.compositeRow, { borderTopColor: colors.border }]}>
            <Text style={[styles.compositeLabel, { color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }]}>
              Composite Score
            </Text>
            <Text style={[styles.compositeVal, { color: colors.primary, fontFamily: 'Inter_700Bold' }]}>
              {pick.compositeScore.toFixed(1)} / 100
            </Text>
          </View>
          <View style={styles.metaRow}>
            {pick.sector ? (
              <View style={[styles.metaChip, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                <Text style={[styles.metaChipText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                  {pick.sector}
                </Text>
              </View>
            ) : null}
            <View style={[styles.metaChip, { backgroundColor: colors.muted, borderColor: colors.border }]}>
              <Text style={[styles.metaChipText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                Vol {pick.volatility}% ann.
              </Text>
            </View>
          </View>
        </View>

        {/* Key Reasons */}
        {pick.reasons.length > 0 && (
          <View style={[styles.section, styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>
              WHY THIS PICK
            </Text>
            <View style={{ marginTop: 12, gap: 8 }}>
              {pick.reasons.map((r, i) => (
                <View key={i} style={styles.reasonRow}>
                  <View style={[styles.reasonDot, { backgroundColor: colors.primary }]} />
                  <Text style={[styles.reasonText, { color: colors.foreground, fontFamily: 'Inter_400Regular' }]}>
                    {r}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Chart */}
        <View style={[styles.section, styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>
            PRICE CHART
          </Text>

          {/* Timeframe selector */}
          <View style={styles.tfRow}>
            {TIMEFRAMES.map((tf, i) => (
              <TouchableOpacity
                key={tf.label}
                style={[
                  styles.tfBtn,
                  i === tfIdx
                    ? { backgroundColor: colors.primary }
                    : { backgroundColor: colors.muted, borderColor: colors.border },
                ]}
                onPress={() => setTfIdx(i)}
                activeOpacity={0.7}
              >
                <Text style={[styles.tfText, {
                  color: i === tfIdx ? colors.primaryForeground : colors.mutedForeground,
                  fontFamily: 'Inter_600SemiBold',
                }]}>
                  {tf.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* MA toggles */}
          <View style={styles.maRow}>
            {[
              { label: 'MA20', active: showMA20, color: '#c084fc', set: setShowMA20 },
              { label: 'MA50', active: showMA50, color: '#60a5fa', set: setShowMA50 },
              { label: 'MA200', active: showMA200, color: '#f59e0b', set: setShowMA200 },
            ].map(({ label, active, color, set }) => (
              <TouchableOpacity
                key={label}
                style={[
                  styles.maBtn,
                  { borderColor: active ? color : colors.border, backgroundColor: active ? color + '22' : 'transparent' },
                ]}
                onPress={() => set((v) => !v)}
                activeOpacity={0.7}
              >
                <View style={[styles.maDot, { backgroundColor: color }]} />
                <Text style={[styles.maText, { color: active ? color : colors.mutedForeground, fontFamily: 'Inter_500Medium' }]}>
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Chart area */}
          <View style={[styles.chartArea, { borderColor: colors.border }]}>
            {chartLoading ? (
              <View style={styles.chartLoading}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            ) : chartError ? (
              <View style={styles.chartLoading}>
                <Text style={[{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12 }]}>
                  Chart unavailable
                </Text>
              </View>
            ) : (
              <StockChart
                candles={candles}
                showMA20={showMA20}
                showMA50={showMA50}
                showMA200={showMA200}
                width={chartWidth}
                height={260}
              />
            )}
          </View>

          {/* Legend */}
          <View style={styles.legendRow}>
            <View style={styles.legendItem}>
              <View style={[styles.legendLine, { backgroundColor: '#c0c0c0' }]} />
              <Text style={[styles.legendText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>Price</Text>
            </View>
            {showMA20 && (
              <View style={styles.legendItem}>
                <View style={[styles.legendLine, { backgroundColor: '#c084fc' }]} />
                <Text style={[styles.legendText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>MA20</Text>
              </View>
            )}
            {showMA50 && (
              <View style={styles.legendItem}>
                <View style={[styles.legendLine, { backgroundColor: '#60a5fa' }]} />
                <Text style={[styles.legendText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>MA50</Text>
              </View>
            )}
            {showMA200 && (
              <View style={styles.legendItem}>
                <View style={[styles.legendLine, { backgroundColor: '#f59e0b', borderStyle: 'dashed' }]} />
                <Text style={[styles.legendText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>MA200</Text>
              </View>
            )}
            <View style={styles.legendItem}>
              <View style={[styles.legendLine, { backgroundColor: '#00e5a0', opacity: 0.5 }]} />
              <Text style={[styles.legendText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>Vol ↑</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendLine, { backgroundColor: '#ff3b3b', opacity: 0.5 }]} />
              <Text style={[styles.legendText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>Vol ↓</Text>
            </View>
          </View>

          <Text style={[styles.chartHint, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
            Tap chart to see price at that point
          </Text>
        </View>

        {/* Disclaimer */}
        <Text style={[styles.disclaimer, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
          For informational purposes only. Not financial advice. AI analysis is based on historical data and does not guarantee future performance.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingBottom: 12,
  },
  backBtn: { padding: 4 },
  headerText: { flex: 1 },
  headerSymbol: { fontSize: 20 },
  headerName: { fontSize: 11 },
  analyzeBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  analyzeBtnText: { fontSize: 12 },
  section: { marginHorizontal: 16, marginBottom: 12 },
  priceCard: { borderRadius: 14, borderWidth: 1, padding: 16 },
  card: { borderRadius: 14, borderWidth: 1, padding: 16 },
  cardTitle: { fontSize: 11, letterSpacing: 1 },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  priceLabel: { fontSize: 9, letterSpacing: 1, marginBottom: 3 },
  priceValue: { fontSize: 24, lineHeight: 30 },
  pricePct: { fontSize: 11, marginTop: 2 },
  targetRange: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, paddingTop: 10, marginBottom: 10 },
  rangeLabel: { fontSize: 10 },
  rangeVal: { fontSize: 12, flex: 1, textAlign: 'center' },
  confRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, paddingTop: 10 },
  confLabel: { fontSize: 10, letterSpacing: 0.5, width: 100 },
  confTrack: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  confFill: { height: 6, borderRadius: 3 },
  confPct: { fontSize: 14, width: 38, textAlign: 'right' },
  compositeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, paddingTop: 10, marginTop: 4 },
  compositeLabel: { fontSize: 12 },
  compositeVal: { fontSize: 16 },
  metaRow: { flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  metaChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 5, borderWidth: 1 },
  metaChipText: { fontSize: 10 },
  reasonRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  reasonDot: { width: 5, height: 5, borderRadius: 3, marginTop: 5 },
  reasonText: { fontSize: 12, lineHeight: 19, flex: 1 },
  tfRow: { flexDirection: 'row', gap: 6, marginTop: 12, marginBottom: 8 },
  tfBtn: { flex: 1, paddingVertical: 6, borderRadius: 6, alignItems: 'center', borderWidth: 1 },
  tfText: { fontSize: 11 },
  maRow: { flexDirection: 'row', gap: 6, marginBottom: 12, flexWrap: 'wrap' },
  maBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, borderWidth: 1 },
  maDot: { width: 6, height: 6, borderRadius: 3 },
  maText: { fontSize: 11 },
  chartArea: { borderRadius: 8, overflow: 'hidden', borderWidth: 1, minHeight: 260 },
  chartLoading: { height: 260, alignItems: 'center', justifyContent: 'center' },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendLine: { width: 16, height: 2, borderRadius: 1 },
  legendText: { fontSize: 10 },
  chartHint: { fontSize: 10, textAlign: 'center', marginTop: 8 },
  disclaimer: { textAlign: 'center', fontSize: 10, lineHeight: 16, paddingHorizontal: 20, marginTop: 12 },
});
