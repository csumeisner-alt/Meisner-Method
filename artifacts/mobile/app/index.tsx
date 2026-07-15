import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
  Keyboard,
  Modal,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@clerk/expo';
import { Feather } from '@expo/vector-icons';
import { useApi } from '@/hooks/useApi';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { BottomTabBar } from '@/components/BottomTabBar';
import { MMLogo } from '@/components/MMLogo';

const BASE_URL = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

interface TrendingTicker {
  symbol: string;
  name: string;
  currentPrice: number;
  priceChange: number;
  priceChangePercent: number;
  volume: number;
}

const TIPS = [
  // WW2
  "🪖 During WW2, the United States produced a new ship every 10 days thanks to Henry Kaiser's revolutionary prefabrication techniques.",
  "🪖 The Enigma code machine used by Nazi Germany was cracked by Alan Turing and the team at Bletchley Park — a breakthrough that historians believe shortened the war by two years.",
  "🪖 During WW2, the Soviet Union lost an estimated 27 million people — more than any other nation in the conflict.",
  "🪖 The D-Day invasion on June 6, 1944 involved over 156,000 Allied troops crossing the English Channel — the largest seaborne invasion in history.",
  "🪖 WW2 saw the first — and only — combat use of nuclear weapons, when the US dropped atomic bombs on Hiroshima and Nagasaki in August 1945.",
  "🪖 The famous Doolittle Raid of April 1942 saw 16 B-25 bombers launched from an aircraft carrier to bomb Tokyo — a massive morale boost for America.",
  "🪖 Finland fought the Soviet Union to a standstill in the Winter War (1939–40), with a ratio of 5 Soviet losses for every 1 Finnish loss.",
  "🪖 The Battle of Stalingrad (1942–43) was the bloodiest battle in human history, with combined casualties estimated at nearly 2 million.",
  "🪖 Nazi Germany's Blitzkrieg strategy conquered France in just 46 days in 1940 — shocking the world.",
  "🪖 The Tuskegee Airmen were the first African American military aviators in the US Army Air Corps, flying over 15,000 missions during WW2.",
  // Trump
  "🇺🇸 Donald Trump was the first US president elected without prior military service or government office since Dwight D. Eisenhower.",
  "🇺🇸 Trump's 2016 victory is considered one of the biggest upsets in modern American political history — virtually every major poll predicted a Clinton win.",
  "🇺🇸 President Trump signed the Tax Cuts and Jobs Act of 2017, the most sweeping overhaul of the US tax code since Ronald Reagan's 1986 reform.",
  "🇺🇸 Trump became the first US president to be impeached twice — once in 2019 and again in 2021.",
  "🇺🇸 The Trump administration brokered the Abraham Accords in 2020, normalizing relations between Israel and four Arab nations: UAE, Bahrain, Sudan, and Morocco.",
  "🇺🇸 Donald Trump is the oldest person ever elected President of the United States, taking office in January 2025 at age 78.",
  "🇺🇸 Trump's Truth Social platform went public in 2024 via a SPAC merger, briefly making him a paper billionaire several times over.",
  "🇺🇸 Under Trump's first term, the US economy saw its lowest unemployment rate in 50 years — hitting 3.5% in 2019.",
  "🇺🇸 Trump became the first former US president to be convicted of felony crimes, with a New York jury returning 34 guilty counts in May 2024.",
  "🇺🇸 President Trump moved the US Embassy in Israel from Tel Aviv to Jerusalem in 2018 — fulfilling a decades-old campaign promise that previous presidents had avoided.",
];

const REFRESH_INTERVAL = 60_000; // refresh trending every 60 seconds

