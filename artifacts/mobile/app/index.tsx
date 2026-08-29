import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Platform,
  Keyboard,
  Modal,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useApi } from '@/hooks/useApi';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { BottomTabBar } from '@/components/BottomTabBar';
import { MMLogo } from '@/components/MMLogo';
import { DonationSidebar } from '@/components/DonationSidebar';
import { AmericanCelebration } from '@/components/AmericanCelebration';
import { useAmericanMode } from '@/contexts/AmericanModeContext';
import { useWatchlist } from '@/hooks/useWatchlist';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { DraggableWatchlist } from '@/components/DraggableWatchlist';
import { AmericanSteelBackground } from '@/components/AmericanSteelBackground';
import { AmericanAnalyzeButton } from '@/components/AmericanAnalyzeButton';
import { PriceAlertModal } from '@/components/PriceAlertModal';
import { matchesFilter, mergeReorderedSubset } from '@/lib/watchlistFilter';
import AsyncStorage from '@react-native-async-storage/async-storage';

/** Show the watchlist filter input when tracking this many tickers or more. */
const WATCHLIST_FILTER_THRESHOLD = 6;

/** AsyncStorage key for the persisted watchlist filter. */
const WATCH_FILTER_KEY = '@stocksense/watchlist_filter';

/** AsyncStorage key for the persisted watchlist open/collapsed state. */
const WATCHLIST_COLLAPSED_KEY = '@stocksense/watchlist_collapsed';

