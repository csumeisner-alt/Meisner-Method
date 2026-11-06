import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Modal,
  Pressable,
  Alert,
  Linking,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ActivityIndicator,
  Animated,
  TextInput,
  useWindowDimensions,
  Share,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQueries } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useColors } from '@/hooks/useColors';
import { getFomcRateMovement } from '@/lib/fomcRateMovement';
import { getCpiAnnualRateChange } from '@/lib/cpiAnnualRateChange';
import { useApi } from '@/hooks/useApi';
import { useAmericanMode } from '@/contexts/AmericanModeContext';
import { useAchievements } from '@/contexts/AchievementsContext';
import {
  getGetStockChartQueryOptions,
  getGetStockChartQueryKey,
  useAnalyzeStock,
  useGetStockChart,
} from '@workspace/api-client-react';
import type { StockAnalysis } from '@workspace/api-client-react';
import { ComparisonChart } from '@/components/ComparisonChart';
import { CommodityRelationshipPanel } from '@/components/CommodityRelationshipPanel';
import type { HeatMapQuote } from '@workspace/api-client-react';
import { getGetMarketBreadthQueryKey, useGetMarketBreadth } from '@workspace/api-client-react';
import type { Candle } from '@/components/StockChart';
import { alignCandleSeriesOnSharedDatesAcrossSeries } from '@/lib/alignCandleSeries';
import {
  addProviderAdjustedReturns,
  alignProviderAdjustedReturnsAcrossSeries,
  calculateRelativeReturnPercent,
} from '@/lib/etfAdjustedReturns';
import type { ProviderAdjustedReturnSeries } from '@/lib/etfAdjustedReturns';
import { AmericanSteelBackground } from '@/components/AmericanSteelBackground';
import { NeonAnalysisLoader } from '@/components/NeonAnalysisLoader';
import { PriceAlertModal } from '@/components/PriceAlertModal';
import { useWatchlist } from '@/hooks/useWatchlist';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import {
  compareEtfHoldingSnapshots,
  createEtfHoldingSnapshot,
  findReportedEtfHoldingsOverlap,
  formatReportedEtfHoldingsOverlapShare,
  formatEtfComparisonValue,
  formatEtfProfileAssets,
  estimateEtfFeeDollars,
  getEtfFeeComparisonStatus,
  getReportedEtfSectorComparison,
  isValidEtfExpenseRatio,
  isValidEtfTrackingHistory,
  parseEtfFeeInvestmentAmount,
  parseSavedEtfComparisonSymbols,
  parseSavedEtfHoldingSnapshots,
  rotateSavedEtfComparisonFocus,
  shareEtfOverlapSummary,
  upsertSavedEtfHoldingSnapshot,
} from '@/lib/heatMapDetail';
import {
  buildEtfScoreHistory,
  calculateEtfResearchScore,
  clearEtfScoreSnapshots,
  createEtfScoreSnapshot,
  CURRENT_ETF_SCORE_METHODOLOGY,
  findComparableEtfScoreChange,
  parseEtfScoreSnapshots,
  persistEtfScoreSnapshot,
  removeEtfScoreSnapshot,
} from '@/lib/etfResearchScore';
import type {
  EtfScoreChangeResult,
  EtfScoreHistoryEntry,
  EtfScoreSnapshot,
  EtfScoreComponentId,
} from '@/lib/etfResearchScore';
import type { HeatMapEtfHoldingSnapshot } from '@/lib/heatMapDetail';
import { formatHeatMapQuoteAge, isDisplayableHeatMapQuote } from '@/lib/heatMapQuoteDisplay';
import { formatCommodityQuotePrice, getCommodityContractSpec } from '@/lib/heatMapInstrumentDisplay';
import {
  createCommodityScoreSnapshot,
  findComparableCommodityScoreChange,
  parseCommodityScoreSnapshots,
  upsertCommodityScoreSnapshot,
} from '@/lib/commodityIntelligenceScore';
import type {
  CommodityScoreCategoryInput,
  CommodityScoreComparison,
} from '@/lib/commodityIntelligenceScore';
import {
  calculateEtfScenarioBreakdown,
  ETF_CONTRIBUTION_CADENCES,
  ETF_SCENARIO_INITIAL_INVESTMENT,
  ETF_SCENARIO_LABELS,
  ETF_SCENARIO_HORIZONS,
  parseEtfContributionCadence,
  parseEtfScenarios,
} from '@/lib/etfScenario';
import type { EtfContributionCadence, EtfScenario } from '@/lib/etfScenario';
import {
  formatAnalysisLoadingStage,
  getAnalysisLoadingStageInterval,
  getAnalysisLoadingStages,
} from '@/lib/analysisLoadingStages';
import {
  APP_REVIEW_STORAGE_KEY,
  parseAppReviewState,
  recordSuccessfulAnalysis,
} from '@/lib/appReview';

// ─── Constants ────────────────────────────────────────────────────────────────

// ─── Constants ────────────────────────────────────────────────────────────────

const PINNED_COMP_KEY = '@stocksense/pinned_comp_symbol';
const ETF_COMPARISON_KEY = '@stocksense/etf_comparison_symbols_v1';
const ETF_HOLDING_SNAPSHOTS_KEY = '@stocksense/etf_holding_snapshots_v1';
const ETF_SCORE_SNAPSHOTS_KEY = '@stocksense/etf_score_snapshots_v1';
const COMMODITY_SCORE_SNAPSHOTS_KEY = '@stocksense/commodity_intelligence_snapshots_v1';
let commodityScoreSnapshotWriteQueue: Promise<void> = Promise.resolve();
const ETF_CONTRIBUTION_CADENCE_KEY = '@stocksense/etf_contribution_cadence_v1';
const ETF_FEE_AMOUNT_PRESETS = [
  { amount: 1_000, label: '$1,000' },
  { amount: 5_000, label: '$5,000' },
  { amount: 10_000, label: '$10,000' },
  { amount: 25_000, label: '$25,000' },
] as const;
const UNAVAILABLE_ADJUSTED_RETURN_SERIES: ProviderAdjustedReturnSeries = {
  status: 'unavailable',
  method: 'provider_adjusted_close',
  values: [],
  reason: 'Provider did not supply a verified adjusted-return series.',
};

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

// ── Chart period config ────────────────────────────────────────────────────────

type Period = '1mo' | '3mo' | '6mo' | '1y' | '2y';
const PERIODS: { label: string; value: Period }[] = [
  { label: '1M', value: '1mo' },
  { label: '3M', value: '3mo' },
  { label: '6M', value: '6mo' },
  { label: '1Y', value: '1y'  },
  { label: '2Y', value: '2y'  },
];

const ETF_ANALYSIS_SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'risk-costs', label: 'Risk & Costs' },
  { id: 'holdings', label: 'Holdings & Diversification' },
  { id: 'performance', label: 'Performance' },
  { id: 'ai-analysis', label: 'AI Analysis' },
  { id: 'projections', label: 'Future Projections' },
] as const;
type EtfAnalysisSectionId = typeof ETF_ANALYSIS_SECTIONS[number]['id'];

const COMMODITY_ANALYSIS_SECTIONS = [
  { id: 'scorecard', label: 'Scorecard' },
  { id: 'relationships', label: 'Relationships' },
  { id: 'events', label: 'Events' },
  { id: 'supply-demand', label: 'Supply & demand' },
  { id: 'market-score', label: 'Market score' },
  { id: 'evidence', label: 'Evidence' },
  { id: 'drivers', label: 'Drivers' },
  { id: 'ai-context', label: 'AI context' },
  { id: 'news', label: 'News' },
] as const;
type CommodityAnalysisSectionId = typeof COMMODITY_ANALYSIS_SECTIONS[number]['id'];

type HelpTopic = 'technical' | 'fundamental';

const METRIC_GUIDES: Record<HelpTopic, {
  title: string;
  intro: string;
  items: { term: string; explanation: string }[];
}> = {
  technical: {
    title: 'Understanding technicals',
    intro: 'Technical analysis looks at price and trading activity to describe momentum, trend, and levels where buyers or sellers have reacted before.',
    items: [
      { term: 'Score', explanation: 'A 0–100 summary of the technical signals shown here. A higher score means more of the signals are currently supportive, not that a profit is guaranteed.' },
      { term: 'RSI (14)', explanation: 'Relative Strength Index measures recent price momentum on a 0–100 scale. Below 30 can mean the stock has been sold heavily; above 70 can mean it has risen quickly. It is a clue, not an automatic buy or sell signal.' },
      { term: 'Trend', explanation: 'The stock’s recent direction. Uptrend means prices have generally been making progress higher; downtrend means they have generally been moving lower.' },
      { term: 'MACD Signal', explanation: 'A momentum comparison between short- and long-term price averages. Bullish suggests momentum is improving; bearish suggests momentum is weakening.' },
      { term: 'Volume vs Avg', explanation: 'Today’s trading volume compared with its recent average. 2.00x means about twice the usual number of shares are changing hands.' },
      { term: 'MA 20 / 50 / 200', explanation: 'Moving averages smooth price over 20, 50, or 200 trading days. Shorter averages react faster; the 200-day average gives a longer-term reference point.' },
      { term: 'Support', explanation: 'An estimated price area where buyers have stepped in before. It can act like a floor, but it can also break.' },
      { term: 'Resistance', explanation: 'An estimated price area where sellers have appeared before. It can act like a ceiling, but it can also be exceeded.' },
      { term: 'Bollinger Upper / Lower', explanation: 'The upper and lower edges of a moving price range. A wider gap usually means more volatility; touching an edge does not by itself mean the price must reverse.' },
    ],
  },
  fundamental: {
    title: 'Understanding fundamentals',
    intro: 'Fundamental analysis looks at a company’s business performance, valuation, profitability, debt, and shareholder payments.',
    items: [
      { term: 'Score', explanation: 'A 0–100 summary of the fundamental measures shown here. It reflects the current data available and is not a prediction of future returns.' },
      { term: 'P/E Ratio', explanation: 'Price-to-earnings compares the share price with earnings per share. A higher number means investors are paying more for each dollar of current earnings.' },
      { term: 'P/B Ratio', explanation: 'Price-to-book compares the company’s market value with the accounting value of its assets minus liabilities. It is most useful when compared with similar companies.' },
      { term: 'EPS', explanation: 'Earnings per share is the portion of the company’s profit assigned to each share. It helps put the company’s total earnings into a per-share context.' },
      { term: 'Revenue Growth', explanation: 'How quickly the company’s sales are increasing or decreasing. Growth is generally encouraging, but growth that does not become profit may not be sustainable.' },
      { term: 'Earnings Growth', explanation: 'How quickly profit is increasing or decreasing. It can differ from revenue growth because costs, taxes, and other expenses affect earnings.' },
      { term: 'Profit Margin', explanation: 'The percentage of revenue left as profit after expenses. A 20% margin means the company keeps about $0.20 from each $1.00 of revenue.' },
      { term: 'Return on Equity', explanation: 'Profit generated for each dollar shareholders have invested in the company. Compare it with companies in the same industry because business models differ.' },
      { term: 'Debt / Equity', explanation: 'The company’s debt compared with shareholders’ equity. More debt can increase risk, especially when interest rates or cash needs rise.' },
      { term: 'Dividend Yield', explanation: 'Estimated yearly dividend payments as a percentage of the share price. Dividends can change or be suspended, so yield is not guaranteed income.' },
    ],
  },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function ScoreBar({ score, color }: { score: number; color: string }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const animation = Animated.timing(anim, { toValue: score / 100, duration: 900, useNativeDriver: false });
    animation.start();
    return () => animation.stop();
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

function EtfScoreGauge({ score }: { score: number }) {
  const colors = useColors();
  const progress = useRef(new Animated.Value(0)).current;
  const size = 152;
  useEffect(() => {
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: 700,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [progress, score]);
  const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] });
  return (
    <Animated.View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center', transform: [{ scale }] }} accessibilityLabel={`Research score ${score} out of 100`}>
      <View style={{ position: 'absolute', width: size - 8, height: size - 8, borderRadius: size, borderWidth: 8, borderColor: colors.border, backgroundColor: colors.background, shadowColor: colors.primary, shadowOpacity: 0.22, shadowRadius: 12, elevation: 3 }} />
      {Array.from({ length: 40 }, (_, index) => {
        const angle = (index / 40) * Math.PI * 2;
        const radius = size / 2 - 7;
        const active = index < Math.round(score / 100 * 40);
        return (
          <View key={`score-tick-${index}`} style={{
            position: 'absolute',
            left: size / 2 + Math.sin(angle) * radius - 1.5,
            top: size / 2 - Math.cos(angle) * radius - 4,
            width: 3,
            height: 8,
            borderRadius: 2,
            backgroundColor: active ? colors.primary : colors.border,
            opacity: active ? 1 : 0.42,
            transform: [{ rotate: `${index * 9}deg` }],
          }} />
        );
      })}
      <LinearGradient colors={[`${colors.primary}20`, 'transparent']} style={{ position: 'absolute', width: 104, height: 104, borderRadius: 52 }} />
      <Text style={{ color: colors.primary, fontFamily: 'Inter_700Bold', fontSize: 42, textShadowColor: `${colors.primary}55`, textShadowRadius: 10 }}>{score}</Text>
      <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium', fontSize: 12, marginTop: -2 }}>OUT OF 100</Text>
    </Animated.View>
  );
}
function EtfCardEntrance({ children }: { children: React.ReactNode }) {
  const entrance = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const animation = Animated.timing(entrance, {
      toValue: 1,
      duration: 320,
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [entrance]);
  return (
    <Animated.View style={{
      opacity: entrance,
      transform: [{ translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
    }}>
      {children}
    </Animated.View>
  );
}

function EtfMarketIntelligence({ quotes, updatedAt }: { quotes: HeatMapQuote[]; updatedAt: number }) {
  const colors = useColors();
  const valid = quotes.filter((quote) => Number.isFinite(quote.price) && quote.price > 0
    && Number.isFinite(quote.priceChangePercent));
  const advancing = valid.filter((quote) => quote.priceChangePercent > 0).length;
  const declining = valid.filter((quote) => quote.priceChangePercent < 0).length;
  const breadthPct = valid.length ? advancing / valid.length * 100 : null;
  const meanMove = valid.length
    ? valid.reduce((sum, quote) => sum + quote.priceChangePercent, 0) / valid.length
    : null;
  const volatility = valid.flatMap((quote) => quote.annualizedVolatilityPercent == null
    ? [] : [quote.annualizedVolatilityPercent]).sort((a, b) => a - b);
  const medianVolatility = volatility.length
    ? volatility[Math.floor(volatility.length / 2)] : null;
  const strength = breadthPct == null ? null : Math.round(breadthPct);
  const trend = meanMove == null ? 'Unavailable'
    : meanMove > 0.15 ? 'Broadly rising' : meanMove < -0.15 ? 'Broadly falling' : 'Mixed / flat';
  const risks = [
    declining > advancing ? 'More tracked stocks are down than up.' : null,
    medianVolatility != null && medianVolatility >= 30 ? 'Median realized volatility is elevated.' : null,
    valid.length < 10 ? 'Limited valid quote coverage; interpret breadth cautiously.' : null,
  ].filter((item): item is string => item !== null);
  const meterColor = strength != null && strength >= 60 ? colors.buyColor
    : strength != null && strength <= 40 ? colors.sellColor : colors.primary;
  return (
    <EtfCardEntrance>
    <View testID="etf-market-intelligence" style={{ marginBottom: 14, borderRadius: 16, borderWidth: 1, borderColor: `${colors.primary}88`, backgroundColor: colors.card, overflow: 'hidden' }}>
      <LinearGradient colors={[`${colors.primary}22`, 'transparent', `${colors.primary}08`]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ padding: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
          <MaterialCommunityIcons name="pulse" size={21} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.primary, fontFamily: 'Inter_700Bold', fontSize: 12, letterSpacing: 1 }}>MEISNER MARKET INTELLIGENCE</Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 3 }}>U.S. equity breadth · {valid.length} valid quotes</Text>
          </View>
          <Text style={{ color: meterColor, fontFamily: 'Inter_700Bold', fontSize: 13 }}>{trend}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
          <View style={{ flex: 1, borderRadius: 12, padding: 12, backgroundColor: `${colors.background}99` }}>
            <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Market strength</Text>
            <Text style={{ color: meterColor, fontFamily: 'Inter_700Bold', fontSize: 26, marginTop: 3 }}>{strength == null ? '—' : `${strength}`}</Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>advancing share</Text>
            <View style={{ height: 5, backgroundColor: colors.border, borderRadius: 5, overflow: 'hidden', marginTop: 8 }}>
              <View style={{ height: '100%', width: `${strength ?? 0}%`, backgroundColor: meterColor }} />
            </View>
          </View>
          <View style={{ flex: 1, borderRadius: 12, padding: 12, backgroundColor: `${colors.background}99`, justifyContent: 'center' }}>
            <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Breadth · up / down</Text>
            <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 20, marginTop: 7 }}>{valid.length ? `${advancing} / ${declining}` : '—'}</Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 5 }}>Daily average {meanMove == null ? '—' : `${meanMove > 0 ? '+' : ''}${meanMove.toFixed(2)}%`}</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 11 }}>
          <Text style={{ color: colors.foreground, fontSize: 12, paddingVertical: 5, paddingHorizontal: 9, borderRadius: 20, backgroundColor: colors.background }}>
            Momentum · {meanMove == null ? 'Unavailable' : meanMove > 0.15 ? 'Positive' : meanMove < -0.15 ? 'Negative' : 'Neutral'}
          </Text>
          <Text style={{ color: colors.foreground, fontSize: 12, paddingVertical: 5, paddingHorizontal: 9, borderRadius: 20, backgroundColor: colors.background }}>
            Volatility · {medianVolatility == null ? 'Unavailable' : `${medianVolatility.toFixed(1)}% median annualized`}
          </Text>
        </View>
        {risks.length > 0 && (
          <View style={{ marginTop: 12 }}>
            <Text style={{ color: colors.holdColor, fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>RISKS TO WATCH</Text>
            {risks.map((risk) => <Text key={risk} style={{ color: colors.mutedForeground, fontSize: 13, lineHeight: 19, marginTop: 4 }}>• {risk}</Text>)}
          </View>
        )}
        <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16, marginTop: 12 }}>
          Market snapshot updated {Number.isFinite(updatedAt) ? new Date(updatedAt).toLocaleString() : 'at an unreported time'}. Daily breadth summarizes tracked U.S. stocks; it is context, not an ETF forecast.
        </Text>
      </LinearGradient>
    </View>
    </EtfCardEntrance>
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
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, gap: 10 },
  label: { fontSize: 14, lineHeight: 20, flexShrink: 1 },
  value: { fontSize: 14, lineHeight: 20, textAlign: 'right', flexShrink: 0 },
});

function EtfSectionAnchor({
  sectionId,
  title,
  onLayout,
  onRef,
}: {
  sectionId: EtfAnalysisSectionId;
  title: string;
  onLayout: (sectionId: EtfAnalysisSectionId, y: number) => void;
  onRef: (sectionId: EtfAnalysisSectionId, view: View | null) => void;
}) {
  const colors = useColors();
  return (
    <View
      testID={`etf-section-${sectionId}`}
      ref={(view) => onRef(sectionId, view)}
      onLayout={(event) => onLayout(sectionId, event.nativeEvent.layout.y)}
      style={{ paddingTop: 8, paddingBottom: 10 }}
      accessibilityLabel={`${title} section`}
    >
      <Text style={{
        color: colors.primary,
        fontFamily: 'Inter_700Bold',
        fontSize: 11,
        letterSpacing: 1,
        textTransform: 'uppercase',
      }}>
        {title}
      </Text>
    </View>
  );
}

