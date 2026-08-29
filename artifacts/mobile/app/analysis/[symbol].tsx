import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Modal,
  Pressable,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ActivityIndicator,
  Animated,
  TextInput,
  useWindowDimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useColors } from '@/hooks/useColors';
import { useApi } from '@/hooks/useApi';
import { useAmericanMode } from '@/contexts/AmericanModeContext';
import { useAnalyzeStock } from '@workspace/api-client-react';
import type { StockAnalysis } from '@workspace/api-client-react';
import { ComparisonChart } from '@/components/ComparisonChart';
import type { Candle } from '@/components/StockChart';
import { AmericanSteelBackground } from '@/components/AmericanSteelBackground';
import { NeonAnalysisLoader } from '@/components/NeonAnalysisLoader';
import { PriceAlertModal } from '@/components/PriceAlertModal';
import { useWatchlist } from '@/hooks/useWatchlist';
import { usePushNotifications } from '@/hooks/usePushNotifications';

// ─── Constants ────────────────────────────────────────────────────────────────

const PINNED_COMP_KEY = '@stocksense/pinned_comp_symbol';

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

function SectionCard({ title, icon, score, scoreColor, children, helpTopic, onHelp }: {
  title: string;
  icon: React.ReactNode;
  score?: number;
  scoreColor?: string;
  children: React.ReactNode;
  helpTopic?: HelpTopic;
  onHelp?: (topic: HelpTopic) => void;
}) {
  const colors = useColors();
  return (
    <View style={[cardStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={cardStyles.header}>
        <View style={cardStyles.titleRow}>
          {icon}
          <Text style={[cardStyles.title, { color: colors.foreground, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.5 }]}>{title}</Text>
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
  helpButton: { marginLeft: 1 },
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

const ANALYSIS_LOADING_STAGES = [
  'Reading the tape',
  'Checking momentum',
  'Comparing the sector',
  'Building the lesson',
] as const;

const NEON_GUCCI_LOADING_PHRASES = [
  'Checking in with Sam Bankman-Fried',
  'Gambling all your money into penny stocks',
  "Telling Dave Ramsey that you aren't following the baby steps",
  'Finding out why you continually make dangerous financial decisions',
  'Alerting FINRA as there appears to be insider trading on your account',
  'Matching you with local singles in your area',
  'Looking into why a new line of credit was opened in your name',
  'Relaying to your spouse about how much money you lose while trading',
] as const;

function shuffledLoadingPhrases(): string[] {
  const phrases = [...NEON_GUCCI_LOADING_PHRASES];
  for (let index = phrases.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [phrases[index], phrases[randomIndex]] = [phrases[randomIndex], phrases[index]];
  }
  return phrases;
}

export default function AnalysisScreen() {
  const { symbol } = useLocalSearchParams<{ symbol: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { isActive, neonGucciActive, neonGucciUnlocked } = useAmericanMode();
  const { width: screenWidth } = useWindowDimensions();
  const { apiFetch } = useApi();
  const { mutate, data, isPending, error } = useAnalyzeStock<Error>();
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
  const [primaryCandles, setPrimaryCandles]   = useState<Candle[]>([]);
  const [primaryLoading, setPrimaryLoading]   = useState(false);
  const [compInput, setCompInput]             = useState('');       // text field
  const [compSymbol, setCompSymbol]           = useState('');       // committed symbol
  const [compCandles, setCompCandles]         = useState<Candle[]>([]);
  const [compLoading, setCompLoading]         = useState(false);
  const [loadingStageIndex, setLoadingStageIndex] = useState(0);
  const tickerGlow = useRef(new Animated.Value(0)).current;
  const loadingStages = useMemo<readonly string[]>(
    () => (neonGucciUnlocked ? shuffledLoadingPhrases() : ANALYSIS_LOADING_STAGES),
    [isPending, neonGucciUnlocked, symbol],
  );

  useEffect(() => {
    if (!isPending) {
      setLoadingStageIndex(0);
      return;
    }
    const timer = setInterval(() => {
      setLoadingStageIndex((current) => (current + 1) % loadingStages.length);
    }, 2_200);
    return () => clearInterval(timer);
  }, [isPending, loadingStages.length]);

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

  // Fetch primary chart data whenever symbol or period changes
  useEffect(() => {
    if (!symbol) return;
    let cancelled = false;
    setPrimaryLoading(true);
    setPrimaryCandles([]);
    apiFetch<{ candles: Candle[] }>(`/api/stocks/chart/${encodeURIComponent(symbol)}?period=${period}&interval=1d`)
      .then((res) => { if (!cancelled) setPrimaryCandles(res.candles ?? []); })
      .catch(() => { if (!cancelled) setPrimaryCandles([]); })
      .finally(() => { if (!cancelled) setPrimaryLoading(false); });
    return () => { cancelled = true; };
  }, [symbol, period]);

  // Fetch comparison chart data whenever compSymbol or period changes
  useEffect(() => {
    if (!compSymbol) { setCompCandles([]); return; }
    let cancelled = false;
    setCompLoading(true);
    setCompCandles([]);
    apiFetch<{ candles: Candle[] }>(`/api/stocks/chart/${encodeURIComponent(compSymbol)}?period=${period}&interval=1d`)
      .then((res) => { if (!cancelled) setCompCandles(res.candles ?? []); })
      .catch(() => { if (!cancelled) setCompCandles([]); })
      .finally(() => { if (!cancelled) setCompLoading(false); });
    return () => { cancelled = true; };
  }, [compSymbol, period]);

  const commitCompSymbol = useCallback(() => {
    const s = compInput.trim().toUpperCase();
    if (s && s !== compSymbol) {
      setCompSymbol(s);
      AsyncStorage.setItem(PINNED_COMP_KEY, s).catch(() => { /* ignore */ });
    } else if (!s) {
      setCompSymbol('');
      setCompCandles([]);
      AsyncStorage.removeItem(PINNED_COMP_KEY).catch(() => { /* ignore */ });
    }
  }, [compInput, compSymbol]);

  const clearComp = useCallback(() => {
    setCompInput('');
    setCompSymbol('');
    setCompCandles([]);
    AsyncStorage.removeItem(PINNED_COMP_KEY).catch(() => { /* ignore */ });
  }, []);

  // Chart card width = screen width minus scroll padding (14 each side) minus card padding (16 each side)
  const chartWidth = screenWidth - 28 - 32;

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
            {loadingStage} · {symbol}
          </Text>
          <Text style={[styles.loadingSubtitle, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
            Fetching market data, validating the quote, and shaping a focused lesson
          </Text>
        </View>
        </View>
      </AmericanSteelBackground>
    );
  }

  // ─── Error ────────────────────────────────────────────────────────────────
  if (error || !data) {
    const errMsg = (error as any)?.response?.data?.message ?? error?.message ?? 'Could not load analysis.';
    return (
      <AmericanSteelBackground>
        <View style={[styles.screen, { backgroundColor: 'transparent' }]}>
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
  const { technical, fundamental, behavioral, recommendation } = data;
  const action = recommendation.action;
  const guide = helpTopic ? METRIC_GUIDES[helpTopic] : null;

  return (
    <AmericanSteelBackground>
      <View style={[styles.screen, { backgroundColor: 'transparent' }]}>
      <PriceAlertModal
        visible={alertVisible}
        symbol={symbol ?? ''}
        currentPrice={data.currentPrice}
        existingDirection={activeAlert?.direction}
        existingTarget={activeAlert?.targetPrice}
        pushToken={pushToken}
        registrationError={registrationError}
        permissionStatus={pushStatus}
        onRequestPermission={requestPermission}
        onOpenSettings={openNotificationSettings}
        onSave={async (direction, targetPrice) => {
          if (!symbol || !pushToken) return;
          await watchlist.saveAlert(symbol, direction, targetPrice, pushToken);
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

        <TouchableOpacity
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
                ? `Alert ${activeAlert.direction === 'above' ? 'above' : 'below'} ${fmtPrice(activeAlert.targetPrice)}`
                : isWatched ? 'Get notified when this stock reaches your target' : 'Adds this stock to your watchlist automatically'}
            </Text>
          </View>
          <Feather name="chevron-right" size={17} color={colors.mutedForeground} />
        </TouchableOpacity>

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
  screen: { flex: 1 },
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
  guideScroll: { flexGrow: 0 },
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