/** Persists the watchlist filter across navigation within a session (resets on full app reload). */
let _persistedWatchFilter = '';

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
  // HK (Heckler & Koch)
  "🔫 Heckler & Koch was founded in 1949 in Oberndorf am Neckar, Germany — rising from the ashes of WWII to become one of the world's premier firearms manufacturers.",
  "🔫 The HK MP5 submachine gun, introduced in 1966, is one of the most iconic and widely-used law-enforcement firearms in history — carried by special forces in over 40 countries.",
  "🔫 HK's roller-delayed blowback operating system, pioneered in the G3 battle rifle, is legendary for its reliability and accuracy — it remains in service in dozens of militaries worldwide.",
  "🔫 The HK416 assault rifle replaced the M4/M16 in German KSK special forces and is the standard rifle of the French Army — it was also the weapon used in Operation Neptune Spear that killed Osama bin Laden.",
  "🔫 HK developed the G11 rifle in the 1970s–80s — a futuristic caseless-ammunition weapon that achieved a cyclic rate of 2,000 rounds per minute in burst mode.",
  "🔫 The HK USP (Universal Self-loading Pistol) was specifically engineered for US law enforcement and military trials, becoming the basis for the legendary HK Mark 23 SOCOM pistol.",
  "🔫 HK's VP9 striker-fired pistol, released in 2014, became one of the best-reviewed duty pistols ever made — praised for its ergonomics, trigger quality, and near-zero malfunction rate.",
  "🔫 The HK G36, adopted by the German Bundeswehr in 1997, was the first military service rifle made primarily of high-strength polymer, setting a new standard for lightweight modern infantry weapons.",
  "🔫 HK's G28 Designated Marksman Rifle is used by US Army Rangers and USSOCOM — it delivers sub-MOA accuracy out to 800 meters with standard 7.62×51mm NATO ammunition.",
  "🔫 HK introduced the 'No Compromise' slogan because their manufacturing tolerances are so tight that HK pistols routinely function for 20,000+ rounds without a single malfunction in independent testing.",
  "🔫 The HK 45 was designed to outperform the Colt 1911 in the US military's Joint Combat Pistol trial — it won fans for its reliability and ergonomic grip angle, even though the program was later cancelled.",
  "🔫 HK's UMP submachine gun was engineered to fire .45 ACP at a cyclic rate of 600 rounds per minute, giving operators a suppressed, hard-hitting option for close-quarters battle.",
  "🔫 The HK P30 served as the sidearm for Liam Neeson in the Taken film series — in real life, it has been adopted by German police and special units across Europe.",
  "🔫 HK's SP5K is the semiautomatic civilian version of the iconic MP5K, bringing the same roller-delayed action to the US market with a 16-round magazine capacity.",
  "🔫 The HK MR556A1 is the civilian version of the HK416, built with the same gas piston and cold-hammer-forged barrel but semi-automatic only — making it a prized premium rifle on the US market.",
  // Pro-2A / Second Amendment
  "🦅 The Second Amendment was ratified on December 15, 1791 as part of the Bill of Rights — its 27 words have been the cornerstone of American individual liberty for over 230 years.",
  "🦅 In District of Columbia v. Heller (2008), the Supreme Court ruled 5–4 that the Second Amendment protects an individual's right to keep and bear arms for self-defense — independent of service in a militia.",
  "🦅 McDonald v. Chicago (2010) extended Heller nationwide, ruling that the 14th Amendment incorporates the Second Amendment against state and local governments — striking down Chicago's handgun ban.",
  "🦅 There are an estimated 400–450 million privately owned firearms in the United States — more guns than people — making American gun ownership the highest per capita of any nation on Earth.",
  "🦅 The right to bear arms predates the US Constitution: the English Bill of Rights of 1689 explicitly recognized the right of Protestants to keep arms for their defense, directly influencing America's Founders.",
  "🦅 As of 2024, 29 states have enacted constitutional carry (permitless carry) laws — allowing law-abiding citizens to carry a concealed firearm without a government permit.",
  "🦅 A CDC-funded study by criminologist Gary Kleck estimated that Americans use firearms defensively between 60,000 and 2.5 million times per year — the overwhelming majority without firing a shot.",
  "🦅 The Founding Fathers were unambiguous about the 2A's purpose: James Madison wrote in Federalist No. 46 that an armed citizenry of 500,000 would be a powerful check against any federal tyranny.",
  "🦅 New York State Rifle & Pistol Association v. Bruen (2022) was a landmark Supreme Court ruling striking down 'may-issue' concealed carry permit laws, affirming that law-abiding citizens have a right to carry outside the home.",
  "🦅 Switzerland issues military rifles to most able-bodied men as part of its national defense doctrine — yet the country consistently ranks among the safest in the world, underlining that responsible gun ownership and safety are not mutually exclusive.",
  "🦅 The US imported roughly 90% of its gunpowder from Britain before the Revolutionary War — securing domestic saltpeter supplies became a strategic priority for the colonies.",
  "🦅 In 1857, the Supreme Court in Dred Scott v. Sandford held that free Black Americans could not be citizens — a ruling that also cited the fear that freed slaves would enjoy the right to keep and bear arms.",
  "🦅 The first American 'assault weapons' ban expired in 2004 after a 10-year run; a federally funded study found it had no clear impact on crime rates.",
  "🦅 Gun-maker Colt's Single Action Army revolver, adopted by the US military in 1873, was nicknamed 'the gun that won the West' and became a symbol of frontier American life.",
  "🦅 American women are one of the fastest-growing demographics of gun owners, with permits and training courses among female shooters rising sharply in the 2010s and 2020s.",
];

const REFRESH_INTERVAL = 60_000;

