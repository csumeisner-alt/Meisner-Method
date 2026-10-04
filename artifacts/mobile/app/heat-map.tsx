import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Keyboard, Platform, RefreshControl, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Polygon } from 'react-native-svg';
import { getGetMarketHeatMapQueryKey, useGetMarketHeatMap, useValidateHeatMapSymbol } from '@workspace/api-client-react';
import type { GetMarketHeatMapCategory, HeatMapQuote } from '@workspace/api-client-react';
import { AmericanSteelBackground } from '@/components/AmericanSteelBackground';
import { BottomTabBar } from '@/components/BottomTabBar';
import { useColors } from '@/hooks/useColors';
import { summarizeHeatMap } from '@/lib/heatMapMetrics';
import { formatHeatMapQuoteAge, getHeatMapSessionLabel, isDisplayableHeatMapQuote } from '@/lib/heatMapQuoteDisplay';
import { MAX_CUSTOM_HEAT_MAP_SYMBOLS, normalizeCustomHeatMapSymbols } from '@/lib/heatMapSymbols';

const STORAGE_KEY = 'meisner.heat-map.custom-symbols.v1';
const CATEGORIES: { id: GetMarketHeatMapCategory; label: string; icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'] }[] = [
  { id: 'stocks', label: 'Stocks', icon: 'chart-line' },
  { id: 'etfs', label: 'ETFs', icon: 'view-grid-outline' },
  { id: 'commodities', label: 'Commodities', icon: 'cube-outline' },
  { id: 'futures', label: 'Futures', icon: 'clock-fast' },
  { id: 'cryptocurrency', label: 'Cryptocurrency', icon: 'bitcoin' },
  { id: 'custom', label: 'Custom', icon: 'tune-variant' },
];

function formatPrice(price: number) {
  return `$${price.toLocaleString('en-US', { minimumFractionDigits: price >= 1 ? 2 : 4, maximumFractionDigits: price >= 1 ? 2 : 4 })}`;
}