function SectionCard({ title, icon, score, scoreColor, children, helpTopic, onHelp, collapsible = false, defaultExpanded = false }: {
  title: string;
  icon: React.ReactNode;
  score?: number;
  scoreColor?: string;
  children: React.ReactNode;
  helpTopic?: HelpTopic;
  onHelp?: (topic: HelpTopic) => void;
  collapsible?: boolean;
  defaultExpanded?: boolean;
}) {
  const colors = useColors();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const Header = collapsible ? Pressable : View;
  return (
    <View style={[cardStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Header
        style={cardStyles.header}
        {...(collapsible ? {
          onPress: () => setExpanded((current) => !current),
          accessibilityRole: 'button' as const,
          accessibilityState: { expanded },
          accessibilityLabel: `Toggle ${title.toLowerCase()} section`,
          testID: `analysis-section-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        } : {})}
      >
        <View style={cardStyles.titleRow}>
          {icon}
          <Text style={[cardStyles.title, { color: colors.foreground, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.5, flex: 1 }]}>{title}</Text>
          {helpTopic && onHelp && (
            <TouchableOpacity
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                onHelp(helpTopic);
              }}
              style={cardStyles.helpButton}
              hitSlop={8}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Understand ${title.toLowerCase()} metrics`}
            >
              <Feather name="help-circle" size={17} color={colors.primary} />
            </TouchableOpacity>
          )}
          {collapsible && (
            <Feather name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.mutedForeground} />
          )}
        </View>
        {score != null && scoreColor && (
          <View style={cardStyles.scoreRow}>
            <Text style={[cardStyles.scoreLabel, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>Score</Text>
            <ScoreBar score={score} color={scoreColor} />
          </View>
        )}
      </Header>
      <View style={[cardStyles.divider, { backgroundColor: colors.border }]} />
      {(!collapsible || expanded) && children}
    </View>
  );
}
const cardStyles = StyleSheet.create({
  card: { borderRadius: 12, borderWidth: 1, marginBottom: 14, overflow: 'hidden' },
  header: { padding: 16, paddingBottom: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  title: { fontSize: 15 },
  helpButton: { marginLeft: 1 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  scoreLabel: { fontSize: 11 },
  divider: { height: 1 },
});

function CommoditySectionAnchor({
  sectionId,
  title,
  onLayout,
  onRef,
  children,
}: {
  sectionId: CommodityAnalysisSectionId;
  title: string;
  onLayout: (sectionId: CommodityAnalysisSectionId, y: number) => void;
  onRef: (sectionId: CommodityAnalysisSectionId, view: View | null) => void;
  children: React.ReactNode;
}) {
  return (
    <View
      testID={`commodity-section-${sectionId}`}
      ref={(view) => onRef(sectionId, view)}
      onLayout={(event) => onLayout(sectionId, event.nativeEvent.layout.y)}
      accessibilityLabel={`${title} section`}
    >
      {children}
    </View>
  );
}

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

function shuffledLoadingPhrases(): string[] {
  const phrases = [...getAnalysisLoadingStages(true)];
  for (let index = phrases.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [phrases[index], phrases[randomIndex]] = [phrases[randomIndex], phrases[index]];
  }
  return phrases;
}

type EtfAnalysisPayload = {
  fundCategory: string | null;
  fundFamily: string | null;
  expenseRatio: number | null;
  totalAssets: number | null;
  dividendYield: number | null;
  beta3Year: number | null;
  averageVolume: number | null;
  topHoldingsCombinedWeight: number | null;
  topHoldingsReportedCount: number;
  topHoldingsRetrievedAt: string;
  sectorWeights: { sector: string; weight: number }[];
  sectorWeightsRetrievedAt: string;
  annualizedReturn: number | null;
  annualizedVolatility: number | null;
  maxDrawdown: number | null;
  riskAdjustedReturn: number | null;
  topHoldings: { symbol: string; name: string; weight: number | null }[];
  benchmark: {
    symbol: string;
    name: string;
    source: string;
    asOf: string;
  } | null;
  trackingComparison: {
    periodStart: string;
    periodEnd: string;
    monthlySamples: number;
    fundAnnualizedReturn: number;
    benchmarkAnnualizedReturn: number;
    trackingDifference: number;
    trackingError: number;
    source: string;
    asOf: string;
  } | null;
  peerExpenseComparison: {
    category: string;
    fundExpenseRatio: number | null;
    categoryAverageExpenseRatio: number;
    difference: number | null;
    sampleSize: number | null;
    sampleContext: string;
    source: string;
    asOf: string;
  } | null;
  peerAssetSizeComparison: {
    category: string;
    fundTotalAssets: number | null;
    categoryAverageTotalAssets: number;
    difference: number | null;
    sampleSize: number | null;
    sampleContext: string;
    source: string;
    asOf: string;
  } | null;
  marketRegime: {
    benchmarkSymbol: string;
    firstYear: number;
    lastYear: number;
    periods: Record<string, { averageAnnualReturn: number | null; years: number }>;
  } | null;
  scenarios?: unknown;
  analysis: string;
  risks: string[];
  strengths: string[];
  provider: string;
  asOf: string;
};

type CommodityAnalysisPayload = {
  score: number;
  confidence: number;
  dataCoveragePercent: number;
  observationCount: number;
  historyAsOf: string | null;
  family: 'metals' | 'energy' | 'agriculture' | 'livestock';
  annualizedVolatilityPercent: number;
  oneMonthReturnPercent: number | null;
  threeMonthReturnPercent: number | null;
  sixMonthReturnPercent: number | null;
  intelligenceScorecard: {
    version: 1;
    score: number;
    coveragePercent: number;
    coverageStatus: 'complete' | 'partial' | 'insufficient';
    missingCategories: string[];
    categories: {
      id: 'technical-momentum' | 'fundamentals' | 'supply-demand' | 'market-environment' | 'risk-volatility';
      label: string;
      score: number | null;
      weight: number;
      classification: 'bullish' | 'bearish' | 'neutral' | 'unavailable';
      detail: string;
      methodology: string;
      sources: { title: string; url: string; asOf: string; unit: string; observation: string }[];
    }[];
    positiveContributors: string[];
    negativeContributors: string[];
    methodology: string;
  };
  factors: {
    key: string;
    label: string;
    status: 'available' | 'unavailable';
    score: number | null;
    weight: number;
    detail: string;
    sources: { title: string; url: string; asOf: string; unit: string; observation: string }[];
  }[];
  methodology: string;
  reasoning: string;
  risks: string[];
  strengths: string[];
  analysisGuide: {
    focus: string[];
    unavailable: string[];
    monitorNext: string[];
  };
  verifiedEvidence: {
    id: string;
    title: string;
    url: string;
    asOf: string;
    unit: string;
    observation: string;
    kind: 'market-data' | 'news';
    eventDate: string | null;
  }[];
  commentary: {
    status: 'available' | 'unavailable';
    currentDrivers: { text: string; evidenceIds: string[] }[];
    strongestBullishFactors: { text: string; evidenceIds: string[] }[];
    strongestBearishFactors: { text: string; evidenceIds: string[] }[];
    technicalAlignment: { text: string; evidenceIds: string[] } | null;
    upcomingCatalysts: { text: string; evidenceIds: string[] }[];
    risks: { text: string; evidenceIds: string[] }[];
    monitorNext: string[];
  };
  newsContext: {
    status: 'available' | 'unavailable';
    summary: string | null;
    retrievedAt: string | null;
    sources: { title: string; url: string; publishedAt: string | null }[];
  };
  eventCalendar: {
    status: 'available' | 'partial' | 'unavailable';
    checkedAt: string;
    events: {
      id: string;
      name: string;
      eventDate: string;
      time: string | null;
      timezone: string | null;
      status: 'upcoming' | 'completed';
      affectedCommodities: string[];
      source: { title: string; url: string; publicationDate: string | null };
      annualRateHistory?: {
        referenceMonth: string;
        rate: number;
        units: string;
        source: { title: string; url: string; publicationDate: string };
      }[];
      values: {
        previous: {
          value: number;
          upperBound?: number;
          units: string;
          annualRate?: {
            value: number;
            units: string;
            source: { title: string; url: string; publicationDate: string };
          } | null;
          source?: { title: string; url: string; publicationDate: string };
        } | null;
        consensus: {
          value: number;
          upperBound?: number;
          units: string;
          annualRate?: {
            value: number;
            units: string;
            source: { title: string; url: string; publicationDate: string };
          } | null;
          source?: { title: string; url: string; publicationDate: string };
        } | null;
        actual: {
          value: number;
          upperBound?: number;
          units: string;
          annualRate?: {
            value: number;
            units: string;
            source: { title: string; url: string; publicationDate: string };
          } | null;
          source?: { title: string; url: string; publicationDate: string };
        } | null;
      };
    }[];
    unavailable: string[];
  };
  supplyDemand: {
    status: 'available' | 'partial' | 'unavailable';
    commodity: string;
    series: {
      id: 'inventory' | 'production' | 'consumption' | 'imports' | 'exports' | 'animal-inventory';
      label: string;
      status: 'available' | 'unavailable';
      units: string | null;
      points: {
        commodity: string;
        value: number;
        units: string;
        reportingPeriod: string;
        publicationDate: string;
        revisionDate?: string;
        source: { title: string; url: string };
      }[];
      historicalAverage: number | null;
      historicalAveragePeriod: string | null;
      reason: string | null;
    }[];
    animalInventory?: {
      id: 'animal-inventory';
      label: string;
      status: 'available' | 'unavailable';
      units: string | null;
      points: {
        commodity: string;
        value: number;
        units: string;
        reportingPeriod: string;
        publicationDate: string;
        revisionDate?: string;
        source: { title: string; url: string };
      }[];
      historicalAverage: number | null;
      historicalAveragePeriod: string | null;
      reason: string | null;
    } | null;
  };
  provider: string;
};

function CommodityIntelligenceGauge({ score }: { score: number }) {
  const colors = useColors();
  const progress = useRef(new Animated.Value(0)).current;
  const size = 132;
  useEffect(() => {
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: 750,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [progress, score]);
  const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] });
  const scoreColor = score >= 60 ? colors.buyColor : score <= 40 ? colors.sellColor : colors.holdColor;
  return (
    <Animated.View
      accessibilityLabel={`Commodity intelligence score ${score} out of 100`}
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center', transform: [{ scale }] }}
    >
      <View style={{ position: 'absolute', width: size - 8, height: size - 8, borderRadius: size, borderWidth: 8, borderColor: colors.border, backgroundColor: colors.background, shadowColor: colors.primary, shadowOpacity: 0.2, shadowRadius: 12, elevation: 3 }} />
      {Array.from({ length: 36 }, (_, index) => {
        const angle = index / 36 * Math.PI * 2;
        const active = index < Math.round(score / 100 * 36);
        const radius = size / 2 - 7;
        return (
          <View
            key={`commodity-score-tick-${index}`}
            style={{
              position: 'absolute',
              left: size / 2 + Math.sin(angle) * radius - 1.5,
              top: size / 2 - Math.cos(angle) * radius - 3.5,
              width: 3,
              height: 7,
              borderRadius: 2,
              backgroundColor: active ? scoreColor : colors.border,
              opacity: active ? 1 : 0.42,
              transform: [{ rotate: `${index * 10}deg` }],
            }}
          />
        );
      })}
      <LinearGradient colors={[`${scoreColor}22`, 'transparent']} style={{ position: 'absolute', width: 86, height: 86, borderRadius: 43 }} />
      <Text style={{ color: scoreColor, fontFamily: 'Inter_700Bold', fontSize: 36 }}>{score}</Text>
      <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium', fontSize: 10, marginTop: -2 }}>OUT OF 100</Text>
    </Animated.View>
  );
}

function CommodityIntelligenceScorecard({
  symbol,
  scorecard,
}: {
  symbol: string;
  scorecard: CommodityAnalysisPayload['intelligenceScorecard'];
}) {
  const colors = useColors();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [historyChange, setHistoryChange] = useState<CommodityScoreComparison | null>(null);
  const [historyReady, setHistoryReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setHistoryReady(false);
    setHistoryChange(null);
    const saveSnapshot = async () => {
      try {
        const history = parseCommodityScoreSnapshots(
          await AsyncStorage.getItem(COMMODITY_SCORE_SNAPSHOTS_KEY),
        );
        if (cancelled) return;
        const snapshot = createCommodityScoreSnapshot({
          symbol,
          score: scorecard.score,
          scorecardVersion: scorecard.version,
          categories: scorecard.categories as CommodityScoreCategoryInput[],
          recordedAt: new Date().toISOString(),
        });
        const comparison = findComparableCommodityScoreChange(snapshot, history);
        const next = snapshot ? upsertCommodityScoreSnapshot(history, snapshot) : history;
        if (snapshot && !history.some((item) =>
          item.symbol === snapshot.symbol
          && item.score === snapshot.score
          && JSON.stringify(item.categoryScores) === JSON.stringify(snapshot.categoryScores)
          && JSON.stringify(item.sourceContexts) === JSON.stringify(snapshot.sourceContexts)
          && JSON.stringify(item.inputAsOf) === JSON.stringify(snapshot.inputAsOf),
        )) {
          await AsyncStorage.setItem(COMMODITY_SCORE_SNAPSHOTS_KEY, JSON.stringify(next));
        }
        if (!cancelled) {
          setHistoryChange(comparison);
          setHistoryReady(true);
        }
      } catch {
        if (!cancelled) {
          setHistoryChange({ status: 'unavailable' });
          setHistoryReady(true);
        }
      }
    };
    const queued = commodityScoreSnapshotWriteQueue.then(saveSnapshot);
    commodityScoreSnapshotWriteQueue = queued.then(() => undefined, () => undefined);
    return () => {
      cancelled = true;
    };
  }, [scorecard, symbol]);

  const classColor = (classification: CommodityAnalysisPayload['intelligenceScorecard']['categories'][number]['classification']) =>
    classification === 'bullish' ? colors.buyColor
      : classification === 'bearish' ? colors.sellColor
        : classification === 'neutral' ? colors.holdColor : colors.mutedForeground;
  const statusLabel = scorecard.coverageStatus === 'complete'
    ? 'Complete coverage'
    : scorecard.coverageStatus === 'partial'
      ? 'Partial coverage'
      : 'Insufficient coverage';
  return (
    <View testID="commodity-intelligence-scorecard" style={{ marginBottom: 14, borderRadius: 16, borderWidth: 1, borderColor: `${colors.primary}88`, backgroundColor: colors.card, overflow: 'hidden' }}>
      <LinearGradient colors={[`${colors.primary}24`, 'transparent', `${colors.primary}08`]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ padding: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <CommodityIntelligenceGauge score={scorecard.score} />
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={{ color: colors.primary, fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 1 }}>COMMODITY INTELLIGENCE</Text>
            <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 14 }}>{statusLabel}</Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{scorecard.coveragePercent}% weighted category coverage</Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 15 }}>Current evidence assessment only — not a prediction of future returns.</Text>
          </View>
        </View>
        <View style={{ marginTop: 14, borderRadius: 10, backgroundColor: `${colors.background}aa`, padding: 10, gap: 4 }}>
          <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 11 }}>WEIGHTED METHOD</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16 }}>{scorecard.methodology}</Text>
        </View>
        {scorecard.missingCategories.length > 0 && (
          <View testID="commodity-intelligence-missing" style={{ marginTop: 10, borderRadius: 10, backgroundColor: `${colors.holdColor}12`, padding: 10, gap: 4 }}>
            <Text style={{ color: colors.holdColor, fontFamily: 'Inter_600SemiBold', fontSize: 11 }}>MISSING CATEGORIES · WEIGHT HELD NEUTRAL</Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16 }}>
              {scorecard.missingCategories.join(', ')}. Missing category weights are not reassigned, so the total stays closer to neutral.
            </Text>
          </View>
        )}
        <View style={{ marginTop: 13, gap: 5 }}>
          {scorecard.categories.map((category) => {
            const isExpanded = Boolean(expanded[category.id]);
            const color = classColor(category.classification);
            return (
              <View key={category.id} testID={`commodity-intelligence-category-${category.id}`} style={{ borderTopWidth: 1, borderTopColor: `${colors.border}99` }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: isExpanded }}
                  accessibilityLabel={`${category.label}, ${category.score === null ? 'unavailable' : `${category.score} out of 100, ${category.classification}`}`}
                  onPress={() => setExpanded((current) => ({ ...current, [category.id]: !current[category.id] }))}
                  style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 8 }}
                  testID={`commodity-intelligence-category-toggle-${category.id}`}
                >
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>{category.label} · {category.weight}%</Text>
                    <View style={{ height: 4, borderRadius: 4, overflow: 'hidden', backgroundColor: colors.border }}>
                      <View style={{ width: `${category.score ?? 0}%`, height: '100%', backgroundColor: color }} />
                    </View>
                  </View>
                  <Text style={{ minWidth: 76, textAlign: 'right', color, fontFamily: 'Inter_700Bold', fontSize: 11 }}>
                    {category.score === null ? 'Unavailable' : `${category.score} · ${category.classification}`}
                  </Text>
                  <Feather name={isExpanded ? 'chevron-up' : 'chevron-down'} size={15} color={colors.mutedForeground} />
                </Pressable>
                {isExpanded && (
                  <View testID={`commodity-intelligence-category-detail-${category.id}`} style={{ paddingBottom: 10, gap: 6 }}>
                    <Text style={{ color: colors.foreground, fontSize: 11, lineHeight: 16 }}>{category.detail}</Text>
                    <Text style={{ color: colors.mutedForeground, fontSize: 10, lineHeight: 15 }}>Method: {category.methodology}</Text>
                    {category.sources.map((source) => (
                      <Pressable
                        key={`${source.url}-${source.asOf}`}
                        accessibilityRole="link"
                        accessibilityLabel={`Open source: ${source.title}, dated ${source.asOf}`}
                        onPress={() => { void Linking.openURL(source.url).catch(() => {}); }}
                      >
                        <Text style={{ color: colors.primary, fontSize: 10, lineHeight: 15, textDecorationLine: 'underline' }}>
                          {source.title} · {source.asOf} · {source.unit}
                        </Text>
                      </Pressable>
                    ))}
                    {category.sources.length === 0 && (
                      <Text style={{ color: colors.mutedForeground, fontSize: 10 }}>No validated supporting evidence is available.</Text>
                    )}
                  </View>
                )}
              </View>
            );
          })}
        </View>
        <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
          <View style={{ flex: 1, borderRadius: 10, padding: 10, backgroundColor: `${colors.buyColor}12` }}>
            <Text style={{ color: colors.buyColor, fontFamily: 'Inter_700Bold', fontSize: 10 }}>POSITIVE CONTRIBUTORS</Text>
            <Text style={{ color: colors.foreground, fontSize: 11, lineHeight: 16, marginTop: 4 }}>
              {scorecard.positiveContributors.length ? scorecard.positiveContributors.join(', ') : 'None available'}
            </Text>
          </View>
          <View style={{ flex: 1, borderRadius: 10, padding: 10, backgroundColor: `${colors.sellColor}12` }}>
            <Text style={{ color: colors.sellColor, fontFamily: 'Inter_700Bold', fontSize: 10 }}>NEGATIVE CONTRIBUTORS</Text>
            <Text style={{ color: colors.foreground, fontSize: 11, lineHeight: 16, marginTop: 4 }}>
              {scorecard.negativeContributors.length ? scorecard.negativeContributors.join(', ') : 'None available'}
            </Text>
          </View>
        </View>
        {historyReady && historyChange?.status === 'available' && (
          <View testID="commodity-intelligence-score-history" style={{ marginTop: 11, borderRadius: 10, padding: 10, backgroundColor: `${colors.background}aa`, gap: 4 }}>
            <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 11 }}>
              SCORE HISTORY · {historyChange.previousScore} → {scorecard.score} ({historyChange.change > 0 ? '+' : ''}{historyChange.change})
            </Text>
            <Text style={{ color: colors.buyColor, fontSize: 10, lineHeight: 15 }}>
              Improved: {historyChange.improvedCategories.length ? historyChange.improvedCategories.join(', ') : 'None'}
            </Text>
            <Text style={{ color: colors.sellColor, fontSize: 10, lineHeight: 15 }}>
              Deteriorated: {historyChange.deterioratedCategories.length ? historyChange.deterioratedCategories.join(', ') : 'None'}
            </Text>
          </View>
        )}
        {historyReady && historyChange?.status === 'not-comparable' && (
          <Text testID="commodity-intelligence-history-not-comparable" style={{ color: colors.mutedForeground, fontSize: 10, lineHeight: 15, marginTop: 10 }}>
            Prior scores use different evidence coverage or sources, so no score change is shown.
          </Text>
        )}
        {historyReady && historyChange?.status === 'first-analysis' && (
          <Text style={{ color: colors.mutedForeground, fontSize: 10, lineHeight: 15, marginTop: 10 }}>
            This is the first saved score for {symbol}. A comparison appears after a later comparable analysis.
          </Text>
        )}
      </LinearGradient>
    </View>
  );
}

function CommodityEvidenceLink({ evidence }: { evidence: CommodityAnalysisPayload['verifiedEvidence'][number] }) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Open source: ${evidence.title}, dated ${evidence.asOf}`}
      onPress={() => { void Linking.openURL(evidence.url).catch(() => {}); }}
      testID={`commodity-evidence-${evidence.id}`}
    >
      <Text style={{ color: colors.primary, fontSize: 10, lineHeight: 15, textDecorationLine: 'underline' }}>
        {evidence.title} · {evidence.asOf} · {evidence.unit}
      </Text>
    </Pressable>
  );
}

function CommodityEventCalendar({ calendar, symbol }: {
  calendar: CommodityAnalysisPayload['eventCalendar'];
  symbol: string;
}) {
  const colors = useColors();
  const events = calendar.events.filter((item) => item.affectedCommodities.length > 0);
  return (
    <SectionCard title="COMMODITY EVENTS" icon={<MaterialCommunityIcons name="calendar-clock" size={16} color={colors.primary} />} collapsible defaultExpanded>
      <View testID="commodity-event-calendar" style={{ paddingHorizontal: 16, paddingBottom: 14, gap: 10 }}>
        <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16 }}>
          Official schedules checked {new Date(calendar.checkedAt).toLocaleString()}. Published previous, consensus, and actual values are shown only when verified.
        </Text>
        {events.length ? events.map((item) => {
          const completed = item.status === 'completed';
          const isFomc = item.name === 'Federal Reserve FOMC meeting';
          const fomcRateMovement = isFomc ? getFomcRateMovement(item) : null;
          const fomcRateMovementLabel = fomcRateMovement
            ? fomcRateMovement.direction === 'held'
              ? 'held, 0 basis points'
              : `${fomcRateMovement.direction} by ${fomcRateMovement.basisPoints} basis points`
            : 'unavailable';
          const cpiRateChange = item.name.startsWith('U.S. Consumer Price Index release') && completed
            ? getCpiAnnualRateChange(item.values.previous, item.values.actual, item.eventDate)
            : null;
          const statusColor = completed ? colors.mutedForeground : colors.primary;
          const publishedValue = (
            label: string,
            value: { value: number; upperBound?: number; units: string; source?: { title: string; url: string; publicationDate: string } } | null,
          ) => {
            const amount = value
              ? `${value.value.toLocaleString()}${value.upperBound !== undefined ? `–${value.upperBound.toLocaleString()}` : ''} ${value.units}`
              : 'Unavailable';
            const text = `${label}: ${amount}${value?.source ? ` · ${value.source.publicationDate}` : ''}`;
            if (value?.source) {
              return (
                <Pressable
                  key={label}
                  accessibilityRole="link"
                  accessibilityLabel={`Open ${label.toLowerCase()} value source: ${value.source.title}`}
                  onPress={() => { void Linking.openURL(value.source!.url).catch(() => {}); }}
                >
                  <Text style={{ color: colors.primary, fontSize: 11, lineHeight: 16, textDecorationLine: 'underline' }}>{text}</Text>
                </Pressable>
              );
            }
            return <Text key={label} style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16 }}>{text}</Text>;
          };
          return (
            <View key={item.id} testID={`commodity-event-${item.id}`} style={{ borderRadius: 11, borderWidth: 1, borderColor: completed ? colors.border : `${colors.primary}66`, backgroundColor: completed ? `${colors.background}99` : `${colors.primary}0c`, padding: 11, gap: 5 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                <Text style={{ flex: 1, color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>{item.name}</Text>
                <Text style={{ color: statusColor, fontFamily: 'Inter_700Bold', fontSize: 9, textTransform: 'uppercase' }}>
                  {completed ? 'Released' : 'Upcoming'}
                </Text>
              </View>
              <Text style={{ color: colors.foreground, fontSize: 11 }}>
                {item.eventDate}{item.time ? ` · ${item.time} ${item.timezone ?? ''}` : ''}
              </Text>
              {isFomc && completed && (
                <Text
                  testID={`commodity-event-${item.id}-rate-movement`}
                  accessibilityLabel={`Federal Reserve rate movement: ${fomcRateMovementLabel}`}
                  style={{ color: fomcRateMovement ? colors.primary : colors.mutedForeground, fontFamily: 'Inter_700Bold', fontSize: 12 }}
                >
                  {fomcRateMovement
                    ? fomcRateMovement.direction === 'held'
                      ? 'Fed rate held (0 bps)'
                      : `Fed rate ${fomcRateMovement.direction} ${fomcRateMovement.basisPoints} bps`
                    : 'Fed rate movement unavailable'}
                </Text>
              )}
              <Text style={{ color: colors.mutedForeground, fontSize: 10 }}>
                Affects {item.affectedCommodities.join(', ')} · {item.source.publicationDate ? `Source updated ${item.source.publicationDate}` : 'Source publication date unavailable'}
              </Text>
              {item.name.startsWith('U.S. Consumer Price Index release') && completed ? (
                <View style={{ gap: 8 }}>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 4 }}>
                    {publishedValue('Previous CPI-U index level', item.values.previous)}
                    {publishedValue('Previous annual CPI rate', item.values.previous?.annualRate ?? null)}
                    {publishedValue('Actual CPI-U index level', item.values.actual)}
                    {publishedValue('Actual annual CPI rate', item.values.actual?.annualRate ?? null)}
                    {cpiRateChange && (
                      <Text
                        testID={`commodity-event-${item.id}-cpi-rate-change`}
                        accessibilityLabel={cpiRateChange.direction === 'unchanged'
                          ? 'Annual CPI inflation unchanged, 0.0 percentage points'
                          : `Annual CPI inflation ${cpiRateChange.direction} by ${cpiRateChange.percentagePoints.toFixed(1)} percentage points`}
                        style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 11, lineHeight: 16 }}
                      >
                        {cpiRateChange.direction === 'unchanged'
                          ? 'Annual CPI inflation unchanged (0.0 percentage points)'
                          : `Annual CPI inflation ${cpiRateChange.direction} by ${cpiRateChange.percentagePoints.toFixed(1)} percentage points`}
                      </Text>
                    )}
                  </View>
                  {!!item.annualRateHistory?.length && (
                    <View
                      testID={`commodity-event-${item.id}-cpi-history`}
                      accessibilityLabel="Verified monthly annual CPI inflation history"
                      style={{ gap: 5 }}
                    >
                      <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 11 }}>
                        Annual CPI inflation history
                      </Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
                        {item.annualRateHistory.map((point) => (
                          <Pressable
                            key={point.referenceMonth}
                            accessibilityRole="link"
                            accessibilityLabel={`Open BLS annual CPI rate for ${point.referenceMonth}, published ${point.source.publicationDate}`}
                            onPress={() => { void Linking.openURL(point.source.url).catch(() => {}); }}
                            style={{ flexGrow: 1, flexBasis: '30%', borderRadius: 7, borderWidth: 1, borderColor: colors.border, backgroundColor: `${colors.background}99`, paddingHorizontal: 7, paddingVertical: 5 }}
                          >
                            <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 11 }}>
                              {point.referenceMonth} · {point.rate > 0 ? '+' : ''}{point.rate.toFixed(1)}%
                            </Text>
                            <Text style={{ color: colors.primary, fontSize: 9, textDecorationLine: 'underline' }}>
                              BLS · {point.source.publicationDate}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  )}
                </View>
              ) : !item.name.startsWith('U.S. Consumer Price Index release') ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 4 }}>
                  {publishedValue('Previous', item.values.previous)}
                  {publishedValue('Consensus', item.values.consensus)}
                  {publishedValue('Actual', item.values.actual)}
                </View>
              ) : null}
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={`Open event source: ${item.source.title}`}
                onPress={() => { void Linking.openURL(item.source.url).catch(() => {}); }}
              >
                <Text style={{ color: colors.primary, fontSize: 10, textDecorationLine: 'underline' }}>{item.source.title}</Text>
              </Pressable>
            </View>
          );
        }) : (
          <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>No supported dated events are available for {symbol}.</Text>
        )}
        {calendar.unavailable.map((item) => (
          <Text key={item} style={{ color: colors.mutedForeground, fontSize: 10, lineHeight: 15 }}>Unavailable: {item}</Text>
        ))}
      </View>
    </SectionCard>
  );
}

function CommoditySupplyChart({ title, series }: {
  title: string;
  series: CommodityAnalysisPayload['supplyDemand']['series'];
}) {
  const colors = useColors();
  const available = series.filter((item) => item.status === 'available');
  const maxValue = Math.max(0, ...available.flatMap((item) => item.points.map((point) => point.value)));
  const seriesColor = (id: CommodityAnalysisPayload['supplyDemand']['series'][number]['id']) => (
    id === 'inventory' || id === 'animal-inventory' ? colors.primary
      : id === 'production' ? colors.buyColor
        : id === 'consumption' ? colors.holdColor
          : id === 'imports' ? colors.mutedForeground : colors.sellColor
  );
  return (
    <View testID={`commodity-supply-chart-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`} style={{ borderRadius: 11, backgroundColor: `${colors.background}99`, padding: 11, gap: 8 }}>
      <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>{title}</Text>
      {series.map((item) => (
        <View key={item.id} style={{ gap: 5 }}>
          <Text style={{ color: item.status === 'available' ? seriesColor(item.id) : colors.mutedForeground, fontFamily: 'Inter_600SemiBold', fontSize: 10 }}>
            {item.label}{item.units ? ` · ${item.units}` : ' · Unavailable'}
          </Text>
          {item.status === 'available' ? (
            <>
              {item.points.slice(-6).map((point) => (
                <View key={`${item.id}-${point.reportingPeriod}`} style={{ gap: 2 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                    <Text style={{ color: colors.mutedForeground, fontSize: 10, width: 68 }}>{point.reportingPeriod}</Text>
                    <View style={{ height: 6, flex: 1, borderRadius: 4, backgroundColor: colors.border, overflow: 'hidden' }}>
                      <View style={{ height: '100%', width: `${maxValue > 0 ? Math.max(2, point.value / maxValue * 100) : 0}%`, backgroundColor: seriesColor(item.id) }} />
                    </View>
                    <Text style={{ color: colors.foreground, fontSize: 11, minWidth: 65, textAlign: 'right' }}>{point.value.toLocaleString()}</Text>
                  </View>
                  <Text style={{ color: colors.mutedForeground, fontSize: 9, marginLeft: 64 }}>
                    Reported {point.publicationDate} · {point.commodity}
                    {point.revisionDate ? ` · Revised ${point.revisionDate}` : ''}
                  </Text>
                </View>
              ))}
              <Text style={{ color: colors.mutedForeground, fontSize: 9 }}>
                Historical average {item.historicalAveragePeriod ? `(${item.historicalAveragePeriod})` : '(period unavailable)'}: {item.historicalAverage === null ? 'Unavailable' : `${item.historicalAverage.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${item.units}`}
              </Text>
              {item.points[0]?.source && (
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel={`Open supply source: ${item.points[0].source.title}`}
                  onPress={() => { void Linking.openURL(item.points[0]!.source.url).catch(() => {}); }}
                >
                  <Text style={{ color: colors.primary, fontSize: 9, textDecorationLine: 'underline' }}>{item.points[0].source.title}</Text>
                </Pressable>
              )}
            </>
          ) : (
            <Text style={{ color: colors.mutedForeground, fontSize: 10, lineHeight: 15 }}>{item.reason ?? 'No comparable validated series is available.'}</Text>
          )}
        </View>
      ))}
    </View>
  );
}

function CommoditySupplyDemand({ context }: { context: CommodityAnalysisPayload['supplyDemand'] }) {
  const colors = useColors();
  const find = (id: CommodityAnalysisPayload['supplyDemand']['series'][number]['id']) => {
    const found = context.series.find((item) => item.id === id);
    return found ?? {
      id,
      label: id,
      status: 'unavailable' as const,
      units: null,
      points: [],
      historicalAverage: null,
      historicalAveragePeriod: null,
      reason: 'No validated series is available.',
    };
  };
  return (
    <SectionCard title="SUPPLY & DEMAND" icon={<MaterialCommunityIcons name="chart-box-outline" size={16} color={colors.primary} />} collapsible defaultExpanded>
      <View testID="commodity-supply-demand" style={{ paddingHorizontal: 16, paddingBottom: 14, gap: 9 }}>
        <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16 }}>
          {context.commodity} reporting periods and publication dates are shown separately. Estimates remain estimates; missing series are not interpolated.
        </Text>
        {(context.commodity === 'Live Cattle' || context.commodity === 'Lean Hogs') && (
          <Text style={{ color: colors.mutedForeground, fontSize: 10, lineHeight: 15 }}>
            Live-animal counts come from separate USDA NASS livestock reports. Beef and pork balances describe meat supply and use, not animal counts.
          </Text>
        )}
        {['Gold', 'Silver', 'Copper', 'Platinum', 'Palladium'].includes(context.commodity) && (
          <Text style={{ color: colors.mutedForeground, fontSize: 10, lineHeight: 15 }}>
            USGS figures are annual U.S. mineral statistics, not global exchange inventories.
          </Text>
        )}
        {(context.commodity === 'Live Cattle' || context.commodity === 'Lean Hogs') && (
          <CommoditySupplyChart
            title="Live-animal counts"
            series={[context.animalInventory ?? {
              id: 'animal-inventory',
              label: context.commodity === 'Live Cattle' ? 'Cattle and calves inventory' : 'All hogs and pigs inventory',
              status: 'unavailable',
              units: null,
              points: [],
              historicalAverage: null,
              historicalAveragePeriod: null,
              reason: 'No fresh, verified USDA NASS inventory report is available.',
            }]}
          />
        )}
        <CommoditySupplyChart title="Inventory history" series={[find('inventory')]} />
        <CommoditySupplyChart title="Production vs. consumption" series={[find('production'), find('consumption')]} />
        <CommoditySupplyChart title="Trade and supply balance context" series={[find('imports'), find('exports')]} />
        {context.status === 'unavailable' && (
          <Text style={{ color: colors.mutedForeground, fontSize: 10 }}>
            No validated supply-and-demand observations are currently available.
          </Text>
        )}
      </View>
    </SectionCard>
  );
}

function CommodityCommentaryItems({
  items,
  evidenceById,
}: {
  items: { text: string; evidenceIds: string[] }[];
  evidenceById: Map<string, CommodityAnalysisPayload['verifiedEvidence'][number]>;
}) {
  const colors = useColors();
  if (!items.length) {
    return <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>No evidence-supported commentary is available.</Text>;
  }
  return (
    <View style={{ gap: 7 }}>
      {items.map((item, index) => (
        <View key={`${index}-${item.text}`} style={{ gap: 3 }}>
          <Text style={{ color: colors.foreground, fontSize: 12, lineHeight: 18 }}>• {item.text}</Text>
          <View style={{ paddingLeft: 11, gap: 3 }}>
            {item.evidenceIds.map((id) => {
              const evidence = evidenceById.get(id);
              return evidence ? <CommodityEvidenceLink key={id} evidence={evidence} /> : null;
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

function CommodityAnalysisSections({
  analysis,
  symbol,
  onSectionLayout,
  onSectionRef,
}: {
  analysis: CommodityAnalysisPayload;
  symbol: string;
  onSectionLayout: (sectionId: CommodityAnalysisSectionId, y: number) => void;
  onSectionRef: (sectionId: CommodityAnalysisSectionId, view: View | null) => void;
}) {
  const colors = useColors();
  const scoreColor = analysis.score >= 65 ? colors.buyColor : analysis.score <= 40 ? colors.sellColor : colors.holdColor;
  const evidenceById = useMemo(
    () => new Map(analysis.verifiedEvidence.map((item) => [item.id, item])),
    [analysis.verifiedEvidence],
  );
  const rows = [
    ['1-month return', analysis.oneMonthReturnPercent],
    ['3-month return', analysis.threeMonthReturnPercent],
    ['6-month return', analysis.sixMonthReturnPercent],
  ] as const;
  return (
    <View testID="commodity-analysis-result" style={{ gap: 12 }}>
      <CommoditySectionAnchor sectionId="scorecard" title="Scorecard" onLayout={onSectionLayout} onRef={onSectionRef}>
        <CommodityIntelligenceScorecard symbol={symbol} scorecard={analysis.intelligenceScorecard} />
      </CommoditySectionAnchor>
      <CommoditySectionAnchor sectionId="relationships" title="Relationships" onLayout={onSectionLayout} onRef={onSectionRef}>
        <CommodityRelationshipPanel />
      </CommoditySectionAnchor>
      <CommoditySectionAnchor sectionId="events" title="Events" onLayout={onSectionLayout} onRef={onSectionRef}>
        <CommodityEventCalendar calendar={analysis.eventCalendar} symbol={symbol} />
      </CommoditySectionAnchor>
      <CommoditySectionAnchor sectionId="supply-demand" title="Supply and demand" onLayout={onSectionLayout} onRef={onSectionRef}>
        <CommoditySupplyDemand context={analysis.supplyDemand} />
      </CommoditySectionAnchor>
      <CommoditySectionAnchor sectionId="market-score" title="Market score" onLayout={onSectionLayout} onRef={onSectionRef}>
      <SectionCard title="COMMODITY MARKET SCORE" icon={<MaterialCommunityIcons name="chart-line" size={16} color={colors.primary} />} collapsible defaultExpanded>
        <View style={{ paddingHorizontal: 16, paddingBottom: 16, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Text testID="commodity-analysis-score" style={{ color: scoreColor, fontSize: 38, fontFamily: 'Inter_700Bold' }}>{analysis.score}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold' }}>Risk-adjusted price trend</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Confidence {analysis.confidence}/100 · {analysis.dataCoveragePercent}% factor coverage</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            {rows.map(([label, value]) => (
              <Text key={label} style={{ color: colors.mutedForeground, fontSize: 12 }}>
                {label}: {value === null ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(1)}%`}
              </Text>
            ))}
          </View>
          <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
            Annualized volatility: {analysis.annualizedVolatilityPercent.toFixed(1)}%
          </Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16 }}>
            {analysis.observationCount} daily observations from {analysis.provider} through {analysis.historyAsOf ?? 'an unreported date'}. The score uses only dated inputs that passed source, instrument, unit, and freshness checks; unavailable factors are excluded.
          </Text>
        </View>
      </SectionCard>
      <SectionCard title="FACTOR COVERAGE" icon={<MaterialCommunityIcons name="database-check-outline" size={16} color={colors.primary} />} collapsible defaultExpanded>
        <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
          {analysis.factors.map((factor) => (
            <View key={factor.key} testID={`commodity-analysis-factor-${factor.key}`} style={{ paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Text style={{ color: factor.status === 'available' ? colors.foreground : colors.mutedForeground, fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>
                {factor.label}{factor.score === null ? ' · Not available' : ` · ${factor.score}/100`}
              </Text>
              <Text testID={`commodity-analysis-factor-${factor.key}-detail`} style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 17, marginTop: 4 }}>
                {factor.detail}
              </Text>
              {factor.sources.map((source) => (
                <Pressable
                  key={`${source.url}-${source.asOf}`}
                  accessibilityRole="link"
                  accessibilityLabel={`Open source: ${source.title}, dated ${source.asOf}`}
                  onPress={() => { void Linking.openURL(source.url).catch(() => {}); }}
                  style={{ marginTop: 5 }}
                >
                  <Text style={{ color: colors.primary, fontSize: 10, lineHeight: 14, textDecorationLine: 'underline' }}>
                    {source.title} · {source.asOf} · {source.unit}
                  </Text>
                </Pressable>
              ))}
            </View>
          ))}
          <Text style={{ color: colors.mutedForeground, fontSize: 10, lineHeight: 14, marginTop: 10 }}>{analysis.methodology}</Text>
        </View>
      </SectionCard>
      </CommoditySectionAnchor>
      <CommoditySectionAnchor sectionId="evidence" title="Evidence" onLayout={onSectionLayout} onRef={onSectionRef}>
      <SectionCard title="VERIFIED EVIDENCE" icon={<MaterialCommunityIcons name="check-decagram-outline" size={16} color={colors.primary} />} collapsible defaultExpanded>
        <View style={{ paddingHorizontal: 16, paddingBottom: 14, gap: 10 }}>
          {analysis.verifiedEvidence.length ? analysis.verifiedEvidence.map((item) => (
            <View key={item.id} testID={`commodity-verified-${item.id}`} style={{ gap: 4 }}>
              <Text style={{ color: colors.foreground, fontSize: 12, lineHeight: 18 }}>{item.observation}</Text>
              <CommodityEvidenceLink evidence={item} />
            </View>
          )) : (
            <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>No validated, dated evidence is available beyond the score inputs.</Text>
          )}
        </View>
      </SectionCard>
      </CommoditySectionAnchor>
      <CommoditySectionAnchor sectionId="drivers" title="Drivers" onLayout={onSectionLayout} onRef={onSectionRef}>
      <SectionCard title="COMMODITY-SPECIFIC DRIVERS" icon={<MaterialCommunityIcons name="compass-outline" size={16} color={colors.primary} />} collapsible defaultExpanded>
        <View style={{ paddingHorizontal: 16, paddingBottom: 14, gap: 10 }}>
          <View>
            <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold', fontSize: 11, marginBottom: 4 }}>ANALYSIS LENSES · NOT VERIFIED FACTS</Text>
            {analysis.analysisGuide.focus.map((item) => <Text key={item} style={{ color: colors.foreground, fontSize: 12, lineHeight: 18 }}>• {item}</Text>)}
          </View>
          <View>
            <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold', fontSize: 11, marginBottom: 4 }}>UNAVAILABLE FACTORS</Text>
            {analysis.analysisGuide.unavailable.map((item) => <Text key={item} style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18 }}>• {item}</Text>)}
          </View>
          <View>
            <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold', fontSize: 11, marginBottom: 4 }}>WHAT TO MONITOR NEXT</Text>
            {analysis.analysisGuide.monitorNext.map((item) => <Text key={item} style={{ color: colors.foreground, fontSize: 12, lineHeight: 18 }}>• {item}</Text>)}
          </View>
        </View>
      </SectionCard>
      </CommoditySectionAnchor>
      <CommoditySectionAnchor sectionId="ai-context" title="AI context" onLayout={onSectionLayout} onRef={onSectionRef}>
      <SectionCard title="AI MARKET CONTEXT" icon={<MaterialCommunityIcons name="brain" size={16} color={colors.primary} />} collapsible defaultExpanded>
        <View style={{ paddingHorizontal: 16, paddingBottom: 16, gap: 12 }}>
          {analysis.commentary.status === 'available' ? (
            <>
              <Text style={{ color: colors.mutedForeground, fontSize: 10, lineHeight: 15 }}>AI interpretation · factual claims link to dated evidence above. The deterministic score is unchanged.</Text>
              {analysis.commentary.currentDrivers.length > 0 && <View style={{ gap: 5 }}>
                <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>CURRENT DRIVERS</Text>
                <CommodityCommentaryItems items={analysis.commentary.currentDrivers} evidenceById={evidenceById} />
              </View>}
              <View style={{ gap: 5 }}>
                <Text style={{ color: colors.buyColor, fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>STRONGEST BULLISH FACTORS</Text>
                <CommodityCommentaryItems items={analysis.commentary.strongestBullishFactors} evidenceById={evidenceById} />
              </View>
              <View style={{ gap: 5 }}>
                <Text style={{ color: colors.sellColor, fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>STRONGEST BEARISH FACTORS</Text>
                <CommodityCommentaryItems items={analysis.commentary.strongestBearishFactors} evidenceById={evidenceById} />
              </View>
              <View style={{ gap: 5 }}>
                <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>TECHNICAL ALIGNMENT</Text>
                <CommodityCommentaryItems items={analysis.commentary.technicalAlignment ? [analysis.commentary.technicalAlignment] : []} evidenceById={evidenceById} />
              </View>
              <View style={{ gap: 5 }}>
                <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>UPCOMING CATALYSTS</Text>
                {analysis.commentary.upcomingCatalysts.length ? (
                  <CommodityCommentaryItems items={analysis.commentary.upcomingCatalysts} evidenceById={evidenceById} />
                ) : <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>No dated upcoming catalysts were verified in the supplied sources.</Text>}
              </View>
              <View style={{ gap: 5 }}>
                <Text style={{ color: colors.sellColor, fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>RISKS</Text>
                <CommodityCommentaryItems items={analysis.commentary.risks} evidenceById={evidenceById} />
              </View>
            </>
          ) : (
            <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18 }}>
              AI commentary is unavailable. The deterministic score, technical history, verified evidence, and unavailable-factor disclosures remain available above.
            </Text>
          )}
        </View>
      </SectionCard>
      </CommoditySectionAnchor>
      <CommoditySectionAnchor sectionId="news" title="News" onLayout={onSectionLayout} onRef={onSectionRef}>
      <SectionCard title="RECENT NEWS" icon={<MaterialCommunityIcons name="web" size={16} color={colors.primary} />} collapsible defaultExpanded>
        <View style={{ paddingHorizontal: 16, paddingBottom: 16, gap: 8 }}>
          {analysis.newsContext.status === 'available' ? (
            <>
              <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18 }}>
                Search results were retrieved {analysis.newsContext.retrievedAt ? new Date(analysis.newsContext.retrievedAt).toLocaleString() : 'recently'}. Article contents are not independently verified and are not used by the commodity score or AI commentary.
              </Text>
              {analysis.newsContext.sources.map((source) => (
                <Pressable key={source.url} accessibilityRole="link" accessibilityLabel={`Open news source: ${source.title}`} onPress={() => { void Linking.openURL(source.url).catch(() => {}); }}>
                  <Text style={{ color: colors.primary, fontSize: 12, lineHeight: 17, textDecorationLine: 'underline' }}>
                    {source.title}{source.publishedAt ? ` · ${source.publishedAt}` : ''}
                  </Text>
                </Pressable>
              ))}
            </>
          ) : (
            <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Recent news search is unavailable. The market score is based on price history and does not use news sentiment.</Text>
          )}
        </View>
      </SectionCard>
      </CommoditySectionAnchor>
      <Text style={{ color: colors.mutedForeground, fontSize: 10, lineHeight: 14 }}>
        Educational market context only—not a forecast, personalized advice, or a buy/sell recommendation.
      </Text>
    </View>
  );
}

