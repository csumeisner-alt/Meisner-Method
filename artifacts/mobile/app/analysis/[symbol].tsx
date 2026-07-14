import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useAnalyzeStock } from '@workspace/api-client-react';
import type { StockAnalysis } from '@workspace/api-client-react';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtPrice = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

const fmtPct = (n: number | null | undefined) =>
  n != null ? `${(n * 100).toFixed(1)}%` : '—';

const fmtNum = (n: number | null | undefined, d = 2) =>
  n != null ? n.toFixed(d) : '—';

const fmtVol = (n: number) => {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toString();
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function ScoreBar({ score, color }: { score: number; color: string }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: score / 100, duration: 900, useNativeDriver: false }).start();
  }, [score]);
  return (
    <View style={scoreStyles.wrapper}>
      <View style={scoreStyles.track}>
        <Animated.View
          style={[scoreStyles.fill, {
            width: anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
            backgroundColor: color,
          }]}
        />
      </View>
      <Text style={[scoreStyles.label, { color }]}>{score}</Text>
    </View>
  );
}
const scoreStyles = StyleSheet.create({
  wrapper: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  track: { flex: 1, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 2 },
  label: { fontSize: 13, fontFamily: 'Inter_700Bold', minWidth: 28, textAlign: 'right' },
});

function MetricRow({ label, value, highlight }: { label: string; value: string; highlight?: string }) {
  const colors = useColors();
  return (
    <View style={metricStyles.row}>
      <Text style={[metricStyles.label, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>{label}</Text>
      <Text style={[metricStyles.value, { color: highlight ?? colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>{value}</Text>
    </View>
  );
}
const metricStyles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  label: { fontSize: 13 },
  value: { fontSize: 13 },
});

function SectionCard({ title, icon, score, scoreColor, children }: {
  title: string;
  icon: React.ReactNode;
  score?: number;
  scoreColor?: string;
  children: React.ReactNode;
}) {
  const colors = useColors();
  return (
    <View style={[cardStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={cardStyles.header}>
        <View style={cardStyles.titleRow}>
          {icon}
          <Text style={[cardStyles.title, { color: colors.foreground, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.5 }]}>{title}</Text>
        </View>
        {score != null && scoreColor && (
          <View style={cardStyles.scoreRow}>
            <Text style={[cardStyles.scoreLabel, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>Score</Text>
            <ScoreBar score={score} color={scoreColor} />
          </View>
        )}
      </View>
      <View style={[cardStyles.divider, { backgroundColor: colors.border }]} />
      {children}
    </View>
  );
}
const cardStyles = StyleSheet.create({
  card: { borderRadius: 12, borderWidth: 1, marginBottom: 12, overflow: 'hidden' },
  header: { padding: 16, paddingBottom: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  title: { fontSize: 14 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  scoreLabel: { fontSize: 11 },
  divider: { height: 1 },
});

function AnalystBar({ buy, hold, sell, total }: { buy: number; hold: number; sell: number; total: number }) {
  const colors = useColors();
  const bPct = total > 0 ? (buy / total) * 100 : 0;
  const hPct = total > 0 ? (hold / total) * 100 : 0;
  const sPct = total > 0 ? (sell / total) * 100 : 0;
  return (
    <View>
      <View style={analystStyles.bar}>
        {bPct > 0 && <View style={[analystStyles.seg, { flex: bPct, backgroundColor: colors.buyColor }]} />}
        {hPct > 0 && <View style={[analystStyles.seg, { flex: hPct, backgroundColor: colors.holdColor }]} />}
        {sPct > 0 && <View style={[analystStyles.seg, { flex: sPct, backgroundColor: colors.sellColor }]} />}
      </View>
      <View style={analystStyles.legend}>
        <Text style={[analystStyles.leg, { color: colors.buyColor, fontFamily: 'Inter_500Medium' }]}>Buy {buy}</Text>
        <Text style={[analystStyles.leg, { color: colors.holdColor, fontFamily: 'Inter_500Medium' }]}>Hold {hold}</Text>
        <Text style={[analystStyles.leg, { color: colors.sellColor, fontFamily: 'Inter_500Medium' }]}>Sell {sell}</Text>
      </View>
    </View>
  );
}
const analystStyles = StyleSheet.create({
  bar: { flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden', marginBottom: 8 },
  seg: { height: '100%' },
  legend: { flexDirection: 'row', justifyContent: 'space-around' },
  leg: { fontSize: 12 },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function AnalysisScreen() {
  const { symbol } = useLocalSearchParams<{ symbol: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { mutate, data, isPending, error } = useAnalyzeStock<Error>();

  useEffect(() => {
    if (symbol) mutate({ data: { symbol } });
  }, [symbol]);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;

  const actionColor = (a?: string) => {
    if (a === 'buy') return colors.buyColor;
    if (a === 'sell') return colors.sellColor;
    return colors.holdColor;
  };

  const actionBg = (a?: string) => {
    if (a === 'buy') return colors.buyBg;
    if (a === 'sell') return colors.sellBg;
    return colors.holdBg;
  };

  const scoreColor = (score: number) => {
    if (score >= 65) return colors.buyColor;
    if (score <= 40) return colors.sellColor;
    return colors.holdColor;
  };

  // ─── Header ──────────────────────────────────────────────────────────────
  const renderHeader = (analysis?: StockAnalysis) => {
    const change = analysis?.priceChange ?? 0;
    const changePct = analysis?.priceChangePercent ?? 0;
    const positive = change >= 0;
    return (
      <View style={[headerStyles.container, { paddingTop: topPad + 8, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <View style={headerStyles.row}>
          <TouchableOpacity onPress={() => router.back()} style={headerStyles.back} activeOpacity={0.7}>
            <Feather name="chevron-left" size={26} color={colors.foreground} />
          </TouchableOpacity>
          <View style={headerStyles.center}>
            <Text style={[headerStyles.symbol, { color: colors.foreground, fontFamily: 'Inter_700Bold', letterSpacing: 1 }]}>
              {symbol}
            </Text>
            {analysis && (
              <Text style={[headerStyles.company, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]} numberOfLines={1}>
                {analysis.companyName}
              </Text>
            )}
          </View>
          {analysis && (
            <View style={headerStyles.priceArea}>
              <Text style={[headerStyles.price, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
                {fmtPrice(analysis.currentPrice)}
              </Text>
              <Text style={[headerStyles.change, {
                color: positive ? colors.buyColor : colors.sellColor,
                fontFamily: 'Inter_500Medium',
              }]}>
                {positive ? '+' : ''}{change.toFixed(2)} ({positive ? '+' : ''}{changePct.toFixed(2)}%)
              </Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  // ─── Loading ──────────────────────────────────────────────────────────────
  if (isPending) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        {renderHeader()}
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingTitle, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>
            Analyzing {symbol}...
          </Text>
          <Text style={[styles.loadingSubtitle, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
            Fetching market data & running AI models
          </Text>
        </View>
      </View>
    );
  }

  // ─── Error ────────────────────────────────────────────────────────────────
  if (error || !data) {
    const errMsg = (error as any)?.response?.data?.message ?? error?.message ?? 'Could not load analysis.';
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        {renderHeader()}
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.sellColor} />
          <Text style={[styles.errorTitle, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>
            Analysis Failed
          </Text>
          <Text style={[styles.errorMsg, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
            {errMsg}
          </Text>
          <TouchableOpacity
            style={[styles.retryBtn, { backgroundColor: colors.muted, borderColor: colors.border, borderWidth: 1 }]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); mutate({ symbol: symbol! }); }}
            activeOpacity={0.8}
          >
            <Text style={[styles.retryText, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>
              Retry
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ─── Results ──────────────────────────────────────────────────────────────
  const { technical, fundamental, behavioral, recommendation } = data;
  const action = recommendation.action;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {renderHeader(data)}
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: botPad + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Recommendation Hero */}
        <View style={[recStyles.hero, { backgroundColor: actionBg(action), borderColor: actionColor(action) }]}>
          <View style={recStyles.topRow}>
            <View>
              <Text style={[recStyles.actionLabel, { color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }]}>
                AI RECOMMENDATION
              </Text>
              <Text style={[recStyles.action, { color: actionColor(action), fontFamily: 'Inter_700Bold' }]}>
                {action.toUpperCase()}
              </Text>
            </View>
            <View style={[recStyles.confidenceBadge, { borderColor: actionColor(action), borderWidth: 1 }]}>
              <Text style={[recStyles.confidenceNum, { color: actionColor(action), fontFamily: 'Inter_700Bold' }]}>
                {recommendation.confidence}%
              </Text>
              <Text style={[recStyles.confidenceLabel, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                confidence
              </Text>
            </View>
          </View>
          <Text style={[recStyles.horizon, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
            Horizon: {recommendation.timeHorizon}
          </Text>
          <View style={[recStyles.targetsRow, { borderTopColor: colors.border }]}>
            {[
              { label: action === 'sell' ? 'Sell At' : 'Entry', value: recommendation.buyPrice },
              { label: 'Target', value: recommendation.sellPrice },
              { label: 'Stop Loss', value: recommendation.stopLoss },
            ].map(({ label, value }) => (
              <View key={label} style={recStyles.targetItem}>
                <Text style={[recStyles.targetLabel, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>{label}</Text>
                <Text style={[recStyles.targetValue, { color: actionColor(action), fontFamily: 'Inter_700Bold' }]}>
                  {value != null ? fmtPrice(value) : '—'}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* 52W Range */}
        <View style={[rangeStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={rangeStyles.labels}>
            <Text style={[rangeStyles.text, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
              52W Low: {fmtPrice(data.week52Low)}
            </Text>
            <Text style={[rangeStyles.text, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
              {fmtPrice(data.week52High)} :52W High
            </Text>
          </View>
          <View style={[rangeStyles.track, { backgroundColor: colors.muted }]}>
            {(() => {
              const range = data.week52High - data.week52Low;
              const pos = range > 0 ? ((data.currentPrice - data.week52Low) / range) * 100 : 50;
              return (
                <View style={[rangeStyles.thumb, {
                  left: `${Math.min(95, Math.max(5, pos))}%` as any,
                  backgroundColor: colors.primary,
                }]} />
              );
            })()}
          </View>
          <View style={rangeStyles.labels}>
            <Text style={[rangeStyles.mktCap, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
              Mkt Cap: {data.marketCap ? `$${fmtVol(data.marketCap)}` : '—'}
            </Text>
            <Text style={[rangeStyles.mktCap, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
              Vol: {fmtVol(data.volume)}
            </Text>
          </View>
        </View>

        {/* Technical */}
        <SectionCard
          title="TECHNICAL"
          icon={<Ionicons name="stats-chart" size={16} color={colors.primary} />}
          score={technical.score}
          scoreColor={scoreColor(technical.score)}
        >
          <View style={{ padding: 16 }}>
            <View style={rsiStyles.container}>
              <Text style={[rsiStyles.label, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>RSI (14)</Text>
              <View style={[rsiStyles.track, { backgroundColor: colors.muted }]}>
                <View style={[rsiStyles.fill, {
                  width: `${technical.rsi}%` as any,
                  backgroundColor: technical.rsi < 30 ? colors.buyColor : technical.rsi > 70 ? colors.sellColor : colors.holdColor,
                }]} />
                <View style={[rsiStyles.marker, { left: '30%' as any, backgroundColor: colors.border }]} />
                <View style={[rsiStyles.marker, { left: '70%' as any, backgroundColor: colors.border }]} />
              </View>
              <Text style={[rsiStyles.value, {
                color: technical.rsi < 30 ? colors.buyColor : technical.rsi > 70 ? colors.sellColor : colors.foreground,
                fontFamily: 'Inter_700Bold',
              }]}>
                {technical.rsi.toFixed(1)}
              </Text>
            </View>
            <View style={[divStyle, { backgroundColor: colors.border }]} />
            <MetricRow label="Trend" value={technical.trend.charAt(0).toUpperCase() + technical.trend.slice(1)}
              highlight={technical.trend === 'uptrend' ? colors.buyColor : technical.trend === 'downtrend' ? colors.sellColor : undefined}
            />
            <MetricRow label="MACD Signal" value={technical.macdSignal.charAt(0).toUpperCase() + technical.macdSignal.slice(1)}
              highlight={technical.macdSignal === 'bullish' ? colors.buyColor : technical.macdSignal === 'bearish' ? colors.sellColor : undefined}
            />
            <MetricRow label="Volume vs Avg" value={`${technical.volumeRatio.toFixed(2)}x`}
              highlight={technical.volumeRatio > 1.5 ? colors.buyColor : undefined}
            />
            <View style={[divStyle, { backgroundColor: colors.border }]} />
            <MetricRow label="MA 20" value={fmtPrice(technical.ma20)} />
            <MetricRow label="MA 50" value={fmtPrice(technical.ma50)} />
            <MetricRow label="MA 200" value={fmtPrice(technical.ma200)} />
            <View style={[divStyle, { backgroundColor: colors.border }]} />
            <MetricRow label="Support" value={fmtPrice(technical.support)} />
            <MetricRow label="Resistance" value={fmtPrice(technical.resistance)} />
            <MetricRow label="Bollinger Upper" value={fmtPrice(technical.bollingerUpper)} />
            <MetricRow label="Bollinger Lower" value={fmtPrice(technical.bollingerLower)} />
          </View>
        </SectionCard>

        {/* Fundamental */}
        <SectionCard
          title="FUNDAMENTAL"
          icon={<Ionicons name="business" size={16} color={colors.primary} />}
          score={fundamental.score}
          scoreColor={scoreColor(fundamental.score)}
        >
          <View style={{ padding: 16 }}>
            <MetricRow label="P/E Ratio" value={fmtNum(fundamental.pe)} />
            <MetricRow label="P/B Ratio" value={fmtNum(fundamental.pb)} />
            <MetricRow label="EPS" value={fundamental.eps != null ? fmtPrice(fundamental.eps) : '—'} />
            <View style={[divStyle, { backgroundColor: colors.border }]} />
            <MetricRow label="Revenue Growth" value={fmtPct(fundamental.revenueGrowth)}
              highlight={fundamental.revenueGrowth != null ? (fundamental.revenueGrowth > 0 ? colors.buyColor : colors.sellColor) : undefined}
            />
            <MetricRow label="Earnings Growth" value={fmtPct(fundamental.earningsGrowth)}
              highlight={fundamental.earningsGrowth != null ? (fundamental.earningsGrowth > 0 ? colors.buyColor : colors.sellColor) : undefined}
            />
            <MetricRow label="Profit Margin" value={fmtPct(fundamental.profitMargin)} />
            <MetricRow label="Return on Equity" value={fmtPct(fundamental.returnOnEquity)} />
            <MetricRow label="Debt / Equity" value={fmtNum(fundamental.debtEquity)} />
            <MetricRow label="Dividend Yield" value={fmtPct(fundamental.dividendYield)} />
          </View>
        </SectionCard>

        {/* Behavioral */}
        <SectionCard
          title="BEHAVIORAL"
          icon={<MaterialCommunityIcons name="chart-bell-curve-cumulative" size={16} color={colors.primary} />}
          score={behavioral.score}
          scoreColor={scoreColor(behavioral.score)}
        >
          <View style={{ padding: 16 }}>
            {behavioral.analystCount > 0 && (
              <>
                <Text style={[behavStyles.consensusLabel, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                  Analyst Consensus — {behavioral.analystRating} ({behavioral.analystCount} analysts)
                </Text>
                <AnalystBar buy={behavioral.buyCount} hold={behavioral.holdCount} sell={behavioral.sellCount} total={behavioral.analystCount} />
                <View style={[divStyle, { backgroundColor: colors.border, marginTop: 12 }]} />
              </>
            )}
            {behavioral.priceTarget != null && (
              <MetricRow
                label="Analyst Price Target"
                value={`${fmtPrice(behavioral.priceTarget)} (${((behavioral.priceTarget - data.currentPrice) / data.currentPrice * 100) > 0 ? '+' : ''}${((behavioral.priceTarget - data.currentPrice) / data.currentPrice * 100).toFixed(1)}%)`}
                highlight={behavioral.priceTarget > data.currentPrice ? colors.buyColor : colors.sellColor}
              />
            )}
            <MetricRow label="Short Interest" value={behavioral.shortInterest != null ? fmtPct(behavioral.shortInterest) : '—'}
              highlight={behavioral.shortInterest != null && behavioral.shortInterest > 0.15 ? colors.sellColor : undefined}
            />
            <MetricRow label="Sentiment" value={behavioral.insiderSentiment.charAt(0).toUpperCase() + behavioral.insiderSentiment.slice(1)}
              highlight={behavioral.insiderSentiment === 'positive' ? colors.buyColor : behavioral.insiderSentiment === 'negative' ? colors.sellColor : undefined}
            />
          </View>
        </SectionCard>

        {/* AI Reasoning */}
        <View style={[cardStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={{ padding: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Ionicons name="sparkles" size={16} color={colors.primary} />
              <Text style={[cardStyles.title, { color: colors.foreground, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.5 }]}>AI REASONING</Text>
            </View>
            <Text style={[reasonStyles.text, { color: colors.foreground, fontFamily: 'Inter_400Regular' }]}>
              {recommendation.reasoning}
            </Text>
          </View>
        </View>

        {/* Strengths & Risks */}
        <View style={srStyles.row}>
          <View style={[srStyles.col, { backgroundColor: colors.buyBg, borderColor: colors.buyColor }]}>
            <Text style={[srStyles.title, { color: colors.buyColor, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.5 }]}>STRENGTHS</Text>
            {recommendation.strengths.map((s, i) => (
              <View key={i} style={srStyles.item}>
                <Ionicons name="checkmark-circle" size={13} color={colors.buyColor} />
                <Text style={[srStyles.itemText, { color: colors.foreground, fontFamily: 'Inter_400Regular' }]}>{s}</Text>
              </View>
            ))}
          </View>
          <View style={[srStyles.col, { backgroundColor: colors.sellBg, borderColor: colors.sellColor }]}>
            <Text style={[srStyles.title, { color: colors.sellColor, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.5 }]}>RISKS</Text>
            {recommendation.risks.map((r, i) => (
              <View key={i} style={srStyles.item}>
                <Ionicons name="warning" size={13} color={colors.sellColor} />
                <Text style={[srStyles.itemText, { color: colors.foreground, fontFamily: 'Inter_400Regular' }]}>{r}</Text>
              </View>
            ))}
          </View>
        </View>

        <Text style={[discStyle, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
          For informational purposes only. Not financial advice.
        </Text>
      </ScrollView>
    </View>
  );
}

const divStyle = { height: 1, marginVertical: 4 };
const discStyle = { textAlign: 'center' as const, fontSize: 11, paddingHorizontal: 20, marginTop: 8 };

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { padding: 14 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  loadingTitle: { fontSize: 18, marginTop: 16 },
  loadingSubtitle: { fontSize: 14, textAlign: 'center' },
  errorTitle: { fontSize: 18, marginTop: 12 },
  errorMsg: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  retryBtn: { marginTop: 16, paddingHorizontal: 32, paddingVertical: 12, borderRadius: 8 },
  retryText: { fontSize: 15 },
});

const headerStyles = StyleSheet.create({
  container: { paddingBottom: 12, borderBottomWidth: 1 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 8 },
  back: { padding: 4 },
  center: { flex: 1 },
  symbol: { fontSize: 20 },
  company: { fontSize: 12 },
  priceArea: { alignItems: 'flex-end' },
  price: { fontSize: 18 },
  change: { fontSize: 12 },
});

const recStyles = StyleSheet.create({
  hero: { borderRadius: 12, borderWidth: 1, padding: 18, marginBottom: 12 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  actionLabel: { fontSize: 10, letterSpacing: 1.5 },
  action: { fontSize: 36 },
  confidenceBadge: { padding: 10, borderRadius: 10, alignItems: 'center', backgroundColor: 'transparent' },
  confidenceNum: { fontSize: 22 },
  confidenceLabel: { fontSize: 10 },
  horizon: { fontSize: 12, marginBottom: 14 },
  targetsRow: { flexDirection: 'row', borderTopWidth: 1, paddingTop: 14, justifyContent: 'space-around' },
  targetItem: { alignItems: 'center', gap: 4 },
  targetLabel: { fontSize: 10 },
  targetValue: { fontSize: 14 },
});

const rangeStyles = StyleSheet.create({
  card: { borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 12 },
  labels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  text: { fontSize: 11 },
  track: { height: 4, borderRadius: 2, position: 'relative', marginBottom: 8 },
  thumb: { position: 'absolute', top: -4, width: 12, height: 12, borderRadius: 6, marginLeft: -6 },
  mktCap: { fontSize: 11 },
});

const rsiStyles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  label: { fontSize: 12, width: 60 },
  track: { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden', position: 'relative' },
  fill: { height: '100%', borderRadius: 4 },
  marker: { position: 'absolute', top: 0, width: 2, height: '100%' },
  value: { fontSize: 14, width: 40, textAlign: 'right' },
});

const behavStyles = StyleSheet.create({
  consensusLabel: { fontSize: 12, marginBottom: 10 },
});

const reasonStyles = StyleSheet.create({
  text: { fontSize: 14, lineHeight: 22 },
});

const srStyles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  col: { flex: 1, borderRadius: 12, borderWidth: 1, padding: 12, gap: 8 },
  title: { fontSize: 11, marginBottom: 2 },
  item: { flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
  itemText: { fontSize: 12, flex: 1, lineHeight: 17 },
});