function formatUpdated(timestamp: number | undefined) {
  if (!timestamp) return 'Awaiting quote batch';
  return `Quotes checked ${new Date(timestamp * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

function HexTile({ quote, width, colors }: { quote: HeatMapQuote; width: number; colors: ReturnType<typeof useColors> }) {
  const change = quote.priceChangePercent;
  const tone = change > 0.25 ? colors.buyColor : change < -0.25 ? colors.sellColor : colors.holdColor;
  const bg = change > 0.25 ? colors.buyBg : change < -0.25 ? colors.sellBg : colors.holdBg;
  const height = Math.round(width * 0.88);
  const sessionLabel = getHeatMapSessionLabel(quote.marketSession);
  const quoteAge = formatHeatMapQuoteAge(quote.priceTimestamp);
  return (
    <View style={[styles.tile, { width, height }]}>
      <Svg width={width} height={height} viewBox="0 0 100 88" style={StyleSheet.absoluteFill}>
        <Polygon points="25,2 75,2 98,44 75,86 25,86 2,44" fill={bg} stroke={tone} strokeWidth="1.4" />
      </Svg>
      <Text numberOfLines={1} style={[styles.tileSymbol, { color: colors.foreground }]}>{quote.symbol}</Text>
      <Text numberOfLines={1} style={[styles.tileChange, { color: tone }]}>
        {change > 0 ? '+' : ''}{change.toFixed(2)}%
      </Text>
      <Text numberOfLines={1} style={[styles.tilePrice, { color: colors.mutedForeground }]}>{formatPrice(quote.price)}</Text>
      <Text testID={`heat-map-session-${quote.symbol}`} numberOfLines={1} style={[styles.tileSession, { color: colors.foreground }]}>{sessionLabel}</Text>
      <Text testID={`heat-map-quote-age-${quote.symbol}`} numberOfLines={1} style={[styles.tileAge, { color: colors.mutedForeground }]}>{quoteAge}</Text>
    </View>
  );
}

export default function HeatMapScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width: viewportWidth } = useWindowDimensions();
  const [category, setCategory] = useState<GetMarketHeatMapCategory>('stocks');
  const [customSymbols, setCustomSymbols] = useState<string[]>([]);
  const [storageReady, setStorageReady] = useState(false);
  const [symbolInput, setSymbolInput] = useState('');
  const [formError, setFormError] = useState('');
  const [nowSeconds, setNowSeconds] = useState(() => Date.now() / 1000);
  const validateSymbol = useValidateHeatMapSymbol();

  useEffect(() => {
    const interval = setInterval(() => setNowSeconds(Date.now() / 1000), 60_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((value) => {
        if (mounted && value) {
          try {
            const parsed: unknown = JSON.parse(value);
            if (Array.isArray(parsed)) setCustomSymbols(normalizeCustomHeatMapSymbols(parsed));
          } catch { /* Ignore corrupt local preferences and let the user start fresh. */ }
        }
      })
      .catch(() => { if (mounted) setFormError("Couldn't load saved tickers from this device."); })
      .finally(() => { if (mounted) setStorageReady(true); });
    return () => { mounted = false; };
  }, []);

  const params = useMemo(() => ({
    category,
    ...(category === 'custom' ? { symbols: customSymbols } : {}),
  }), [category, customSymbols]);
  const mapQuery = useGetMarketHeatMap(params, {
    query: {
      enabled: category !== 'custom' || (storageReady && customSymbols.length > 0),
      queryKey: getGetMarketHeatMapQueryKey(params),
    },
  });
  const sourceQuotes = mapQuery.data?.quotes ?? [];
  const quotes = sourceQuotes.filter((quote) => isDisplayableHeatMapQuote(quote, nowSeconds));
  const unavailableSymbols = [...new Set([
    ...(mapQuery.data?.unavailableSymbols ?? []),
    ...sourceQuotes.filter((quote) => !isDisplayableHeatMapQuote(quote, nowSeconds)).map((quote) => quote.symbol),
  ])];
  const summary = summarizeHeatMap(quotes);
  const hotCold = summary.tone === 'HOT'
    ? { label: summary.tone, icon: 'fire' as const, color: colors.buyColor }
    : summary.tone === 'COLD'
      ? { label: summary.tone, icon: 'snowflake' as const, color: colors.sellColor }
      : { label: summary.tone, icon: 'minus' as const, color: colors.holdColor };

  const sectors = useMemo(() => {
    if (category !== 'stocks') return [{ name: '', quotes }];
    const grouped = new Map<string, HeatMapQuote[]>();
    quotes.forEach((quote) => {
      const sector = quote.sector?.trim() || 'Other';
      grouped.set(sector, [...(grouped.get(sector) ?? []), quote]);
    });
    return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, items]) => ({ name, quotes: items }));
  }, [category, quotes]);
  const contentWidth = Math.max(280, viewportWidth - 36);
  const tileWidth = Math.min(114, Math.max(82, (contentWidth - 16) / 3));

  async function persistSymbols(next: string[]) {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setCustomSymbols(next);
    setFormError('');
  }

  async function addSymbol() {
    const symbol = symbolInput.trim().toUpperCase();
    if (!symbol) return;
    if (customSymbols.includes(symbol)) {
      setFormError(`${symbol} is already in your map.`);
      return;
    }
    if (customSymbols.length >= MAX_CUSTOM_HEAT_MAP_SYMBOLS) {
      setFormError(`A custom map can contain at most ${MAX_CUSTOM_HEAT_MAP_SYMBOLS} tickers.`);
      return;
    }
    setFormError('');
    Keyboard.dismiss();
    try {
      const quote = await validateSymbol.mutateAsync({ data: { symbol } });
      if (!customSymbols.some((existing) => existing === quote.symbol)) {
        try {
          await persistSymbols([...customSymbols, quote.symbol]);
        } catch {
          setFormError(`Couldn't save ${quote.symbol} on this device. Try again.`);
          return;
        }
      }
      setSymbolInput('');
    } catch {
      setFormError(`We couldn't validate ${symbol}. Check the ticker and try again.`);
    }
  }

  async function removeSymbol(symbol: string) {
    try {
      await persistSymbols(customSymbols.filter((item) => item !== symbol));
    } catch {
      setFormError(`Couldn't remove ${symbol} from this device. Try again.`);
    }
  }

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPad = Platform.OS === 'web' ? 34 : 24;
  return (
    <AmericanSteelBackground>
      <View style={styles.screen}>
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingTop: topPad + 12, paddingBottom: bottomPad }]}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={mapQuery.isRefetching} onRefresh={() => mapQuery.refetch()} tintColor={colors.primary} />}
        >
          <View style={styles.header}>
            <TouchableOpacity
              testID="heat-map-back"
              accessibilityRole="button"
              accessibilityLabel="Back to Analyze"
              onPress={() => router.canGoBack() ? router.back() : router.replace('/')}
              style={[styles.backButton, { borderColor: colors.border }]}
            >
              <MaterialCommunityIcons name="arrow-left" size={20} color={colors.foreground} />
            </TouchableOpacity>
            <View style={styles.headingCopy}>
              <Text style={[styles.eyebrow, { color: colors.gold }]}>MARKET PULSE</Text>
              <Text style={[styles.title, { color: colors.heading }]}>Heat map</Text>
              <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Each tile shows its session and quote age.</Text>
            </View>
            <TouchableOpacity
              testID="heat-map-refresh"
              accessibilityRole="button"
              accessibilityLabel="Refresh heat map"
              onPress={() => mapQuery.refetch()}
              style={[styles.refreshButton, { borderColor: colors.border }]}
            >
              <MaterialCommunityIcons name="refresh" size={20} color={colors.foreground} />
            </TouchableOpacity>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRail}>
            {CATEGORIES.map((item) => {
              const active = category === item.id;
              return (
                <TouchableOpacity
                  key={item.id}
                  testID={`heat-map-category-${item.id}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => { setCategory(item.id); setFormError(''); }}
                  style={[styles.categoryButton, { backgroundColor: active ? colors.accent : colors.card, borderColor: active ? colors.primary : colors.border }]}
                >
                  <MaterialCommunityIcons name={item.icon} size={15} color={active ? colors.primary : colors.mutedForeground} />
                  <Text style={[styles.categoryLabel, { color: active ? colors.foreground : colors.mutedForeground }]}>{item.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View style={[styles.summaryPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.summaryMain}>
              <View style={[styles.marketIcon, { backgroundColor: `${hotCold.color}18` }]}>
                <MaterialCommunityIcons name={hotCold.icon} size={19} color={hotCold.color} />
              </View>
              <View>
                <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>MARKET TONE</Text>
                <Text testID="heat-map-market-tone" style={[styles.summaryValue, { color: hotCold.color }]}>{hotCold.label}</Text>
              </View>
            </View>
            <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
            <View style={styles.countBlock}>
              <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>QUOTED</Text>
              <Text style={[styles.countValue, { color: colors.foreground }]}>{summary.quoted}</Text>
            </View>
            <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
            <View style={styles.countBlock}>
              <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>UP / DOWN</Text>
              <Text style={[styles.countValue, { color: colors.foreground }]}>{summary.positive}<Text style={{ color: colors.mutedForeground }}> / </Text>{summary.negative}</Text>
            </View>
          </View>
          <Text style={[styles.timestamp, { color: colors.mutedForeground }]}>{formatUpdated(mapQuery.data?.updatedAt)}</Text>

          {category === 'custom' && (
            <View style={[styles.customPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Your watch map</Text>
              <Text style={[styles.customHint, { color: colors.mutedForeground }]}>
                Add tickers to compare recent moves. {customSymbols.length}/{MAX_CUSTOM_HEAT_MAP_SYMBOLS}; saved only on this device.
              </Text>
              <View style={styles.addRow}>
                <TextInput
                  testID="heat-map-custom-input"
                  value={symbolInput}
                  onChangeText={(value) => { setSymbolInput(value.toUpperCase()); setFormError(''); }}
                  placeholder="Ticker symbol"
                  placeholderTextColor={colors.mutedForeground}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={15}
                  returnKeyType="done"
                  onSubmitEditing={addSymbol}
                  style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.input }]}
                />
                <TouchableOpacity
                  testID="heat-map-custom-add"
                  accessibilityRole="button"
                  accessibilityLabel="Validate and add ticker"
                  disabled={!symbolInput.trim() || validateSymbol.isPending || customSymbols.length >= MAX_CUSTOM_HEAT_MAP_SYMBOLS}
                  onPress={addSymbol}
                  style={[styles.addButton, { backgroundColor: colors.primary, opacity: !symbolInput.trim() || validateSymbol.isPending || customSymbols.length >= MAX_CUSTOM_HEAT_MAP_SYMBOLS ? 0.55 : 1 }]}
                >
                  {validateSymbol.isPending ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : <MaterialCommunityIcons name="plus" size={20} color={colors.primaryForeground} />}
                </TouchableOpacity>
              </View>
              {!!formError && <Text testID="heat-map-custom-error" style={[styles.formError, { color: colors.sellColor }]}>{formError}</Text>}
              {customSymbols.length > 0 && (
                <View style={styles.chipList}>
                  {customSymbols.map((symbol) => (
                    <View key={symbol} style={[styles.symbolChip, { borderColor: colors.border, backgroundColor: colors.secondary }]}>
                      <Text style={[styles.chipText, { color: colors.foreground }]}>{symbol}</Text>
                      <TouchableOpacity
                        testID={`heat-map-custom-remove-${symbol}`}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${symbol}`}
                        onPress={() => removeSymbol(symbol)}
                        hitSlop={8}
                      >
                        <MaterialCommunityIcons name="close" size={15} color={colors.mutedForeground} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}

          {category === 'custom' && storageReady && customSymbols.length === 0 ? (
            <View style={[styles.statePanel, { borderColor: colors.border }]}>
              <MaterialCommunityIcons name="hexagon-multiple-outline" size={29} color={colors.primary} />
              <Text style={[styles.stateTitle, { color: colors.foreground }]}>Start your own map</Text>
              <Text style={[styles.stateCopy, { color: colors.mutedForeground }]}>Validated tickers are saved on this device and kept after app restarts.</Text>
            </View>
          ) : mapQuery.isLoading || (category === 'custom' && !storageReady) ? (
            <View style={[styles.statePanel, { borderColor: colors.border }]}>
              <ActivityIndicator color={colors.primary} />
              <Text style={[styles.stateTitle, { color: colors.foreground }]}>Gathering the latest quotes</Text>
              <Text style={[styles.stateCopy, { color: colors.mutedForeground }]}>One batched read for this market.</Text>
            </View>
          ) : mapQuery.isError ? (
            <View style={[styles.statePanel, { borderColor: colors.border }]}>
              <MaterialCommunityIcons name="alert-circle-outline" size={28} color={colors.sellColor} />
              <Text style={[styles.stateTitle, { color: colors.foreground }]}>Market data is unavailable</Text>
              <Text style={[styles.stateCopy, { color: colors.mutedForeground }]}>Your map couldn't be refreshed just now.</Text>
              <TouchableOpacity testID="heat-map-retry" onPress={() => mapQuery.refetch()} style={[styles.retryButton, { borderColor: colors.border }]}>
                <Text style={[styles.retryText, { color: colors.primary }]}>Try again</Text>
              </TouchableOpacity>
            </View>
          ) : quotes.length === 0 ? (
            <View style={[styles.statePanel, { borderColor: colors.border }]}>
              <MaterialCommunityIcons name="chart-box-outline" size={29} color={colors.mutedForeground} />
              <Text style={[styles.stateTitle, { color: colors.foreground }]}>No quotes available</Text>
              <Text style={[styles.stateCopy, { color: colors.mutedForeground }]}>
                {unavailableSymbols.length ? `No valid current or recent quotes for ${unavailableSymbols.join(', ')}.` : 'There are no valid quotes in this map right now.'}
              </Text>
            </View>
          ) : (
            <View style={styles.mapWrap}>
              {sectors.map((group) => (
                <View key={group.name || 'all'} style={styles.sectorGroup}>
                  {category === 'stocks' && (
                    <View style={styles.sectorHeading}>
                      <Text style={[styles.sectorName, { color: colors.foreground }]}>{group.name}</Text>
                      <Text style={[styles.sectorCount, { color: colors.mutedForeground }]}>{group.quotes.length} {group.quotes.length === 1 ? 'asset' : 'assets'}</Text>
                    </View>
                  )}
                  <View style={styles.honeycomb}>
                    {group.quotes.map((quote, index) => (
                      <View key={quote.symbol} style={index % 3 === 1 ? styles.offsetTile : undefined}>
                        <HexTile quote={quote} width={tileWidth} colors={colors} />
                      </View>
                    ))}
                  </View>
                </View>
              ))}
              {!!unavailableSymbols.length && (
                <Text style={[styles.unavailable, { color: colors.mutedForeground }]}>
                  No recent quote: {unavailableSymbols.join(' · ')}
                </Text>
              )}
            </View>
          )}
          <View style={styles.footerNote}>
            <View style={[styles.legendDot, { backgroundColor: colors.buyColor }]} />
            <Text style={[styles.legendText, { color: colors.mutedForeground }]}>Up</Text>
            <View style={[styles.legendDot, { backgroundColor: colors.holdColor }]} />
            <Text style={[styles.legendText, { color: colors.mutedForeground }]}>Within ±0.25%</Text>
            <View style={[styles.legendDot, { backgroundColor: colors.sellColor }]} />
            <Text style={[styles.legendText, { color: colors.mutedForeground }]}>Down</Text>
          </View>
        </ScrollView>
        <BottomTabBar />
      </View>
    </AmericanSteelBackground>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scrollContent: { paddingHorizontal: 18, paddingBottom: 24 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  backButton: { width: 40, height: 40, borderWidth: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 11 },
  headingCopy: { flex: 1 },
  eyebrow: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.8, marginBottom: 6 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 29, letterSpacing: -0.7 },
  subtitle: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 5 },
  refreshButton: { width: 42, height: 42, borderWidth: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginLeft: 12 },
  categoryRail: { gap: 8, paddingBottom: 17 },
  categoryButton: { height: 36, paddingHorizontal: 11, borderWidth: 1, borderRadius: 18, flexDirection: 'row', alignItems: 'center', gap: 6 },
  categoryLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  summaryPanel: { minHeight: 76, borderWidth: 1, borderRadius: 17, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13 },
  summaryMain: { flex: 1.15, flexDirection: 'row', alignItems: 'center', gap: 9 },
  marketIcon: { height: 35, width: 35, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  summaryLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 8, letterSpacing: 0.8 },
  summaryValue: { fontFamily: 'Inter_700Bold', fontSize: 14, marginTop: 3, letterSpacing: 0.6 },
  summaryDivider: { width: 1, height: 34, marginHorizontal: 10 },
  countBlock: { alignItems: 'center', minWidth: 48 },
  countValue: { fontFamily: 'Inter_700Bold', fontSize: 14, marginTop: 5 },
  timestamp: { fontFamily: 'Inter_400Regular', fontSize: 10, textAlign: 'right', marginTop: 8, marginBottom: 20 },
  customPanel: { borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 18 },
  sectionTitle: { fontFamily: 'Inter_700Bold', fontSize: 15 },
  customHint: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 4 },
  addRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  input: { flex: 1, height: 42, borderRadius: 11, borderWidth: 1, paddingHorizontal: 12, fontFamily: 'Inter_500Medium', fontSize: 13 },
  addButton: { width: 43, height: 42, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  formError: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 8 },
  chipList: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 12 },
  symbolChip: { flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderRadius: 15, paddingLeft: 10, paddingRight: 7, paddingVertical: 5 },
  chipText: { fontFamily: 'Inter_600SemiBold', fontSize: 10 },
  statePanel: { minHeight: 190, borderWidth: 1, borderStyle: 'dashed', borderRadius: 18, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8, marginTop: 2 },
  stateTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 14, textAlign: 'center', marginTop: 4 },
  stateCopy: { fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 17, textAlign: 'center', maxWidth: 280 },
  retryButton: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 15, paddingVertical: 8, marginTop: 6 },
  retryText: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  mapWrap: { gap: 20 },
  sectorGroup: { gap: 7 },
  sectorHeading: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 3 },
  sectorName: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  sectorCount: { fontFamily: 'Inter_400Regular', fontSize: 9 },
  honeycomb: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center' },
  offsetTile: { marginTop: 31 },
  tile: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, gap: 2 },
  tileSymbol: { maxWidth: 70, fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 0.2 },
  tileChange: { fontFamily: 'Inter_700Bold', fontSize: 11 },
  tilePrice: { fontFamily: 'Inter_500Medium', fontSize: 8 },
  tileSession: { fontFamily: 'Inter_600SemiBold', fontSize: 7.5, letterSpacing: 0.15 },
  tileAge: { fontFamily: 'Inter_400Regular', fontSize: 7.5 },
  unavailable: { fontFamily: 'Inter_400Regular', fontSize: 10, textAlign: 'center', marginTop: 2 },
  footerNote: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 23, paddingBottom: 8 },
  legendDot: { width: 6, height: 6, borderRadius: 3, marginLeft: 6 },
  legendText: { fontFamily: 'Inter_400Regular', fontSize: 9 },
});