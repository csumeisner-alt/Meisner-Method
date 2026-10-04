import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, Keyboard, Modal, Platform, Pressable, RefreshControl,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Polygon } from 'react-native-svg';
import { useReducedMotion } from 'react-native-reanimated';
import {
  getGetMarketHeatMapQueryKey, getSearchStockSymbolsQueryKey,
  useGetMarketHeatMap, useSearchStockSymbols, useValidateHeatMapSymbol,
} from '@workspace/api-client-react';
import type {
  GetMarketHeatMapCategory, GetMarketHeatMapPeriod, GetMarketHeatMapSector,
  HeatMapQuote, StockSymbolSuggestion,
} from '@workspace/api-client-react';
import { AmericanSteelBackground } from '@/components/AmericanSteelBackground';
import { BottomTabBar } from '@/components/BottomTabBar';
import { useColors } from '@/hooks/useColors';
import {
  countActiveHeatMapFilters, filterHeatMapQuotes,
  heatMapResponseMatchesSelection, layoutHoneycomb, summarizeHeatMap,
  type HeatMapFilters, type HeatMapCapBucket, type HeatMapRiskBand, type HeatMapRiskFilter,
} from '@/lib/heatMapMetrics';
import {
  formatHeatMapQuoteAge, getHeatMapSessionLabel, isDisplayableHeatMapQuote,
} from '@/lib/heatMapQuoteDisplay';
import { MAX_CUSTOM_HEAT_MAP_SYMBOLS, normalizeCustomHeatMapSymbols } from '@/lib/heatMapSymbols';
import {
  getStockSearchFeedback, getStockSearchQueryFromKey, isStockSearchCurrent,
} from '@/lib/stockSearch';

const STORAGE_KEY = 'meisner.heat-map.custom-symbols.v1';
const CATEGORIES: { id: GetMarketHeatMapCategory; label: string }[] = [
  { id: 'stocks', label: 'Stocks' }, { id: 'etfs', label: 'ETFs' },
  { id: 'commodities', label: 'Commodities' }, { id: 'futures', label: 'Futures' },
  { id: 'cryptocurrency', label: 'Cryptocurrency' }, { id: 'custom', label: 'Custom' },
];
const STOCK_SECTORS: GetMarketHeatMapSector[] = [
  'Technology', 'Communication Services', 'Consumer Cyclical', 'Consumer Defensive',
  'Financials', 'Healthcare', 'Industrials', 'Real Estate', 'Energy', 'Utilities', 'Basic Materials',
];
const PERIODS: { id: GetMarketHeatMapPeriod; label: string }[] = [
  { id: '1d', label: '1D' }, { id: '1w', label: '1W' }, { id: '1m', label: '1M' },
  { id: '3m', label: '3M' }, { id: '6m', label: '6M' }, { id: '1y', label: '1Y' },
  { id: '3y', label: '3Y' }, { id: '5y', label: '5Y' }, { id: 'max', label: 'Max' },
];
const CAP_BUCKETS: HeatMapCapBucket[] = ['Micro', 'Small', 'Mid', 'Large', 'Mega'];
const CAP_BUCKET_LABELS: Record<HeatMapCapBucket, string> = {
  Micro: 'Micro · under $300M',
  Small: 'Small · $300M–under $2B',
  Mid: 'Mid · $2B–under $10B',
  Large: 'Large · $10B–under $200B',
  Mega: 'Mega · $200B or more',
};
const RISK_BANDS: HeatMapRiskBand[] = [
  'Conservative', 'Moderate Conservative', 'Moderate', 'Moderate Aggressive', 'Aggressive',
];
const RISK_BAND_LABELS: Record<HeatMapRiskBand, string> = {
  Conservative: 'Conservative · <15%',
  'Moderate Conservative': 'Moderate Conservative · 15–<25%',
  Moderate: 'Moderate · 25–<40%',
  'Moderate Aggressive': 'Moderate Aggressive · 40–<60%',
  Aggressive: 'Aggressive · 60%+',
};
const EMPTY_FILTERS: HeatMapFilters = { sector: null, marketCap: null, exchange: null, risk: null };

