import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Platform, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { BottomTabBar } from '@/components/BottomTabBar';
import { AmericanSteelBackground } from '@/components/AmericanSteelBackground';
import { useAmericanMode } from '@/contexts/AmericanModeContext';

const BASE_URL = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

export interface Pick {
  symbol: string;
  name: string;
  currentPrice: number;
  priceChange: number;
  priceChangePercent: number;
  priceTarget: number;
  confidence: number;
  upside: number;
  compositeScore: number;
  riskAdjScore: number;
  volatility: number;
  technicalScore: number;
  fundamentalScore: number;
  momentumScore: number;
  analystScore: number;
  sector: string;
  industry: string;
  targetHighPrice: number | null;
  targetLowPrice: number | null;
  numberOfAnalysts: number;
  reasons: string[];
  volume: number;
  marketCap: number | null;
}

function fmtPrice(p: number) {
  if (p >= 1000) return `$${p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (p >= 1) return `$${p.toFixed(2)}`;
  return `$${p.toFixed(4)}`;
}

function fmtMktCap(mc: number | null) {
  if (!mc) return '';
  if (mc >= 1e12) return `$${(mc / 1e12).toFixed(1)}T`;
  if (mc >= 1e9) return `$${(mc / 1e9).toFixed(1)}B`;
  if (mc >= 1e6) return `$${(mc / 1e6).toFixed(0)}M`;
  return '';
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const color = confidence >= 80 ? '#00e5a0' : confidence >= 65 ? '#f59e0b' : '#c0c0c0';
  return (
    <View style={[badgeStyles.container, { borderColor: color + '55', backgroundColor: color + '18' }]}>
      <View style={[badgeStyles.dot, { backgroundColor: color }]} />
      <Text style={[badgeStyles.text, { color }]}>{confidence}% conf</Text>
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  container: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 5, borderWidth: 1,
  },
  dot: { width: 5, height: 5, borderRadius: 3 },
  text: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
});

export default function PicksScreen() {
  const colors = useColors();
  const { isActive } = useAmericanMode();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [picks, setPicks] = useState<Pick[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const fetchPicks = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${BASE_URL}/api/stocks/top-picks`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: Pick[] = await res.json();
      setPicks(data);
      setLastUpdated(new Date());
    } catch (e: any) {
      setError('Failed to load picks. The screener analyzes 100+ stocks — try again in a moment.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchPicks(); }, [fetchPicks]);

  const openPick = (pick: Pick) => {
    router.push({
      pathname: '/picks/[symbol]',
      params: { symbol: pick.symbol, data: JSON.stringify(pick) },
    });
  };

  const timeStr = lastUpdated
    ? lastUpdated.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <AmericanSteelBackground>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 12 }]}>
        <View style={styles.headerRow}>
          <View>
            <View style={styles.titleRow}>
              <Feather name="star" size={15} color={colors.primary} />
              <Text style={[styles.title, { color: colors.heading, fontFamily: 'Inter_700Bold' }]}>
                TOP PICKS
              </Text>
            </View>
            <Text style={[styles.subtitle, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
              AI multi-factor screener · refreshes every 4 hrs
            </Text>
          </View>
          {timeStr && (
            <Text style={[styles.timeText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
              {timeStr}
            </Text>
          )}
        </View>

        {/* Disclaimer banner */}
        <View style={[styles.banner, { backgroundColor: 'rgba(192,192,192,0.06)', borderColor: colors.border }]}>
          <Feather name="alert-circle" size={11} color={colors.mutedForeground} />
          <Text style={[styles.bannerText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
            AI analysis only — not financial advice. Past signals ≠ future results. Always do your own research.
          </Text>
        </View>
      </View>

      {/* Body */}
      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingTitle, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>
            Running Full Screener…
          </Text>
          <Text style={[styles.loadingText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
            Analyzing 100+ stocks across technicals,{'\n'}fundamentals, momentum & analyst consensus.{'\n'}This takes 1–3 minutes.
          </Text>
        </View>
      ) : error ? (
        <View style={styles.loadingBox}>
          <Feather name="wifi-off" size={32} color={colors.mutedForeground} />
          <Text style={[styles.loadingText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textAlign: 'center' }]}>
            {error}
          </Text>
          <TouchableOpacity
            style={[styles.retryBtn, { borderColor: colors.border }]}
            onPress={() => fetchPicks()}
            activeOpacity={0.7}
          >
            <Text style={[styles.retryText, { color: colors.primary, fontFamily: 'Inter_600SemiBold' }]}>
              Retry
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => fetchPicks(true)}
              tintColor={colors.primary}
            />
          }
        >
          {picks.map((pick, idx) => {
            const up = pick.priceChangePercent >= 0;
            const pctColor = up ? colors.buyColor : colors.sellColor;
            return (
              <TouchableOpacity
                key={pick.symbol}
                style={[styles.card, {
                  backgroundColor: colors.card,
                  borderColor: isActive ? colors.gold : colors.border,
                }]}
                onPress={() => openPick(pick)}
                activeOpacity={0.75}
              >
                {/* Rank + Confidence */}
                <View style={styles.cardTop}>
                  <View style={styles.rankBadge}>
                    <Text style={[styles.rankText, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>
                      #{idx + 1}
                    </Text>
                  </View>
                  <ConfidenceBadge confidence={pick.confidence} />
                  <View style={{ flex: 1 }} />
                  <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
                </View>

                {/* Symbol + Name */}
                <View style={styles.cardMid}>
                  <Text style={[styles.symbol, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
                    {pick.symbol}
                  </Text>
                  <Text style={[styles.name, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]} numberOfLines={1}>
                    {pick.name}
                  </Text>
                </View>

                {/* Price row */}
                <View style={styles.cardBottom}>
                  <View>
                    <Text style={[styles.price, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>
                      {fmtPrice(pick.currentPrice)}
                    </Text>
                    <Text style={[styles.change, { color: pctColor, fontFamily: 'Inter_500Medium' }]}>
                      {up ? '+' : ''}{pick.priceChangePercent.toFixed(2)}% today
                    </Text>
                  </View>

                  <View style={styles.targetCol}>
                    <Text style={[styles.targetLabel, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                      Target
                    </Text>
                    <Text style={[styles.targetPrice, { color: '#00e5a0', fontFamily: 'Inter_700Bold' }]}>
                      {fmtPrice(pick.priceTarget)}
                    </Text>
                    <Text style={[styles.upside, { color: '#00e5a0', fontFamily: 'Inter_500Medium' }]}>
                      +{pick.upside.toFixed(1)}% upside
                    </Text>
                  </View>

                  <View style={styles.scoreCol}>
                    <Text style={[styles.scoreLabel, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                      Score
                    </Text>
                    <Text style={[styles.score, { color: colors.primary, fontFamily: 'Inter_700Bold' }]}>
                      {pick.compositeScore.toFixed(0)}
                    </Text>
                    <Text style={[styles.scoreSubLabel, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                      {pick.sector || '—'}
                    </Text>
                  </View>
                </View>

                {/* Score bar row */}
                <View style={styles.scoreBars}>
                  {[
                    { label: 'Tech', val: pick.technicalScore, color: '#60a5fa' },
                    { label: 'Fund', val: pick.fundamentalScore, color: '#34d399' },
                    { label: 'Mom', val: pick.momentumScore, color: '#c084fc' },
                    { label: 'Anlst', val: pick.analystScore, color: '#f59e0b' },
                  ].map(({ label, val, color }) => (
                    <View key={label} style={styles.scoreBarItem}>
                      <Text style={[styles.scoreBarLabel, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                        {label}
                      </Text>
                      <View style={[styles.scoreBarTrack, { backgroundColor: colors.muted }]}>
                        <View style={[styles.scoreBarFill, { width: `${val}%` as any, backgroundColor: color }]} />
                      </View>
                    </View>
                  ))}
                </View>
              </TouchableOpacity>
            );
          })}
          {picks.length === 0 && (
            <Text style={[styles.emptyText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
              No high-confidence picks found right now. Pull down to refresh.
            </Text>
          )}
        </ScrollView>
      )}

      <BottomTabBar />
    </AmericanSteelBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 },
  title: { fontSize: 18, letterSpacing: 1 },
  subtitle: { fontSize: 11 },
  timeText: { fontSize: 10, marginTop: 2 },
  banner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 7,
    padding: 10, borderRadius: 8, borderWidth: 1,
  },
  bannerText: { fontSize: 10, lineHeight: 15, flex: 1 },
  loadingBox: {
    flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16,
  },
  loadingTitle: { fontSize: 16 },
  loadingText: { fontSize: 13, lineHeight: 21, textAlign: 'center' },
  retryBtn: { paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8, borderWidth: 1, marginTop: 8 },
  retryText: { fontSize: 14 },
  card: {
    borderRadius: 14, borderWidth: 1, padding: 16, marginBottom: 12, gap: 10,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rankBadge: {},
  rankText: { fontSize: 11 },
  cardMid: { gap: 2 },
  symbol: { fontSize: 20, lineHeight: 26 },
  name: { fontSize: 12 },
  cardBottom: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  price: { fontSize: 17 },
  change: { fontSize: 11, marginTop: 2 },
  targetCol: { alignItems: 'center' },
  targetLabel: { fontSize: 10, marginBottom: 2 },
  targetPrice: { fontSize: 15 },
  upside: { fontSize: 10, marginTop: 1 },
  scoreCol: { alignItems: 'flex-end' },
  scoreLabel: { fontSize: 10, marginBottom: 2 },
  score: { fontSize: 20 },
  scoreSubLabel: { fontSize: 9, marginTop: 1 },
  scoreBars: { gap: 5 },
  scoreBarItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scoreBarLabel: { fontSize: 9, width: 28 },
  scoreBarTrack: { flex: 1, height: 4, borderRadius: 2, overflow: 'hidden' },
  scoreBarFill: { height: 4, borderRadius: 2 },
  emptyText: { textAlign: 'center', fontSize: 13, marginTop: 40, lineHeight: 21 },
});