function EtfAnalysisSections({
  fund,
  colors,
  symbol,
  onSectionLayout,
  onSectionRef,
  primaryCandles,
  primaryAdjustedReturnSeries,
  primaryLoading,
  primaryError,
  retryPrimaryChart,
  period,
  setPeriod,
  chartWidth,
  marketQuotes,
  marketUpdatedAt,
}: {
  fund: EtfAnalysisPayload;
  colors: ReturnType<typeof useColors>;
  symbol: string;
  onSectionLayout: (sectionId: EtfAnalysisSectionId, y: number) => void;
  onSectionRef: (sectionId: EtfAnalysisSectionId, view: View | null) => void;
  primaryCandles: Candle[];
  primaryAdjustedReturnSeries: ProviderAdjustedReturnSeries;
  primaryLoading: boolean;
  primaryError: boolean;
  retryPrimaryChart: () => void;
  period: Period;
  setPeriod: (period: Period) => void;
  chartWidth: number;
  marketQuotes: HeatMapQuote[];
  marketUpdatedAt: number;
}) {
  const { apiFetch } = useApi();
  const router = useRouter();
  const [savedCompareSymbols, setSavedCompareSymbols] = useState<string[]>([]);
  const [chartTickerSymbols, setChartTickerSymbols] = useState<string[]>([]);
  const [chartTickerInput, setChartTickerInput] = useState('');
  const [chartTickerError, setChartTickerError] = useState('');
  const [compareFunds, setCompareFunds] = useState<Array<{
    symbol: string;
    topHoldings: { symbol: string; name: string; weight: number }[];
    topHoldingsReportedCount: number;
    topHoldingsRetrievedAt: string | null;
    currentPrice: number;
    expenseRatio: number | null;
    sectorWeights: { sector: string; weight: number }[];
    sectorWeightsRetrievedAt: string | null;
    analysis: EtfAnalysisPayload;
  }>>([]);
  const [comparePendingSymbols, setComparePendingSymbols] = useState<string[]>([]);
  const [compareFailedSymbols, setCompareFailedSymbols] = useState<string[]>([]);
  const selectedComparisonSymbols = [...savedCompareSymbols, ...chartTickerSymbols];
  const comparisonChartSymbols = [...new Set(selectedComparisonSymbols)];
  const comparisonChartPendingSymbols = comparePendingSymbols.filter((candidate) =>
    savedCompareSymbols.includes(candidate));
  const comparisonChartUnavailableSymbols = compareFailedSymbols.filter((candidate) =>
    savedCompareSymbols.includes(candidate));
  const comparisonChartQueries = useQueries({
    queries: comparisonChartSymbols.map((candidate) =>
      getGetStockChartQueryOptions(encodeURIComponent(candidate), period, '1d', {
        query: {
          queryKey: getGetStockChartQueryKey(encodeURIComponent(candidate), period, '1d'),
          retry: false,
          staleTime: 15_000,
        },
      })),
  });
  const comparisonChartResults = comparisonChartSymbols.map((ticker, index) => ({
    ticker,
    query: comparisonChartQueries[index]!,
    candles: comparisonChartQueries[index]?.data?.candles ?? [],
    adjustedReturnSeries:
      comparisonChartQueries[index]?.data?.adjustedReturnSeries ?? UNAVAILABLE_ADJUSTED_RETURN_SERIES,
  }));
  const comparisonChartErrors = comparisonChartResults
    .filter(({ query }) => query.isError)
    .map(({ ticker }) => ticker);
  const comparisonChartHistoryMissing = comparisonChartResults
    .filter(({ query, candles }) => !query.isLoading && !query.isError && candles.length < 2)
    .map(({ ticker }) => ticker);
  const comparisonChartLoadingSymbols = comparisonChartResults
    .filter(({ query }) => query.isLoading)
    .map(({ ticker }) => ticker);
  const comparisonChartComplete = selectedComparisonSymbols.length > 0
    && comparisonChartPendingSymbols.length === 0
    && comparisonChartUnavailableSymbols.length === 0
    && comparisonChartSymbols.length === selectedComparisonSymbols.length
    && comparisonChartErrors.length === 0
    && comparisonChartHistoryMissing.length === 0
    && comparisonChartLoadingSymbols.length === 0;
  const chartInputCandles = [
    primaryCandles,
    ...comparisonChartResults.map(({ candles }) => candles),
  ];
  const sharedChartCandles = comparisonChartComplete
    ? alignCandleSeriesOnSharedDatesAcrossSeries(chartInputCandles)
    : { dates: [], series: [] as Candle[][] };
  const hasSharedComparisonHistory = comparisonChartComplete && sharedChartCandles.dates.length >= 2;
  const sharedAdjustedReturns = comparisonChartComplete
    ? alignProviderAdjustedReturnsAcrossSeries(
      chartInputCandles,
      [
        primaryAdjustedReturnSeries,
        ...comparisonChartResults.map(({ adjustedReturnSeries }) => adjustedReturnSeries),
      ],
    )
    : { dates: [], series: [] as (Candle & { adjustedReturnPercent: number })[][], available: false };
  const hasSharedAdjustedReturns = hasSharedComparisonHistory && sharedAdjustedReturns.available;
  const primaryStandaloneAdjustedCandles = addProviderAdjustedReturns(primaryCandles, primaryAdjustedReturnSeries);
  const totalReturnAvailable = selectedComparisonSymbols.length > 0
    ? hasSharedAdjustedReturns
    : primaryStandaloneAdjustedCandles != null;
  const chartUsesAdjustedReturns = false;
  const unavailableAdjustedFunds = [
    {
      ticker: symbol.toUpperCase(),
      series: primaryAdjustedReturnSeries,
    },
    ...comparisonChartResults.map(({ ticker, adjustedReturnSeries }) => ({
      ticker,
      series: adjustedReturnSeries,
    })),
  ].filter(({ series }) => series.status !== 'available');
  const totalReturnUnavailableReason = selectedComparisonSymbols.length === 0
    ? primaryAdjustedReturnSeries.reason ?? 'The provider-adjusted series does not cover every reported date.'
    : comparisonChartPendingSymbols.length > 0
      ? `ETF verification is still pending for ${comparisonChartPendingSymbols.join(', ')}.`
      : comparisonChartUnavailableSymbols.length > 0
        ? `ETF history is unavailable for ${comparisonChartUnavailableSymbols.join(', ')}.`
        : comparisonChartErrors.length > 0
          ? `Price history could not be loaded for ${comparisonChartErrors.join(', ')}.`
          : comparisonChartHistoryMissing.length > 0
            ? `Fewer than two reported price dates are available for ${comparisonChartHistoryMissing.join(', ')}.`
            : !hasSharedComparisonHistory
              ? `Only ${sharedChartCandles.dates.length} dates are reported by every selected ticker; at least two are required.`
              : unavailableAdjustedFunds.length > 0
                ? `Provider-adjusted history is incomplete for ${unavailableAdjustedFunds
                    .map(({ ticker, series }) => `${ticker}${series.reason ? ` (${series.reason})` : ''}`)
                    .join(' and ')}.`
                : 'Provider-adjusted history does not cover every shared reported date.';
  const chartPrimaryCandles = hasSharedComparisonHistory
    ? chartUsesAdjustedReturns ? sharedAdjustedReturns.series[0]! : sharedChartCandles.series[0]!
    : chartUsesAdjustedReturns ? primaryStandaloneAdjustedCandles ?? primaryCandles : primaryCandles;
  const chartComparisonSeries = hasSharedComparisonHistory
    ? chartUsesAdjustedReturns
      ? sharedAdjustedReturns.series.slice(1).map((candles, index) => ({
        symbol: comparisonChartSymbols[index]!,
        candles,
      }))
      : sharedChartCandles.series.slice(1).map((candles, index) => ({
        symbol: comparisonChartSymbols[index]!,
        candles,
      }))
    : [];
  const chartReturnPercent = (candles: Candle[]) => candles.length > 1 && candles[0]!.c > 0
    ? (candles[candles.length - 1]!.c / candles[0]!.c - 1) * 100
    : null;
  const seriesReturnPercent = (candles: Candle[]) => candles.length > 1
    ? candles[candles.length - 1]!.adjustedReturnPercent ?? null
    : null;
  const primaryPeriodReturn = chartUsesAdjustedReturns
    ? seriesReturnPercent(chartPrimaryCandles)
    : chartReturnPercent(chartPrimaryCandles);
  const chartComparisonReturns = chartComparisonSeries.map(({ symbol: ticker, candles }) => {
    const periodReturn = chartUsesAdjustedReturns
      ? seriesReturnPercent(candles)
      : chartReturnPercent(candles);
    return {
      ticker,
      periodReturn,
      relativeReturn: primaryPeriodReturn != null && periodReturn != null
        ? calculateRelativeReturnPercent(primaryPeriodReturn, periodReturn)
        : null,
    };
  });
  const [compareTicker, setCompareTicker] = useState('');
  const [replaceTarget, setReplaceTarget] = useState<string | null>(null);
  const [focusSwitching, setFocusSwitching] = useState(false);
  const [selectedScenarioHorizon, setSelectedScenarioHorizon] = useState<number>(10);
  const [scenarioInitialInvestmentInput, setScenarioInitialInvestmentInput] = useState(
    String(ETF_SCENARIO_INITIAL_INVESTMENT),
  );
  const [scenarioReturnInputs, setScenarioReturnInputs] = useState<Record<string, string>>({});
  const [feeInvestmentInput, setFeeInvestmentInput] = useState('10000');
  const [feeHoldingYears, setFeeHoldingYears] = useState<number>(10);
  const [contributionInput, setContributionInput] = useState('0');
  const [contributionCadence, setContributionCadence] = useState<EtfContributionCadence>('monthly');
  const [contributionCadenceLoaded, setContributionCadenceLoaded] = useState(false);
  const contributionCadenceTouched = useRef(false);
  const contributionAmount = contributionInput.trim() === '' || contributionInput === '.'
    ? 0
    : Number(contributionInput);
  const savedCompareSymbolsRef = useRef<string[]>([]);
  const comparisonWriteQueue = useRef<Promise<void>>(Promise.resolve());
  const scenarios = parseEtfScenarios(fund.scenarios);
  const scenarioReturn = (scenario: EtfScenario, feeAdjusted: boolean) => {
    const key = scenario.label.toLowerCase();
    const edited = scenarioReturnInputs[key];
    if (edited === undefined) {
      return feeAdjusted ? scenario.annualReturnAssumption : scenario.noFeeAnnualReturnAssumption;
    }
    const parsed = Number(edited);
    if (edited.trim() === '' || !Number.isFinite(parsed) || parsed <= -100) return null;
    const annualRate = parsed / 100;
    return feeAdjusted ? annualRate : validExpenseRatio ? annualRate + (fund.expenseRatio ?? 0) : null;
  };
  const feeInvestmentAmount = parseEtfFeeInvestmentAmount(feeInvestmentInput);
  const scenarioInitialInvestment = parseEtfFeeInvestmentAmount(scenarioInitialInvestmentInput);
  const feeEstimate = estimateEtfFeeDollars(
    feeInvestmentAmount,
    fund.expenseRatio,
    feeHoldingYears,
  );
  const validExpenseRatio = isValidEtfExpenseRatio(fund.expenseRatio);
  const hasValidTrackingHistory = (
    tracking: EtfAnalysisPayload['trackingComparison'] | null | undefined,
  ): tracking is NonNullable<EtfAnalysisPayload['trackingComparison']> => Boolean(
    tracking
    && isValidEtfTrackingHistory(
      tracking.periodStart,
      tracking.periodEnd,
      tracking.monthlySamples,
    ),
  );
  const feeComparisonStatus = getEtfFeeComparisonStatus(
    fund.peerExpenseComparison?.fundExpenseRatio,
    fund.peerExpenseComparison?.categoryAverageExpenseRatio,
    fund.peerExpenseComparison?.difference,
  );
  const [compareError, setCompareError] = useState('');
  const [shareStatus, setShareStatus] = useState('');
  const [manualCopySummary, setManualCopySummary] = useState<string | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareRestoreLoading, setCompareRestoreLoading] = useState(true);
  const [compareStorageError, setCompareStorageError] = useState('');
  const profileScore = calculateEtfResearchScore({
    expenseRatio: fund.expenseRatio,
    categoryAverageExpenseRatio: fund.peerExpenseComparison?.categoryAverageExpenseRatio ?? null,
    riskAdjustedReturn: fund.riskAdjustedReturn,
    sectorWeights: fund.sectorWeights ?? [],
    averageVolume: fund.averageVolume,
    totalAssets: fund.totalAssets,
    peerAssetSizeComparison: fund.peerAssetSizeComparison,
    annualizedVolatility: fund.annualizedVolatility,
    maxDrawdown: fund.maxDrawdown,
  });
  const scoreSourceContexts: Partial<Record<EtfScoreComponentId, string>> = {};
  const scoreInputAsOf: Partial<Record<EtfScoreComponentId, string[]>> = {};
  const scoredComponentIds = new Set(
    profileScore.components.filter((component) => component.score !== null).map((component) => component.id),
  );
  if (scoredComponentIds.has('cost')) {
    scoreSourceContexts.cost = `${fund.provider}|${fund.peerExpenseComparison?.source ?? 'unknown'}|${fund.peerExpenseComparison?.category ?? fund.fundCategory ?? 'unknown'}`;
    if (fund.peerExpenseComparison) scoreInputAsOf.cost = [fund.peerExpenseComparison.asOf];
  }
  if (scoredComponentIds.has('performance')) {
    scoreSourceContexts.performance = `${fund.provider}|annualized-return-divided-by-volatility|risk-free-proxy:0%`;
    scoreInputAsOf.performance = [fund.asOf];
  }
  if (scoredComponentIds.has('diversification')) {
    scoreSourceContexts.diversification = `${fund.provider}|reported-sector-weights-v1`;
    scoreInputAsOf.diversification = [fund.sectorWeightsRetrievedAt];
  }
  if (scoredComponentIds.has('liquidity')) {
    const hasFundAssets = typeof fund.totalAssets === 'number' && Number.isFinite(fund.totalAssets) && fund.totalAssets > 0;
    const usesPeerAssets = hasFundAssets
      && typeof fund.peerAssetSizeComparison?.categoryAverageTotalAssets === 'number'
      && Number.isFinite(fund.peerAssetSizeComparison.categoryAverageTotalAssets)
      && fund.peerAssetSizeComparison.categoryAverageTotalAssets > 0;
    scoreSourceContexts.liquidity = [
      fund.provider,
      `volume:${typeof fund.averageVolume === 'number' && fund.averageVolume > 0 ? 'available' : 'unavailable'}`,
      `assets:${hasFundAssets ? 'available' : 'unavailable'}`,
      `asset-basis:${usesPeerAssets ? `${fund.peerAssetSizeComparison?.source}|${fund.peerAssetSizeComparison?.category}` : 'fixed-bands'}`,
    ].join('|');
    scoreInputAsOf.liquidity = [
      fund.asOf,
      ...(usesPeerAssets && fund.peerAssetSizeComparison ? [fund.peerAssetSizeComparison.asOf] : []),
    ];
  }
  if (scoredComponentIds.has('risk')) {
    scoreSourceContexts.risk = `fixed-risk-bands-v1|volatility:${fund.annualizedVolatility == null ? 'unavailable' : 'available'}|drawdown:${fund.maxDrawdown == null ? 'unavailable' : 'available'}`;
    scoreInputAsOf.risk = [fund.asOf];
  }
  const scoreSnapshotSignature = JSON.stringify({
    symbol: symbol.toUpperCase(),
    score: profileScore.score,
    componentScores: profileScore.components.map(({ id, score }) => [id, score]),
    sourceContexts: scoreSourceContexts,
    inputAsOf: scoreInputAsOf,
  });
  const [scoreChangeResult, setScoreChangeResult] = useState<EtfScoreChangeResult | null>(null);
  const [scoreHistoryEntries, setScoreHistoryEntries] = useState<EtfScoreHistoryEntry[]>([]);
  const [scoreHistoryReady, setScoreHistoryReady] = useState(false);
  const [currentScoreSnapshot, setCurrentScoreSnapshot] = useState<EtfScoreSnapshot | null>(null);
  const [scoreHistoryClearing, setScoreHistoryClearing] = useState(false);
  const [scoreHistoryCleared, setScoreHistoryCleared] = useState(false);
  const [scoreHistoryClearError, setScoreHistoryClearError] = useState('');
  const [scoreHistoryRemoving, setScoreHistoryRemoving] = useState<string | null>(null);
  const [scoreHistoryRemoveError, setScoreHistoryRemoveError] = useState('');
  const [scoreCardHidden, setScoreCardHidden] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setScoreHistoryReady(false);
    setScoreHistoryEntries([]);
    setCurrentScoreSnapshot(null);
    setScoreHistoryCleared(false);
    setScoreHistoryClearError('');
    setScoreHistoryRemoveError('');
    const saveAndCompareScoreHistory = async () => {
      try {
        const now = new Date().toISOString();
        const snapshot = createEtfScoreSnapshot({
          methodology: CURRENT_ETF_SCORE_METHODOLOGY,
          symbol,
          score: profileScore.score,
          components: profileScore.components,
          sourceContexts: scoreSourceContexts,
          inputAsOf: scoreInputAsOf,
          recordedAt: now,
        });
        if (!cancelled) setCurrentScoreSnapshot(snapshot);
        const history = snapshot
          ? await persistEtfScoreSnapshot(
            snapshot,
            () => AsyncStorage.getItem(ETF_SCORE_SNAPSHOTS_KEY),
            (value) => AsyncStorage.setItem(ETF_SCORE_SNAPSHOTS_KEY, value),
          )
          : parseEtfScoreSnapshots(await AsyncStorage.getItem(ETF_SCORE_SNAPSHOTS_KEY));
        if (cancelled) return;
        const change = profileScore.score == null
          ? { status: 'unavailable' as const }
          : findComparableEtfScoreChange(snapshot, history);
        if (!cancelled) {
          setScoreChangeResult(change);
          setScoreHistoryEntries(buildEtfScoreHistory(symbol, snapshot, history));
          setScoreHistoryReady(true);
        }
      } catch {
        if (!cancelled) {
          setScoreChangeResult({ status: 'unavailable' });
          setScoreHistoryReady(true);
        }
      }
    };
    void saveAndCompareScoreHistory();
    return () => {
      cancelled = true;
    };
  // The serialized score inputs intentionally prevent storage writes on unrelated renders.
  }, [symbol, scoreSnapshotSignature]);
  const clearScoreHistory = useCallback(async () => {
    if (scoreHistoryClearing) return;
    setScoreHistoryClearing(true);
    setScoreHistoryClearError('');
    try {
      await clearEtfScoreSnapshots(() => AsyncStorage.removeItem(ETF_SCORE_SNAPSHOTS_KEY));
      setScoreHistoryEntries([]);
      setScoreChangeResult({ status: 'first-analysis' });
      setScoreHistoryCleared(true);
    } catch {
      setScoreHistoryClearError('Saved score history could not be cleared. Please try again.');
    } finally {
      setScoreHistoryClearing(false);
    }
  }, [scoreHistoryClearing]);
  const confirmRemoveScoreHistoryEntry = useCallback((snapshot: EtfScoreSnapshot) => {
    const date = new Date(snapshot.recordedAt).toLocaleDateString();
    const removeEntry = async () => {
      if (scoreHistoryRemoving !== null) return;
      setScoreHistoryRemoving(snapshot.recordedAt);
      setScoreHistoryRemoveError('');
      try {
        const history = await removeEtfScoreSnapshot(
          snapshot,
          () => AsyncStorage.getItem(ETF_SCORE_SNAPSHOTS_KEY),
          (value) => AsyncStorage.setItem(ETF_SCORE_SNAPSHOTS_KEY, value),
        );
        setScoreHistoryEntries(buildEtfScoreHistory(symbol, null, history));
        setScoreChangeResult(currentScoreSnapshot
          ? findComparableEtfScoreChange(currentScoreSnapshot, history)
          : { status: 'unavailable' });
        setScoreHistoryCleared(false);
      } catch {
        setScoreHistoryRemoveError('This saved score could not be removed. Please try again.');
      } finally {
        setScoreHistoryRemoving(null);
      }
    };
    const title = 'Remove this saved score?';
    const message = `This permanently removes the ${date} score from this device. Other ETF score history stays saved.`;
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(message)) {
        void removeEntry();
      }
      return;
    }
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove score', style: 'destructive', onPress: () => void removeEntry() },
    ]);
  }, [currentScoreSnapshot, scoreHistoryRemoving, symbol]);
  const confirmClearScoreHistory = useCallback(() => {
    const title = 'Clear saved score history?';
    const message = 'This permanently removes saved ETF score snapshots from this device. Comparison tickers and other ETF data will stay saved.';
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(message)) {
        void clearScoreHistory();
      }
      return;
    }
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear history', style: 'destructive', onPress: () => void clearScoreHistory() },
    ]);
  }, [clearScoreHistory]);
  const etfScoreColor = (score: number) =>
    score >= 65 ? colors.buyColor : score <= 40 ? colors.sellColor : colors.holdColor;
  const availableScoreWeight = profileScore.components
    .filter((component) => component.score != null)
    .reduce((sum, component) => sum + component.weight, 0);
  const scoreClassification = profileScore.score == null ? 'Not scored'
    : profileScore.score >= 75 ? 'Strong profile'
      : profileScore.score >= 60 ? 'Constructive profile'
        : profileScore.score >= 41 ? 'Mixed profile' : 'Limited profile';
  const [holdingSnapshots, setHoldingSnapshots] = useState<HeatMapEtfHoldingSnapshot[]>([]);
  const snapshotWriteQueue = useRef<Promise<void>>(Promise.resolve());
  const [snapshotStorageError, setSnapshotStorageError] = useState('');
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(ETF_CONTRIBUTION_CADENCE_KEY)
      .then((stored) => {
        if (!cancelled && !contributionCadenceTouched.current && stored !== null) {
          setContributionCadence(parseEtfContributionCadence(stored));
        }
      })
      .catch(() => {
        // Keep the safe monthly default when local preferences cannot be read.
      })
      .finally(() => {
        if (!cancelled) setContributionCadenceLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    if (!contributionCadenceLoaded) return;
    AsyncStorage.setItem(ETF_CONTRIBUTION_CADENCE_KEY, contributionCadence).catch(() => {
      // A storage failure should not block editing or using the analysis.
    });
  }, [contributionCadence, contributionCadenceLoaded]);
  const selectedProjection = (
    scenario: EtfScenario | null,
    horizonYears: number,
  ) => {
    if (!scenario) return null;
    const afterFeeRate = scenarioReturn(scenario, true);
    const noFeeRate = scenarioReturn(scenario, false);
    const noFee = calculateEtfScenarioBreakdown(
      scenarioInitialInvestment ?? 0,
      noFeeRate,
      contributionAmount,
      horizonYears,
      contributionCadence,
    );
    const afterFee = calculateEtfScenarioBreakdown(
      scenarioInitialInvestment ?? 0,
      afterFeeRate,
      contributionAmount,
      horizonYears,
      contributionCadence,
    );
    return {
      horizonYears,
      startingInvestment: noFee.startingInvestment,
      totalContributions: noFee.totalContributions,
      noFeeValue: noFee.totalValue,
      noFeeGrowth: noFee.projectedGrowth,
      afterFeeValue: afterFee.totalValue,
      afterFeeGrowth: afterFee.projectedGrowth,
      afterFeeAnnualReturn: afterFeeRate,
      noFeeAnnualReturn: noFeeRate,
    };
  };
  const renderContributionControls = (testID: string) => (
    <View style={{ marginTop: 12 }}>
        <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 14 }}>
        Contribution per deposit
      </Text>
      <TextInput
        testID={testID}
        accessibilityLabel="ETF contribution amount per deposit in dollars"
        value={contributionInput}
        onChangeText={(value) => setContributionInput(value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1'))}
        keyboardType="decimal-pad"
        placeholder="0"
        placeholderTextColor={colors.mutedForeground}
        style={{
          color: colors.foreground,
          backgroundColor: colors.input,
          borderColor: colors.border,
          borderWidth: 1,
          borderRadius: 8,
          paddingHorizontal: 12,
          paddingVertical: 9,
          marginTop: 6,
          fontFamily: 'Inter_600SemiBold',
        }}
      />
      <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 12, marginTop: 12 }}>
        Contribution schedule
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 7 }}>
        {ETF_CONTRIBUTION_CADENCES.map((cadence) => {
          const selected = contributionCadence === cadence;
          const label = cadence.charAt(0).toUpperCase() + cadence.slice(1);
          return (
            <Pressable
              key={cadence}
              testID={`${testID.replace('-contribution-input', '')}-cadence-${cadence}`}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`Set contribution schedule to ${label.toLowerCase()}`}
              onPress={() => {
                contributionCadenceTouched.current = true;
                setContributionCadence(cadence);
              }}
              style={{
                minHeight: 44,
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: selected ? colors.primary : colors.border,
                borderRadius: 8,
                paddingHorizontal: 10,
                backgroundColor: selected ? colors.primary : 'transparent',
              }}
            >
              <Text style={{
                color: selected ? colors.primaryForeground : colors.foreground,
                fontFamily: 'Inter_600SemiBold',
                fontSize: 11,
              }}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 15, marginTop: 5 }}>
        Deposited at the end of each {contributionCadence === 'weekly'
          ? 'week'
          : contributionCadence === 'monthly' ? 'month' : 'quarter'}, alongside a {scenarioInitialInvestment == null ? 'valid starting investment' : fmtPrice(scenarioInitialInvestment)} starting investment.
      </Text>
    </View>
  );
  const renderScenarioInitialInvestmentControl = () => (
    <View style={{ marginTop: 12 }}>
      <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 14 }}>
        Starting investment
      </Text>
      <TextInput
        testID="etf-scenario-initial-investment"
        accessibilityLabel="Starting investment amount in dollars"
        value={scenarioInitialInvestmentInput}
        onChangeText={(value) => setScenarioInitialInvestmentInput(value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1'))}
        keyboardType="decimal-pad"
        placeholder="100"
        placeholderTextColor={colors.mutedForeground}
        style={{ minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, color: colors.foreground, fontSize: 16, fontFamily: 'Inter_600SemiBold', marginTop: 6 }}
      />
      {scenarioInitialInvestment == null && (
        <Text style={{ color: colors.sellColor, fontSize: 12, lineHeight: 17, marginTop: 4 }}>
          Enter an amount greater than $0 to calculate projections.
        </Text>
      )}
    </View>
  );
  const renderScenarioHorizonSelector = () => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
      {ETF_SCENARIO_HORIZONS.map((horizonYears) => {
        const selected = selectedScenarioHorizon === horizonYears;
        return (
          <Pressable
            key={horizonYears}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            testID={`etf-scenario-horizon-${horizonYears}`}
            onPress={() => setSelectedScenarioHorizon(horizonYears)}
            style={{
              minWidth: 54,
            minHeight: 44,
              alignItems: 'center',
              borderWidth: 1,
              borderColor: selected ? colors.primary : colors.border,
              borderRadius: 8,
              paddingHorizontal: 10,
              paddingVertical: 7,
              backgroundColor: selected ? colors.primary : 'transparent',
            }}
          >
            <Text style={{
              color: selected ? colors.primaryForeground : colors.foreground,
              fontFamily: 'Inter_600SemiBold',
              fontSize: 12,
            }}>
              {horizonYears} yr
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  const persistHoldingSnapshot = useCallback((snapshot: HeatMapEtfHoldingSnapshot) => {
    const nextWrite = snapshotWriteQueue.current.catch(() => {}).then(async () => {
      const stored = parseSavedEtfHoldingSnapshots(
        await AsyncStorage.getItem(ETF_HOLDING_SNAPSHOTS_KEY),
      );
      const next = upsertSavedEtfHoldingSnapshot(stored, snapshot);
      setHoldingSnapshots(next);
      if (JSON.stringify(stored) !== JSON.stringify(next)) {
        await AsyncStorage.setItem(ETF_HOLDING_SNAPSHOTS_KEY, JSON.stringify(next));
      }
      setSnapshotStorageError('');
    }).catch(() => {
      setSnapshotStorageError('Could not save ETF holding history on this device.');
    });
    snapshotWriteQueue.current = nextWrite;
    return nextWrite;
  }, []);

  const persistCompareSymbols = (symbols: string[]): Promise<boolean> => {
    savedCompareSymbolsRef.current = symbols;
    setSavedCompareSymbols(symbols);
    const write = comparisonWriteQueue.current.catch(() => {}).then(async () => {
      await AsyncStorage.setItem(ETF_COMPARISON_KEY, JSON.stringify(symbols));
      return true;
    }).catch(() => false);
    comparisonWriteQueue.current = write.then((saved) => {
      setCompareStorageError(saved ? '' : 'Could not save ETF comparisons on this device.');
    });
    return write;
  };

  const removeCompareSymbol = (candidate: string) => {
    persistCompareSymbols(savedCompareSymbolsRef.current.filter((item) => item !== candidate));
    setCompareFunds((current) => current.filter((item) => item.symbol !== candidate));
    setCompareFailedSymbols((current) => current.filter((item) => item !== candidate));
    setReplaceTarget((current) => current === candidate ? null : current);
  };

  const switchComparisonFocus = async (candidate: string) => {
    if (focusSwitching) return;
    setFocusSwitching(true);
    const currentSymbol = symbol.toUpperCase();
    const nextSymbols = rotateSavedEtfComparisonFocus(
      currentSymbol,
      candidate,
      savedCompareSymbolsRef.current,
    );
    try {
      const saved = await persistCompareSymbols(nextSymbols);
      if (saved) router.push({ pathname: '/analysis/[symbol]', params: { symbol: candidate } });
    } finally {
      setFocusSwitching(false);
    }
  };

  const loadCompareFund = async (candidate: string) => {
    setComparePendingSymbols((current) => current.includes(candidate) ? current : [...current, candidate]);
    setCompareFailedSymbols((current) => current.filter((item) => item !== candidate));
    try {
      const response = await apiFetch<{
        assetType?: string;
        currentPrice?: number;
        etfAnalysis?: EtfAnalysisPayload;
      }>('/api/stocks/analyze', {
        method: 'POST',
        body: JSON.stringify({ symbol: candidate, includeCommentary: false }),
      });
      const analysis = response.etfAnalysis;
      if (response.assetType !== 'etf' || !analysis) {
        removeCompareSymbol(candidate);
        setCompareError(`${candidate} is no longer identified as an ETF by the provider.`);
        return;
      }
      if (!savedCompareSymbolsRef.current.includes(candidate)) return;
      const reportedHoldings = analysis.topHoldings.flatMap((holding) =>
        holding.weight == null ? [] : [{ ...holding, weight: holding.weight }]);
      const snapshot = createEtfHoldingSnapshot(
        candidate,
        analysis.topHoldingsReportedCount,
        analysis.topHoldingsRetrievedAt,
        reportedHoldings,
      );
      if (snapshot) void persistHoldingSnapshot(snapshot);
      setCompareFunds((current) => current.some((item) => item.symbol === candidate)
        ? current
        : [...current, {
          symbol: candidate,
          topHoldings: reportedHoldings,
          topHoldingsReportedCount: analysis.topHoldingsReportedCount,
          topHoldingsRetrievedAt: analysis.topHoldingsRetrievedAt,
          currentPrice: response.currentPrice ?? 0,
          expenseRatio: analysis.expenseRatio,
          sectorWeights: analysis.sectorWeights,
          sectorWeightsRetrievedAt: analysis.sectorWeightsRetrievedAt,
          analysis,
        }]);
    } catch {
      setCompareFailedSymbols((current) => current.includes(candidate) ? current : [...current, candidate]);
      setCompareError(`Could not load reported holdings for ${candidate}. It remains saved for retry.`);
    } finally {
      setComparePendingSymbols((current) => current.filter((item) => item !== candidate));
    }
  };

  useEffect(() => {
    let cancelled = false;
    setCompareFunds([]);
    setCompareFailedSymbols([]);
    setCompareRestoreLoading(true);
    AsyncStorage.getItem(ETF_COMPARISON_KEY).then(async (stored) => {
      const symbols = parseSavedEtfComparisonSymbols(stored);
      if (cancelled) return;
      savedCompareSymbolsRef.current = symbols;
      setSavedCompareSymbols(symbols);
      const toRestore = symbols.filter((item) => item !== symbol.toUpperCase());
      setComparePendingSymbols(toRestore);
      setCompareRestoreLoading(false);

      const results = await Promise.all(toRestore.map(async (candidate) => {
        try {
          const response = await apiFetch<{
            assetType?: string;
            currentPrice?: number;
            etfAnalysis?: EtfAnalysisPayload;
          }>('/api/stocks/analyze', {
            method: 'POST',
            body: JSON.stringify({ symbol: candidate, includeCommentary: false }),
          });
          return {
            candidate,
            analysis: response.assetType === 'etf' ? response.etfAnalysis ?? null : null,
            currentPrice: response.currentPrice ?? 0,
            failed: false,
          };
        } catch {
          return { candidate, analysis: null, failed: true };
        }
      }));
      if (cancelled) return;
      for (const { candidate, analysis, currentPrice: comparisonPrice, failed } of results) {
        if (analysis) {
          const reportedHoldings = analysis.topHoldings.flatMap((holding) =>
            holding.weight == null ? [] : [{ ...holding, weight: holding.weight }]);
          const snapshot = createEtfHoldingSnapshot(
            candidate,
            analysis.topHoldingsReportedCount,
            analysis.topHoldingsRetrievedAt,
            reportedHoldings,
          );
          if (snapshot) void persistHoldingSnapshot(snapshot);
          setCompareFunds((current) => current.some((item) => item.symbol === candidate)
            ? current
            : [...current, {
              symbol: candidate,
              topHoldings: reportedHoldings,
              topHoldingsReportedCount: analysis.topHoldingsReportedCount,
              topHoldingsRetrievedAt: analysis.topHoldingsRetrievedAt,
              currentPrice: comparisonPrice,
              expenseRatio: analysis.expenseRatio,
              sectorWeights: analysis.sectorWeights,
              sectorWeightsRetrievedAt: analysis.sectorWeightsRetrievedAt,
              analysis,
            }]);
        } else if (failed) {
          setCompareFailedSymbols((current) => current.includes(candidate) ? current : [...current, candidate]);
        } else {
          removeCompareSymbol(candidate);
          setCompareError(`${candidate} is no longer identified as an ETF by the provider and was removed.`);
        }
      }
      setComparePendingSymbols([]);
    }).catch(() => {
      if (!cancelled) {
        setCompareStorageError('Could not restore saved ETF comparisons from this device.');
        setCompareRestoreLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [symbol, apiFetch, persistHoldingSnapshot]);

  const currentEtfSnapshot = useMemo(() => createEtfHoldingSnapshot(
    symbol,
    fund.topHoldingsReportedCount,
    fund.topHoldingsRetrievedAt,
    fund.topHoldings.flatMap((holding) =>
      holding.weight == null ? [] : [{ ...holding, weight: holding.weight }]),
  ), [
    symbol,
    fund.topHoldings,
    fund.topHoldingsReportedCount,
    fund.topHoldingsRetrievedAt,
  ]);

  useEffect(() => {
    if (currentEtfSnapshot) void persistHoldingSnapshot(currentEtfSnapshot);
  }, [currentEtfSnapshot, persistHoldingSnapshot]);

  const addCompareFund = async (candidateOverride?: string) => {
    const candidate = (candidateOverride ?? compareTicker).trim().toUpperCase();
    if (!/^[A-Z0-9.^=-]{1,20}$/.test(candidate)) {
      setCompareError('Enter a valid ETF ticker.');
      return;
    }
    if (candidate === symbol.toUpperCase()
      || (savedCompareSymbolsRef.current.includes(candidate) && candidate !== replaceTarget)) {
      setCompareError('That ETF is already selected.');
      return;
    }
    if (replaceTarget === candidate) {
      setCompareError('Enter a different ETF ticker to replace this one.');
      return;
    }
    if (
      !replaceTarget
      && savedCompareSymbolsRef.current.length + chartTickerSymbols.length >= 4
    ) {
      setCompareError('Compare up to four additional tickers in the chart.');
      return;
    }
    setCompareLoading(true);
    setCompareError('');
    const nextSymbols = replaceTarget
      ? savedCompareSymbolsRef.current.map((item) => item === replaceTarget ? candidate : item)
      : [...savedCompareSymbolsRef.current, candidate];
    persistCompareSymbols(nextSymbols);
    if (replaceTarget) {
      setCompareFunds((current) => current.filter((item) => item.symbol !== replaceTarget));
      setCompareFailedSymbols((current) => current.filter((item) => item !== replaceTarget));
    }
    setCompareTicker('');
    setReplaceTarget(null);
    await loadCompareFund(candidate);
    setCompareLoading(false);
  };
  const addChartTicker = () => {
    const candidate = chartTickerInput.trim().toUpperCase();
    if (!/^[A-Z0-9.^=-]{1,20}$/.test(candidate)) {
      setChartTickerError('Enter a valid stock or ETF ticker.');
      return;
    }
    if (
      candidate === symbol.toUpperCase()
      || selectedComparisonSymbols.includes(candidate)
    ) {
      setChartTickerError('That ticker is already on the chart.');
      return;
    }
    if (selectedComparisonSymbols.length >= 4) {
      setChartTickerError('Compare up to four additional tickers at once.');
      return;
    }
    setChartTickerSymbols((current) => [...current, candidate]);
    setChartTickerInput('');
    setChartTickerError('');
  };
  const removeChartTicker = (candidate: string) => {
    setChartTickerSymbols((current) => current.filter((ticker) => ticker !== candidate));
    setChartTickerError('');
  };
  const selectedFunds = [
    {
      symbol: symbol.toUpperCase(),
      topHoldings: fund.topHoldings.flatMap((holding) =>
        holding.weight == null ? [] : [{ ...holding, weight: holding.weight }]),
      topHoldingsReportedCount: fund.topHoldingsReportedCount,
      topHoldingsRetrievedAt: fund.topHoldingsRetrievedAt,
      expenseRatio: fund.expenseRatio,
      sectorWeights: fund.sectorWeights ?? [],
      sectorWeightsRetrievedAt: fund.sectorWeightsRetrievedAt ?? null,
    },
    ...compareFunds,
  ];
  const primaryHistoryComparison = compareEtfHoldingSnapshots(currentEtfSnapshot, holdingSnapshots);
  const overlaps = findReportedEtfHoldingsOverlap(selectedFunds);
  const sectorComparison = getReportedEtfSectorComparison(selectedFunds);
  const comparisonMetricFunds: { symbol: string; analysis: EtfAnalysisPayload }[] = [
    { symbol: symbol.toUpperCase(), analysis: fund },
    ...compareFunds.map(({ symbol: candidate, analysis }) => ({
      symbol: candidate,
      analysis,
    })),
  ];
  const formatRegimeReturn = (
    analysis: EtfAnalysisPayload,
    regime: 'bull' | 'bear' | 'mixed',
  ) => {
    const period = analysis.marketRegime?.periods[regime];
    if (!period || period.averageAnnualReturn == null || period.years <= 0) return 'Unavailable';
    return `${formatEtfComparisonValue(period.averageAnnualReturn, 'percent')} · ${period.years} yr`;
  };
  const comparisonMetricRows: {
    label: string;
    value: (analysis: EtfAnalysisPayload) => string;
  }[] = [
    {
      label: 'Expense ratio',
      value: (analysis) => isValidEtfExpenseRatio(analysis.expenseRatio)
        ? formatEtfComparisonValue(analysis.expenseRatio, 'percent')
        : 'Unavailable',
    },
    {
      label: 'Category average fee',
      value: (analysis) => {
        const peer = analysis.peerExpenseComparison;
        if (!peer) return 'Unavailable';
        const average = isValidEtfExpenseRatio(peer.categoryAverageExpenseRatio)
          ? formatEtfComparisonValue(peer.categoryAverageExpenseRatio, 'percent')
          : 'Unavailable';
        return `${average} · ${peer.category}`;
      },
    },
    {
      label: 'Fee difference',
      value: (analysis) => {
        const peer = analysis.peerExpenseComparison;
        const status = getEtfFeeComparisonStatus(
          peer?.fundExpenseRatio,
          peer?.categoryAverageExpenseRatio,
          peer?.difference,
        );
        if (status === 'unavailable') return 'Unavailable';
        const difference = formatEtfComparisonValue(peer?.difference, 'basis-points');
        return status === 'above-average'
          ? `${difference} · Above category average`
          : difference;
      },
    },
    {
      label: 'Assets under management',
      value: (analysis) => formatEtfComparisonValue(analysis.totalAssets, 'assets'),
    },
    {
      label: 'Category average assets',
      value: (analysis) => {
        const peer = analysis.peerAssetSizeComparison;
        if (!peer) return 'Unavailable';
        return `${formatEtfComparisonValue(peer.categoryAverageTotalAssets, 'assets')} · ${peer.category}`;
      },
    },
    {
      label: '3-year beta',
      value: (analysis) => formatEtfComparisonValue(analysis.beta3Year, 'number'),
    },
    {
      label: '1-year annualized volatility',
      value: (analysis) => formatEtfComparisonValue(analysis.annualizedVolatility, 'percent'),
    },
    {
      label: '1-year maximum drawdown',
      value: (analysis) => formatEtfComparisonValue(analysis.maxDrawdown, 'percent'),
    },
    {
      label: 'Return / volatility ratio',
      value: (analysis) => formatEtfComparisonValue(analysis.riskAdjustedReturn, 'number'),
    },
    {
      label: '1-year annualized return',
      value: (analysis) => formatEtfComparisonValue(analysis.annualizedReturn, 'percent'),
    },
    {
      label: 'Verified benchmark return',
      value: (analysis) => {
        const tracking = analysis.trackingComparison;
        if (!hasValidTrackingHistory(tracking) || !analysis.benchmark) return 'Unavailable';
        const value = tracking.benchmarkAnnualizedReturn;
        if (value == null) return 'Unavailable';
        return `${formatEtfComparisonValue(value, 'percent')} · ${analysis.benchmark.symbol}`;
      },
    },
    {
      label: 'Tracking difference',
      value: (analysis) => analysis.benchmark && hasValidTrackingHistory(analysis.trackingComparison)
        ? formatEtfComparisonValue(analysis.trackingComparison.trackingDifference, 'percent')
        : 'Unavailable',
    },
    {
      label: 'Annualized tracking error',
      value: (analysis) => analysis.benchmark && hasValidTrackingHistory(analysis.trackingComparison)
        ? formatEtfComparisonValue(analysis.trackingComparison.trackingError, 'percent')
        : 'Unavailable',
    },
    { label: 'Bull regime average', value: (analysis) => formatRegimeReturn(analysis, 'bull') },
    { label: 'Bear regime average', value: (analysis) => formatRegimeReturn(analysis, 'bear') },
    { label: 'Mixed regime average', value: (analysis) => formatRegimeReturn(analysis, 'mixed') },
  ];
  const comparisonHighlightMetrics: {
    label: string;
    value: (analysis: EtfAnalysisPayload) => number | null;
    format: (value: number) => string;
    hasMeaningfulGap: (minimum: number, maximum: number) => boolean;
  }[] = [
    {
      label: 'Expense ratio',
      value: (analysis) => isValidEtfExpenseRatio(analysis.expenseRatio) ? analysis.expenseRatio : null,
      format: (value) => formatEtfComparisonValue(value, 'percent'),
      hasMeaningfulGap: (minimum, maximum) => maximum - minimum >= 0.0001,
    },
    {
      label: '1-year annualized return',
      value: (analysis) => analysis.annualizedReturn,
      format: (value) => formatEtfComparisonValue(value, 'percent'),
      hasMeaningfulGap: (minimum, maximum) => maximum - minimum >= 0.01,
    },
    {
      label: '1-year annualized volatility',
      value: (analysis) => analysis.annualizedVolatility,
      format: (value) => formatEtfComparisonValue(value, 'percent'),
      hasMeaningfulGap: (minimum, maximum) => maximum - minimum >= 0.01,
    },
    {
      label: '1-year maximum drawdown',
      value: (analysis) => analysis.maxDrawdown,
      format: (value) => formatEtfComparisonValue(value, 'percent'),
      hasMeaningfulGap: (minimum, maximum) => maximum - minimum >= 0.01,
    },
    {
      label: 'Distribution yield',
      value: (analysis) => analysis.dividendYield,
      format: (value) => formatEtfComparisonValue(value, 'percent'),
      hasMeaningfulGap: (minimum, maximum) => maximum - minimum >= 0.01,
    },
    {
      label: '3-year beta',
      value: (analysis) => analysis.beta3Year,
      format: (value) => formatEtfComparisonValue(value, 'number'),
      hasMeaningfulGap: (minimum, maximum) => maximum - minimum >= 0.1,
    },
    {
      label: 'Assets under management',
      value: (analysis) => analysis.totalAssets,
      format: (value) => formatEtfComparisonValue(value, 'assets'),
      hasMeaningfulGap: (minimum, maximum) => minimum > 0 && maximum / minimum >= 1.25,
    },
  ];
  const sharedHighlightMetricCount = comparisonHighlightMetrics.filter((metric) =>
    comparisonMetricFunds.filter(({ analysis }) => {
      const value = metric.value(analysis);
      return value != null && Number.isFinite(value);
    }).length >= 2,
  ).length;
  const comparisonHighlights = comparisonHighlightMetrics.flatMap((metric) => {
    const values = comparisonMetricFunds.flatMap(({ symbol: fundSymbol, analysis }) => {
      const value = metric.value(analysis);
      return value != null && Number.isFinite(value) ? [{ symbol: fundSymbol, value }] : [];
    });
    if (values.length < 2) return [];
    const minimum = values.reduce((current, candidate) => candidate.value < current.value ? candidate : current);
    const maximum = values.reduce((current, candidate) => candidate.value > current.value ? candidate : current);
    if (maximum.value === minimum.value || !metric.hasMeaningfulGap(minimum.value, maximum.value)) return [];
    return [{
      label: metric.label,
      minimum,
      maximum,
      format: metric.format,
    }];
  }).slice(0, 3);
  const pctValue = (value: number | null) => value == null ? 'Unavailable' : `${(value * 100).toFixed(2)}%`;
  const sourceDate = (asOf: string) => new Date(asOf).toLocaleDateString();
  const snapshotDateTime = (asOf: string) => {
    const timestamp = Date.parse(asOf);
    return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString() : 'date unavailable';
  };
  const shareOverlapSummary = async () => {
    const message = formatReportedEtfHoldingsOverlapShare(
      selectedFunds,
      overlaps,
      comparisonMetricFunds,
    );
    setShareStatus('');
    setManualCopySummary(null);
    const browserNavigator = Platform.OS === 'web' && typeof navigator !== 'undefined'
      ? navigator
      : undefined;
    const result = await shareEtfOverlapSummary({
      platform: Platform.OS === 'web' ? 'web' : 'native',
      message,
      webShare: typeof browserNavigator?.share === 'function'
        ? (data) => browserNavigator.share(data)
        : undefined,
      clipboardWriteText: browserNavigator?.clipboard?.writeText
        ? (text) => browserNavigator.clipboard.writeText(text)
        : undefined,
      nativeShare: async (data) => {
        const shareResult = await Share.share(data);
        return shareResult.action === Share.dismissedAction ? 'dismissed' : 'shared';
      },
    });
    if (result === 'copied') setShareStatus('Summary copied to clipboard.');
    else if (result === 'manual-copy') setManualCopySummary(message);
    else if (result === 'unavailable') setShareStatus('Sharing is not available in this browser.');
    else if (result === 'failed') {
      setShareStatus('Could not share the ETF comparison summary. Please try again.');
    }
  };
  return (
    <>
      <Modal
        transparent
        animationType="fade"
        visible={manualCopySummary !== null}
        onRequestClose={() => setManualCopySummary(null)}
      >
        <View style={{ flex: 1, justifyContent: 'center', padding: 20, backgroundColor: 'rgba(0,0,0,0.72)' }}>
          <View style={{
            maxHeight: '82%',
            backgroundColor: colors.card,
            borderColor: colors.border,
            borderWidth: 1,
            borderRadius: 16,
            padding: 18,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 18 }}>
                Copy comparison summary
              </Text>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Close manual copy summary"
                onPress={() => setManualCopySummary(null)}
                hitSlop={10}
              >
                <Ionicons name="close" size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            <Text style={{ color: colors.mutedForeground, fontSize: 13, lineHeight: 19, marginTop: 8 }}>
              Sharing and clipboard access are blocked. Select the summary below and copy it manually.
            </Text>
            <ScrollView style={{ maxHeight: 360, marginTop: 14 }} nestedScrollEnabled>
              <Text
                selectable
                testID="manual-copy-etf-comparison-summary"
                style={{ color: colors.foreground, fontSize: 13, lineHeight: 19 }}
              >
                {manualCopySummary}
              </Text>
            </ScrollView>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => setManualCopySummary(null)}
              style={{ alignSelf: 'flex-end', paddingHorizontal: 12, paddingVertical: 10, marginTop: 10 }}
            >
              <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold' }}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <EtfSectionAnchor sectionId="overview" title="Overview" onLayout={onSectionLayout} onRef={onSectionRef} />
      <EtfMarketIntelligence quotes={marketQuotes} updatedAt={marketUpdatedAt} />
      <EtfCardEntrance>
      {scoreCardHidden ? (
        <View testID="etf-score-card-hidden" style={[recStyles.hero, {
          backgroundColor: colors.card,
          borderColor: colors.border,
          paddingVertical: 12,
        }]}>
          <Pressable
            testID="etf-score-card-show"
            accessibilityRole="button"
            accessibilityLabel="Show ETF research score card"
            onPress={() => setScoreCardHidden(false)}
            style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          >
            <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>
              Show ETF research score
            </Text>
          </Pressable>
        </View>
      ) : (
      <View style={[recStyles.hero, {
        backgroundColor: colors.card,
        borderColor: profileScore.score == null ? colors.primary : etfScoreColor(profileScore.score),
      }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={[recStyles.actionLabel, { color: colors.primary, fontFamily: 'Inter_600SemiBold', textAlign: 'center', flex: 1 }]}>
            MEISNER ETF RESEARCH SCORE
          </Text>
          <Pressable
            testID="etf-score-card-hide"
            accessibilityRole="button"
            accessibilityLabel="Hide ETF research score card"
            onPress={() => setScoreCardHidden(true)}
            hitSlop={8}
            style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold', fontSize: 11 }}>
              Hide
            </Text>
          </Pressable>
        </View>
        <View style={{ alignItems: 'center', marginTop: 10 }}>
          {profileScore.score == null ? (
            <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold', fontSize: 18 }}>Not scored</Text>
          ) : <EtfScoreGauge score={profileScore.score} />}
          <Text testID="etf-score-classification" style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 17, marginTop: 8 }}>
            {scoreClassification}
          </Text>
          <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 1, marginTop: 3 }}>
            ETF SCORE CLASSIFICATION
          </Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 13, marginTop: 4 }}>
            {profileScore.availableComponents} of 5 factors rated
          </Text>
          <Text
            testID="etf-score-history"
            style={{
              color: scoreChangeResult?.status === 'available' && scoreChangeResult.change > 0
                ? colors.buyColor
                : scoreChangeResult?.status === 'available' && scoreChangeResult.change < 0
                  ? colors.sellColor
                  : colors.mutedForeground,
              fontSize: 12,
              lineHeight: 17,
              textAlign: 'center',
              marginTop: 6,
              paddingHorizontal: 12,
            }}
          >
            {!scoreHistoryReady
              ? 'Checking score history…'
              : scoreHistoryCleared
                ? 'Saved score history was cleared from this device.'
              : scoreChangeResult?.status === 'available'
                ? `Previous score ${scoreChangeResult.previousScore}/100 on ${new Date(scoreChangeResult.previousRecordedAt).toLocaleDateString()} · Change ${scoreChangeResult.change > 0 ? '+' : ''}${scoreChangeResult.change} points`
                : scoreChangeResult?.status === 'first-analysis'
                  ? 'History starts with this analysis. A change will appear after another analysis with the same factors and data sources.'
                  : scoreChangeResult?.status === 'stale-inputs'
                    ? 'Score history is unavailable because one or more current inputs are older than 30 days or missing a source date.'
                    : scoreChangeResult?.status === 'stale-history'
                      ? 'No prior score shown because saved history is too old or its inputs were stale.'
                      : scoreChangeResult?.status === 'not-comparable'
                        ? 'No prior score shown because the available factors or their source context changed.'
                        : scoreChangeResult?.status === 'methodology-changed'
                          ? 'Previous scores use benchmark tracking and are not directly comparable with this methodology.'
                        : profileScore.score == null
                          ? 'A score change is unavailable until at least three factors can be rated.'
                          : 'Score history could not be loaded or saved on this device.'}
          </Text>
          <View
            testID="etf-score-history-list"
            style={{ width: '100%', marginTop: 14, borderTopWidth: 1, borderColor: colors.border, paddingTop: 10 }}
          >
            <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 13, marginBottom: 6 }}>
              Dated score history
            </Text>
            {!scoreHistoryReady ? (
              <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Loading saved analyses…</Text>
            ) : scoreHistoryEntries.length === 0 ? (
              <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 17 }}>
                {scoreChangeResult?.status === 'unavailable'
                  ? 'Saved score history could not be loaded or saved on this device.'
                  : 'No saved score analyses yet. A dated score appears when at least three factors are available and fresh.'}
              </Text>
            ) : (
              <>
                {scoreHistoryEntries.slice(-10).reverse().map((entry) => {
                  const changeColor = entry.status === 'available' && (entry.change ?? 0) > 0
                    ? colors.buyColor
                    : entry.status === 'available' && (entry.change ?? 0) < 0
                      ? colors.sellColor
                      : colors.mutedForeground;
                  const comparisonLabel = entry.status === 'available'
                    ? `${(entry.change ?? 0) > 0 ? '+' : ''}${entry.change} pts vs. ${new Date(entry.previousRecordedAt!).toLocaleDateString()}`
                    : entry.status === 'baseline'
                      ? 'Starting point · no earlier saved analysis'
                      : entry.status === 'not-comparable'
                        ? 'Gap · factor coverage or source context changed'
                        : entry.status === 'methodology-changed'
                          ? 'Gap · scoring methodology changed; scores are not comparable'
                        : entry.status === 'stale-inputs'
                          ? 'Gap · this analysis had stale or undated inputs'
                          : 'Gap · earlier inputs were stale or more than one year apart';
                  return (
                    <View
                      key={`${entry.snapshot.recordedAt}-${entry.snapshot.score}`}
                      accessibilityLabel={`${new Date(entry.snapshot.recordedAt).toLocaleDateString()}, score ${entry.snapshot.score} out of 100. ${comparisonLabel}.`}
                      style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, paddingVertical: 6, borderBottomWidth: 1, borderColor: colors.border }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>
                          {new Date(entry.snapshot.recordedAt).toLocaleDateString()}
                        </Text>
                        <Text style={{ color: changeColor, fontSize: 11, lineHeight: 15, marginTop: 2 }}>
                          {comparisonLabel}
                        </Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 14 }}>
                          {entry.snapshot.score}/100
                        </Text>
                        <Pressable
                          testID={`etf-score-history-remove-${entry.snapshot.recordedAt}`}
                          accessibilityRole="button"
                          accessibilityLabel={`Remove score history from ${new Date(entry.snapshot.recordedAt).toLocaleDateString()}`}
                          disabled={scoreHistoryRemoving !== null}
                          onPress={() => confirmRemoveScoreHistoryEntry(entry.snapshot)}
                          style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', opacity: scoreHistoryRemoving === entry.snapshot.recordedAt ? 0.5 : 1 }}
                        >
                          <Feather name="trash-2" size={14} color={colors.sellColor} />
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
                <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16, marginTop: 7 }}>
                  Showing up to 10 recent saved analyses. Point changes compare adjacent entries only when inputs are fresh and factor coverage and source context match; gaps are not interpolated.
                </Text>
                <Pressable
                  testID="etf-score-history-clear"
                  accessibilityRole="button"
                  accessibilityLabel="Clear saved ETF score history"
                  disabled={scoreHistoryClearing}
                  onPress={confirmClearScoreHistory}
                  style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 8, opacity: scoreHistoryClearing ? 0.55 : 1 }}
                >
                  <Feather name="trash-2" size={14} color={colors.sellColor} />
                  <Text style={{ color: colors.sellColor, fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>
                    {scoreHistoryClearing ? 'Clearing history…' : 'Clear score history'}
                  </Text>
                </Pressable>
              </>
            )}
            {!!scoreHistoryClearError && (
              <Text accessibilityRole="alert" style={{ color: colors.sellColor, fontSize: 12, lineHeight: 17, marginTop: 8 }}>
                {scoreHistoryClearError}
              </Text>
            )}
            {!!scoreHistoryRemoveError && (
              <Text accessibilityRole="alert" style={{ color: colors.sellColor, fontSize: 12, lineHeight: 17, marginTop: 8 }}>
                {scoreHistoryRemoveError}
              </Text>
            )}
          </View>
        </View>
        <View style={{ marginTop: 16, borderTopWidth: 1, borderColor: colors.border, paddingTop: 10 }}>
          {profileScore.components.map((component) => {
            const normalizedWeight = component.score == null || availableScoreWeight === 0
              ? null : component.weight / availableScoreWeight;
            const impact = component.score == null || availableScoreWeight === 0
              ? null : component.score * component.weight / availableScoreWeight;
            return (
              <View key={component.id} style={{ paddingVertical: 5 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 13, flex: 1 }}>{component.label}</Text>
                  <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
                    {component.score == null
                      ? 'Unavailable'
                      : `${Math.round(component.score)}/100 · ${Math.round((normalizedWeight ?? 0) * 100)}% weight · +${impact?.toFixed(1)} pts`}
                  </Text>
                </View>
                <View style={{ height: 5, borderRadius: 5, backgroundColor: colors.border, overflow: 'hidden', marginTop: 6 }}>
                  <View style={{ height: '100%', width: `${component.score ?? 0}%`, backgroundColor: colors.primary, opacity: component.score == null ? 0.2 : 0.9 }} />
                </View>
              </View>
            );
          })}
        </View>
        <Text testID="etf-score-methodology" style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18, marginTop: 10 }}>
            Base weights: cost 25%, risk-adjusted performance 20%, diversification 20%, liquidity 15%, and one-year risk 10%. These stated weights are normalized to 100%; missing factors are excluded and the remaining weights are rescaled. Performance is annualized return ÷ annualized volatility using a 0% risk-free proxy, not Sharpe or a peer ranking. Fixed bands: −1 or lower = 0, 0 = 50, +1 or higher = 100. Descriptive score bands: strong 75+, constructive 60–74, mixed 41–59, limited 0–40. Score changes are shown only for fresh analyses with matching factors, methodology, and source context.
        </Text>
        <Text style={[recStyles.horizon, { color: colors.mutedForeground, marginTop: 12, marginBottom: 0 }]}>
          {fund.fundCategory ?? 'ETF'} · Rules-based profile, not a forecast or recommendation.
        </Text>
      </View>
      )}
      </EtfCardEntrance>
      <View
        testID="etf-comparison-switcher"
        style={[cardStyles.card, { backgroundColor: colors.card, borderColor: colors.border, padding: 14 }]}
      >
        <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 14 }}>
          ETF comparison
        </Text>
        <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16, marginTop: 4 }}>
          Viewing {symbol.toUpperCase()}. All verified ETFs in this saved lineup appear together on the performance chart, using only dates reported for every fund.
        </Text>
        <ScrollView
          horizontal
          nestedScrollEnabled
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingTop: 11, paddingRight: 4 }}
          accessibilityLabel="Selected ETF comparison lineup"
        >
          <View
            accessibilityRole="text"
            accessibilityLabel={`Current ETF ${symbol.toUpperCase()}`}
            style={{
              minHeight: 42,
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: colors.primary,
              borderRadius: 10,
              paddingHorizontal: 12,
              backgroundColor: colors.accent,
            }}
          >
            <Text style={{ color: colors.primary, fontFamily: 'Inter_700Bold', fontSize: 12 }}>
              {symbol.toUpperCase()} · CURRENT
            </Text>
          </View>
          {savedCompareSymbols.map((candidate) => (
            <View
              key={`comparison-switch-${candidate}`}
              style={{
                minHeight: 42,
                flexDirection: 'row',
                alignItems: 'center',
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 10,
                backgroundColor: colors.input,
              }}
            >
              <Pressable
                testID={`etf-comparison-switch-${candidate}`}
                accessibilityRole="button"
                accessibilityLabel={`Open ${candidate} ETF details`}
                accessibilityState={{ disabled: focusSwitching }}
                disabled={focusSwitching}
                onPress={() => void switchComparisonFocus(candidate)}
                style={{ minHeight: 42, justifyContent: 'center', paddingLeft: 12, paddingRight: 8 }}
              >
                <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>
                  {candidate}
                </Text>
                <Text style={{ color: colors.mutedForeground, fontSize: 9 }}>
                  {comparePendingSymbols.includes(candidate)
                    ? 'Loading'
                    : compareFailedSymbols.includes(candidate)
                      ? 'Saved · retry'
                      : 'Open details'}
                </Text>
              </Pressable>
              <Pressable
                testID={`etf-comparison-remove-${candidate}`}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${candidate} from comparison`}
                disabled={focusSwitching}
                onPress={() => removeCompareSymbol(candidate)}
                style={{ minHeight: 42, minWidth: 36, alignItems: 'center', justifyContent: 'center', paddingRight: 7 }}
              >
                <Text style={{ color: colors.sellColor, fontSize: 18 }}>×</Text>
              </Pressable>
            </View>
          ))}
        </ScrollView>
        <Text style={{ color: colors.mutedForeground, fontSize: 10, marginTop: 6 }}>
          {savedCompareSymbols.length + 1} of 4 ETFs selected
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 9 }}>
          <TextInput
            testID="etf-comparison-ticker"
            value={compareTicker}
            onChangeText={setCompareTicker}
            placeholder={replaceTarget ? `Replace ${replaceTarget} with…` : 'Add ETF ticker'}
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="characters"
            accessibilityLabel={replaceTarget
              ? `New ETF ticker replacing ${replaceTarget}`
              : 'ETF ticker to add to comparison'}
            style={{
              flex: 1,
              minWidth: 0,
              minHeight: 44,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 8,
              paddingHorizontal: 10,
              color: colors.foreground,
              fontSize: 13,
            }}
          />
          <TouchableOpacity
            testID="etf-comparison-submit"
            accessibilityRole="button"
            accessibilityLabel={replaceTarget ? `Replace ${replaceTarget} ETF` : 'Add ETF to comparison'}
            disabled={compareLoading || compareRestoreLoading}
            onPress={() => void addCompareFund()}
            style={{
              minHeight: 44,
              justifyContent: 'center',
              paddingHorizontal: 12,
              borderRadius: 8,
              backgroundColor: colors.primary,
              opacity: compareLoading || compareRestoreLoading ? 0.6 : 1,
            }}
          >
            <Text style={{ color: colors.primaryForeground, fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>
              {compareRestoreLoading ? 'Restoring' : compareLoading ? 'Loading' : replaceTarget ? 'Replace' : 'Add'}
            </Text>
          </TouchableOpacity>
        </View>
        {!!replaceTarget && (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={`Cancel replacing ${replaceTarget}`}
            onPress={() => {
              setReplaceTarget(null);
              setCompareTicker('');
              setCompareError('');
            }}
            style={{ alignSelf: 'flex-start', minHeight: 40, justifyContent: 'center', paddingHorizontal: 4 }}
          >
            <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Cancel replacement</Text>
          </TouchableOpacity>
        )}
        {!!savedCompareSymbols.length && (
          <ScrollView
            horizontal
            nestedScrollEnabled
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 7, paddingTop: 4, paddingRight: 4 }}
            accessibilityLabel="Replace a selected ETF"
          >
            {savedCompareSymbols.map((candidate) => (
              <Pressable
                key={`replace-${candidate}`}
                testID={`etf-comparison-replace-${candidate}`}
                accessibilityRole="button"
                accessibilityLabel={`Replace ${candidate} in comparison`}
                accessibilityState={{ selected: replaceTarget === candidate }}
                onPress={() => {
                  setReplaceTarget(candidate);
                  setCompareTicker('');
                  setCompareError('');
                }}
                style={{
                  minHeight: 38,
                  justifyContent: 'center',
                  paddingHorizontal: 10,
                  borderWidth: 1,
                  borderColor: replaceTarget === candidate ? colors.primary : colors.border,
                  borderRadius: 18,
                }}
              >
                <Text style={{ color: replaceTarget === candidate ? colors.primary : colors.mutedForeground, fontSize: 11 }}>
                  Replace {candidate}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
        {compareRestoreLoading && (
          <Text style={{ color: colors.mutedForeground, marginTop: 8 }}>Restoring saved ETF comparisons…</Text>
        )}
        {!!compareError && <Text style={{ color: colors.sellColor, marginTop: 8 }}>{compareError}</Text>}
        {!!compareStorageError && <Text style={{ color: colors.sellColor, marginTop: 8 }}>{compareStorageError}</Text>}
        {!!snapshotStorageError && <Text style={{ color: colors.sellColor, marginTop: 8 }}>{snapshotStorageError}</Text>}
      </View>
      <View style={[cardStyles.card, { backgroundColor: colors.card, borderColor: colors.border, padding: 16 }]}>
        <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 14 }}>
          At a glance
        </Text>
        <Text style={{ color: colors.mutedForeground, fontSize: 13, lineHeight: 19, marginTop: 6 }}>
          {profileScore.score == null
            ? 'A profile score is unavailable because none of the score components could be rated from current fund data.'
            : profileScore.score >= 65
              ? 'The available rules-based profile signals are broadly supportive.'
              : profileScore.score <= 40
                ? 'The available rules-based profile signals are limited; review the component coverage and evidence.'
                : 'The available rules-based profile signals are mixed.'}
          {' '}This is a summary of reported data, not a forecast or recommendation.
        </Text>
        <View style={{ borderTopWidth: 1, borderTopColor: colors.border, marginTop: 12, paddingTop: 8 }}>
          <MetricRow label="Fund" value={fund.fundFamily ?? fund.fundCategory ?? 'ETF'} />
          <MetricRow label="Research score" value={profileScore.score == null ? 'Unavailable' : `${profileScore.score}/100`} />
          <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16, marginTop: 4 }}>
            Research score uses {profileScore.availableComponents} of 5 available components. {fund.provider} data retrieved {sourceDate(fund.asOf)}.
          </Text>
        </View>
        <View style={{ borderTopWidth: 1, borderTopColor: colors.border, marginTop: 12, paddingTop: 12 }}>
          <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold', fontSize: 11, letterSpacing: 0.5, marginBottom: 8 }}>
            AI-IDENTIFIED TAKEAWAYS
          </Text>
          {!!fund.strengths.length && (
            <View style={{ marginBottom: fund.risks.length ? 10 : 0 }}>
              <Text style={{ color: colors.buyColor, fontSize: 11, fontFamily: 'Inter_600SemiBold', marginBottom: 6 }}>STRENGTHS</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
                {fund.strengths.map((item, index) => (
                  <Text key={`overview-strength-${index}-${item}`} style={{ color: colors.buyColor, backgroundColor: colors.buyBg, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 6, fontSize: 12 }}>
                    {item}
                  </Text>
                ))}
              </View>
            </View>
          )}
          {!!fund.risks.length && (
            <View>
              <Text style={{ color: colors.sellColor, fontSize: 11, fontFamily: 'Inter_600SemiBold', marginBottom: 6 }}>RISKS TO REVIEW</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
                {fund.risks.map((item, index) => (
                  <Text key={`overview-risk-${index}-${item}`} style={{ color: colors.sellColor, backgroundColor: colors.sellBg, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 6, fontSize: 12 }}>
                    {item}
                  </Text>
                ))}
              </View>
            </View>
          )}
          {!fund.strengths.length && !fund.risks.length && (
            <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>No AI takeaways are available.</Text>
          )}
          <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16, marginTop: 10 }}>
            AI-generated observations are separate from the rules-based score and are not personalized advice.
          </Text>
        </View>
      </View>
      {!!compareFunds.length && (
        <View
          testID="etf-comparison-highlights"
          style={[cardStyles.card, { backgroundColor: colors.card, borderColor: colors.border, padding: 16 }]}
        >
          <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 14 }}>
            Key differences across compared ETFs
          </Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16, marginTop: 5 }}>
            Notable gaps in shared reported metrics—not an overall ranking. Full details remain below.
          </Text>
          {comparisonHighlights.length ? comparisonHighlights.map((highlight) => (
            <View
              key={highlight.label}
              style={{ borderTopWidth: 1, borderTopColor: colors.border, marginTop: 10, paddingTop: 9 }}
            >
              <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: 'Inter_600SemiBold' }}>
                {highlight.label}
              </Text>
              <Text style={{ color: colors.foreground, fontSize: 13, lineHeight: 19, marginTop: 3 }}>
                {highlight.minimum.symbol} {highlight.format(highlight.minimum.value)}
                {'  →  '}
                {highlight.maximum.symbol} {highlight.format(highlight.maximum.value)}
              </Text>
            </View>
          )) : (
            <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 17, marginTop: 10 }}>
              {sharedHighlightMetricCount
                ? 'No notable gaps were found in the metrics reported for both funds.'
                : 'Not enough shared reported data to summarize differences.'}
            </Text>
          )}
        </View>
      )}
      <SectionCard collapsible title="SCORE DETAILS & METHODOLOGY" icon={<Ionicons name="speedometer-outline" size={16} color={colors.primary} />}>
        <View style={{ padding: 16 }}>
          <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 28 }}>
            {profileScore.score == null ? 'Not scored' : `${profileScore.score}/100`}
          </Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 4 }}>
            {profileScore.availableComponents} of 5 components available. Missing components are excluded and remaining weights are rescaled.
          </Text>
          {profileScore.score != null && (
            <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden', marginTop: 12, marginBottom: 6 }}>
              <View style={{ height: '100%', width: `${profileScore.score}%`, backgroundColor: colors.primary }} />
            </View>
          )}
          {profileScore.components.map((component) => {
            const normalizedWeight = component.score == null || availableScoreWeight === 0
              ? null : component.weight / availableScoreWeight * 100;
            return (
              <View key={component.id} style={{ marginTop: 8 }}>
                <MetricRow
                  label={`${component.label} · ${normalizedWeight == null ? `${component.weight}% base weight` : `${normalizedWeight.toFixed(1)}% weight`}`}
                  value={component.score == null ? 'Unavailable' : `${Math.round(component.score)}/100`}
                />
                <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16 }}>{component.detail}</Text>
                {component.peerContext ? (
                  <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16, marginTop: 3 }}>
                    Category: {component.peerContext.category} · category-average assets: {formatEtfProfileAssets(component.peerContext.categoryAverageTotalAssets)} · {component.peerContext.sampleContext}
                    {component.peerContext.sampleSize == null ? '' : ` · ${component.peerContext.sampleSize} funds`}
                    {'\n'}Source: {component.peerContext.source} · retrieved {sourceDate(component.peerContext.asOf)}
                  </Text>
                ) : null}
              </View>
            );
          })}
          <Text style={{ color: colors.mutedForeground, fontSize: 11, marginTop: 12 }}>
            Rules-based, not AI-generated or personalized advice. Fees and net assets use provider category averages when reported; tracking requires a verified benchmark. Sector diversification uses reported sector weights, while volume and risk use fixed bands when peer data is unavailable. Compare funds with similar strategies.
          </Text>
        </View>
      </SectionCard>
      <EtfSectionAnchor sectionId="risk-costs" title="Risk & Costs" onLayout={onSectionLayout} onRef={onSectionRef} />
      <SectionCard collapsible title="FUND PROFILE & RISK" icon={<Ionicons name="layers-outline" size={16} color={colors.primary} />}>
        <View style={{ padding: 16 }}>
          <MetricRow label="Category" value={fund.fundCategory ?? 'Unavailable'} />
          <MetricRow label="Fund family" value={fund.fundFamily ?? 'Unavailable'} />
          <MetricRow label="Expense ratio" value={pctValue(fund.expenseRatio)} />
          <MetricRow label="Distribution yield" value={pctValue(fund.dividendYield)} />
          <MetricRow label="Assets under management" value={formatEtfProfileAssets(fund.totalAssets)} />
          <MetricRow label="3-year beta" value={fmtNum(fund.beta3Year)} />
          <MetricRow label="Average daily volume" value={fund.averageVolume == null ? 'Unavailable' : fmtVol(fund.averageVolume)} />
          <MetricRow label="1-year annualized return" value={pctValue(fund.annualizedReturn)} />
          <MetricRow label="1-year annualized volatility" value={pctValue(fund.annualizedVolatility)} />
          <MetricRow label="1-year maximum drawdown" value={pctValue(fund.maxDrawdown)} />
          <MetricRow label="Return / volatility ratio" value={fmtNum(fund.riskAdjustedReturn)} />
          <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16, marginTop: 6 }}>
            Expense ratio is the annual operating cost as a share of fund assets. Distribution yield can change and is not guaranteed.
          </Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16, marginTop: 6 }}>
            Beta estimates sensitivity to broad-market moves; volatility describes price variation; maximum drawdown is the largest peak-to-trough decline in the period.
          </Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 11, marginTop: 6 }}>
            Risk-adjusted ratio uses a 0% risk-free proxy and is not a Sharpe ratio.
          </Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 11, marginTop: 6 }}>
            Fund data source: {fund.provider} · retrieved {sourceDate(fund.asOf)}
          </Text>
        </View>
      </SectionCard>
      {fund.benchmark && hasValidTrackingHistory(fund.trackingComparison) && (
      <SectionCard collapsible title="BENCHMARK & TRACKING" icon={<Ionicons name="git-compare-outline" size={16} color={colors.primary} />}>
        <View style={{ padding: 16 }}>
          {fund.benchmark ? (
            <>
              <MetricRow label="Provider-identified benchmark" value={`${fund.benchmark.name} (${fund.benchmark.symbol})`} />
              <Text style={{ color: colors.mutedForeground, fontSize: 11, marginTop: 4 }}>
                Source: {fund.benchmark.source} · retrieved {sourceDate(fund.benchmark.asOf)}
              </Text>
            </>
          ) : (
            <Text style={{ color: colors.mutedForeground }}>
              Benchmark unavailable. The provider did not identify a benchmark for this fund.
            </Text>
          )}
          {hasValidTrackingHistory(fund.trackingComparison) ? (
            <>
              <MetricRow label="Fund annualized return" value={pctValue(fund.trackingComparison.fundAnnualizedReturn)} />
              <MetricRow label="Benchmark annualized return" value={pctValue(fund.trackingComparison.benchmarkAnnualizedReturn)} />
              <MetricRow label="Tracking difference" value={pctValue(fund.trackingComparison.trackingDifference)} />
              <MetricRow label="Annualized tracking error" value={pctValue(fund.trackingComparison.trackingError)} />
              <Text style={{ color: colors.mutedForeground, fontSize: 11, marginTop: 6 }}>
                Adjusted monthly returns, {fund.trackingComparison.periodStart}–{fund.trackingComparison.periodEnd} · {fund.trackingComparison.monthlySamples} monthly samples.
                {'\n'}Source: {fund.trackingComparison.source} · retrieved {sourceDate(fund.trackingComparison.asOf)}
              </Text>
            </>
          ) : (
            <Text style={{ color: colors.mutedForeground, marginTop: fund.benchmark ? 8 : 4 }}>
              {fund.trackingComparison
                ? 'Tracking history unavailable because its dates or monthly sample count are invalid or incomplete.'
                : 'Tracking difference and error unavailable without a verified benchmark and enough shared history.'}
            </Text>
          )}
          <Text style={{ color: colors.mutedForeground, fontSize: 11, marginTop: 8 }}>
            SPY is used only to group the separate broad-market regime history; it is not assumed to be this fund’s benchmark.
          </Text>
        </View>
      </SectionCard>
      )}
      <SectionCard collapsible title="COSTS & CATEGORY CONTEXT" icon={<MaterialCommunityIcons name="scale-balance" size={16} color={colors.primary} />}>
        <View style={{ padding: 16 }}>
          {fund.peerExpenseComparison ? (
            <>
              <MetricRow label="Provider category" value={fund.peerExpenseComparison.category} />
              <MetricRow
                label="Fund expense ratio"
                value={isValidEtfExpenseRatio(fund.peerExpenseComparison.fundExpenseRatio)
                  ? pctValue(fund.peerExpenseComparison.fundExpenseRatio)
                  : 'Unavailable'}
              />
              <MetricRow
                label="Category average"
                value={isValidEtfExpenseRatio(fund.peerExpenseComparison.categoryAverageExpenseRatio)
                  ? pctValue(fund.peerExpenseComparison.categoryAverageExpenseRatio)
                  : 'Unavailable'}
              />
              <MetricRow
                label="Fund minus category average"
                value={feeComparisonStatus === 'unavailable'
                  ? 'Unavailable'
                  : `${fund.peerExpenseComparison.difference! > 0 ? '+' : ''}${(fund.peerExpenseComparison.difference! * 10000).toFixed(1)} bps`}
              />
              {feeComparisonStatus === 'above-average' && (
                <Text
                  testID="etf-fee-above-category-average"
                  style={{ color: colors.holdColor, fontSize: 12, lineHeight: 17, marginTop: 2, marginBottom: 5 }}
                >
                  This fund’s fee is above its category average.
                </Text>
              )}
              <Text style={{ color: colors.mutedForeground, fontSize: 11, marginTop: 6 }}>
                {fund.peerExpenseComparison.sampleContext}
                {fund.peerExpenseComparison.sampleSize == null ? '' : ` · ${fund.peerExpenseComparison.sampleSize} funds`}
                {'\n'}Source: {fund.peerExpenseComparison.source} · retrieved {sourceDate(fund.peerExpenseComparison.asOf)}
              </Text>
            </>
          ) : (
            <Text style={{ color: colors.mutedForeground }}>
              Category expense comparison unavailable. The provider did not report a category average.
            </Text>
          )}
        </View>
      </SectionCard>
      <EtfSectionAnchor sectionId="holdings" title="Holdings & Diversification" onLayout={onSectionLayout} onRef={onSectionRef} />
      <SectionCard collapsible title="HOLDINGS & DIVERSIFICATION" icon={<MaterialCommunityIcons name="briefcase-outline" size={16} color={colors.primary} />}>
        <View style={{ padding: 16 }}>
          {fund.topHoldings.length ? fund.topHoldings.map((holding) => (
            <MetricRow key={holding.symbol} label={`${holding.name} (${holding.symbol})`} value={pctValue(holding.weight)} />
          )) : <Text style={{ color: colors.mutedForeground }}>Holdings data unavailable.</Text>}
          <MetricRow label="Provider-reported holdings positions" value={String(fund.topHoldingsReportedCount)} />
          {fund.topHoldingsCombinedWeight != null && (
            <MetricRow label="Combined weight of reported holdings" value={pctValue(fund.topHoldingsCombinedWeight)} />
          )}
          <Text style={{ color: colors.mutedForeground, fontSize: 11, marginTop: 6 }}>
            Provider snapshot retrieved {new Date(fund.topHoldingsRetrievedAt).toLocaleString()}; the provider does not supply a holdings report date here.
          </Text>
          {savedCompareSymbols.filter((candidate) =>
            candidate !== symbol.toUpperCase()
            && !compareFunds.some((fundEntry) => fundEntry.symbol === candidate)
            && !comparePendingSymbols.includes(candidate),
          ).map((candidate) => (
            <View key={`saved-${candidate}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 }}>
              <Text style={{ flex: 1, color: colors.mutedForeground }}>
                {candidate} is saved{compareFailedSymbols.includes(candidate) ? ' but could not be verified right now.' : ' and awaiting ETF verification.'}
              </Text>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={`Retry ${candidate} ETF verification`}
                onPress={() => void loadCompareFund(candidate)}
              >
                <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold' }}>Retry</Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={`Remove saved ${candidate} comparison`}
                onPress={() => removeCompareSymbol(candidate)}
              >
                <Text style={{ color: colors.sellColor }}>Remove</Text>
              </TouchableOpacity>
            </View>
          ))}
          <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', marginTop: 18 }}>Changes between provider snapshots</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16, marginTop: 5 }}>
            These dates are retrieval times, not holdings report dates. Changes compare only snapshots with the same number of fully reported positions.
          </Text>
          {primaryHistoryComparison ? (
            <>
              <Text style={{ color: colors.mutedForeground, fontSize: 11, marginTop: 8 }}>
                Retrieved {snapshotDateTime(primaryHistoryComparison.previousRetrievedAt)} → {snapshotDateTime(primaryHistoryComparison.currentRetrievedAt)} · {primaryHistoryComparison.reportedPositionCount} reported positions in each snapshot
              </Text>
              {primaryHistoryComparison.changes.length ? primaryHistoryComparison.changes.map((change) => {
                const detail = change.change === 'added'
                  ? `Newly reported · ${pctValue(change.currentWeight)}`
                  : change.change === 'removed'
                    ? `No longer reported · ${pctValue(change.previousWeight)}`
                    : `${pctValue(change.previousWeight)} → ${pctValue(change.currentWeight)} (${((change.currentWeight! - change.previousWeight!) * 100).toFixed(2)} percentage points)`;
                return (
                  <View key={`${symbol}-${change.symbol}`} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginTop: 8 }}>
                    <Text style={{ flex: 1, color: colors.mutedForeground }}>{change.name} ({change.symbol})</Text>
                    <Text style={{ color: colors.foreground, textAlign: 'right' }}>{detail}</Text>
                  </View>
                );
              }) : (
                <Text style={{ color: colors.mutedForeground, marginTop: 8 }}>No changes among the reported positions.</Text>
              )}
            </>
          ) : (
            <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 17, marginTop: 4 }}>
              A dated comparison will appear after another complete snapshot with the same reported-position count.
            </Text>
          )}
          {!!compareFunds.length && (
            <>
              {selectedFunds.map((fundEntry) => (
                <Text key={`coverage-${fundEntry.symbol}`} style={{ color: colors.mutedForeground, fontSize: 11, marginTop: 8 }}>
                  {fundEntry.symbol}: {fundEntry.topHoldingsReportedCount} reported positions · retrieved {fundEntry.topHoldingsRetrievedAt ? new Date(fundEntry.topHoldingsRetrievedAt).toLocaleString() : 'date unavailable'}
                </Text>
              ))}
              <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', marginTop: 16 }}>Shared reported positions</Text>
              {overlaps.length ? overlaps.map(({ symbol: holdingSymbol, positions }) => (
                <Text key={holdingSymbol} style={{ color: colors.mutedForeground, marginTop: 8, lineHeight: 20 }}>
                  {holdingSymbol}: {positions.map((position) => `${position.fundSymbol} ${position.name} (${(position.weight * 100).toFixed(2)}%)`).join(' · ')}
                </Text>
              )) : (
                <Text style={{ color: colors.mutedForeground, marginTop: 8 }}>No shared positions among the reported holdings.</Text>
              )}
              <Text style={{ color: colors.mutedForeground, fontSize: 11, marginTop: 8 }}>
                Overlap compares only provider-reported positions, not complete portfolios.
              </Text>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Share ETF comparison summary"
                testID="share-etf-comparison-summary"
                onPress={() => void shareOverlapSummary()}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 14, paddingVertical: 11, borderRadius: 8, backgroundColor: colors.primary }}
              >
                <Ionicons name="share-outline" size={16} color={colors.primaryForeground} />
                <Text style={{ color: colors.primaryForeground, fontFamily: 'Inter_600SemiBold' }}>Share comparison summary</Text>
              </TouchableOpacity>
              {!!shareStatus && (
                <Text accessibilityLiveRegion="polite" style={{ color: colors.mutedForeground, fontSize: 11, marginTop: 7 }}>
                  {shareStatus}
                </Text>
              )}
              <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', marginTop: 18 }}>Provider-reported sector mix</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16, marginTop: 5 }}>
                Provider coverage only, not a complete portfolio reconstruction. Missing weights are not treated as zero.
              </Text>
              {sectorComparison.length ? sectorComparison.map(({ sector, funds: sectorFunds }) => (
                <View key={sector} style={{ marginTop: 12 }}>
                  <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold' }}>{sector}</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 4, marginTop: 4 }}>
                    {sectorFunds.map(({ symbol: fundSymbol, weight }) => (
                      <Text key={`${sector}-${fundSymbol}`} style={{ color: colors.mutedForeground, fontSize: 12 }}>
                        {fundSymbol}: {weight == null ? 'Not reported' : pctValue(weight)}
                      </Text>
                    ))}
                  </View>
                </View>
              )) : (
                <Text style={{ color: colors.mutedForeground, marginTop: 8 }}>No sector weights were reported for these funds.</Text>
              )}
              {selectedFunds.map((fundEntry) => (
                <Text key={`sector-coverage-${fundEntry.symbol}`} style={{ color: colors.mutedForeground, fontSize: 11, marginTop: 8 }}>
                  {fundEntry.symbol} sector data retrieved {fundEntry.sectorWeightsRetrievedAt ? new Date(fundEntry.sectorWeightsRetrievedAt).toLocaleString() : 'date unavailable'}
                </Text>
              ))}
            </>
          )}
        </View>
      </SectionCard>
  {!!compareFunds.length && (
    <SectionCard
      collapsible
      title="ETF COST, RISK & PERFORMANCE"
      icon={<MaterialCommunityIcons name="scale-balance" size={16} color={colors.primary} />}
    >
      <View style={{ padding: 16 }}>
        <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 17, marginBottom: 12 }}>
          Reported figures only. Unavailable data is not zero; compare funds with similar strategies.
        </Text>
        <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator>
          <View style={{ minWidth: 150 + comparisonMetricFunds.length * 124 }}>
            <View style={{
              flexDirection: 'row',
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
              paddingBottom: 8,
            }}>
              <Text style={{ width: 150, color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold', fontSize: 11 }}>
                Metric
              </Text>
              {comparisonMetricFunds.map(({ symbol: fundSymbol }) => (
                <Text
                  key={`comparison-heading-${fundSymbol}`}
                  style={{ width: 124, color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 12 }}
                  numberOfLines={1}
                >
                  {fundSymbol}
                </Text>
              ))}
            </View>
            {comparisonMetricRows.filter((row) => {
              const isTrackingMetric = row.label === 'Verified benchmark return'
                || row.label === 'Tracking difference'
                || row.label === 'Annualized tracking error';
              return !isTrackingMetric || comparisonMetricFunds.some(({ analysis }) =>
                analysis.benchmark && hasValidTrackingHistory(analysis.trackingComparison));
            }).map((row) => (
              <View
                key={row.label}
                style={{
                  flexDirection: 'row',
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                  paddingVertical: 9,
                }}
              >
                <Text style={{ width: 150, color: colors.mutedForeground, fontSize: 11, lineHeight: 15, paddingRight: 8 }}>
                  {row.label}
                </Text>
                {comparisonMetricFunds.map(({ symbol: fundSymbol, analysis: comparison }) => (
                  <Text
                    key={`${row.label}-${fundSymbol}`}
                    style={{ width: 124, color: colors.foreground, fontSize: 11, lineHeight: 15, paddingRight: 10 }}
                  >
                    {row.value(comparison)}
                  </Text>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
        <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', marginTop: 20 }}>
          Long-range historical scenarios
        </Text>
        <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16, marginTop: 5 }}>
          Illustrations, not forecasts. Each fund uses its own expense ratio and historical return assumption.
        </Text>
        {renderContributionControls('etf-comparison-contribution-input')}
        {renderScenarioInitialInvestmentControl()}
        {renderScenarioHorizonSelector()}
        <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator style={{ marginTop: 10 }}>
          <View style={{ flexDirection: 'row', gap: 10, paddingRight: 16 }}>
            {comparisonMetricFunds.map(({ symbol: fundSymbol, analysis: comparison }) => {
              const scenarioRows = ETF_SCENARIO_LABELS.map((label) => ({
                label,
                scenario: parseEtfScenarios(comparison.scenarios)
                  .find((item) => item.label.toLowerCase() === label) ?? null,
              }));
              return (
                <View
                  key={`scenario-comparison-${fundSymbol}`}
                  style={{
                    width: 246,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 10,
                    padding: 12,
                  }}
                >
                  <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', marginBottom: 8 }}>
                    {fundSymbol}
                  </Text>
                  <MetricRow label="Expense ratio used" value={pctValue(comparison.expenseRatio)} />
                  {scenarioRows.map(({ label, scenario }) => (
                    <View
                      key={`${fundSymbol}-${label}`}
                      style={{ borderTopWidth: 1, borderTopColor: colors.border, marginTop: 10, paddingTop: 8 }}
                    >
                      <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', textTransform: 'uppercase' }}>
                        {label} scenario
                      </Text>
                      <MetricRow
                        label="Historical annual assumption"
                        value={pctValue(scenario?.annualReturnAssumption ?? null)}
                      />
                      <MetricRow
                        label={`No-fee total in ${selectedScenarioHorizon} years`}
                        value={selectedProjection(scenario, selectedScenarioHorizon)?.noFeeValue == null
                          ? 'Unavailable'
                          : fmtPrice(selectedProjection(scenario, selectedScenarioHorizon)!.noFeeValue!)}
                      />
                      <MetricRow
                        label={`After-fee total in ${selectedScenarioHorizon} years`}
                        value={selectedProjection(scenario, selectedScenarioHorizon)?.afterFeeValue == null
                          ? 'Unavailable'
                          : fmtPrice(selectedProjection(scenario, selectedScenarioHorizon)!.afterFeeValue!)}
                      />
                      <MetricRow
                        label="Starting investment"
                        value={selectedProjection(scenario, selectedScenarioHorizon)?.startingInvestment == null
                          ? 'Unavailable'
                          : fmtPrice(selectedProjection(scenario, selectedScenarioHorizon)!.startingInvestment!)}
                      />
                      <MetricRow
                        label="Total contributions"
                        value={selectedProjection(scenario, selectedScenarioHorizon)?.totalContributions == null
                          ? 'Unavailable'
                          : fmtPrice(selectedProjection(scenario, selectedScenarioHorizon)!.totalContributions!)}
                      />
                      <MetricRow
                        label={`No-fee projected growth in ${selectedScenarioHorizon} years`}
                        value={selectedProjection(scenario, selectedScenarioHorizon)?.noFeeGrowth == null
                          ? 'Unavailable'
                          : fmtPrice(selectedProjection(scenario, selectedScenarioHorizon)!.noFeeGrowth!)}
                      />
                      <MetricRow
                        label={`After-fee projected growth in ${selectedScenarioHorizon} years`}
                        value={selectedProjection(scenario, selectedScenarioHorizon)?.afterFeeGrowth == null
                          ? 'Unavailable'
                          : fmtPrice(selectedProjection(scenario, selectedScenarioHorizon)!.afterFeeGrowth!)}
                      />
                      <Text style={{ color: colors.mutedForeground, fontSize: 10, lineHeight: 14, marginTop: 4 }}>
                        {scenario?.assumption ?? 'Unavailable: no reported historical scenario for this regime.'}
                      </Text>
                    </View>
                  ))}
                </View>
              );
            })}
          </View>
        </ScrollView>
        <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16, marginTop: 8 }}>
          Historical-regime illustrations only, not forecasts or guarantees. They assume a constant annual return applied across the selected schedule, with contributions deposited at the end of each {contributionCadence === 'weekly'
            ? 'week'
            : contributionCadence === 'monthly' ? 'month' : 'quarter'}; actual results may differ.
        </Text>
        {comparisonMetricFunds.map(({ symbol: fundSymbol, analysis: comparison }) => (
          <View
            key={`comparison-context-${fundSymbol}`}
            style={{ borderTopWidth: 1, borderTopColor: colors.border, marginTop: 12, paddingTop: 10 }}
          >
            <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>
              {fundSymbol} · {comparison.fundCategory ?? 'Category unavailable'}
            </Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16, marginTop: 4 }}>
              Fund data: {comparison.provider} · retrieved {sourceDate(comparison.asOf)}.
            </Text>
            {comparison.peerExpenseComparison ? (
              <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16, marginTop: 3 }}>
                Fee baseline: {comparison.peerExpenseComparison.category} · {comparison.peerExpenseComparison.sampleContext}
                {comparison.peerExpenseComparison.sampleSize == null ? '' : ` · ${comparison.peerExpenseComparison.sampleSize} funds`}
                {'\n'}Source: {comparison.peerExpenseComparison.source} · retrieved {sourceDate(comparison.peerExpenseComparison.asOf)}
              </Text>
            ) : (
              <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16, marginTop: 3 }}>
                Fee category average unavailable.
              </Text>
            )}
            {comparison.peerAssetSizeComparison ? (
              <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16, marginTop: 3 }}>
                Asset baseline: {comparison.peerAssetSizeComparison.category} · {comparison.peerAssetSizeComparison.sampleContext}
                {comparison.peerAssetSizeComparison.sampleSize == null ? '' : ` · ${comparison.peerAssetSizeComparison.sampleSize} funds`}
                {'\n'}Source: {comparison.peerAssetSizeComparison.source} · retrieved {sourceDate(comparison.peerAssetSizeComparison.asOf)}
              </Text>
            ) : (
              <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16, marginTop: 3 }}>
                Category average assets unavailable.
              </Text>
            )}
            {comparison.benchmark ? (
              <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16, marginTop: 3 }}>
                Verified benchmark: {comparison.benchmark.name} ({comparison.benchmark.symbol}) · {comparison.benchmark.source} · retrieved {sourceDate(comparison.benchmark.asOf)}
              </Text>
            ) : null}
            {comparison.benchmark && hasValidTrackingHistory(comparison.trackingComparison) ? (
              <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16, marginTop: 3 }}>
                Tracking history: {comparison.trackingComparison.periodStart}–{comparison.trackingComparison.periodEnd} · {comparison.trackingComparison.monthlySamples} monthly samples · {comparison.trackingComparison.source} · retrieved {sourceDate(comparison.trackingComparison.asOf)}
              </Text>
            ) : null}
            {comparison.marketRegime ? (
              <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16, marginTop: 3 }}>
                Regime returns: {comparison.marketRegime.firstYear}–{comparison.marketRegime.lastYear}, grouped by {comparison.marketRegime.benchmarkSymbol}; each row shows its reported years. Historical comparison only.
              </Text>
            ) : (
              <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16, marginTop: 3 }}>
                Historical regime performance unavailable.
              </Text>
            )}
          </View>
        ))}
        <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16, marginTop: 12 }}>
          Risk-adjusted return uses a 0% risk-free proxy and is not a Sharpe ratio. Reported categories, benchmarks, periods, and samples can differ; this comparison does not imply that fund strategies are interchangeable.
        </Text>
      </View>
    </SectionCard>
  )}
      <EtfSectionAnchor sectionId="performance" title="Performance" onLayout={onSectionLayout} onRef={onSectionRef} />
      <View style={[cardStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={chartCardStyles.header}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Feather name="trending-up" size={14} color={colors.primary} />
            <Text style={[cardStyles.title, { color: colors.foreground, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.5 }]}>
              PRICE HISTORY · {symbol.toUpperCase()}
            </Text>
          </View>
          <View style={chartCardStyles.periodRow}>
            {PERIODS.map(({ label, value }) => (
              <TouchableOpacity
                key={value}
                testID={`etf-chart-period-${value}`}
                accessibilityRole="button"
                accessibilityState={{ selected: period === value }}
                accessibilityLabel={`Show ${label} ETF price history`}
                style={[
                  chartCardStyles.pill,
                  { borderColor: colors.border },
                  period === value && { backgroundColor: colors.primary, borderColor: colors.primary },
                ]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  setPeriod(value);
                }}
                activeOpacity={0.7}
              >
                <Text style={[
                  chartCardStyles.pillText,
                  { color: period === value ? colors.primaryForeground : colors.mutedForeground, fontFamily: 'Inter_600SemiBold' },
                ]}>
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <View style={[cardStyles.divider, { backgroundColor: colors.border }]} />
        <View style={chartCardStyles.chartArea}>
          {primaryLoading ? (
            <View style={[chartCardStyles.loader, { height: 240 }]}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[chartCardStyles.loaderText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                Loading price history…
              </Text>
            </View>
          ) : primaryError ? (
            <View style={{ minHeight: 160, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <Text style={{ color: colors.mutedForeground, textAlign: 'center' }}>
                Price history could not be loaded. No chart is shown.
              </Text>
              <Pressable
                testID="etf-chart-retry"
                accessibilityRole="button"
                onPress={retryPrimaryChart}
                style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 16 }}
              >
                <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold' }}>Retry price history</Text>
              </Pressable>
            </View>
          ) : primaryCandles.length < 2 ? (
            <View style={{ minHeight: 160, justifyContent: 'center', paddingHorizontal: 8 }}>
              <Text style={{ color: colors.mutedForeground, textAlign: 'center', lineHeight: 18 }}>
                {primaryCandles.length === 1
                  ? 'Only one dated price observation is available; a trend line needs at least two.'
                  : 'Price history is unavailable for this period.'}
              </Text>
            </View>
          ) : (
            <ComparisonChart
              primaryCandles={chartPrimaryCandles}
              primarySymbol={symbol ?? ''}
              additionalSeries={chartComparisonSeries}
              width={chartWidth}
              height={240}
            />
          )}
        </View>
        {!primaryLoading && !primaryError && primaryCandles.length > 1 && (
          <Text style={{ color: colors.mutedForeground, fontSize: 10, lineHeight: 15, paddingHorizontal: 16, paddingBottom: 10 }}>
            {hasSharedComparisonHistory
              ? `All ${comparisonChartSymbols.length + 1} charted tickers use the same ${sharedChartCandles.dates.length} reported dates: ${sharedChartCandles.dates[0]} to ${sharedChartCandles.dates[sharedChartCandles.dates.length - 1]}. No missing dates are filled or interpolated.`
              : selectedComparisonSymbols.length > 0
                ? `Comparison lines are unavailable: ${totalReturnUnavailableReason} Only ${symbol.toUpperCase()} is shown. No dates or returns are estimated.`
                : `Dated provider observations: ${primaryCandles[0]?.date ?? 'date unavailable'} to ${primaryCandles[primaryCandles.length - 1]?.date ?? 'date unavailable'}. Calendar gaps are not filled or interpolated.`}
          </Text>
        )}
        {!primaryLoading && !primaryError && primaryCandles.length > 1 && (
          <Text testID="etf-performance-methodology" style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18, paddingHorizontal: 16, paddingBottom: 10 }}>
            {hasSharedComparisonHistory && primaryPeriodReturn != null
              ? `${symbol.toUpperCase()} ${chartUsesAdjustedReturns ? 'dividend-adjusted total' : 'Close price'} return ${primaryPeriodReturn >= 0 ? '+' : ''}${primaryPeriodReturn.toFixed(2)}%${chartComparisonReturns.map(({ ticker, periodReturn, relativeReturn }) => chartUsesAdjustedReturns
                ? ` · ${ticker} ${periodReturn == null ? 'unavailable' : `${periodReturn >= 0 ? '+' : ''}${periodReturn.toFixed(2)}%`} (relative ${relativeReturn == null ? 'unavailable' : `${relativeReturn >= 0 ? '+' : ''}${relativeReturn.toFixed(2)}%`})`
                : ` · ${ticker} ${periodReturn == null ? 'unavailable' : `${periodReturn >= 0 ? '+' : ''}${periodReturn.toFixed(2)}%`} (spread ${periodReturn == null ? 'unavailable' : `${primaryPeriodReturn - periodReturn >= 0 ? '+' : ''}${(primaryPeriodReturn - periodReturn).toFixed(2)} pp`})`).join('')}.`
              : chartUsesAdjustedReturns && primaryPeriodReturn != null
                ? `${symbol.toUpperCase()} dividend-adjusted total return ${primaryPeriodReturn >= 0 ? '+' : ''}${primaryPeriodReturn.toFixed(2)}% for the selected range.`
                : primaryPeriodReturn != null
                  ? `${symbol.toUpperCase()} Close price return ${primaryPeriodReturn >= 0 ? '+' : ''}${primaryPeriodReturn.toFixed(2)}% for the selected range.`
                  : `Selected range: ${primaryCandles[0]?.date ?? 'date unavailable'} to ${primaryCandles[primaryCandles.length - 1]?.date ?? 'date unavailable'}.`}
            {' '}{chartUsesAdjustedReturns
              ? 'Every plotted ticker uses its provider Adj Close series on the shared dates; the provider calculation is not independently audited.'
              : 'The chart uses provider Close changes to show price return.'}
          </Text>
        )}
        {symbol.toUpperCase() === 'VOO' && (
          <View style={{ paddingHorizontal: 16, paddingTop: 10 }}>
            <Text style={{ color: colors.mutedForeground, fontSize: 13, marginBottom: 7 }}>Compare broad-market alternatives</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {['SPY', 'IVV', 'VTI', 'QQQ'].map((ticker) => (
                <Pressable
                  key={ticker}
                  testID={`etf-benchmark-${ticker}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Compare VOO with ${ticker}`}
                  accessibilityState={{ selected: savedCompareSymbols.includes(ticker) }}
                  onPress={() => void addCompareFund(ticker)}
                  style={{
                    minHeight: 44,
                    minWidth: 58,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 1,
                    borderColor: savedCompareSymbols.includes(ticker) ? colors.primary : colors.border,
                    borderRadius: 10,
                    paddingHorizontal: 12,
                    backgroundColor: savedCompareSymbols.includes(ticker) ? colors.accent : 'transparent',
                  }}
                >
                  <Text style={{ color: savedCompareSymbols.includes(ticker) ? colors.primary : colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>{ticker}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}
        <View testID="etf-chart-add-ticker" style={{ paddingHorizontal: 16, paddingTop: 12 }}>
          <Text style={{ color: colors.mutedForeground, fontSize: 12, marginBottom: 6 }}>
            Compare stocks or ETFs · up to four additional tickers
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TextInput
              testID="etf-chart-ticker-input"
              value={chartTickerInput}
              onChangeText={(value) => {
                setChartTickerInput(value.toUpperCase());
                setChartTickerError('');
              }}
              onSubmitEditing={addChartTicker}
              placeholder="Add ticker (e.g. AAPL)"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="characters"
              autoCorrect={false}
              accessibilityLabel="Stock or ETF ticker to compare on this chart"
              style={{
                flex: 1,
                minWidth: 0,
                minHeight: 44,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 8,
                paddingHorizontal: 10,
                color: colors.foreground,
                fontSize: 13,
              }}
            />
            <Pressable
              testID="etf-chart-add-ticker-button"
              accessibilityRole="button"
              accessibilityLabel="Add ticker to ETF chart"
              disabled={!chartTickerInput.trim()}
              onPress={addChartTicker}
              style={{
                minHeight: 44,
                minWidth: 58,
                justifyContent: 'center',
                alignItems: 'center',
                paddingHorizontal: 12,
                borderRadius: 8,
                backgroundColor: colors.primary,
                opacity: chartTickerInput.trim() ? 1 : 0.55,
              }}
            >
              <Text style={{ color: colors.primaryForeground, fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>Add</Text>
            </Pressable>
          </View>
          {chartTickerError ? (
            <Text testID="etf-chart-ticker-error" style={{ color: colors.sellColor, fontSize: 11, marginTop: 6 }}>
              {chartTickerError}
            </Text>
          ) : null}
          {chartTickerSymbols.length > 0 ? (
            <View testID="etf-chart-ticker-list" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, paddingTop: 8 }}>
              {chartTickerSymbols.map((ticker) => (
                <View
                  key={ticker}
                  style={{
                    minHeight: 34,
                    flexDirection: 'row',
                    alignItems: 'center',
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 17,
                    paddingLeft: 10,
                    backgroundColor: colors.input,
                  }}
                >
                  <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 11 }}>
                    {ticker}
                  </Text>
                  <Pressable
                    testID={`etf-chart-remove-ticker-${ticker}`}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${ticker} from chart`}
                    onPress={() => removeChartTicker(ticker)}
                    style={{ minWidth: 36, minHeight: 34, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Text style={{ color: colors.sellColor, fontSize: 18 }}>×</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}
        </View>
        {selectedComparisonSymbols.length > 0 && (
          <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16, paddingHorizontal: 16, paddingVertical: 9 }}>
            {comparisonChartLoadingSymbols.length > 0
              ? `Loading chart history for ${comparisonChartLoadingSymbols.join(', ')}.`
              : comparisonChartErrors.length > 0
                ? `Chart history is unavailable for ${comparisonChartErrors.join(', ')}. These tickers are not plotted until history loads.`
                : comparisonChartPendingSymbols.length > 0
                  ? `ETF verification is pending for ${comparisonChartPendingSymbols.join(', ')}; unverified funds are not plotted.`
                  : comparisonChartUnavailableSymbols.length > 0
                        ? `ETF verification is unavailable for ${comparisonChartUnavailableSymbols.join(', ')}; these ETFs are not plotted.`
                    : comparisonChartHistoryMissing.length > 0
                      ? `Fewer than two dated price observations are available for ${comparisonChartHistoryMissing.join(', ')}; no incomplete comparison is drawn.`
                      : hasSharedComparisonHistory
                        ? `All ${comparisonChartSymbols.length + 1} selected tickers share ${sharedChartCandles.dates.length} reported dates; no missing prices or returns are estimated.`
                        : `Price comparison unavailable: only ${sharedChartCandles.dates.length} dates are reported by every selected ticker; at least two are required.`}
          </Text>
        )}
        {comparisonChartErrors.length > 0 && (
          <Pressable
            testID="etf-chart-compare-retry"
            accessibilityRole="button"
            accessibilityLabel="Retry comparison chart history"
            onPress={() => {
              void Promise.all(comparisonChartQueries.map((query) => query.refetch()));
            }}
            style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start', paddingHorizontal: 16 }}
          >
            <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold' }}>Retry comparison history</Text>
          </Pressable>
        )}
      </View>
      <SectionCard collapsible title="HISTORICAL PERFORMANCE" icon={<Ionicons name="trending-up" size={16} color={colors.primary} />}>
        <View style={{ padding: 16 }}>
          {fund.marketRegime ? (
            <>
              {['bull', 'bear', 'mixed'].map((key) => {
                const period = fund.marketRegime?.periods[key];
                const label = key === 'mixed' ? 'Sideways / mixed' : `${key[0]?.toUpperCase()}${key.slice(1)}`;
                return <MetricRow key={key} label={`${label} (${period?.years ?? 0} years)`} value={pctValue(period?.averageAnnualReturn ?? null)} />;
              })}
              <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 8 }}>
                {fund.marketRegime.firstYear}–{fund.marketRegime.lastYear}, grouped by {fund.marketRegime.benchmarkSymbol} calendar-year returns. Historical comparison only.
              </Text>
            </>
          ) : <Text style={{ color: colors.mutedForeground }}>Historical regime data unavailable.</Text>}
        </View>
      </SectionCard>
      <SectionCard collapsible title="ETF FEE DOLLAR IMPACT" icon={<MaterialCommunityIcons name="cash-minus" size={16} color={colors.primary} />}>
        <View style={{ padding: 16 }}>
          <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 12, marginBottom: 7 }}>
            Investment amount (USD)
          </Text>
          <TextInput
            testID="etf-fee-impact-amount"
            accessibilityLabel="Investment amount in U.S. dollars"
            keyboardType="decimal-pad"
            value={feeInvestmentInput}
            onChangeText={setFeeInvestmentInput}
            placeholder="Enter an amount"
            placeholderTextColor={colors.mutedForeground}
            style={{
              minHeight: 44,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 9,
              paddingHorizontal: 12,
              color: colors.foreground,
              fontFamily: 'Inter_500Medium',
              fontSize: 14,
            }}
          />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 9 }}>
            {ETF_FEE_AMOUNT_PRESETS.map(({ amount, label }) => {
              const selected = feeInvestmentAmount === amount;
              return (
                <Pressable
                  key={amount}
                  testID={`etf-fee-impact-amount-${amount}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`Set investment amount to ${label}`}
                  onPress={() => setFeeInvestmentInput(String(amount))}
                  style={{
              minHeight: 44,
                    justifyContent: 'center',
                    borderWidth: 1,
                    borderColor: selected ? colors.primary : colors.border,
                    borderRadius: 8,
                    paddingHorizontal: 10,
                    backgroundColor: selected ? colors.primary : 'transparent',
                  }}
                >
                  <Text style={{
                    color: selected ? colors.primaryForeground : colors.foreground,
                    fontFamily: 'Inter_600SemiBold',
                    fontSize: 11,
                  }}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 12, marginTop: 16 }}>
            Holding period
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            {ETF_SCENARIO_HORIZONS.map((years) => {
              const selected = feeHoldingYears === years;
              return (
                <Pressable
                  key={years}
                  testID={`etf-fee-impact-horizon-${years}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`Set holding period to ${years} ${years === 1 ? 'year' : 'years'}`}
                  onPress={() => setFeeHoldingYears(years)}
                  style={{
                    minWidth: 54,
                    minHeight: 44,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 1,
                    borderColor: selected ? colors.primary : colors.border,
                    borderRadius: 8,
                    paddingHorizontal: 9,
                    backgroundColor: selected ? colors.primary : 'transparent',
                  }}
                >
                  <Text style={{
                    color: selected ? colors.primaryForeground : colors.foreground,
                    fontFamily: 'Inter_600SemiBold',
                    fontSize: 11,
                  }}>{years} yr</Text>
                </Pressable>
              );
            })}
          </View>
          <MetricRow
            label="Provider-reported expense ratio"
            value={validExpenseRatio ? pctValue(fund.expenseRatio) : 'Unavailable'}
          />
          <MetricRow
            label={`Estimated fees over ${feeHoldingYears} years`}
            value={feeEstimate === null ? 'Unavailable' : fmtPrice(feeEstimate)}
          />
          {feeEstimate === null && (
            <Text testID="etf-fee-impact-unavailable" style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 17, marginTop: 5 }}>
              {!validExpenseRatio
                ? 'Fee estimate unavailable because this fund has no valid provider-reported expense ratio.'
                : 'Enter an investment amount greater than $0 to estimate fees.'}
            </Text>
          )}
          <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16, marginTop: 12 }}>
            Fee-only illustration: assumes the balance stays equal to your starting amount for the full period, with no investment returns or added contributions. It multiplies that balance by the provider-reported annual expense ratio and holding period. Actual fees vary as fund assets change; this estimate is separate from the return scenarios and excludes trading costs and taxes.
          </Text>
        </View>
      </SectionCard>
      <EtfSectionAnchor sectionId="ai-analysis" title="AI Analysis" onLayout={onSectionLayout} onRef={onSectionRef} />
      <SectionCard collapsible title="AI COMMENTARY" icon={<Ionicons name="sparkles-outline" size={16} color={colors.primary} />}>
        <View style={{ padding: 16 }}>
          <Text style={{ color: colors.foreground, fontSize: 14, lineHeight: 22 }}>
            {fund.analysis || 'AI commentary is unavailable. Review the sourced fund data below.'}
          </Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 11, marginTop: 14 }}>
            AI commentary summarizes supplied fund data; it does not set the deterministic profile score or provide personalized advice or a buy/sell recommendation.
          </Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16, marginTop: 10 }}>
            Reported strengths and risks reflect the supplied fund analysis. Missing benchmark, holdings, or tracking evidence is identified in the sourced sections; absence of evidence is not treated as a positive or negative finding.
          </Text>
        </View>
      </SectionCard>
      <EtfSectionAnchor sectionId="projections" title="Future Projections" onLayout={onSectionLayout} onRef={onSectionRef} />
      <SectionCard collapsible title="LONG-RANGE SCENARIOS" icon={<MaterialCommunityIcons name="chart-timeline-variant" size={16} color={colors.primary} />}>
        <View style={{ padding: 16 }}>
          <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18, marginBottom: 10 }}>
            Deterministic illustrations based on historical market-regime returns and reported fees. They repeat a historical assumption as if it continued; they are hypothetical examples, not forecasts or guarantees.
          </Text>
          <MetricRow label="Annual expense ratio used" value={pctValue(fund.expenseRatio)} />
          {renderContributionControls('etf-scenario-contribution-input')}
          {renderScenarioInitialInvestmentControl()}
          {renderScenarioHorizonSelector()}
          {scenarios.length > 0 && (() => {
            const rows = scenarios.map((scenario) => ({
              scenario,
              projection: selectedProjection(scenario, selectedScenarioHorizon),
            }));
            const largestValue = Math.max(1, ...rows.map(({ projection }) => projection?.afterFeeValue ?? 0));
            return (
              <View testID="etf-scenario-chart" style={{ marginTop: 16, padding: 13, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.input }}>
                <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 14 }}>
                  Ending value · {selectedScenarioHorizon} years
                </Text>
                <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 17, marginTop: 3 }}>
                  After-fee illustration; {scenarioInitialInvestment == null ? 'starting amount unavailable' : fmtPrice(scenarioInitialInvestment)} initial investment plus your selected deposits.
                </Text>
                {rows.map(({ scenario, projection }) => {
                  const label = scenario.label.toLowerCase();
                  const color = label === 'bull' ? colors.buyColor : label === 'bear' ? colors.sellColor : colors.primary;
                  const amount = projection?.afterFeeValue;
                  return (
                    <View key={`scenario-chart-${label}`} style={{ marginTop: 13 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                        <Text style={{ color, fontFamily: 'Inter_600SemiBold', fontSize: 13, textTransform: 'capitalize' }}>{label}</Text>
                        <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 14 }}>
                          {amount == null ? 'Unavailable' : fmtPrice(amount)}
                        </Text>
                      </View>
                      <View style={{ height: 9, borderRadius: 8, backgroundColor: colors.border, overflow: 'hidden' }}>
                        <View style={{ height: '100%', width: `${amount == null ? 0 : Math.min(100, amount / largestValue * 100)}%`, backgroundColor: color, borderRadius: 8 }} />
                      </View>
                    </View>
                  );
                })}
                <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 17, marginTop: 12 }}>
                  Contributions: {rows[0]?.projection?.totalContributions == null ? 'Unavailable' : fmtPrice(rows[0].projection.totalContributions)} · Estimated growth ranges from {rows.flatMap(({ projection }) => projection?.afterFeeGrowth == null ? [] : [projection.afterFeeGrowth]).length
                    ? fmtPrice(Math.min(...rows.flatMap(({ projection }) => projection?.afterFeeGrowth == null ? [] : [projection.afterFeeGrowth])))
                    : 'Unavailable'} to {rows.flatMap(({ projection }) => projection?.afterFeeGrowth == null ? [] : [projection.afterFeeGrowth]).length
                    ? fmtPrice(Math.max(...rows.flatMap(({ projection }) => projection?.afterFeeGrowth == null ? [] : [projection.afterFeeGrowth])))
                    : 'Unavailable'}.
                </Text>
                {(() => {
                  const bearProjection = rows.find(({ scenario }) => scenario.label.toLowerCase() === 'bear')?.projection;
                  const principal = bearProjection?.startingInvestment != null && bearProjection.totalContributions != null
                    ? bearProjection.startingInvestment + bearProjection.totalContributions : null;
                  const downside = principal != null && bearProjection?.afterFeeValue != null
                    ? Math.max(0, principal - bearProjection.afterFeeValue) : null;
                  return (
                    <Text style={{ color: colors.sellColor, fontFamily: 'Inter_600SemiBold', fontSize: 12, lineHeight: 17, marginTop: 5 }}>
                      Potential downside vs contributions in bear case: {downside == null ? 'Unavailable' : fmtPrice(downside)}.
                    </Text>
                  );
                })()}
              </View>
            );
          })()}
          {comparisonMetricFunds.length > 1 && (
            <View testID="etf-long-range-comparison" style={{ marginTop: 16 }}>
              <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold' }}>
                Side-by-side · {selectedScenarioHorizon} years
              </Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 15, marginTop: 4 }}>
                Each fund starts with $100. Values include the same contribution schedule and reported fees.
              </Text>
              <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator style={{ marginTop: 10 }}>
                <View>
                  <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: 7 }}>
                    <Text style={{ width: 76, color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold', fontSize: 11 }}>ETF</Text>
                    {ETF_SCENARIO_LABELS.map((label) => (
                      <Text key={`scenario-heading-${label}`} style={{ width: 88, color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold', fontSize: 11, textTransform: 'capitalize' }}>
                        {label}
                      </Text>
                    ))}
                  </View>
                  {comparisonMetricFunds.map(({ symbol: fundSymbol, analysis }) => {
                    const fundScenarios = parseEtfScenarios(analysis.scenarios);
                    return (
                      <View key={`scenario-quick-compare-${fundSymbol}`} style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 9 }}>
                        <Text style={{ width: 76, color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 11 }} numberOfLines={1}>
                          {fundSymbol}
                        </Text>
                        {ETF_SCENARIO_LABELS.map((label) => {
                          const scenario = fundScenarios.find((item) => item.label.toLowerCase() === label) ?? null;
                          const projection = selectedProjection(scenario, selectedScenarioHorizon);
                          return (
                            <Text key={`${fundSymbol}-${label}`} style={{ width: 88, color: colors.foreground, fontSize: 11 }}>
                              {projection?.afterFeeValue == null ? '—' : fmtPrice(projection.afterFeeValue)}
                            </Text>
                          );
                        })}
                      </View>
                    );
                  })}
                </View>
              </ScrollView>
              <Text style={{ color: colors.mutedForeground, fontSize: 10, lineHeight: 14, marginTop: 5 }}>
                After-fee ending values for bear, base, and bull historical scenarios. Add up to three ETFs in the comparison lineup above.
              </Text>
            </View>
          )}
          {scenarios.length ? scenarios.map((scenario) => (
            <View key={scenario.label} style={{ marginBottom: 12 }}>
              <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', textTransform: 'uppercase' }}>{scenario.label}</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 13, marginTop: 8 }}>Edit annualized after-fee assumption (%)</Text>
              <TextInput
                testID={`etf-scenario-return-${scenario.label.toLowerCase()}`}
                accessibilityLabel={`Annualized ${scenario.label} scenario return percentage`}
                value={scenarioReturnInputs[scenario.label.toLowerCase()] ?? (
                  scenario.annualReturnAssumption == null ? '' : (scenario.annualReturnAssumption * 100).toFixed(2)
                )}
                onChangeText={(value) => setScenarioReturnInputs((current) => ({
                  ...current,
                  [scenario.label.toLowerCase()]: value.replace(/[^0-9.-]/g, '').replace(/(?!^)-/g, '').replace(/(\..*)\./g, '$1'),
                }))}
                keyboardType="numbers-and-punctuation"
                placeholder="Unavailable"
                placeholderTextColor={colors.mutedForeground}
                style={{ minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, color: colors.foreground, fontSize: 16, fontFamily: 'Inter_600SemiBold', marginTop: 6, marginBottom: 8 }}
              />
              <MetricRow label="Annualized after-fee assumption" value={pctValue(selectedProjection(scenario, selectedScenarioHorizon)?.afterFeeAnnualReturn ?? null)} />
              <MetricRow label="No-fee assumption (derived)" value={pctValue(selectedProjection(scenario, selectedScenarioHorizon)?.noFeeAnnualReturn ?? null)} />
              <MetricRow
                label={`No-fee value in ${selectedScenarioHorizon} years`}
                value={selectedProjection(scenario, selectedScenarioHorizon)?.noFeeValue == null
                  ? 'Unavailable'
                  : fmtPrice(selectedProjection(scenario, selectedScenarioHorizon)!.noFeeValue!)}
              />
              <MetricRow
                label={`After-fee value in ${selectedScenarioHorizon} years`}
                value={selectedProjection(scenario, selectedScenarioHorizon)?.afterFeeValue == null
                  ? 'Unavailable'
                  : fmtPrice(selectedProjection(scenario, selectedScenarioHorizon)!.afterFeeValue!)}
              />
              <MetricRow
                label="Starting investment"
                value={selectedProjection(scenario, selectedScenarioHorizon)?.startingInvestment == null
                  ? 'Unavailable'
                  : fmtPrice(selectedProjection(scenario, selectedScenarioHorizon)!.startingInvestment!)}
              />
              <MetricRow
                label="Total contributions"
                value={selectedProjection(scenario, selectedScenarioHorizon)?.totalContributions == null
                  ? 'Unavailable'
                  : fmtPrice(selectedProjection(scenario, selectedScenarioHorizon)!.totalContributions!)}
              />
              <MetricRow
                label={`No-fee projected growth in ${selectedScenarioHorizon} years`}
                value={selectedProjection(scenario, selectedScenarioHorizon)?.noFeeGrowth == null
                  ? 'Unavailable'
                  : fmtPrice(selectedProjection(scenario, selectedScenarioHorizon)!.noFeeGrowth!)}
              />
              <MetricRow
                label={`After-fee projected growth in ${selectedScenarioHorizon} years`}
                value={selectedProjection(scenario, selectedScenarioHorizon)?.afterFeeGrowth == null
                  ? 'Unavailable'
                  : fmtPrice(selectedProjection(scenario, selectedScenarioHorizon)!.afterFeeGrowth!)}
              />
              <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{scenario.assumption}</Text>
            </View>
          )) : (
            <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
              Long-range scenario data unavailable.
            </Text>
          )}
          <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Historical-regime illustrations only, not forecasts or guarantees. Totals start with a $100 investment plus the contribution per deposit entered above. The selected {contributionCadence} schedule is deposited at the end of each {contributionCadence === 'weekly'
            ? 'week'
            : contributionCadence === 'monthly' ? 'month' : 'quarter'}, using the historical annual return assumption; actual results may differ.</Text>
        </View>
      </SectionCard>
    </>
  );
}

export default function AnalysisScreen() {
  const { symbol } = useLocalSearchParams<{ symbol: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { isActive, neonGucciActive, brew } = useAmericanMode();
  const { awardAchievement } = useAchievements();
  const { width: screenWidth } = useWindowDimensions();
  const { mutate, data: response, isPending, error } = useAnalyzeStock<Error>();
  const marketBreadthQuery = useGetMarketBreadth({
    query: {
      queryKey: getGetMarketBreadthQueryKey(),
      enabled: (response as unknown as { assetType?: string } | undefined)?.assetType === 'etf',
      staleTime: 45_000,
      refetchInterval: 60_000,
      refetchIntervalInBackground: false,
    },
  });
  const watchlist = useWatchlist();
  const {
    pushToken,
    status: pushStatus,
    registrationError,
    requestPermission,
    openNotificationSettings,
  } = usePushNotifications();

  // ── Watchlist star state ──────────────────────────────────────────────────
  const isWatched = symbol ? watchlist.isWatched(symbol) : false;
  const activeAlert = symbol ? watchlist.activeAlertFor(symbol) : null;
  const [alertVisible, setAlertVisible] = useState(false);
  const [helpTopic, setHelpTopic] = useState<HelpTopic | null>(null);

  useEffect(() => {
    if (symbol) void awardAchievement('first-analysis');
  }, [awardAchievement, symbol]);

  const toggleWatchlist = useCallback(async () => {
    if (!symbol) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isWatched) {
      await watchlist.remove(symbol);
    } else {
      await watchlist.add(symbol);
    }
  }, [isWatched, symbol, watchlist]);

  // ── Chart state ──────────────────────────────────────────────────────────
  const [period, setPeriod] = useState<Period>('3mo');
  const [compInput, setCompInput]             = useState('');       // text field
  const [compSymbol, setCompSymbol]           = useState('');       // committed symbol
  const primaryChartQuery = useGetStockChart(
    encodeURIComponent(symbol ?? ''),
    period,
    '1d',
    {
      query: {
        queryKey: getGetStockChartQueryKey(encodeURIComponent(symbol ?? ''), period, '1d'),
        enabled: Boolean(symbol),
        retry: false,
        staleTime: 15_000,
      },
    },
  );
  const compChartQuery = useGetStockChart(
    encodeURIComponent(compSymbol),
    period,
    '1d',
    {
      query: {
        queryKey: getGetStockChartQueryKey(encodeURIComponent(compSymbol), period, '1d'),
        enabled: Boolean(compSymbol),
        retry: false,
        staleTime: 15_000,
      },
    },
  );
  const primaryCandles: Candle[] = primaryChartQuery.data?.candles ?? [];
  const primaryAdjustedReturnSeries =
    primaryChartQuery.data?.adjustedReturnSeries ?? UNAVAILABLE_ADJUSTED_RETURN_SERIES;
  const primaryLoading = Boolean(symbol) && primaryChartQuery.isLoading;
  const primaryChartError = primaryChartQuery.isError;
  const compCandles: Candle[] = compChartQuery.data?.candles ?? [];
  const compLoading = Boolean(compSymbol) && compChartQuery.isLoading;
  const compChartError = Boolean(compSymbol) && compChartQuery.isError;
  const [activeEtfSection, setActiveEtfSection] = useState<EtfAnalysisSectionId>('overview');
  const etfScrollRef = useRef<ScrollView>(null);
  const etfScrollFrameRef = useRef<View>(null);
  const etfSectionOffsets = useRef<Partial<Record<EtfAnalysisSectionId, number>>>({});
  const etfSectionRefs = useRef<Partial<Record<EtfAnalysisSectionId, View>>>({});
  const etfScrollOffset = useRef(0);
  const [activeCommoditySection, setActiveCommoditySection] = useState<CommodityAnalysisSectionId>('scorecard');
  const commodityScrollRef = useRef<ScrollView>(null);
  const commodityScrollFrameRef = useRef<View>(null);
  const commoditySectionOffsets = useRef<Partial<Record<CommodityAnalysisSectionId, number>>>({});
  const commoditySectionRefs = useRef<Partial<Record<CommodityAnalysisSectionId, View>>>({});
  const commodityScrollOffset = useRef(0);
  const [loadingStageIndex, setLoadingStageIndex] = useState(0);
  const tickerGlow = useRef(new Animated.Value(0)).current;
  const loadingStages = useMemo<readonly string[]>(
    () => (brew.neonGucciPhrasesActive ? shuffledLoadingPhrases() : getAnalysisLoadingStages(false)),
    [brew.neonGucciPhrasesActive, isPending, symbol],
  );

  useEffect(() => {
    if (!isPending) {
      setLoadingStageIndex(0);
      return;
    }
    const timer = setInterval(() => {
      setLoadingStageIndex((current) => (current + 1) % loadingStages.length);
    }, getAnalysisLoadingStageInterval(brew.neonGucciPhrasesActive));
    return () => clearInterval(timer);
  }, [brew.neonGucciPhrasesActive, isPending, loadingStages.length]);

  useEffect(() => {
    if (!isActive) return;
    tickerGlow.setValue(0);
    Animated.sequence([
      Animated.timing(tickerGlow, { toValue: 1, duration: 260, useNativeDriver: true }),
      Animated.delay(420),
      Animated.timing(tickerGlow, { toValue: 0, duration: 620, useNativeDriver: true }),
    ]).start();
  }, [isActive, symbol, tickerGlow]);

  // Load pinned comparison symbol from storage on first mount
  useEffect(() => {
    AsyncStorage.getItem(PINNED_COMP_KEY).then((stored) => {
      if (stored) {
        setCompInput(stored);
        setCompSymbol(stored);
      }
    }).catch(() => { /* ignore storage errors */ });
  }, []);

  const commitCompSymbol = useCallback(() => {
    const s = compInput.trim().toUpperCase();
    if (s && s !== compSymbol) {
      setCompSymbol(s);
      AsyncStorage.setItem(PINNED_COMP_KEY, s).catch(() => { /* ignore */ });
    } else if (!s) {
      setCompSymbol('');
      AsyncStorage.removeItem(PINNED_COMP_KEY).catch(() => { /* ignore */ });
    }
  }, [compInput, compSymbol]);

  const clearComp = useCallback(() => {
    setCompInput('');
    setCompSymbol('');
    AsyncStorage.removeItem(PINNED_COMP_KEY).catch(() => { /* ignore */ });
  }, []);

  const retryPrimaryChart = useCallback(() => {
    void primaryChartQuery.refetch();
  }, [primaryChartQuery.refetch]);

  const retryComparisonChart = useCallback(() => {
    void compChartQuery.refetch();
  }, [compChartQuery.refetch]);

  // Chart card width = screen width minus scroll padding (14 each side) minus card padding (16 each side)
  const chartWidth = screenWidth - 28 - 32;

  useEffect(() => {
    if (symbol) mutate({ data: { symbol } });
  }, [symbol]);

  useEffect(() => {
    if (!response || !symbol || response.symbol.toUpperCase() !== symbol.toUpperCase()) return;

    void AsyncStorage.getItem(APP_REVIEW_STORAGE_KEY)
      .then((raw) => {
        const next = recordSuccessfulAnalysis(parseAppReviewState(raw), Date.now());
        return AsyncStorage.setItem(APP_REVIEW_STORAGE_KEY, JSON.stringify(next));
      })
      .catch(() => {});
  }, [response, symbol]);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;

  const recordEtfSectionOffset = (sectionId: EtfAnalysisSectionId, y: number) => {
    etfSectionOffsets.current[sectionId] = y;
  };
  const recordEtfSectionRef = (sectionId: EtfAnalysisSectionId, view: View | null) => {
    if (view) etfSectionRefs.current[sectionId] = view;
    else delete etfSectionRefs.current[sectionId];
  };
  const navigateToEtfSection = (sectionId: EtfAnalysisSectionId) => {
    setActiveEtfSection(sectionId);
    const scrollView = etfScrollRef.current;
    const scrollFrame = etfScrollFrameRef.current;
    const sectionView = etfSectionRefs.current[sectionId];
    if (scrollView && scrollFrame && sectionView) {
      sectionView.measureInWindow((_sectionX, sectionY) => {
        scrollFrame.measureInWindow((_frameX, frameY) => {
          const y = etfScrollOffset.current + sectionY - frameY;
          scrollView.scrollTo({ y: Math.max(0, y - 8), animated: Platform.OS !== 'web' });
        });
      });
      return;
    }
    const y = etfSectionOffsets.current[sectionId];
    if (y != null) scrollView?.scrollTo({ y: Math.max(0, y - 8), animated: true });
  };
  const renderEtfSectionNavigation = () => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityLabel="ETF analysis sections"
      contentContainerStyle={{
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 14,
        paddingVertical: 9,
      }}
      style={{ flexGrow: 0, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.background }}
    >
      {ETF_ANALYSIS_SECTIONS.map(({ id, label }) => {
        const selected = activeEtfSection === id;
        return (
          <Pressable
            key={id}
            testID={`etf-section-nav-${id}`}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={selected ? `Selected section: ${label}` : `Go to ${label}`}
            onPress={() => navigateToEtfSection(id)}
            style={{
              minHeight: 42,
              justifyContent: 'center',
              borderBottomWidth: 2,
              borderBottomColor: selected ? colors.primary : 'transparent',
              paddingHorizontal: 8,
            }}
          >
            <Text
              numberOfLines={1}
              style={{
                color: selected ? colors.primary : colors.mutedForeground,
                fontFamily: selected ? 'Inter_700Bold' : 'Inter_500Medium',
                fontSize: 12,
              }}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
  const recordCommoditySectionOffset = (sectionId: CommodityAnalysisSectionId, y: number) => {
    commoditySectionOffsets.current[sectionId] = y;
  };
  const recordCommoditySectionRef = (sectionId: CommodityAnalysisSectionId, view: View | null) => {
    if (view) commoditySectionRefs.current[sectionId] = view;
    else delete commoditySectionRefs.current[sectionId];
  };
  const navigateToCommoditySection = (sectionId: CommodityAnalysisSectionId) => {
    setActiveCommoditySection(sectionId);
    const scrollView = commodityScrollRef.current;
    const scrollFrame = commodityScrollFrameRef.current;
    const sectionView = commoditySectionRefs.current[sectionId];
    if (scrollView && scrollFrame && sectionView) {
      sectionView.measureInWindow((_sectionX, sectionY) => {
        scrollFrame.measureInWindow((_frameX, frameY) => {
          const y = commodityScrollOffset.current + sectionY - frameY;
          scrollView.scrollTo({ y: Math.max(0, y - 8), animated: Platform.OS !== 'web' });
        });
      });
      return;
    }
    const y = commoditySectionOffsets.current[sectionId];
    if (y != null) scrollView?.scrollTo({ y: Math.max(0, y - 8), animated: Platform.OS !== 'web' });
  };
  const handleCommodityScroll = (offsetY: number) => {
    commodityScrollOffset.current = offsetY;
    const reached = Object.entries(commoditySectionOffsets.current)
      .flatMap(([id, y]) => y != null && y <= offsetY + 100
        ? [{ id: id as CommodityAnalysisSectionId, y }]
        : [])
      .sort((first, second) => first.y - second.y);
    const current = reached.at(-1)?.id;
    if (current && current !== activeCommoditySection) setActiveCommoditySection(current);
  };
  const renderCommoditySectionNavigation = () => (
    <ScrollView
      horizontal
      testID="commodity-section-navigation"
      showsHorizontalScrollIndicator={false}
      accessibilityLabel="Commodity analysis sections"
      contentContainerStyle={{ alignItems: 'center', gap: 7, paddingHorizontal: 12, paddingVertical: 5 }}
      style={{ flexGrow: 0, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.background }}
    >
      {COMMODITY_ANALYSIS_SECTIONS.map(({ id, label }) => {
        const selected = activeCommoditySection === id;
        return (
          <Pressable
            key={id}
            testID={`commodity-section-nav-${id}`}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={selected ? `Selected section: ${label}` : `Go to ${label}`}
            onPress={() => navigateToCommoditySection(id)}
            style={{
              minHeight: 44,
              justifyContent: 'center',
              borderBottomWidth: 2,
              borderBottomColor: selected ? colors.primary : 'transparent',
              paddingHorizontal: 8,
            }}
          >
            <Text
              numberOfLines={1}
              style={{
                color: selected ? colors.primary : colors.mutedForeground,
                fontFamily: selected ? 'Inter_700Bold' : 'Inter_500Medium',
                fontSize: 12,
              }}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
  const handleEtfScroll = (offsetY: number) => {
    const reached = Object.entries(etfSectionOffsets.current)
      .flatMap(([id, y]) => y != null && y <= offsetY + 100
        ? [{ id: id as EtfAnalysisSectionId, y }]
        : [])
      .sort((first, second) => first.y - second.y)
      .at(-1);
    if (reached) setActiveEtfSection(reached.id);
  };

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
  const renderHeader = (analysis?: Pick<StockAnalysis, 'companyName' | 'currentPrice' | 'priceChange' | 'priceChangePercent'> & { priceTimestamp?: number | null }) => {
    const change = analysis?.priceChange ?? 0;
    const changePct = analysis?.priceChangePercent ?? 0;
    const positive = change >= 0;
    const isCommodity = Boolean(getCommodityContractSpec(symbol));
    const showCurrentQuote = !isCommodity || isDisplayableHeatMapQuote({
      assetType: 'commodity',
      priceTimestamp: analysis?.priceTimestamp ?? null,
    });
    return (
      <View style={[headerStyles.container, { paddingTop: topPad + 8, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <View style={headerStyles.row}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={isCommodity ? 'Back to commodity heat map' : 'Back to previous screen'}
            onPress={() => router.back()}
            style={[headerStyles.back, isCommodity && { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }]}
            activeOpacity={0.7}
          >
            <Feather name="chevron-left" size={26} color={colors.foreground} />
          </TouchableOpacity>
          <View style={headerStyles.center}>
            {isActive && (
              <Animated.View pointerEvents="none" style={[headerStyles.flagGlow, { opacity: tickerGlow }]}>
                <LinearGradient
                  colors={['#B22234', '#FFFFFF', '#3C3B6E']}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={StyleSheet.absoluteFill}
                />
              </Animated.View>
            )}
            <Text style={[headerStyles.symbol, { color: colors.heading, fontFamily: 'Inter_700Bold', letterSpacing: 1 }]}>
              {symbol}
            </Text>
            {analysis && (
              <Text style={[headerStyles.company, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]} numberOfLines={1}>
                {analysis.companyName}
              </Text>
            )}
            {neonGucciActive && (
              <View style={headerStyles.neonBadge}>
                <Text style={headerStyles.neonBadgeText}>HYBRID NEON GUCCI · ACTIVE</Text>
              </View>
            )}
          </View>
          {/* Local guest watchlist toggle */}
          {
            <TouchableOpacity
              onPress={toggleWatchlist}
              style={headerStyles.starBtn}
              activeOpacity={0.7}
            >
              <Feather
                name={isWatched ? 'star' : 'star'}
                size={22}
                color={isWatched ? '#FFD700' : colors.mutedForeground}
              />
            </TouchableOpacity>
          }
          {analysis && showCurrentQuote && (
            <View style={headerStyles.priceArea}>
              <Text style={[headerStyles.price, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
                {getCommodityContractSpec(symbol)
                  ? formatCommodityQuotePrice(symbol, analysis.currentPrice)
                  : fmtPrice(analysis.currentPrice)}
              </Text>
              <Text style={[headerStyles.change, {
                color: positive ? colors.buyColor : colors.sellColor,
                fontFamily: 'Inter_500Medium',
              }]}>
                {getCommodityContractSpec(symbol)
                  ? `${positive ? '+' : ''}${formatCommodityQuotePrice(symbol, change)}`
                  : `${positive ? '+' : ''}${change.toFixed(2)}`} ({positive ? '+' : ''}{changePct.toFixed(2)}%)
              </Text>
              {analysis && 'priceTimestamp' in analysis && (
                <Text style={{ color: colors.mutedForeground, fontSize: 9, marginTop: 2 }}>
                  Yahoo quote · {formatHeatMapQuoteAge(analysis.priceTimestamp ?? null)}
                </Text>
              )}
            </View>
          )}
          {analysis && isCommodity && !showCurrentQuote && (
            <View style={headerStyles.priceArea}>
              <Text style={[headerStyles.change, { color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }]}>
                Quote unavailable or stale
              </Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 9, marginTop: 2 }}>
                Yahoo quote · {formatHeatMapQuoteAge(analysis.priceTimestamp ?? null)}
              </Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  // ─── Loading ──────────────────────────────────────────────────────────────
  if (isPending) {
    const loadingStage = loadingStages[loadingStageIndex % loadingStages.length] ?? loadingStages[0];
    return (
      <AmericanSteelBackground>
        <View style={[styles.screen, { backgroundColor: 'transparent' }]}>
        {renderHeader()}
        <View style={styles.centered}>
          {neonGucciActive
            ? <NeonAnalysisLoader symbol={symbol ?? ''} stage={loadingStage} />
            : <ActivityIndicator size="large" color={colors.primary} />}
          <Text style={[styles.loadingTitle, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>
            {formatAnalysisLoadingStage(loadingStage, symbol, brew.neonGucciPhrasesActive)}
          </Text>
          <Text style={[styles.loadingSubtitle, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
            Checking the latest quote and price history. Missing provider data is marked unavailable.
          </Text>
        </View>
        </View>
      </AmericanSteelBackground>
    );
  }

  // ─── Error ────────────────────────────────────────────────────────────────
  if (error || !response) {
    const errorData = (error as any)?.response?.data as {
      error?: string;
      message?: string;
      reason?: string;
      lastUsableDate?: string | null;
    } | undefined;
    const commodityHistoryUnavailable = errorData?.error === 'COMMODITY_HISTORY_UNAVAILABLE';
    const errMsg = (commodityHistoryUnavailable ? errorData?.reason : undefined)
      ?? errorData?.message
      ?? error?.message
      ?? 'Could not load analysis.';
    return (
      <AmericanSteelBackground>
        <View style={[styles.screen, { backgroundColor: 'transparent' }]}>
        {renderHeader()}
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.sellColor} />
          <Text style={[styles.errorTitle, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>
            {commodityHistoryUnavailable ? 'Score Unavailable' : 'Analysis Failed'}
          </Text>
          <Text style={[styles.errorMsg, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
            {errMsg}
          </Text>
          {commodityHistoryUnavailable && (
            <Text style={[styles.errorMsg, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
              Last usable data date: {errorData?.lastUsableDate ?? 'None available'}
              {'\n'}No score is shown until the history is reliable.
            </Text>
          )}
          <TouchableOpacity
            style={[styles.retryBtn, { backgroundColor: colors.muted, borderColor: colors.border, borderWidth: 1 }]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); mutate({ data: { symbol: symbol! } }); }}
            activeOpacity={0.8}
          >
            <Text style={[styles.retryText, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>
              Retry
            </Text>
          </TouchableOpacity>
        </View>
        </View>
      </AmericanSteelBackground>
    );
  }

  // ─── Results ──────────────────────────────────────────────────────────────
  const result = response as unknown as {
    assetType?: string;
    etfAnalysis?: EtfAnalysisPayload;
    commodityAnalysis?: CommodityAnalysisPayload;
  } & Pick<StockAnalysis, 'symbol' | 'companyName' | 'exchange' | 'currency' | 'currentPrice' | 'priceChange' | 'priceChangePercent' | 'volume' | 'marketCap' | 'week52High' | 'week52Low'> & { priceTimestamp?: number | null };
  if (result.assetType === 'commodity' && result.commodityAnalysis) {
    return (
      <AmericanSteelBackground>
        <View style={[styles.screen, { backgroundColor: 'transparent' }]}>
          {renderHeader(result)}
          {renderCommoditySectionNavigation()}
          <View ref={commodityScrollFrameRef} style={{ flex: 1, minHeight: 0 }}>
            <ScrollView
              ref={commodityScrollRef}
              testID="commodity-analysis-scroll"
              style={{ flex: 1, minHeight: 0 }}
              contentContainerStyle={[styles.scroll, { paddingBottom: botPad + 24 }]}
              showsVerticalScrollIndicator={false}
              onScroll={(event) => handleCommodityScroll(event.nativeEvent.contentOffset.y)}
              scrollEventThrottle={100}
            >
              <CommodityAnalysisSections
                analysis={result.commodityAnalysis}
                symbol={result.symbol}
                onSectionLayout={recordCommoditySectionOffset}
                onSectionRef={recordCommoditySectionRef}
              />
            </ScrollView>
          </View>
        </View>
      </AmericanSteelBackground>
    );
  }
  if (result.assetType === 'etf' && result.etfAnalysis) {
    return (
      <AmericanSteelBackground>
        <View style={[styles.screen, { backgroundColor: 'transparent' }]}>
          {renderHeader(response as StockAnalysis)}
          {renderEtfSectionNavigation()}
          <View ref={etfScrollFrameRef} style={{ flex: 1, minHeight: 0 }}>
            <ScrollView
              ref={etfScrollRef}
              style={{ flex: 1, minHeight: 0 }}
              contentContainerStyle={[styles.scroll, { paddingBottom: botPad + 24 }]}
              showsVerticalScrollIndicator={false}
              onScroll={(event) => {
                etfScrollOffset.current = event.nativeEvent.contentOffset.y;
                handleEtfScroll(event.nativeEvent.contentOffset.y);
              }}
              scrollEventThrottle={100}
            >
              <EtfAnalysisSections
                fund={result.etfAnalysis}
                colors={colors}
                symbol={result.symbol}
                onSectionLayout={recordEtfSectionOffset}
                onSectionRef={recordEtfSectionRef}
                primaryCandles={primaryCandles}
                primaryAdjustedReturnSeries={primaryAdjustedReturnSeries}
                primaryLoading={primaryLoading}
                primaryError={primaryChartError}
                retryPrimaryChart={retryPrimaryChart}
                period={period}
                setPeriod={setPeriod}
                chartWidth={chartWidth}
                marketQuotes={marketBreadthQuery.data?.quotes ?? []}
                marketUpdatedAt={marketBreadthQuery.data?.updatedAt ?? 0}
              />
            </ScrollView>
          </View>
        </View>
      </AmericanSteelBackground>
    );
  }
  const data = response as StockAnalysis;
  const { technical, fundamental, behavioral, recommendation } = data;
  const commoditySpec = getCommodityContractSpec(symbol);
  const commodityQuoteIsFresh = !commoditySpec || isDisplayableHeatMapQuote({
    assetType: 'commodity',
    priceTimestamp: (data as StockAnalysis & { priceTimestamp?: number | null }).priceTimestamp ?? null,
  });
  const formatAnalysisPrice = (value: number) => commoditySpec
    ? formatCommodityQuotePrice(symbol, value)
    : fmtPrice(value);
  const action = recommendation.action;
  const guide = helpTopic ? METRIC_GUIDES[helpTopic] : null;

  return (
    <AmericanSteelBackground>
      <View style={[styles.screen, { backgroundColor: 'transparent' }]}>
      <PriceAlertModal
        visible={alertVisible && commodityQuoteIsFresh}
        symbol={symbol ?? ''}
        currentPrice={data.currentPrice}
        existingDirection={activeAlert?.direction}
        existingTarget={activeAlert?.targetPrice}
        existingAlertId={activeAlert?.id}
        pushToken={pushToken}
        registrationError={registrationError}
        permissionStatus={pushStatus}
        onRequestPermission={requestPermission}
        onOpenSettings={openNotificationSettings}
        onSave={async (direction, targetPrice) => {
          if (!symbol || !pushToken) return;
          if (activeAlert) {
            await watchlist.updateAlert(activeAlert.id, direction, targetPrice, pushToken);
          } else {
            await watchlist.saveAlert(symbol, direction, targetPrice, pushToken);
          }
          if (!watchlist.isWatched(symbol)) {
            await watchlist.add(symbol);
          }
        }}
        onDelete={async () => {
          if (activeAlert) await watchlist.deleteAlert(activeAlert.id).catch(() => {});
        }}
        onClose={() => setAlertVisible(false)}
        colors={colors}
      />
      <Modal
        visible={guide != null}
        transparent
        animationType="slide"
        onRequestClose={() => setHelpTopic(null)}
      >
        <Pressable style={guideStyles.backdrop} onPress={() => setHelpTopic(null)}>
          <Pressable
            style={[guideStyles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={(event) => event.stopPropagation()}
          >
            <View style={guideStyles.sheetHeader}>
              <View style={guideStyles.sheetTitleRow}>
                <View style={[guideStyles.bookIcon, { backgroundColor: colors.primary }]}>
                  <Feather name="book-open" size={16} color={colors.primaryForeground} />
                </View>
                <View style={guideStyles.sheetTitleCopy}>
                  <Text style={[guideStyles.sheetEyebrow, { color: colors.primary, fontFamily: 'Inter_600SemiBold' }]}>
                    BEGINNER GUIDE
                  </Text>
                  <Text style={[guideStyles.sheetTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
                    {guide?.title}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => setHelpTopic(null)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Close metric guide"
              >
                <Feather name="x" size={21} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            <ScrollView
              style={guideStyles.guideScroll}
              contentContainerStyle={guideStyles.guideContent}
              showsVerticalScrollIndicator={false}
            >
              <Text style={[guideStyles.intro, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                {guide?.intro}
              </Text>
              {guide?.items.map((item) => (
                <View key={item.term} style={[guideStyles.guideItem, { borderTopColor: colors.border }]}>
                  <Text style={[guideStyles.term, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>
                    {item.term}
                  </Text>
                  <Text style={[guideStyles.explanation, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                    {item.explanation}
                  </Text>
                </View>
              ))}
              <Text style={[guideStyles.disclaimer, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                These indicators are educational context, not guarantees or personalized financial advice.
              </Text>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
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
                ANALYSIS RECOMMENDATION
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
                  {value != null ? formatAnalysisPrice(value) : '—'}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {commodityQuoteIsFresh && <TouchableOpacity
          style={[styles.alertAction, { backgroundColor: colors.card, borderColor: colors.primary }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setAlertVisible(true);
          }}
          activeOpacity={0.8}
        >
          <Feather name="bell" size={17} color={colors.primary} />
          <View style={styles.alertActionCopy}>
            <Text style={[styles.alertActionTitle, { color: colors.primary, fontFamily: 'Inter_700Bold' }]}>
              {activeAlert ? 'EDIT PRICE ALERT' : 'SET PRICE ALERT'}
            </Text>
            <Text style={[styles.alertActionSubtitle, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
              {activeAlert
                ? `Alert ${activeAlert.direction === 'above' ? 'above' : 'below'} ${formatAnalysisPrice(activeAlert.targetPrice)}`
                : isWatched ? 'Get notified when this stock reaches your target' : 'Adds this stock to your watchlist automatically'}
            </Text>
          </View>
          <Feather name="chevron-right" size={17} color={colors.mutedForeground} />
        </TouchableOpacity>}

        {/* 52W Range */}
        <View style={[rangeStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={rangeStyles.labels}>
            <Text style={[rangeStyles.text, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
              52W Low: {formatAnalysisPrice(data.week52Low)}
            </Text>
            <Text style={[rangeStyles.text, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
              {formatAnalysisPrice(data.week52High)} :52W High
            </Text>
          </View>
          <View style={[rangeStyles.track, { backgroundColor: colors.muted }]}>
            {(() => {
              const range = data.week52High - data.week52Low;
              const pos = range > 0 ? ((data.currentPrice - data.week52Low) / range) * 100 : 50;
              return commodityQuoteIsFresh ? (
                <View style={[rangeStyles.thumb, {
                  left: `${Math.min(95, Math.max(5, pos))}%` as any,
                  backgroundColor: colors.primary,
                }]} />
              ) : null;
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
          helpTopic="technical"
          onHelp={setHelpTopic}
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
            <MetricRow label="MA 20" value={formatAnalysisPrice(technical.ma20)} />
            <MetricRow label="MA 50" value={formatAnalysisPrice(technical.ma50)} />
            <MetricRow label="MA 200" value={formatAnalysisPrice(technical.ma200)} />
            <View style={[divStyle, { backgroundColor: colors.border }]} />
            <MetricRow label="Support" value={formatAnalysisPrice(technical.support)} />
            <MetricRow label="Resistance" value={formatAnalysisPrice(technical.resistance)} />
            <MetricRow label="Bollinger Upper" value={formatAnalysisPrice(technical.bollingerUpper)} />
            <MetricRow label="Bollinger Lower" value={formatAnalysisPrice(technical.bollingerLower)} />
          </View>
        </SectionCard>

        {/* Fundamental */}
        <SectionCard
          title="FUNDAMENTAL"
          icon={<Ionicons name="business" size={16} color={colors.primary} />}
          score={fundamental.score}
          scoreColor={scoreColor(fundamental.score)}
          helpTopic="fundamental"
          onHelp={setHelpTopic}
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
                value={`${formatAnalysisPrice(behavioral.priceTarget)} (${((behavioral.priceTarget - data.currentPrice) / data.currentPrice * 100) > 0 ? '+' : ''}${((behavioral.priceTarget - data.currentPrice) / data.currentPrice * 100).toFixed(1)}%)`}
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

        {/* ── Price Chart ─────────────────────────────────────────────────── */}
        <View style={[cardStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={chartCardStyles.header}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Feather name="trending-up" size={14} color={colors.primary} />
              <Text style={[cardStyles.title, { color: colors.foreground, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.5 }]}>
                PRICE CHART
              </Text>
            </View>
            {/* Period pills */}
            <View style={chartCardStyles.periodRow}>
              {PERIODS.map(({ label, value }) => (
                <TouchableOpacity
                  key={value}
                  style={[
                    chartCardStyles.pill,
                    { borderColor: colors.border },
                    period === value && { backgroundColor: colors.primary, borderColor: colors.primary },
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setPeriod(value);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[
                    chartCardStyles.pillText,
                    { color: period === value ? '#000' : colors.mutedForeground, fontFamily: 'Inter_600SemiBold' },
                  ]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={[cardStyles.divider, { backgroundColor: colors.border }]} />

          <View style={chartCardStyles.chartArea}>
            {primaryLoading ? (
              <View style={[chartCardStyles.loader, { height: 240 }]}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={[chartCardStyles.loaderText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                  Loading chart…
                </Text>
              </View>
            ) : (
              <ComparisonChart
                primaryCandles={primaryCandles}
                primarySymbol={symbol ?? ''}
                compCandles={compCandles.length > 0 ? compCandles : undefined}
                compSymbol={compSymbol || undefined}
                width={chartWidth}
                height={240}
              />
            )}
          </View>

          {/* Comparison input */}
          <View style={[chartCardStyles.compRow, { borderTopColor: colors.border }]}>
            <Feather name="plus-circle" size={14} color={colors.mutedForeground} style={{ marginRight: 6 }} />
            <TextInput
              style={[chartCardStyles.compInput, { color: colors.foreground, fontFamily: 'Inter_400Regular' }]}
              placeholder="Compare with… (e.g. SPY)"
              placeholderTextColor={colors.mutedForeground}
              value={compInput}
              onChangeText={(t) => setCompInput(t.toUpperCase())}
              onSubmitEditing={commitCompSymbol}
              onBlur={commitCompSymbol}
              autoCapitalize="characters"
              autoCorrect={false}
              returnKeyType="search"
              maxLength={10}
            />
            {compLoading && <ActivityIndicator size="small" color={colors.primary} style={{ marginLeft: 6 }} />}
            {(compSymbol !== '' || compInput !== '') && !compLoading && (
              <TouchableOpacity onPress={clearComp} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Feather name="x" size={14} color={colors.mutedForeground} />
              </TouchableOpacity>
            )}
          </View>
        </View>

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
    </AmericanSteelBackground>
  );
}

const divStyle = { height: 1, marginVertical: 4 };
const discStyle = { textAlign: 'center' as const, fontSize: 11, paddingHorizontal: 20, marginTop: 8 };

const styles = StyleSheet.create({
  screen: { flex: 1, minHeight: 0 },
  scroll: { padding: 14 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  alertAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
  },
  alertActionCopy: { flex: 1, gap: 3 },
  alertActionTitle: { fontSize: 11, letterSpacing: 1 },
  alertActionSubtitle: { fontSize: 12, lineHeight: 17 },
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
  flagGlow: {
    position: 'absolute',
    left: -10,
    right: -10,
    top: -5,
    bottom: -5,
    borderRadius: 8,
    overflow: 'hidden',
  },
  symbol: { fontSize: 20 },
  company: { fontSize: 12 },
  neonBadge: { alignSelf: 'flex-start', marginTop: 4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 7, backgroundColor: 'rgba(85,236,255,0.13)', borderWidth: 1, borderColor: '#55ecff' },
  neonBadgeText: { color: '#b9ffcf', fontSize: 7, fontWeight: '800', letterSpacing: 0.45 },
  starBtn: { padding: 6 },
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

const guideStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.68)',
  },
  sheet: {
    height: '86%',
    maxHeight: '86%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    paddingTop: 18,
    paddingHorizontal: 18,
    paddingBottom: 8,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingBottom: 16,
  },
  sheetTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  bookIcon: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  sheetTitleCopy: { flex: 1, gap: 2 },
  sheetEyebrow: { fontSize: 10, letterSpacing: 1.2 },
  sheetTitle: { fontSize: 20 },
  guideScroll: { flex: 1, minHeight: 0 },
  guideContent: { paddingBottom: 18 },
  intro: { fontSize: 14, lineHeight: 21, marginBottom: 8 },
  guideItem: { borderTopWidth: 1, paddingVertical: 12 },
  term: { fontSize: 14, marginBottom: 4 },
  explanation: { fontSize: 13, lineHeight: 19 },
  disclaimer: { fontSize: 11, lineHeight: 16, marginTop: 4 },
});

const chartCardStyles = StyleSheet.create({
  header: { padding: 16, paddingBottom: 10, gap: 10 },
  periodRow: { flexDirection: 'row', gap: 6 },
  pill: {
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 20, borderWidth: 1,
  },
  pillText: { fontSize: 11 },
  chartArea: { padding: 16, paddingTop: 12 },
  loader: { alignItems: 'center', justifyContent: 'center', gap: 8 },
  loaderText: { fontSize: 12 },
  compRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10,
    borderTopWidth: 1,
  },
  compInput: { flex: 1, fontSize: 13, paddingVertical: 2 },
});