function formatPrice(p: number) {
  if (p >= 1000) return `$${p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (p >= 1) return `$${p.toFixed(2)}`;
  return `$${p.toFixed(4)}`;
}

function formatPct(p: number) {
  const sign = p >= 0 ? '+' : '';
  return `${sign}${p.toFixed(2)}%`;
}

export default function HomeScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signOut } = useAuth();
  const { apiFetch } = useApi();
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState<string[]>([]);
  const [tipVisible, setTipVisible] = useState(false);
  const [currentTip, setCurrentTip] = useState('');
  const [trending, setTrending] = useState<TrendingTicker[]>([]);
  const [trendingLoading, setTrendingLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    apiFetch<string[]>('/api/user/recent').then(setRecent).catch(() => {});
  }, [apiFetch]);

  const fetchTrending = useCallback(async (showLoader = false) => {
    if (showLoader) setTrendingLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/api/stocks/trending`);
      if (res.ok) {
        const data: TrendingTicker[] = await res.json();
        setTrending(data);
        setLastUpdated(new Date());
      }
    } catch {
      // silently keep last data
    } finally {
      setTrendingLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTrending(true);
    intervalRef.current = setInterval(() => fetchTrending(false), REFRESH_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchTrending]);

  const showTip = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const tip = TIPS[Math.floor(Math.random() * TIPS.length)]!;
    setCurrentTip(tip);
    setTipVisible(true);
  }, []);

  const navigateTo = useCallback(async (symbol: string) => {
    const upper = symbol.toUpperCase().trim();
    if (!upper) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Keyboard.dismiss();
    const updated = [upper, ...recent.filter((s) => s !== upper)].slice(0, 8);
    setRecent(updated);
    apiFetch('/api/user/recent', { method: 'PUT', body: JSON.stringify({ tickers: updated }) }).catch(() => {});
    router.push(`/analysis/${upper}`);
  }, [recent, router]);

  const handleSubmit = () => {
    if (query.trim()) navigateTo(query.trim());
  };

  const clearRecent = () => {
    setRecent([]);
    apiFetch('/api/user/recent', { method: 'PUT', body: JSON.stringify({ tickers: [] }) }).catch(() => {});
  };

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;

  const timeStr = lastUpdated
    ? lastUpdated.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Tip Modal */}
      <Modal transparent animationType="fade" visible={tipVisible} onRequestClose={() => setTipVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setTipVisible(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.primary, fontFamily: 'Inter_700Bold' }]}>
              Did You Know?
            </Text>
            <Text style={[styles.modalTip, { color: colors.foreground, fontFamily: 'Inter_400Regular' }]}>
              {currentTip}
            </Text>
            <TouchableOpacity
              style={[styles.modalBtn, { borderColor: colors.border }]}
              onPress={() => {
                const tip = TIPS[Math.floor(Math.random() * TIPS.length)]!;
                setCurrentTip(tip);
              }}
              activeOpacity={0.7}
            >
              <Text style={[styles.modalBtnText, { color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }]}>
                Another one
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setTipVisible(false)} style={styles.modalClose}>
              <Feather name="x" size={20} color={colors.mutedForeground} />
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 12 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity style={[styles.brandRow, { flex: 1 }]} onPress={showTip} activeOpacity={0.75}>
            <MMLogo size={44} />
            <View style={styles.brandText}>
              <Text style={[styles.brandName, { color: colors.foreground, fontFamily: 'Inter_700Bold', letterSpacing: 0.8 }]}>
                Meisner Method
              </Text>
              <Text style={[styles.tagline, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                AI-powered market intelligence
              </Text>
            </View>
            <Feather name="info" size={13} color={colors.mutedForeground} style={{ marginLeft: 'auto', marginRight: 8 }} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => signOut()} style={{ padding: 8 }} activeOpacity={0.7}>
            <Feather name="log-out" size={17} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Search bar */}
      <View style={[styles.searchSection, { backgroundColor: colors.background }]}>
        <View style={[styles.searchRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="search" size={20} color={colors.mutedForeground} style={styles.searchIcon} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground, fontFamily: 'Inter_500Medium' }]}
            placeholder="Enter ticker (AAPL, TSLA...)"
            placeholderTextColor={colors.mutedForeground}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={handleSubmit}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')} style={styles.clearBtn}>
              <Feather name="x" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          style={[styles.analyzeBtn, {
            backgroundColor: query.trim() ? colors.primary : colors.muted,
            borderWidth: 1,
            borderColor: query.trim() ? colors.primary : colors.border,
          }]}
          onPress={handleSubmit}
          disabled={!query.trim()}
          activeOpacity={0.8}
        >
          <Text style={[styles.analyzeBtnText, {
            color: query.trim() ? colors.primaryForeground : colors.mutedForeground,
            fontFamily: 'Inter_700Bold',
            letterSpacing: 1,
          }]}>
            ANALYZE
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: botPad + 24 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Recent searches */}
        {recent.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold', letterSpacing: 1 }]}>
                RECENT
              </Text>
              <TouchableOpacity onPress={clearRecent}>
                <Text style={[styles.clearText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                  Clear
                </Text>
              </TouchableOpacity>
            </View>
            <View style={styles.chipsRow}>
              {recent.map((sym) => (
                <TouchableOpacity
                  key={sym}
                  style={[styles.chip, { backgroundColor: colors.card, borderColor: colors.border }]}
                  onPress={() => navigateTo(sym)}
                  activeOpacity={0.7}
                >
                  <Feather name="clock" size={12} color={colors.mutedForeground} />
                  <Text style={[styles.chipText, { color: colors.primary, fontFamily: 'Inter_600SemiBold' }]}>
                    {sym}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Trending tickers */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Feather name="zap" size={11} color={colors.mutedForeground} />
              <Text style={[styles.sectionTitle, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold', letterSpacing: 1, marginLeft: 4 }]}>
                TRENDING
              </Text>
            </View>
            <View style={styles.refreshRow}>
              {timeStr && (
                <Text style={[styles.updatedText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                  {timeStr}
                </Text>
              )}
              <TouchableOpacity
                onPress={() => fetchTrending(true)}
                style={styles.refreshBtn}
                disabled={trendingLoading}
              >
                <Feather name="refresh-cw" size={13} color={trendingLoading ? colors.muted : colors.mutedForeground} />
              </TouchableOpacity>
            </View>
          </View>

          {trendingLoading && trending.length === 0 ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[styles.loadingText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                Fetching live market data…
              </Text>
            </View>
          ) : (
            <View style={styles.tickerGrid}>
              {trending.map((t) => {
                const up = t.priceChangePercent >= 0;
                const pctColor = up ? colors.buyColor : colors.sellColor;
                return (
                  <TouchableOpacity
                    key={t.symbol}
                    style={[styles.tickerCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                    onPress={() => navigateTo(t.symbol)}
                    activeOpacity={0.75}
                  >
                    {/* Change badge */}
                    <View style={[styles.pctBadge, { backgroundColor: up ? 'rgba(0,229,160,0.10)' : 'rgba(255,59,59,0.10)' }]}>
                      <Feather
                        name={up ? 'trending-up' : 'trending-down'}
                        size={10}
                        color={pctColor}
                      />
                      <Text style={[styles.pctText, { color: pctColor, fontFamily: 'Inter_700Bold' }]}>
                        {formatPct(t.priceChangePercent)}
                      </Text>
                    </View>

                    <Text style={[styles.tickerSymbol, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
                      {t.symbol}
                    </Text>
                    <Text style={[styles.tickerName, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]} numberOfLines={1}>
                      {t.name}
                    </Text>
                    <Text style={[styles.tickerPrice, { color: colors.primary, fontFamily: 'Inter_600SemiBold' }]}>
                      {formatPrice(t.currentPrice)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        {/* Disclaimer */}
        <Text style={[styles.disclaimer, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
          For informational purposes only. Not financial advice.
        </Text>
      </ScrollView>
      <BottomTabBar />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 16 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  brandText: { flex: 1 },
  brandName: { fontSize: 21, lineHeight: 26 },
  tagline: { fontSize: 12, marginTop: 1 },
  searchSection: { paddingHorizontal: 20, paddingBottom: 16, gap: 10 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    height: 52,
  },
  searchIcon: { marginRight: 10 },
  searchInput: { flex: 1, fontSize: 16, height: '100%' },
  clearBtn: { padding: 4 },
  analyzeBtn: {
    height: 52,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  analyzeBtnText: { fontSize: 14 },
  section: { paddingHorizontal: 20, marginBottom: 24 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center' },
  sectionTitle: { fontSize: 11 },
  refreshRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  updatedText: { fontSize: 10 },
  refreshBtn: { padding: 4 },
  clearText: { fontSize: 13 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
  },
  chipText: { fontSize: 13 },
  loadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 28,
    justifyContent: 'center',
  },
  loadingText: { fontSize: 13 },
  tickerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tickerCard: {
    width: '47%',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 3,
  },
  pctBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    alignSelf: 'flex-start',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
    marginBottom: 6,
  },
  pctText: { fontSize: 11 },
  tickerSymbol: { fontSize: 17, lineHeight: 22 },
  tickerName: { fontSize: 11, lineHeight: 15 },
  tickerPrice: { fontSize: 14, marginTop: 4 },
  disclaimer: { textAlign: 'center', fontSize: 11, paddingHorizontal: 20, marginTop: 8 },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 24,
    width: '100%',
    maxWidth: 380,
  },
  modalTitle: {
    fontSize: 13,
    letterSpacing: 2,
    marginBottom: 16,
  },
  modalTip: {
    fontSize: 15,
    lineHeight: 24,
    marginBottom: 20,
  },
  modalBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  modalBtnText: {
    fontSize: 13,
  },
  modalClose: {
    position: 'absolute',
    top: 16,
    right: 16,
    padding: 4,
  },
});
