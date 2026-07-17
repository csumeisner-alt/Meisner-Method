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
  Alert,
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
import { DonationSidebar } from '@/components/DonationSidebar';
import { useWatchlist } from '@/hooks/useWatchlist';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { DraggableWatchlist } from '@/components/DraggableWatchlist';
import { matchesFilter, mergeReorderedSubset } from '@/lib/watchlistFilter';
import AsyncStorage from '@react-native-async-storage/async-storage';

/** Show the watchlist filter input when tracking this many tickers or more. */
const WATCHLIST_FILTER_THRESHOLD = 6;

/** AsyncStorage key for the persisted watchlist filter. */
const WATCH_FILTER_KEY = '@stocksense/watchlist_filter';

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

// ─── Alert Modal ──────────────────────────────────────────────────────────────

interface AlertModalProps {
  visible: boolean;
  symbol: string;
  currentPrice?: number;
  existingDirection?: 'above' | 'below';
  existingTarget?: number;
  pushToken: string | null;
  permissionStatus: 'unknown' | 'granted' | 'denied' | 'unavailable';
  onRequestPermission: () => Promise<boolean>;
  onOpenSettings: () => void;
  onSave: (direction: 'above' | 'below', targetPrice: number) => void;
  onDelete: () => void;
  onClose: () => void;
  colors: any;
}