function formatPrice(price: number) {
  return `$${price.toLocaleString('en-US', { minimumFractionDigits: price >= 1 ? 2 : 4, maximumFractionDigits: price >= 1 ? 2 : 4 })}`;
}
function formatUpdated(timestamp?: number) {
  if (!timestamp) return 'Waiting for quote batch';
  return `Updated ${new Date(timestamp * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

function HexTile({ quote, width, height, colors, period }: {
  quote: HeatMapQuote; width: number; height: number; colors: ReturnType<typeof useColors>; period: GetMarketHeatMapPeriod;
}) {
  const value = quote.returnPercent;
  const available = typeof value === 'number' && Number.isFinite(value);
  const positive = available && value! > 0.25;
  const negative = available && value! < -0.25;
  const tone = !available ? colors.mutedForeground : positive ? colors.buyColor : negative ? colors.sellColor : colors.holdColor;
  const bg = !available ? colors.secondary : positive ? colors.buyBg : negative ? colors.sellBg : colors.holdBg;
  const label = available ? `${value! > 0 ? '+' : ''}${value!.toFixed(2)}%` : 'Unavailable';
  const session = getHeatMapSessionLabel(quote.marketSession);
  const age = formatHeatMapQuoteAge(quote.priceTimestamp);
  return (
    <View style={[styles.tile, { width, height }]} accessibilityLabel={`${quote.symbol}, ${label}, ${session}, ${age}`}>
      <Svg width={width} height={height} viewBox="0 0 100 86.6" style={StyleSheet.absoluteFill}>
        <Polygon points="1,43.3 25,1 75,1 99,43.3 75,85.6 25,85.6" fill={bg} stroke={tone} strokeWidth="1.5" />
      </Svg>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72} style={[styles.tileSymbol, { color: colors.foreground }]}>{quote.symbol}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={[styles.tileChange, { color: tone }]}>{label}</Text>
      <Text numberOfLines={1} style={[styles.tilePrice, { color: colors.mutedForeground }]}>{formatPrice(quote.price)}</Text>
      <Text testID={`heat-map-session-${quote.symbol}`} numberOfLines={1} style={[styles.tileSession, { color: colors.foreground }]}>{session}</Text>
      <Text testID={`heat-map-quote-age-${quote.symbol}`} numberOfLines={1} style={[styles.tileAge, { color: colors.mutedForeground }]}>{age}</Text>
      {quote.returnBasis === 'price_return_proxy' && <Text numberOfLines={1} style={[styles.tileBasis, { color: colors.mutedForeground }]}>Price-return proxy</Text>}
      {period === 'max' && <Text numberOfLines={1} style={[styles.tileBasis, { color: colors.mutedForeground }]}>Since {quote.historyStartDate ?? 'unknown'}</Text>}
    </View>
  );
}

export default function HeatMapScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width: viewportWidth } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const [category, setCategory] = useState<GetMarketHeatMapCategory>('stocks');
  const [period, setPeriod] = useState<GetMarketHeatMapPeriod>('1d');
  const [customSymbols, setCustomSymbols] = useState<string[]>([]);
  const [storageReady, setStorageReady] = useState(false);
  const [symbolInput, setSymbolInput] = useState('');
  const [debouncedSymbolSearch, setDebouncedSymbolSearch] = useState('');
  const [formError, setFormError] = useState('');
  const [nowSeconds, setNowSeconds] = useState(() => Date.now() / 1000);
  const [filters, setFilters] = useState<HeatMapFilters>(EMPTY_FILTERS);
  const [draftFilters, setDraftFilters] = useState<HeatMapFilters>(EMPTY_FILTERS);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const directionPulse = useRef(new Animated.Value(0)).current;
  const validateSymbol = useValidateHeatMapSymbol();
  const symbolSearchQueryKey = getSearchStockSymbolsQueryKey({ q: debouncedSymbolSearch });
  const stockSearch = useSearchStockSymbols(
    { q: debouncedSymbolSearch },
    {
      query: {
        queryKey: symbolSearchQueryKey,
        enabled: category === 'custom' && debouncedSymbolSearch.length >= 2,
        staleTime: 45_000,
      },
    },
  );

  useEffect(() => {
    const interval = setInterval(() => setNowSeconds(Date.now() / 1000), 60_000);
    return () => clearInterval(interval);
  }, []);
  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSymbolSearch(symbolInput.trim()), 300);
    return () => clearTimeout(timeout);
  }, [symbolInput]);
  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(STORAGE_KEY).then((value) => {
      if (mounted && value) {
        try {
          const parsed: unknown = JSON.parse(value);
          if (Array.isArray(parsed)) setCustomSymbols(normalizeCustomHeatMapSymbols(parsed));
        } catch { /* Discard corrupt local preferences. */ }
      }
    }).catch(() => { if (mounted) setFormError("Couldn't load saved tickers from this device."); })
      .finally(() => { if (mounted) setStorageReady(true); });
    return () => { mounted = false; };
  }, []);

  const requestedSector: GetMarketHeatMapSector | null = category === 'stocks'
    && filters.sector !== 'Unknown'
    && STOCK_SECTORS.includes(filters.sector as GetMarketHeatMapSector)
    ? filters.sector as GetMarketHeatMapSector
    : null;
  const searchText = symbolInput.trim();
  const isCustomSearchInput = category === 'custom'
    && searchText.length >= 2
    && !validateSymbol.isPending;
  const searchResultQuery = getStockSearchQueryFromKey(stockSearch.queryKey);
  const isCurrentCustomSearch = isCustomSearchInput && isStockSearchCurrent({
    input: searchText,
    settledQuery: debouncedSymbolSearch,
    resultQuery: searchResultQuery,
    isPlaceholderData: stockSearch.isPlaceholderData,
  });
  const customSuggestions: StockSymbolSuggestion[] = isCurrentCustomSearch
    ? stockSearch.data ?? []
    : [];
  const customSearchFeedback = isCustomSearchInput
    ? getStockSearchFeedback({
        isFetching: !isCurrentCustomSearch || stockSearch.isFetching,
        isError: isCurrentCustomSearch && stockSearch.isError,
        isSuccess: isCurrentCustomSearch && stockSearch.isSuccess,
        suggestionCount: customSuggestions.length,
      })
    : null;
  const params = useMemo(() => ({
    category,
    period,
    ...(category === 'custom' ? { symbols: customSymbols } : {}),
    ...(requestedSector ? { sector: requestedSector } : {}),
  }), [category, period, customSymbols, requestedSector]);
  const mapQuery = useGetMarketHeatMap(params, {
    query: {
      enabled: category !== 'custom' || (storageReady && customSymbols.length > 0),
      queryKey: getGetMarketHeatMapQueryKey(params),
    },
  });

  const response = mapQuery.data;
  const responseMatches = heatMapResponseMatchesSelection(
    response,
    category,
    period,
    category === 'custom' ? customSymbols : undefined,
    requestedSector,
  );
  const sourceQuotes = responseMatches ? response!.quotes : [];
  const staleQuotes = sourceQuotes.filter((quote) => !isDisplayableHeatMapQuote(quote, nowSeconds));
  const validAgeQuotes = sourceQuotes.filter((quote) => isDisplayableHeatMapQuote(quote, nowSeconds));
  const unavailableSymbols = [...new Set([
    ...(responseMatches ? response!.unavailableSymbols : []),
    ...staleQuotes.map((quote) => quote.symbol),
  ])];

  const choices = useMemo(() => {
    const unique = <T,>(items: T[]) => [...new Set(items)].filter(Boolean);
    return {
      sectors: category === 'stocks'
        ? [...new Set([...STOCK_SECTORS, ...validAgeQuotes.map((q) => q.sector?.trim() || 'Unknown')])].sort()
        : unique(validAgeQuotes.map((q) => q.sector?.trim() || 'Unknown')).sort(),
      exchanges: unique(validAgeQuotes.map((q) => q.exchange ?? '')).sort(),
      hasUnknownRisk: validAgeQuotes.some((q) => !q.riskBand),
    };
  }, [category, validAgeQuotes]);
  const supportsSectorFilter = category === 'stocks'
    || (category === 'custom' && validAgeQuotes.some((quote) => quote.sector !== null));
  const supportsMarketCapFilter = category === 'stocks'
    || (category === 'custom' && validAgeQuotes.some((quote) => quote.assetType === 'stock' && quote.marketCapUsd !== null));
  const filterableQuotes = useMemo(() => filterHeatMapQuotes(validAgeQuotes, filters), [validAgeQuotes, filters]);
  const summary = summarizeHeatMap(filterableQuotes);
  const toneColor = summary.tone === 'HOT' ? colors.buyColor : summary.tone === 'COLD' ? colors.sellColor : colors.holdColor;
  const directionalLabel = summary.tone === 'HOT' ? 'Market direction rising' : summary.tone === 'COLD' ? 'Market direction falling' : 'Market direction sideways';
  const directionalWord = summary.tone === 'HOT' ? 'Rising' : summary.tone === 'COLD' ? 'Falling' : 'Sideways';
  const directionScale = directionPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
  const activeFilterCount = countActiveHeatMapFilters(filters);

  useEffect(() => {
    if (reduceMotion) {
      directionPulse.setValue(0);
      return;
    }
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(directionPulse, { toValue: 1, duration: 900, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(directionPulse, { toValue: 0, duration: 900, useNativeDriver: Platform.OS !== 'web' }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [directionPulse, reduceMotion, summary.tone]);

  const sectors = useMemo(() => {
    if (category !== 'stocks' && category !== 'custom') return [{ name: '', quotes: filterableQuotes }];
    const grouped = new Map<string, HeatMapQuote[]>();
    filterableQuotes.forEach((quote) => {
      const sector = quote.sector?.trim() || 'Unknown';
      grouped.set(sector, [...(grouped.get(sector) ?? []), quote]);
    });
    return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, items]) => ({ name, quotes: items }));
  }, [category, filterableQuotes]);

  const contentWidth = Math.max(0, viewportWidth - 36);
  const tileWidth = Math.min(116, Math.max(84, contentWidth / 2.9));
  const tileHeight = tileWidth * Math.sqrt(3) / 2;

  async function persistSymbols(next: string[]) {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setCustomSymbols(next);
    setFormError('');
  }
  async function addSymbol(rawSymbol = symbolInput) {
    const symbol = rawSymbol.trim().toUpperCase();
    if (!symbol) return;
    if (validateSymbol.isPending) return;
    if (customSymbols.includes(symbol)) { setFormError(`${symbol} is already in your map.`); return; }
    if (customSymbols.length >= MAX_CUSTOM_HEAT_MAP_SYMBOLS) {
      setFormError(`A custom map can contain at most ${MAX_CUSTOM_HEAT_MAP_SYMBOLS} tickers.`); return;
    }
    setFormError('');
    setSymbolInput(symbol);
    Keyboard.dismiss();
    try {
      const quote = await validateSymbol.mutateAsync({ data: { symbol } });
      if (!customSymbols.includes(quote.symbol)) {
        try { await persistSymbols([...customSymbols, quote.symbol]); }
        catch { setFormError(`Couldn't save ${quote.symbol} on this device. Try again.`); return; }
      }
      setSymbolInput('');
    } catch { setFormError(`We couldn't validate ${symbol}. Check the ticker and try again.`); }
  }
  async function removeSymbol(symbol: string) {
    try { await persistSymbols(customSymbols.filter((item) => item !== symbol)); }
    catch { setFormError(`Couldn't remove ${symbol} from this device. Try again.`); }
  }
  function selectCategory(nextCategory: GetMarketHeatMapCategory) {
    setCategory(nextCategory);
    setFilters(EMPTY_FILTERS);
    setDraftFilters(EMPTY_FILTERS);
    setFormError('');
  }
  function toggleFilter<K extends keyof HeatMapFilters>(key: K, value: HeatMapFilters[K]) {
    setDraftFilters((current) => ({ ...current, [key]: current[key] === value ? null : value }));
  }
  function FilterChoice({ label, selected, onPress, testID }: {
    label: string; selected: boolean; onPress: () => void; testID: string;
  }) {
    return (
      <TouchableOpacity testID={testID} accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress}
        style={[styles.filterChoice, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.accent : colors.card }]}>
        <Text style={[styles.filterChoiceText, { color: selected ? colors.foreground : colors.mutedForeground }]}>{label}</Text>
        {selected && <MaterialCommunityIcons name="check" size={15} color={colors.primary} />}
      </TouchableOpacity>
    );
  }
  function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
    return <View style={styles.filterSection}><Text style={[styles.filterSectionTitle, { color: colors.foreground }]}>{title}</Text><View style={styles.filterChoices}>{children}</View></View>;
  }
  function stateCard(icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'], title: string, copy: string, action?: React.ReactNode) {
    return <View style={[styles.statePanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <MaterialCommunityIcons name={icon} size={27} color={colors.primary} />
      <Text style={[styles.stateTitle, { color: colors.foreground }]}>{title}</Text>
      <Text style={[styles.stateCopy, { color: colors.mutedForeground }]}>{copy}</Text>{action}
    </View>;
  }
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPad = Platform.OS === 'web' ? 34 : Math.max(insets.bottom, 16);
  const busy = mapQuery.isLoading || !responseMatches || (category === 'custom' && !storageReady);

  return (
    <AmericanSteelBackground>
      <View style={styles.screen}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.scrollContent, { paddingTop: topPad + 12, paddingBottom: bottomPad + 18 }]}
          refreshControl={<RefreshControl refreshing={mapQuery.isRefetching} onRefresh={() => mapQuery.refetch()} tintColor={colors.primary} />}>
          <View style={styles.header}>
            <TouchableOpacity testID="heat-map-back" accessibilityRole="button" accessibilityLabel="Back to Analyze"
              onPress={() => router.canGoBack() ? router.back() : router.replace('/')} style={[styles.iconButton, { borderColor: colors.border }]}>
              <MaterialCommunityIcons name="arrow-left" size={20} color={colors.foreground} />
            </TouchableOpacity>
            <View style={styles.headingCopy}>
              <Text style={[styles.eyebrow, { color: colors.gold }]}>MEISNER METHOD  /  EXPLORE</Text>
              <Text style={[styles.title, { color: colors.heading }]}>Market heat map</Text>
            </View>
            <TouchableOpacity testID="heat-map-refresh" accessibilityRole="button" accessibilityLabel="Refresh heat map"
              onPress={() => mapQuery.refetch()} style={[styles.iconButton, { borderColor: colors.border }]}>
              <MaterialCommunityIcons name="refresh" size={19} color={colors.foreground} />
            </TouchableOpacity>
          </View>

          <View style={styles.controlRow}>
            <TouchableOpacity testID="heat-map-category-picker" accessibilityRole="button" accessibilityLabel={`Market category: ${CATEGORIES.find((item) => item.id === category)?.label}`}
              accessibilityState={{ expanded: categoryMenuOpen }} onPress={() => setCategoryMenuOpen(true)}
              style={[styles.categoryPicker, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.categoryPickerLabel, { color: colors.foreground }]}>{CATEGORIES.find((item) => item.id === category)?.label}</Text>
              <MaterialCommunityIcons name="chevron-down" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
            <TouchableOpacity testID="heat-map-filter-open" accessibilityRole="button" accessibilityLabel={`Filters${activeFilterCount ? `, ${activeFilterCount} active` : ''}`}
              onPress={() => { setDraftFilters(filters); setDrawerOpen(true); }}
              style={[styles.filterButton, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <MaterialCommunityIcons name="tune-variant" size={17} color={colors.foreground} />
              <Text style={[styles.filterButtonText, { color: colors.foreground }]}>Filter</Text>
              {activeFilterCount > 0 && <Text style={[styles.filterCount, { color: colors.primaryForeground, backgroundColor: colors.primary }]}>{activeFilterCount}</Text>}
            </TouchableOpacity>
          </View>

          <View style={styles.periodHeader}>
            <View><Text style={[styles.periodKicker, { color: colors.mutedForeground }]}>SELECTED RETURN WINDOW</Text>
              <Text testID="heat-map-selected-period" style={[styles.periodTitle, { color: colors.heading }]}>{PERIODS.find((item) => item.id === period)?.label} <Text style={{ color: colors.mutedForeground }}>performance</Text></Text></View>
            <Text style={[styles.timestamp, { color: colors.mutedForeground }]}>{formatUpdated(responseMatches ? response!.updatedAt : undefined)}</Text>
          </View>
          <View style={styles.periodRail}>
            {PERIODS.map((item) => {
              const selected = period === item.id;
              return <TouchableOpacity key={item.id} testID={`heat-map-period-${item.id}`} accessibilityRole="button" accessibilityState={{ selected }}
                onPress={() => setPeriod(item.id)} style={[styles.periodOption, { backgroundColor: selected ? colors.primary : colors.card, borderColor: selected ? colors.primary : colors.border }]}>
                <Text style={[styles.periodOptionText, { color: selected ? colors.primaryForeground : colors.mutedForeground }]}>{item.label}</Text>
              </TouchableOpacity>;
            })}
          </View>

          <View style={[styles.summaryPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.summaryTone}>
              <Animated.View accessibilityRole="image" accessibilityLabel={directionalLabel}
                style={{ transform: [{ scale: directionScale }] }}>
                <MaterialCommunityIcons name={summary.tone === 'HOT' ? 'trending-up' : summary.tone === 'COLD' ? 'trending-down' : 'arrow-left-right'}
                  size={20} color={toneColor} />
              </Animated.View>
              <View><Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>MARKET TONE</Text>
                <Text testID="heat-map-market-tone" style={[styles.summaryValue, { color: toneColor }]}>{summary.tone}</Text>
                <Text style={[styles.directionWord, { color: toneColor }]}>{directionalWord}</Text></View>
            </View>
            <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
            <View style={styles.summaryCount}><Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>COUNTED</Text>
              <Text style={[styles.countValue, { color: colors.foreground }]}>{summary.quoted}</Text></View>
            <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
            <View style={styles.summaryCount}><Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>UP / DOWN</Text>
              <Text style={[styles.countValue, { color: colors.foreground }]}>{summary.positive}<Text style={{ color: colors.mutedForeground }}> / </Text>{summary.negative}</Text></View>
          </View>
          <Text style={[styles.summaryNote, { color: colors.mutedForeground }]}>Breadth uses {PERIODS.find((item) => item.id === period)?.label} return where available; missing history is excluded.</Text>

          {category === 'custom' && <View style={[styles.customPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Your watch map</Text>
            <Text style={[styles.customHint, { color: colors.mutedForeground }]}>Compare validated tickers. {customSymbols.length}/{MAX_CUSTOM_HEAT_MAP_SYMBOLS}; saved on this device.</Text>
            <View style={styles.addRow}><TextInput testID="heat-map-custom-input" value={symbolInput} onChangeText={(value) => { setSymbolInput(value); setFormError(''); }}
              placeholder="Ticker or company name" placeholderTextColor={colors.mutedForeground} autoCapitalize="none" autoCorrect={false} maxLength={80}
              returnKeyType="done" onSubmitEditing={() => void addSymbol()} style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.input }]} />
              <TouchableOpacity testID="heat-map-custom-add" accessibilityRole="button" accessibilityLabel="Validate and add ticker"
                disabled={!symbolInput.trim() || validateSymbol.isPending || customSymbols.length >= MAX_CUSTOM_HEAT_MAP_SYMBOLS} onPress={() => void addSymbol()}
                style={[styles.addButton, { backgroundColor: colors.primary, opacity: !symbolInput.trim() || validateSymbol.isPending || customSymbols.length >= MAX_CUSTOM_HEAT_MAP_SYMBOLS ? 0.55 : 1 }]}>
                {validateSymbol.isPending ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : <MaterialCommunityIcons name="plus" size={20} color={colors.primaryForeground} />}
              </TouchableOpacity></View>
            {isCustomSearchInput && <View testID="heat-map-custom-suggestions" style={[styles.suggestionsPanel, { backgroundColor: colors.background, borderColor: colors.border }]}>
              {customSuggestions.map((suggestion, index) => <TouchableOpacity
                key={suggestion.symbol}
                testID={`heat-map-custom-suggestion-${suggestion.symbol}`}
                accessibilityRole="button"
                accessibilityLabel={`Add ${suggestion.name}, ticker ${suggestion.symbol}, ${suggestion.exchange}`}
                disabled={validateSymbol.isPending || customSymbols.length >= MAX_CUSTOM_HEAT_MAP_SYMBOLS}
                onPress={() => void addSymbol(suggestion.symbol)}
                style={[styles.suggestionRow, index < customSuggestions.length - 1 && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}
              >
                <View style={styles.suggestionCopy}>
                  <Text numberOfLines={1} style={[styles.suggestionName, { color: colors.foreground }]}>{suggestion.name}</Text>
                  <Text numberOfLines={1} style={[styles.suggestionExchange, { color: colors.mutedForeground }]}>{suggestion.exchange}</Text>
                </View>
                <Text style={[styles.suggestionSymbol, { color: colors.primary }]}>{suggestion.symbol}</Text>
                <MaterialCommunityIcons name="plus" size={17} color={colors.primary} />
              </TouchableOpacity>)}
              {customSearchFeedback?.kind === 'loading' && <View style={styles.searchStatus}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={[styles.searchHint, { color: colors.mutedForeground }]}>{customSearchFeedback.message}</Text>
              </View>}
              {customSearchFeedback && customSearchFeedback.kind !== 'loading' && <Text style={[styles.searchHint, { color: colors.mutedForeground }]}>
                {customSearchFeedback.message}
              </Text>}
            </View>}
            {!!formError && <Text testID="heat-map-custom-error" style={[styles.formError, { color: colors.sellColor }]}>{formError}</Text>}
            {!!customSymbols.length && <View style={styles.chipList}>{customSymbols.map((symbol) => <View key={symbol} style={[styles.symbolChip, { borderColor: colors.border, backgroundColor: colors.secondary }]}>
              <Text style={[styles.chipText, { color: colors.foreground }]}>{symbol}</Text><TouchableOpacity testID={`heat-map-custom-remove-${symbol}`} accessibilityRole="button"
                accessibilityLabel={`Remove ${symbol}`} onPress={() => removeSymbol(symbol)} hitSlop={8}><MaterialCommunityIcons name="close" size={15} color={colors.mutedForeground} /></TouchableOpacity>
            </View>)}</View>}
          </View>}

          {!!staleQuotes.length && <View style={[styles.notice, styles.staleNotice, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <MaterialCommunityIcons name="clock-alert-outline" size={15} color={colors.gold} />
            <Text style={[styles.noticeText, { color: colors.mutedForeground }]}>Stale or invalid quote timestamps are excluded: {staleQuotes.map((quote) => quote.symbol).join(', ')}.</Text>
          </View>}
          {mapQuery.isError && responseMatches && <View style={[styles.notice, styles.staleNotice, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <MaterialCommunityIcons name="alert-circle-outline" size={15} color={colors.gold} />
            <Text style={[styles.noticeText, { color: colors.mutedForeground }]}>Refresh failed. Showing the last successful quote batch from {formatUpdated(response!.updatedAt).replace('Updated ', '')}.</Text>
          </View>}

          {category === 'custom' && storageReady && customSymbols.length === 0
            ? stateCard('hexagon-multiple-outline', 'Build a personal comparison', 'Add validated tickers above. Your symbols remain private and stored on this device.')
              : mapQuery.isError && !responseMatches
              ? stateCard('alert-circle-outline', 'Market data is unavailable', "This quote batch couldn't be refreshed.", <TouchableOpacity testID="heat-map-retry" onPress={() => mapQuery.refetch()} style={[styles.retryButton, { borderColor: colors.border }]}><Text style={[styles.retryText, { color: colors.primary }]}>Try again</Text></TouchableOpacity>)
              : busy
                ? stateCard('chart-timeline-variant', 'Loading selected market', 'Preparing one quote batch for this category and return window.')
                : filterableQuotes.length === 0 && activeFilterCount > 0
                  ? stateCard('filter-off-outline', 'No matches for these filters', 'Clear or adjust a filter to see instruments in this map.')
                  : filterableQuotes.length === 0
                    ? stateCard('chart-box-outline', 'No current quotes', unavailableSymbols.length ? `No recent valid quotes for ${unavailableSymbols.join(', ')}.` : 'There are no current quotes available in this market.')
                    : <View style={styles.mapWrap}>
                      {sectors.map((group) => {
                        const layout = layoutHoneycomb(group.quotes.length, contentWidth, tileWidth);
                        const tileHeight = tileWidth * Math.sqrt(3) / 2;
                        return <View key={group.name || 'all'} style={styles.sectorGroup}>
                          {(category === 'stocks' || category === 'custom') && <View style={styles.sectorHeading}>
                            <Text style={[styles.sectorName, { color: colors.foreground }]}>{group.name}</Text>
                            <Text style={[styles.sectorCount, { color: colors.mutedForeground }]}>{group.quotes.length} instruments</Text>
                          </View>}
                          <View style={[styles.honeycomb, { width: contentWidth, height: layout.height }]}>
                            {layout.positions.map((position) => {
                              const quote = group.quotes[position.index];
                              return <View key={quote.symbol} style={{ position: 'absolute', left: position.left, top: position.top }}>
                                <HexTile quote={quote} width={tileWidth} height={tileHeight} colors={colors} period={period} />
                              </View>;
                            })}
                          </View>
                        </View>;
                      })}
                      {!!unavailableSymbols.length && <Text style={[styles.unavailable, { color: colors.mutedForeground }]}>No recent quote: {unavailableSymbols.join(' · ')}</Text>}
                      {!!filterableQuotes.some((quote) => quote.returnPercent === null) && <View style={[styles.notice, { backgroundColor: colors.card, borderColor: colors.border }]}>
                        <MaterialCommunityIcons name="information-outline" size={15} color={colors.primary} />
                        <Text style={[styles.noticeText, { color: colors.mutedForeground }]}>Unavailable returns have no performance color and are excluded from breadth.</Text>
                      </View>}
                    </View>}

          {responseMatches && period === 'max' && <Text style={[styles.disclosure, { color: colors.mutedForeground }]}>
            Each Max tile shows the actual first available history date for that instrument; start dates vary.
          </Text>}
          <View style={[styles.disclosureCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.disclosure, { color: colors.mutedForeground }]}>Risk bands use trailing-year historical volatility. They describe past price behavior, not investment suitability.</Text>
            <Text style={[styles.disclosure, { color: colors.mutedForeground }]}>Price-return proxies exclude distributions where adjusted total return is unavailable. Continuous futures may be affected by contract-roll methodology.</Text>
          </View>
          <View style={styles.footerNote}><View style={[styles.legendDot, { backgroundColor: colors.buyColor }]} /><Text style={[styles.legendText, { color: colors.mutedForeground }]}>Positive</Text>
            <View style={[styles.legendDot, { backgroundColor: colors.holdColor }]} /><Text style={[styles.legendText, { color: colors.mutedForeground }]}>Within ±0.25%</Text>
            <View style={[styles.legendDot, { backgroundColor: colors.sellColor }]} /><Text style={[styles.legendText, { color: colors.mutedForeground }]}>Negative</Text>
          </View>
        </ScrollView>
        <BottomTabBar />

        <Modal visible={categoryMenuOpen} transparent animationType="fade" onRequestClose={() => setCategoryMenuOpen(false)}>
          <Pressable style={styles.modalScrim} onPress={() => setCategoryMenuOpen(false)}>
            <View style={[styles.categoryMenu, { top: topPad + 78, left: 68, backgroundColor: colors.card, borderColor: colors.border }]}>
              {CATEGORIES.map((item) => <TouchableOpacity key={item.id} testID={`heat-map-category-${item.id}`} accessibilityRole="button"
                accessibilityState={{ selected: item.id === category }} onPress={() => { selectCategory(item.id); setCategoryMenuOpen(false); }}
                style={[styles.categoryMenuItem, { borderBottomColor: colors.border }]}>
                <Text style={[styles.categoryMenuText, { color: item.id === category ? colors.primary : colors.foreground }]}>{item.label}</Text>
                {item.id === category && <MaterialCommunityIcons name="check" size={17} color={colors.primary} />}
              </TouchableOpacity>)}
            </View>
          </Pressable>
        </Modal>

        <Modal visible={drawerOpen} transparent animationType="fade" onRequestClose={() => setDrawerOpen(false)}>
          <View style={styles.drawerRoot}>
            <Pressable accessibilityRole="button" accessibilityLabel="Close filters" onPress={() => setDrawerOpen(false)} style={styles.drawerBackdrop} />
            <View style={[styles.drawer, { backgroundColor: colors.background, paddingTop: Math.max(insets.top, 18) + 12, paddingBottom: Math.max(insets.bottom, 14) }]}>
              <View style={styles.drawerHeader}>
                <View><Text style={[styles.drawerKicker, { color: colors.gold }]}>REFINE THE FIELD</Text><Text style={[styles.drawerTitle, { color: colors.heading }]}>Filters</Text></View>
                <TouchableOpacity testID="heat-map-filter-close" accessibilityRole="button" accessibilityLabel="Close filters" onPress={() => setDrawerOpen(false)} style={[styles.drawerClose, { borderColor: colors.border }]}>
                  <MaterialCommunityIcons name="close" size={20} color={colors.foreground} />
                </TouchableOpacity>
              </View>
              <Text style={[styles.drawerFeedback, { color: colors.mutedForeground }]}>{countActiveHeatMapFilters(draftFilters)} selected · filters combine together</Text>
              <ScrollView style={styles.drawerScroll} contentContainerStyle={styles.drawerScrollContent} showsVerticalScrollIndicator>
                <FilterSection title="Return period">{PERIODS.map((item) => <FilterChoice key={item.id} label={item.label} selected={period === item.id}
                  onPress={() => setPeriod(item.id)} testID={`heat-map-drawer-period-${item.id}`} />)}</FilterSection>
                {supportsSectorFilter && <FilterSection title="Sector">{choices.sectors.map((value) => <FilterChoice key={value} label={value} selected={draftFilters.sector === value} onPress={() => toggleFilter('sector', value)} testID={`heat-map-filter-sector-${value}`} />)}</FilterSection>}
                {supportsMarketCapFilter && <FilterSection title="Market cap (USD)">{CAP_BUCKETS.map((value) => <FilterChoice key={value} label={CAP_BUCKET_LABELS[value]} selected={draftFilters.marketCap === value} onPress={() => toggleFilter('marketCap', value)} testID={`heat-map-filter-cap-${value}`} />)}</FilterSection>}
                {choices.exchanges.length > 0 && <FilterSection title="Exchange">{choices.exchanges.map((value) => <FilterChoice key={value} label={value} selected={draftFilters.exchange === value} onPress={() => toggleFilter('exchange', value)} testID={`heat-map-filter-exchange-${value}`} />)}</FilterSection>}
                <FilterSection title="Historical risk">{RISK_BANDS.map((value) => <FilterChoice key={value} label={RISK_BAND_LABELS[value]} selected={draftFilters.risk === value} onPress={() => toggleFilter('risk', value)} testID={`heat-map-filter-risk-${value}`} />)}
                  {choices.hasUnknownRisk && <FilterChoice label="Unknown" selected={draftFilters.risk === 'Unknown'} onPress={() => toggleFilter('risk', 'Unknown')} testID="heat-map-filter-risk-Unknown" />}</FilterSection>
                <Text style={[styles.riskExplanation, { color: colors.mutedForeground }]}>Risk uses trailing-year daily returns, annualized with 252 trading days (stocks and funds) or 365 days (crypto); at least 60 observations are required. These labels describe historical volatility, not personal suitability. Unknown means history is insufficient.</Text>
              </ScrollView>
              <View style={[styles.drawerActions, { borderTopColor: colors.border }]}>
                <TouchableOpacity testID="heat-map-filter-reset" accessibilityRole="button" onPress={() => { setDraftFilters(EMPTY_FILTERS); setFilters(EMPTY_FILTERS); }} style={[styles.resetButton, { borderColor: colors.border }]}>
                  <Text style={[styles.resetText, { color: colors.foreground }]}>Clear all</Text>
                </TouchableOpacity>
                <TouchableOpacity testID="heat-map-filter-apply" accessibilityRole="button" onPress={() => { setFilters(draftFilters); setDrawerOpen(false); }}
                  style={[styles.applyButton, { backgroundColor: colors.primary }]}>
                  <Text style={[styles.applyText, { color: colors.primaryForeground }]}>Apply filters</Text><Text style={[styles.applyCount, { color: colors.primaryForeground }]}>{countActiveHeatMapFilters(draftFilters)}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </AmericanSteelBackground>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scrollContent: { paddingHorizontal: 18 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 18 },
  iconButton: { width: 40, height: 40, borderWidth: 1, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  headingCopy: { flex: 1, marginHorizontal: 12 },
  eyebrow: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1.45, marginBottom: 4 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 24, letterSpacing: -0.45 },
  controlRow: { flexDirection: 'row', gap: 9, marginBottom: 20 },
  categoryPicker: { height: 42, flex: 1, borderWidth: 1, borderRadius: 12, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  categoryPickerLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  filterButton: { height: 42, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 7 },
  filterButtonText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  filterCount: { minWidth: 18, height: 18, borderRadius: 9, overflow: 'hidden', textAlign: 'center', textAlignVertical: 'center', fontFamily: 'Inter_700Bold', fontSize: 10 },
  periodHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 11 },
  periodKicker: { fontFamily: 'Inter_600SemiBold', fontSize: 8, letterSpacing: 1.2 },
  periodTitle: { fontFamily: 'Inter_700Bold', fontSize: 20, marginTop: 4 },
  timestamp: { fontFamily: 'Inter_400Regular', fontSize: 9, textAlign: 'right', marginBottom: 3, flexShrink: 1 },
  periodRail: { flexDirection: 'row', justifyContent: 'space-between', gap: 4, marginBottom: 17 },
  periodOption: { flex: 1, minWidth: 0, height: 32, borderWidth: 1, borderRadius: 9, justifyContent: 'center', alignItems: 'center' },
  periodOptionText: { fontFamily: 'Inter_600SemiBold', fontSize: 10 },
  summaryPanel: { minHeight: 72, borderWidth: 1, borderRadius: 15, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10 },
  summaryTone: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  summaryLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 8, letterSpacing: 0.8 },
  summaryValue: { fontFamily: 'Inter_700Bold', fontSize: 13, marginTop: 3, letterSpacing: 0.5 },
  directionWord: { fontFamily: 'Inter_600SemiBold', fontSize: 9, marginTop: 1 },
  summaryDivider: { width: 1, height: 32, marginHorizontal: 8 },
  summaryCount: { alignItems: 'center', minWidth: 52 },
  countValue: { fontFamily: 'Inter_700Bold', fontSize: 14, marginTop: 5 },
  summaryNote: { fontFamily: 'Inter_400Regular', fontSize: 9, lineHeight: 14, textAlign: 'right', marginTop: 7, marginBottom: 15 },
  customPanel: { borderWidth: 1, borderRadius: 15, padding: 14, marginBottom: 16 },
  sectionTitle: { fontFamily: 'Inter_700Bold', fontSize: 15 },
  customHint: { fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 16, marginTop: 4 },
  addRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  input: { flex: 1, height: 42, borderRadius: 11, borderWidth: 1, paddingHorizontal: 12, fontFamily: 'Inter_500Medium', fontSize: 13 },
  addButton: { width: 43, height: 42, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  suggestionsPanel: { marginTop: 8, borderWidth: 1, borderRadius: 11, overflow: 'hidden' },
  suggestionRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 11, paddingVertical: 8 },
  suggestionCopy: { flex: 1, minWidth: 0 },
  suggestionName: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  suggestionExchange: { fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 3 },
  suggestionSymbol: { fontFamily: 'Inter_700Bold', fontSize: 11 },
  searchStatus: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 11 },
  searchHint: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 10, lineHeight: 15, paddingHorizontal: 11, paddingVertical: 10 },
  formError: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 8 },
  chipList: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 12 },
  symbolChip: { flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderRadius: 15, paddingLeft: 10, paddingRight: 7, paddingVertical: 5 },
  chipText: { fontFamily: 'Inter_600SemiBold', fontSize: 10 },
  statePanel: { minHeight: 170, borderWidth: 1, borderStyle: 'dashed', borderRadius: 17, alignItems: 'center', justifyContent: 'center', padding: 22, gap: 8, marginTop: 3 },
  stateTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 14, textAlign: 'center', marginTop: 3 },
  stateCopy: { fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 17, textAlign: 'center', maxWidth: 280 },
  retryButton: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 15, paddingVertical: 8, marginTop: 6 },
  retryText: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  mapWrap: { gap: 18 },
  sectorGroup: { gap: 7 },
  sectorHeading: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 3 },
  sectorName: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  sectorCount: { fontFamily: 'Inter_400Regular', fontSize: 9 },
  honeycomb: { alignSelf: 'center', position: 'relative' },
  tile: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 13, gap: 1 },
  tileSymbol: { maxWidth: '90%', fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 0.2 },
  tileChange: { maxWidth: '90%', fontFamily: 'Inter_700Bold', fontSize: 10 },
  tilePrice: { maxWidth: '90%', fontFamily: 'Inter_500Medium', fontSize: 8 },
  tileSession: { maxWidth: '92%', fontFamily: 'Inter_600SemiBold', fontSize: 7, letterSpacing: 0.05 },
  tileAge: { maxWidth: '92%', fontFamily: 'Inter_400Regular', fontSize: 7 },
  tileBasis: { maxWidth: '92%', fontFamily: 'Inter_400Regular', fontSize: 6.2, letterSpacing: -0.1 },
  unavailable: { fontFamily: 'Inter_400Regular', fontSize: 10, textAlign: 'center', marginTop: 2 },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 11, padding: 10 },
  staleNotice: { marginBottom: 12 },
  noticeText: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 10, lineHeight: 15 },
  disclosureCard: { borderWidth: 1, borderRadius: 13, padding: 12, gap: 8, marginTop: 19 },
  disclosure: { fontFamily: 'Inter_400Regular', fontSize: 9, lineHeight: 14, marginTop: 10 },
  footerNote: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 17, paddingBottom: 8 },
  legendDot: { width: 6, height: 6, borderRadius: 3, marginLeft: 6 },
  legendText: { fontFamily: 'Inter_400Regular', fontSize: 9 },
  modalScrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.34)' },
  categoryMenu: { position: 'absolute', width: 220, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 5, elevation: 8 },
  categoryMenuItem: { minHeight: 44, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  categoryMenuText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  drawerRoot: { flex: 1, flexDirection: 'row', justifyContent: 'flex-end' },
  drawerBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.48)' },
  drawer: { width: '88%', maxWidth: 420, height: '100%', borderTopLeftRadius: 22, borderBottomLeftRadius: 22, paddingHorizontal: 20, elevation: 14 },
  drawerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  drawerKicker: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1.35 },
  drawerTitle: { fontFamily: 'Inter_700Bold', fontSize: 25, marginTop: 3 },
  drawerClose: { width: 38, height: 38, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  drawerFeedback: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 7, marginBottom: 9 },
  drawerScroll: { flex: 1 },
  drawerScrollContent: { paddingBottom: 18 },
  filterSection: { paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(128,128,128,0.35)' },
  filterSectionTitle: { fontFamily: 'Inter_700Bold', fontSize: 13, marginBottom: 10 },
  filterChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filterChoice: { minHeight: 36, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  filterChoiceText: { fontFamily: 'Inter_500Medium', fontSize: 10 },
  riskExplanation: { fontFamily: 'Inter_400Regular', fontSize: 10, lineHeight: 15, marginTop: 4 },
  drawerActions: { borderTopWidth: 1, paddingTop: 13, flexDirection: 'row', gap: 10 },
  resetButton: { minWidth: 83, height: 46, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  resetText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  applyButton: { flex: 1, height: 46, borderRadius: 12, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  applyText: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  applyCount: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
});