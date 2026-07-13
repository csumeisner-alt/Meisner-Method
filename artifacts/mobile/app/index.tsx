import React, { useState, useEffect, useCallback } from 'react';
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
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather, Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';

const POPULAR_TICKERS = [
  { symbol: 'AAPL', name: 'Apple' },
  { symbol: 'MSFT', name: 'Microsoft' },
  { symbol: 'NVDA', name: 'NVIDIA' },
  { symbol: 'TSLA', name: 'Tesla' },
  { symbol: 'AMZN', name: 'Amazon' },
  { symbol: 'GOOGL', name: 'Alphabet' },
  { symbol: 'META', name: 'Meta' },
  { symbol: 'JPM', name: 'JPMorgan' },
  { symbol: 'BRK-B', name: 'Berkshire' },
  { symbol: 'SPY', name: 'S&P 500 ETF' },
];

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

const RECENT_KEY = 'meisner_recent';

export default function HomeScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState<string[]>([]);
  const [tipVisible, setTipVisible] = useState(false);
  const [currentTip, setCurrentTip] = useState('');

  useEffect(() => {
    AsyncStorage.getItem(RECENT_KEY).then((v) => {
      if (v) setRecent(JSON.parse(v));
    });
  }, []);

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
    await AsyncStorage.setItem(RECENT_KEY, JSON.stringify(updated));
    router.push(`/analysis/${upper}`);
  }, [recent, router]);

  const handleSubmit = () => {
    if (query.trim()) navigateTo(query.trim());
  };

  const clearRecent = async () => {
    setRecent([]);
    await AsyncStorage.removeItem(RECENT_KEY);
  };

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;

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
      <View style={[styles.header, { paddingTop: topPad + 16 }]}>
        <TouchableOpacity style={styles.brandRow} onPress={showTip} activeOpacity={0.75}>
          <View style={[styles.logoIcon, { borderColor: colors.primary }]}>
            <Ionicons name="trending-up" size={18} color={colors.primary} />
          </View>
          <Text style={[styles.brandName, { color: colors.foreground, fontFamily: 'Inter_700Bold', letterSpacing: 1 }]}>
            Meisner Method
          </Text>
          <Feather name="info" size={13} color={colors.mutedForeground} style={{ marginLeft: 4 }} />
        </TouchableOpacity>
        <Text style={[styles.tagline, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
          AI-powered market intelligence
        </Text>
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

        {/* Popular tickers */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold', letterSpacing: 1 }]}>
            MARKETS
          </Text>
          <View style={styles.tickerGrid}>
            {POPULAR_TICKERS.map((t) => (
              <TouchableOpacity
                key={t.symbol}
                style={[styles.tickerCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => navigateTo(t.symbol)}
                activeOpacity={0.75}
              >
                <Text style={[styles.tickerSymbol, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
                  {t.symbol}
                </Text>
                <Text style={[styles.tickerName, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                  {t.name}
                </Text>
                <Ionicons name="chevron-forward" size={14} color={colors.primary} style={styles.tickerArrow} />
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Disclaimer */}
        <Text style={[styles.disclaimer, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
          For informational purposes only. Not financial advice.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 20 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  logoIcon: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
  brandName: { fontSize: 22 },
  tagline: { fontSize: 13 },
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
  sectionTitle: { fontSize: 11 },
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
  tickerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tickerCard: {
    width: '47%',
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    position: 'relative',
  },
  tickerSymbol: { fontSize: 16, marginBottom: 2 },
  tickerName: { fontSize: 12 },
  tickerArrow: { position: 'absolute', right: 12, top: '50%' },
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