function AlertModal({
  visible, symbol, currentPrice, existingDirection, existingTarget,
  pushToken, permissionStatus, onRequestPermission, onOpenSettings,
  onSave, onDelete, onClose, colors,
}: AlertModalProps) {
  const [direction, setDirection] = useState<'above' | 'below'>(existingDirection ?? 'above');
  const [targetInput, setTargetInput] = useState(existingTarget?.toFixed(2) ?? '');
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    if (visible) {
      setDirection(existingDirection ?? 'above');
      setTargetInput(existingTarget?.toFixed(2) ?? (currentPrice ? currentPrice.toFixed(2) : ''));
    }
  }, [visible, existingDirection, existingTarget, currentPrice]);

  const handleSave = () => {
    const val = parseFloat(targetInput);
    if (!val || val <= 0) {
      Alert.alert('Invalid price', 'Please enter a valid price target.');
      return;
    }
    onSave(direction, val);
    onClose();
  };

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <Pressable style={alertStyles.overlay} onPress={onClose}>
        <Pressable style={[alertStyles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[alertStyles.title, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
            Price Alert — {symbol}
          </Text>
          {currentPrice != null && (
            <Text style={[alertStyles.subtitle, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
              Current: {formatPrice(currentPrice)}
            </Text>
          )}

          {permissionStatus === 'unavailable' ? (
            <View style={[alertStyles.unavailableBox, { backgroundColor: colors.muted, borderColor: colors.border }]}>
              <Feather name="bell-off" size={16} color={colors.mutedForeground} />
              <Text style={[alertStyles.unavailableText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                Push notifications are only available on a physical device with the app installed.
              </Text>
            </View>
          ) : permissionStatus === 'denied' ? (
            <>
              <View style={[alertStyles.unavailableBox, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                <Feather name="bell-off" size={16} color={colors.mutedForeground} />
                <Text style={[alertStyles.unavailableText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                  Notifications are turned off for this app. To get price alerts, enable them in your phone's settings.
                </Text>
              </View>
              <TouchableOpacity
                style={[alertStyles.saveBtn, { backgroundColor: colors.primary }]}
                onPress={onOpenSettings}
                activeOpacity={0.8}
              >
                <Feather name="settings" size={14} color={colors.primaryForeground} />
                <Text style={[alertStyles.saveTxt, { color: colors.primaryForeground, fontFamily: 'Inter_700Bold' }]}>
                  Open Settings
                </Text>
              </TouchableOpacity>
            </>
          ) : !pushToken ? (
            <>
              <View style={[alertStyles.unavailableBox, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                <Feather name="bell" size={16} color={colors.mutedForeground} />
                <Text style={[alertStyles.unavailableText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                  We'll send you a notification when {symbol} crosses your target price. Allow notifications to set your alert.
                </Text>
              </View>
              <TouchableOpacity
                style={[alertStyles.saveBtn, { backgroundColor: colors.primary, opacity: requesting ? 0.6 : 1 }]}
                onPress={async () => {
                  if (requesting) return;
                  setRequesting(true);
                  try { await onRequestPermission(); } finally { setRequesting(false); }
                }}
                disabled={requesting}
                activeOpacity={0.8}
              >
                {requesting ? (
                  <ActivityIndicator size="small" color={colors.primaryForeground} />
                ) : (
                  <Feather name="bell" size={14} color={colors.primaryForeground} />
                )}
                <Text style={[alertStyles.saveTxt, { color: colors.primaryForeground, fontFamily: 'Inter_700Bold' }]}>
                  Enable Notifications
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              {/* Direction toggle */}
              <View style={alertStyles.dirRow}>
                {(['above', 'below'] as const).map((d) => (
                  <TouchableOpacity
                    key={d}
                    style={[
                      alertStyles.dirBtn,
                      { borderColor: colors.border },
                      direction === d && { backgroundColor: d === 'above' ? colors.buyBg : colors.sellBg, borderColor: d === 'above' ? colors.buyColor : colors.sellColor },
                    ]}
                    onPress={() => setDirection(d)}
                    activeOpacity={0.8}
                  >
                    <Text style={[alertStyles.dirTxt, {
                      color: direction === d ? (d === 'above' ? colors.buyColor : colors.sellColor) : colors.mutedForeground,
                      fontFamily: 'Inter_600SemiBold',
                    }]}>
                      {d === 'above' ? '↑ Above' : '↓ Below'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Price input */}
              <Text style={[alertStyles.label, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                Target price ($)
              </Text>
              <TextInput
                style={[alertStyles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.muted, fontFamily: 'Inter_500Medium' }]}
                value={targetInput}
                onChangeText={setTargetInput}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={colors.mutedForeground}
              />

              <TouchableOpacity
                style={[alertStyles.saveBtn, { backgroundColor: colors.primary }]}
                onPress={handleSave}
                activeOpacity={0.8}
              >
                <Feather name="bell" size={14} color={colors.primaryForeground} />
                <Text style={[alertStyles.saveTxt, { color: colors.primaryForeground, fontFamily: 'Inter_700Bold' }]}>
                  {existingTarget ? 'Update Alert' : 'Set Alert'}
                </Text>
              </TouchableOpacity>
            </>
          )}

          {existingTarget != null && (
            <TouchableOpacity style={alertStyles.deleteBtn} onPress={() => { onDelete(); onClose(); }} activeOpacity={0.8}>
              <Text style={[alertStyles.deleteTxt, { color: colors.sellColor, fontFamily: 'Inter_500Medium' }]}>
                Remove alert
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={alertStyles.closeBtn} onPress={onClose} activeOpacity={0.7}>
            <Feather name="x" size={20} color={colors.mutedForeground} />
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const alertStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  sheet: { borderRadius: 16, borderWidth: 1, padding: 24, width: '100%', maxWidth: 380 },
  title: { fontSize: 15, letterSpacing: 0.5, marginBottom: 4 },
  subtitle: { fontSize: 12, marginBottom: 20 },
  unavailableBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderWidth: 1, borderRadius: 8, padding: 12, marginBottom: 8 },
  unavailableText: { fontSize: 13, lineHeight: 19, flex: 1 },
  dirRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  dirBtn: { flex: 1, borderWidth: 1, borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  dirTxt: { fontSize: 14 },
  label: { fontSize: 11, letterSpacing: 0.5, marginBottom: 6 },
  input: { height: 48, borderRadius: 8, borderWidth: 1, paddingHorizontal: 14, fontSize: 16, marginBottom: 16 },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, borderRadius: 10, marginBottom: 8 },
  saveTxt: { fontSize: 14, letterSpacing: 0.5 },
  deleteBtn: { alignItems: 'center', paddingVertical: 10 },
  deleteTxt: { fontSize: 13 },
  closeBtn: { position: 'absolute', top: 16, right: 16, padding: 4 },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signOut, isSignedIn } = useAuth();
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
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Watchlist + push notifications
  const watchlist = useWatchlist();
  const { pushToken, status: pushStatus, requestPermission, openNotificationSettings } = usePushNotifications();

  // Alert modal state
  const [alertModalSymbol, setAlertModalSymbol] = useState<string | null>(null);
  const [alertModalPrice, setAlertModalPrice] = useState<number | undefined>(undefined);

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

  const openAlertModal = (symbol: string, price?: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setAlertModalSymbol(symbol);
    setAlertModalPrice(price);
  };

  const activeAlert = alertModalSymbol ? watchlist.activeAlertFor(alertModalSymbol) : null;

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

      {/* Alert Modal */}
      {alertModalSymbol && (
        <AlertModal
          visible={!!alertModalSymbol}
          symbol={alertModalSymbol}
          currentPrice={alertModalPrice ?? watchlist.quotes.get(alertModalSymbol)?.currentPrice}
          existingDirection={activeAlert?.direction}
          existingTarget={activeAlert?.targetPrice}
          pushToken={pushToken}
          permissionStatus={pushStatus}
          onRequestPermission={requestPermission}
          onOpenSettings={openNotificationSettings}
          onSave={async (direction, targetPrice) => {
            if (!pushToken) return;
            await watchlist.saveAlert(alertModalSymbol, direction, targetPrice, pushToken).catch(() => {});
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
              <Text style={[styles.brandName, { color: colors.foreground, fontFamily: 'Inter_700Bold', letterSpacing: 0.8 }]}>
                Meisner Method
              </Text>
              <Text style={[styles.tagline, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                AI-powered market intelligence
              </Text>
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

      {/* Watchlist filter — sticky bar between search and scroll so it's always reachable */}
      {isSignedIn && showWatchFilter && (
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
        {isSignedIn && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <Feather name="star" size={11} color={colors.mutedForeground} />
                <Text style={[styles.sectionTitle, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold', letterSpacing: 1, marginLeft: 4 }]}>
                  WATCHLIST
                  {watchlist.items.length > 0 && (
                    <Text style={{ fontFamily: 'Inter_400Regular' }}> ({watchlist.items.length})</Text>
                  )}
                </Text>
              </View>
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

            {watchlist.items.length === 0 ? (
              <View style={[styles.watchlistEmpty, { borderColor: colors.border }]}>
                <Feather name="star" size={20} color={colors.mutedForeground} />
                <Text style={[styles.watchlistEmptyText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                  Search for a stock and tap ★ to add it here
                </Text>
              </View>
            ) : filteredWatchItems.length === 0 ? (
              <View style={[styles.watchlistEmpty, { borderColor: colors.border }]}>
                <Feather name="search" size={20} color={colors.mutedForeground} />
                <Text style={[styles.watchlistEmptyText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                  No tickers match “{watchFilter.trim().toUpperCase()}”
                </Text>
              </View>
            ) : (
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
            )}
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
                    <View style={[styles.pctBadge, { backgroundColor: up ? 'rgba(0,229,160,0.10)' : 'rgba(255,59,59,0.10)' }]}>
                      <Feather name={up ? 'trending-up' : 'trending-down'} size={10} color={pctColor} />
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

      <DonationSidebar
        visible={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSignOut={() => {
          setSettingsOpen(false);
          signOut();
        }}
      />
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