function formatPrice(p: number) {
  if (p >= 1000) return `$${p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (p >= 1) return `$${p.toFixed(2)}`;
  return `$${p.toFixed(4)}`;
}

function formatPct(p: number) {
  const sign = p >= 0 ? '+' : '';
  return `${sign}${p.toFixed(2)}%`;
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { apiFetch } = useApi();
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState<string[]>([]);
  const [tipVisible, setTipVisible] = useState(false);
  const [currentTip, setCurrentTip] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [trending, setTrending] = useState<TrendingTicker[]>([]);
  const [trendingLoading, setTrendingLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const [watchlistCollapsed, setWatchlistCollapsed] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Watchlist + push notifications
  const watchlist = useWatchlist();
  const {
    pushToken,
    status: pushStatus,
    registrationError,
    requestPermission,
    openNotificationSettings,
  } = usePushNotifications();

  // Alert modal state
  const [alertModalSymbol, setAlertModalSymbol] = useState<string | null>(null);
  const [alertModalPrice, setAlertModalPrice] = useState<number | undefined>(undefined);

  // Patriot Mode — fact counter, unlock state, and celebration trigger
  const { isActive, neonGucciActive, justUnlocked, incrementFact, clearJustUnlocked } = useAmericanMode();
  const [showCelebration, setShowCelebration] = useState(false);

  useEffect(() => {
    if (justUnlocked) {
      setShowCelebration(true);
      clearJustUnlocked();
    }
  }, [justUnlocked, clearJustUnlocked]);

  // Watchlist filter — only shown when the list gets long.
  // Initialised from the module-level variable so the value survives navigation.
  const [watchFilter, setWatchFilterState] = useState(_persistedWatchFilter);
  // Holds the filter value loaded from AsyncStorage before the watchlist is ready.
  const pendingSavedFilterRef = useRef<string | null>(null);

  const setWatchFilter = useCallback((v: string) => {
    _persistedWatchFilter = v;
    setWatchFilterState(v);
    if (v) {
      AsyncStorage.setItem(WATCH_FILTER_KEY, v).catch(() => {});
    } else {
      AsyncStorage.removeItem(WATCH_FILTER_KEY).catch(() => {});
    }
  }, []);

  const showWatchFilter = watchlist.items.length >= WATCHLIST_FILTER_THRESHOLD;

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(WATCHLIST_COLLAPSED_KEY).then((saved) => {
      if (!cancelled && saved === '1') setWatchlistCollapsed(true);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const toggleWatchlist = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setWatchlistCollapsed((current) => {
      const next = !current;
      AsyncStorage.setItem(WATCHLIST_COLLAPSED_KEY, next ? '1' : '0').catch(() => {});
      return next;
    });
  }, []);

  // On cold start, load the persisted filter from AsyncStorage.
  useEffect(() => {
    AsyncStorage.getItem(WATCH_FILTER_KEY).then((saved) => {
      if (saved) {
        pendingSavedFilterRef.current = saved;
        // If the watchlist is already above threshold, apply immediately.
        if (watchlist.items.length >= WATCHLIST_FILTER_THRESHOLD) {
          setWatchFilter(saved);
          pendingSavedFilterRef.current = null;
        }
      }
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When the watchlist crosses the threshold for the first time, apply any
  // pending saved filter that was loaded before the list was ready.
  useEffect(() => {
    if (showWatchFilter && pendingSavedFilterRef.current) {
      setWatchFilter(pendingSavedFilterRef.current);
      pendingSavedFilterRef.current = null;
    }
  }, [showWatchFilter, setWatchFilter]);

  // Clear the filter (and its persisted value) when the list drops below the threshold.
  useEffect(() => {
    if (!showWatchFilter && watchFilter) setWatchFilter('');
  }, [showWatchFilter, watchFilter, setWatchFilter]);

  const filteredWatchItems = showWatchFilter && watchFilter.trim()
    ? watchlist.items.filter((i) => matchesFilter(i.symbol, watchFilter))
    : watchlist.items;

  // When a filtered subset is reordered, map it back onto the full list
  const handleWatchReorder = useCallback(
    (symbols: string[]) => {
      const fullOrder = watchlist.items.map((i) => i.symbol);
      if (symbols.length === fullOrder.length) {
        watchlist.reorder(symbols);
      } else {
        watchlist.reorder(mergeReorderedSubset(fullOrder, symbols));
      }
    },
    [watchlist.items, watchlist.reorder],
  );

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

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([watchlist.refresh(), fetchTrending(false)]);
    setRefreshing(false);
  }, [watchlist.refresh, fetchTrending]);

  const showTip = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const tip = TIPS[Math.floor(Math.random() * TIPS.length)]!;
    setCurrentTip(tip);
    setTipVisible(true);
    void incrementFact();
  }, [incrementFact]);

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

  const openAlertModal = (symbol: string, price?: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setAlertModalSymbol(symbol);
    setAlertModalPrice(price);
  };

  const activeAlert = alertModalSymbol ? watchlist.activeAlertFor(alertModalSymbol) : null;

  return (
    <AmericanSteelBackground>
      {/* Tip Modal */}
      <Modal transparent animationType="fade" visible={tipVisible} onRequestClose={() => setTipVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setTipVisible(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.primary, fontFamily: 'Inter_700Bold' }]}>
              {isActive ? '🦅 ' : ''}Did You Know?
            </Text>
            <Text style={[styles.modalTip, { color: colors.foreground, fontFamily: 'Inter_400Regular' }]}>
              {currentTip}
            </Text>
            <TouchableOpacity
              style={[styles.modalBtn, { borderColor: colors.border }]}
              onPress={() => {
                const tip = TIPS[Math.floor(Math.random() * TIPS.length)]!;
                setCurrentTip(tip);
                void incrementFact();
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

      {/* Patriot Mode celebration — fires once when 1,776 facts are read */}
      <AmericanCelebration
        visible={showCelebration}
        onDismiss={() => setShowCelebration(false)}
      />

      {/* Alert Modal */}
      {alertModalSymbol && (
        <PriceAlertModal
          visible={!!alertModalSymbol}
          symbol={alertModalSymbol}
          currentPrice={alertModalPrice ?? watchlist.quotes.get(alertModalSymbol)?.currentPrice}
          existingDirection={activeAlert?.direction}
          existingTarget={activeAlert?.targetPrice}
          pushToken={pushToken}
          registrationError={registrationError}
          permissionStatus={pushStatus}
          onRequestPermission={requestPermission}
          onOpenSettings={openNotificationSettings}
          onSave={async (direction, targetPrice) => {
            if (!pushToken) return;
            await watchlist.saveAlert(alertModalSymbol, direction, targetPrice, pushToken);
          }}
          onDelete={async () => {
            if (activeAlert) await watchlist.deleteAlert(activeAlert.id).catch(() => {});
          }}
          onClose={() => setAlertModalSymbol(null)}
          colors={colors}
        />
      )}

      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 12 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity style={[styles.brandRow, { flex: 1 }]} onPress={showTip} activeOpacity={0.75}>
            <MMLogo size={44} />
            <View style={styles.brandText}>
              <Text style={[styles.brandName, { color: colors.heading, fontFamily: 'Inter_700Bold', letterSpacing: 0.8 }]}>
                Meisner Method{isActive ? ' 🇺🇸' : ''}
              </Text>
              <Text style={[styles.tagline, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                AI-powered market intelligence
              </Text>
              {neonGucciActive && (
                <View style={styles.neonThemeBadge}>
                  <View style={styles.neonThemeDot} />
                  <Text style={styles.neonThemeBadgeText}>HYBRID NEON GUCCI · ACTIVE</Text>
                </View>
              )}
            </View>
            <Feather name="info" size={13} color={colors.mutedForeground} style={{ marginLeft: 'auto', marginRight: 8 }} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setSettingsOpen(true);
            }}
            style={{ padding: 8 }}
            activeOpacity={0.7}
          >
            <Feather name="settings" size={20} color={colors.mutedForeground} />
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
        <AmericanAnalyzeButton
          active={isActive}
          neonActive={neonGucciActive}
          disabled={!query.trim()}
          hasQuery={Boolean(query.trim())}
          colors={colors}
          onPress={handleSubmit}
        />
      </View>

      {/* Watchlist filter — sticky bar between search and scroll so it's always reachable */}
      {showWatchFilter && !watchlistCollapsed && (
        <View style={[styles.watchFilterBar, { borderBottomColor: colors.border }]}>
          <View style={[styles.watchFilterRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="filter" size={14} color={colors.mutedForeground} style={{ marginRight: 8 }} />
            <TextInput
              style={[styles.watchFilterInput, { color: colors.foreground, fontFamily: 'Inter_500Medium' }]}
              placeholder="Filter watchlist…"
              placeholderTextColor={colors.mutedForeground}
              value={watchFilter}
              onChangeText={setWatchFilter}
              autoCapitalize="characters"
              autoCorrect={false}
              returnKeyType="done"
            />
            {watchFilter.length > 0 && (
              <TouchableOpacity onPress={() => setWatchFilter('')} style={{ padding: 4 }}>
                <Feather name="x" size={14} color={colors.mutedForeground} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: botPad + 24 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        scrollEnabled={scrollEnabled}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.mutedForeground}
            colors={[colors.primary]}
          />
        }
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

        {/* ─── Watchlist ──────────────────────────────────────────────── */}
        <View>
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <TouchableOpacity
                style={styles.sectionTitleRow}
                onPress={toggleWatchlist}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`${watchlistCollapsed ? 'Expand' : 'Collapse'} watchlist`}
                accessibilityState={{ expanded: !watchlistCollapsed }}
              >
                <Feather name="star" size={11} color={colors.mutedForeground} />
                <Text style={[styles.sectionTitle, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold', letterSpacing: 1, marginLeft: 4 }]}>
                  WATCHLIST
                  {watchlist.items.length > 0 && (
                    <Text style={{ fontFamily: 'Inter_400Regular' }}> ({watchlist.items.length})</Text>
                  )}
                </Text>
                <Feather
                  name={watchlistCollapsed ? 'chevron-right' : 'chevron-down'}
                  size={15}
                  color={colors.mutedForeground}
                  style={{ marginLeft: 5 }}
                />
              </TouchableOpacity>
              <View style={styles.refreshRow}>
                {watchlist.lastUpdated && (
                  <Text style={[styles.updatedText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                    {watchlist.lastUpdated.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                )}
                {watchlist.loading && !refreshing ? (
                  <ActivityIndicator size="small" color={colors.mutedForeground} style={{ marginRight: 4 }} />
                ) : (
                  <TouchableOpacity onPress={() => watchlist.refresh()} style={styles.refreshBtn} disabled={watchlist.loading}>
                    <Feather name="refresh-cw" size={13} color={watchlist.loading ? colors.muted : colors.mutedForeground} />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {!watchlistCollapsed && watchlist.items.length === 0 ? (
              <View style={[styles.watchlistEmpty, { borderColor: colors.border }]}>
                <Feather name="star" size={20} color={colors.mutedForeground} />
                <Text style={[styles.watchlistEmptyText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                  Search for a stock and tap ★ to add it here
                </Text>
              </View>
            ) : !watchlistCollapsed && filteredWatchItems.length === 0 ? (
              <View style={[styles.watchlistEmpty, { borderColor: colors.border }]}>
                <Feather name="search" size={20} color={colors.mutedForeground} />
                <Text style={[styles.watchlistEmptyText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                  No tickers match “{watchFilter.trim().toUpperCase()}”
                </Text>
              </View>
            ) : !watchlistCollapsed ? (
              <DraggableWatchlist
                items={filteredWatchItems}
                quotes={watchlist.quotes}
                activeAlertFor={watchlist.activeAlertFor}
                onNavigate={navigateTo}
                onRemove={watchlist.remove}
                onReorder={handleWatchReorder}
                onOpenAlert={openAlertModal}
                onDragActive={(active) => setScrollEnabled(!active)}
                colors={colors}
                formatPrice={formatPrice}
                formatPct={formatPct}
              />
            ) : null}
          </View>
        </View>

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
                    style={[styles.tickerCard, {
                      backgroundColor: colors.card,
                      borderColor: isActive ? colors.gold : colors.border,
                      shadowColor: isActive ? colors.gold : '#000',
                      shadowOpacity: isActive ? 0.18 : 0,
                      shadowRadius: isActive ? 8 : 0,
                    }]}
                    onPress={() => navigateTo(t.symbol)}
                    activeOpacity={0.75}
                  >
                    <View style={[styles.pctBadge, { backgroundColor: up ? 'rgba(0,229,160,0.10)' : 'rgba(255,59,59,0.10)' }]}>
                      <Feather name={up ? 'trending-up' : 'trending-down'} size={10} color={pctColor} />
                      <Text style={[styles.pctText, { color: pctColor, fontFamily: 'Inter_700Bold' }]}>
                        {formatPct(t.priceChangePercent)}
                      </Text>
                    </View>
                    <Text style={[styles.tickerSymbol, { color: colors.heading, fontFamily: 'Inter_700Bold' }]}>
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

      <DonationSidebar
        visible={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </AmericanSteelBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 16 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  brandText: { flex: 1 },
  brandName: { fontSize: 21, lineHeight: 26 },
  tagline: { fontSize: 12, marginTop: 1 },
  neonThemeBadge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8, backgroundColor: 'rgba(85,236,255,0.12)', borderWidth: 1, borderColor: '#55ecff' },
  neonThemeDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#55ecff' },
  neonThemeBadgeText: { color: '#b9ffcf', fontSize: 7, fontWeight: '800', letterSpacing: 0.55 },
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
  // Watchlist
  watchFilterBar: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  watchFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    height: 40,
  },
  watchFilterInput: { flex: 1, fontSize: 14, height: '100%' },
  watchlistEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 10,
    borderStyle: 'dashed',
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  watchlistEmptyText: { fontSize: 13, flex: 1, lineHeight: 18 },
});
