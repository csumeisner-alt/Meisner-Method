import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo, ActivityIndicator, Animated, AppState, Keyboard, Modal, Platform, Pressable, RefreshControl,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions,
} from 'react-native';
import { Gesture, GestureDetector, type GestureType } from 'react-native-gesture-handler';
import { useFocusEffect, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Polygon } from 'react-native-svg';
import Reanimated, {
  cancelAnimation,
  Easing as ReanimatedEasing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import {
  getGetMarketBreadthQueryKey, getGetMarketHeatMapQueryKey,
  getSearchHeatMapInstrumentsQueryKey, getSearchStockSymbolsQueryKey,
  useGetMarketBreadth, useGetMarketHeatMap, useSearchHeatMapInstruments,
  useSearchStockSymbols, useValidateHeatMapSymbol,
} from '@workspace/api-client-react';
import type {
  GetMarketHeatMapCategory, GetMarketHeatMapPeriod, GetMarketHeatMapSector,
  HeatMapInstrumentSuggestion, HeatMapQuote, StockSymbolSuggestion,
} from '@workspace/api-client-react';
import { AmericanSteelBackground } from '@/components/AmericanSteelBackground';
import { BottomTabBar } from '@/components/BottomTabBar';
import { useAchievements } from '@/contexts/AchievementsContext';
import { AmericanModeContext } from '@/contexts/AmericanModeContext';
import { useColors } from '@/hooks/useColors';
import { useWatchlist } from '@/hooks/useWatchlist';
import { HeatMapCryptoLogo } from '@/components/HeatMapCryptoLogo';
import { HeatMapDetailModal } from '@/components/HeatMapDetailModal';
import { HeatMapInstrumentIcon } from '@/components/HeatMapInstrumentIcon';
import {
  countActiveHeatMapFilters, filterHeatMapQuotes,
  getHeatMapLoadingDelays, getHeatMapLoadingHexColors, getHeatMapLoadingTheme,
  getHeatMapRevealDelays, getHeatMapTileWidth, hasUsableHeatMapPerformanceSnapshot,
  heatMapResponseMatchesSelection, layoutHoneycomb, sortHeatMapQuotesByReturn, summarizeHeatMap,
  uniqueHeatMapQuotesBySymbol,
  type HeatMapFilters, type HeatMapCapBucket, type HeatMapLoadingTheme, type HeatMapReturnSort, type HeatMapRiskBand, type HeatMapRiskFilter,
} from '@/lib/heatMapMetrics';
import { getHeatMapInstrumentDisplay } from '@/lib/heatMapInstrumentDisplay';
import { getHeatMapCryptoLogoCode } from '@/lib/heatMapCryptoLogo';
import { formatHeatMapCryptoPrice } from '@/lib/heatMapCryptoPrice';
import {
  formatHeatMapNextOpen, formatHeatMapQuoteAge, getHeatMapMarketStatus, getHeatMapSessionLabel,
  getHeatMapRegularOpenRefreshTimestamp, getNextHeatMapRegularOpenTimestamp,
  HEAT_MAP_CRYPTO_REFRESH_INTERVAL_MS,
  HEAT_MAP_REGULAR_SESSION_REFRESH_INTERVAL_MS, isDisplayableHeatMapQuote,
  shouldRefreshCryptoHeatMapOnResume, shouldRefreshHeatMapOnForegroundCadence,
} from '@/lib/heatMapQuoteDisplay';
import {
  CUSTOM_HEAT_MAP_ASSETS, CUSTOM_HEAT_MAP_ASSET_TYPES,
  MAX_CUSTOM_HEAT_MAP_SYMBOLS, appendCustomHeatMapSymbolInSavedOrder,
  getCustomHeatMapValidationFailureReason,
  isSupportedCustomMapCommoditySymbol,
  moveCustomHeatMapSymbol, normalizeCustomHeatMapSymbols,
  planCustomHeatMapBatchAdd,
  removeCustomHeatMapSymbolFromSavedOrder,
  searchCustomHeatMapAssets,
  swapCustomHeatMapSymbolWithIndex,
  type CustomHeatMapAssetType,
} from '@/lib/heatMapSymbols';
import { mergeReorderedSubset } from '@/lib/watchlistFilter';
import {
  getStockSearchFeedback, getStockSearchQueryFromKey, getStockSearchSuggestionSelectionState, isStockSearchCurrent,
} from '@/lib/stockSearch';

const STORAGE_KEY = 'meisner.heat-map.custom-symbols.v1';
const CATEGORIES: { id: GetMarketHeatMapCategory; label: string }[] = [
  { id: 'stocks', label: 'Stocks' }, { id: 'etfs', label: 'ETFs' },
  { id: 'commodities', label: 'Commodities' }, { id: 'futures', label: 'Futures' },
  { id: 'cryptocurrency', label: 'Cryptocurrency' }, { id: 'custom', label: 'Custom' },
];
const LARGE_TICKER_LABEL_CATEGORIES = new Set<GetMarketHeatMapCategory>([
  'stocks', 'etfs', 'commodities', 'custom',
]);
const SHARED_MARKET_STATUS_CATEGORIES = new Set<GetMarketHeatMapCategory>([
  'stocks', 'etfs', 'custom',
]);
const MARKET_STATUS_LABELS: Record<ReturnType<typeof getHeatMapMarketStatus>, string> = {
  open: 'MARKET OPEN',
  pre_market: 'OPEN · PRE-MARKET',
  extended: 'OPEN · EXTENDED HOURS',
  closed: 'MARKET CLOSED',
  mixed: 'MIXED HOURS',
  unknown: 'STATUS UNKNOWN',
};
const MARKET_STATUS_ACCESSIBILITY_LABELS: Record<ReturnType<typeof getHeatMapMarketStatus>, string> = {
  open: 'Market open during regular trading',
  pre_market: 'Market open for pre-market trading',
  extended: 'Market open for extended-hours trading',
  closed: 'Market closed',
  mixed: 'Market sessions differ across displayed instruments',
  unknown: 'Market status unavailable',
};
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
const SCHEDULED_OPEN_REFRESH_RETRY_DELAY_MS = 1_000;
const LOADING_HEX_COUNT = 6;
const LOADING_HEX_REVEAL_MS = 380;
const LOADING_HEX_PULSE_HALF_CYCLE_MS = 900;
const HEX_REVEAL_SPREAD_MS = 1_100;
const HEX_REVEAL_DURATION_MS = 680;

function formatPrice(price: number, symbol?: string, isCrypto = false) {
  if (isCrypto && symbol) return formatHeatMapCryptoPrice(price, symbol);
  return `$${price.toLocaleString('en-US', { minimumFractionDigits: price >= 1 ? 2 : 4, maximumFractionDigits: price >= 1 ? 2 : 4 })}`;
}
function formatUpdated(timestamp?: number) {
  if (!timestamp) return 'Waiting for quote batch';
  return `Updated ${new Date(timestamp * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

type HexDragPosition = { index: number; left: number; top: number };

function HexTile({
  quote, width, height, colors, period, category, editing, reduceMotion, revealDelayMs, removing, onRemove, onSelect, scrollGesture,
  dragEnabled, dragging, positionIndex, positionLeft, positionTop, positions, visibleSymbols,
  onDragStart, onDragTarget, onDragEnd, onMoveAccessibility,
}: {
  quote: HeatMapQuote;
  width: number;
  height: number;
  colors: ReturnType<typeof useColors>;
  period: GetMarketHeatMapPeriod;
  category: GetMarketHeatMapCategory;
  editing: boolean;
  reduceMotion: boolean;
  revealDelayMs: number;
  removing: boolean;
  onRemove: () => void;
  onSelect: () => void;
  scrollGesture: GestureType;
  dragEnabled: boolean;
  dragging: boolean;
  positionIndex: number;
  positionLeft: number;
  positionTop: number;
  positions: HexDragPosition[];
  visibleSymbols: string[];
  onDragStart: (symbol: string, visibleSymbols: string[], index: number) => void;
  onDragTarget: (symbol: string, index: number) => void;
  onDragEnd: (symbol: string, index: number) => void;
  onMoveAccessibility: (direction: 'up' | 'down') => void;
}) {
  const wiggle = useRef(new Animated.Value(0)).current;
  const revealProgress = useSharedValue(reduceMotion ? 1 : 0);
  const dragProgress = useSharedValue(0);
  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  const dragTargetIndex = useSharedValue(positionIndex);

  useEffect(() => {
    cancelAnimation(revealProgress);
    if (reduceMotion) {
      revealProgress.value = 1;
      return () => cancelAnimation(revealProgress);
    }

    revealProgress.value = 0;
    revealProgress.value = withDelay(
      revealDelayMs,
      withTiming(1, {
        duration: HEX_REVEAL_DURATION_MS,
        easing: ReanimatedEasing.out(ReanimatedEasing.cubic),
      }),
    );
    return () => cancelAnimation(revealProgress);
  }, [reduceMotion, revealDelayMs, revealProgress]);

  const revealStyle = useAnimatedStyle(() => ({
    opacity: revealProgress.value,
    transform: [
      { translateY: (1 - revealProgress.value) * 8 },
      { scale: 0.96 + revealProgress.value * 0.04 },
    ],
  }));

  useEffect(() => {
    if (!editing || reduceMotion) {
      wiggle.stopAnimation();
      wiggle.setValue(0);
      return;
    }
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(wiggle, { toValue: 1, duration: 105, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(wiggle, { toValue: -1, duration: 105, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(wiggle, { toValue: 0, duration: 105, useNativeDriver: Platform.OS !== 'web' }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [editing, reduceMotion, wiggle]);
  const value = quote.returnPercent;
  const available = typeof value === 'number' && Number.isFinite(value);
  const positive = available && value! > 0.25;
  const negative = available && value! < -0.25;
  const tone = !available ? colors.mutedForeground : positive ? colors.buyColor : negative ? colors.sellColor : colors.holdColor;
  const bg = !available ? colors.secondary : positive ? colors.buyBg : negative ? colors.sellBg : colors.holdBg;
  const largerTickerLabel = LARGE_TICKER_LABEL_CATEGORIES.has(category);
  const label = available ? `${value! > 0 ? '+' : ''}${value!.toFixed(2)}%` : 'Unavailable';
  const instrument = getHeatMapInstrumentDisplay(quote);
  const cryptoLogoCode = quote.assetType === 'cryptocurrency'
    ? getHeatMapCryptoLogoCode(quote.symbol)
    : null;
  const session = getHeatMapSessionLabel(quote.marketSession);
  const age = formatHeatMapQuoteAge(quote.priceTimestamp);
  const nextOpen = formatHeatMapNextOpen(
    quote.nextRegularOpenTimestamp,
    quote.marketSession,
    quote.assetType,
    quote.exchangeTimezone,
  );
  const showNextOpen = !SHARED_MARKET_STATUS_CATEGORIES.has(category);
  const identityLabel = instrument ? `${instrument.name}, ${quote.symbol}` : quote.symbol;
  const tileAccessibilityLabel = [
    identityLabel,
    label,
    session,
    ...(showNextOpen && nextOpen ? [nextOpen] : []),
    age,
  ].join(', ');
  const rotation = wiggle.interpolate({ inputRange: [-1, 1], outputRange: ['-2.4deg', '2.4deg'] });
  const dragStyle = useAnimatedStyle(() => ({
    zIndex: dragProgress.value > 0 ? 50 : 0,
    transform: [
      { translateX: dragX.value },
      { translateY: dragY.value },
      { scale: 1 + dragProgress.value * 0.08 },
    ],
  }));
  const dragGesture = useMemo(() => Gesture.Pan()
    .enabled(dragEnabled)
    .activateAfterLongPress(Platform.OS === 'web' ? 320 : 420)
    .simultaneousWithExternalGesture(scrollGesture)
    .onStart(() => {
      dragTargetIndex.value = positionIndex;
      dragProgress.value = 1;
      runOnJS(onDragStart)(quote.symbol, visibleSymbols, positionIndex);
    })
    .onUpdate((event) => {
      dragX.value = event.translationX;
      dragY.value = event.translationY;
      const centerX = positionLeft + width / 2 + event.translationX;
      const centerY = positionTop + height / 2 + event.translationY;
      let nearestIndex = positionIndex;
      let nearestDistance = Number.POSITIVE_INFINITY;
      for (let index = 0; index < positions.length; index += 1) {
        const target = positions[index];
        const dx = centerX - (target.left + width / 2);
        const dy = centerY - (target.top + height / 2);
        const distance = dx * dx + dy * dy;
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = target.index;
        }
      }
      if (nearestIndex !== dragTargetIndex.value) {
        dragTargetIndex.value = nearestIndex;
        runOnJS(onDragTarget)(quote.symbol, nearestIndex);
      }
    })
    .onFinalize(() => {
      const targetIndex = dragTargetIndex.value;
      dragProgress.value = 0;
      dragX.value = 0;
      dragY.value = 0;
      runOnJS(onDragEnd)(quote.symbol, targetIndex);
    }), [
    dragEnabled, dragProgress, dragTargetIndex, dragX, dragY, height, onDragEnd, onDragStart, scrollGesture,
    onDragTarget, positionIndex, positionLeft, positionTop, positions, quote.symbol, visibleSymbols, width,
  ]);

  const accessibilityActions = dragEnabled
    ? [{ name: 'increment' as const, label: 'Move earlier' }, { name: 'decrement' as const, label: 'Move later' }]
    : undefined;
  const onAccessibilityAction = (event: { nativeEvent: { actionName: string } }) => {
    if (event.nativeEvent.actionName === 'increment') onMoveAccessibility('up');
    if (event.nativeEvent.actionName === 'decrement') onMoveAccessibility('down');
  };

  const tile = (
    <Reanimated.View
      testID={`heat-map-hex-tile-${quote.symbol}`}
      style={[{ width, height }, revealStyle]}
    >
      <Reanimated.View style={[{ width, height }, dragStyle, dragging && styles.hexDragging]}>
        <Animated.View style={[{ width, height }, { transform: [{ rotate: rotation }] }]}>
        <View style={[
          styles.tile,
          instrument ? styles.tileInstrument : cryptoLogoCode ? styles.tileCrypto : null,
          { width, height },
        ]} accessibilityLabel={tileAccessibilityLabel}>
      <Svg width={width} height={height} viewBox="0 0 100 86.6" style={StyleSheet.absoluteFill}>
        <Polygon points="1,43.3 25,1 75,1 99,43.3 75,85.6 25,85.6" fill={bg} stroke={tone} strokeWidth="1.5" />
      </Svg>
      {cryptoLogoCode ? (
        <View style={styles.tileInstrumentIdentity} testID={`heat-map-crypto-identity-${quote.symbol}`}>
          <HeatMapCryptoLogo
            code={cryptoLogoCode}
            testID={`heat-map-crypto-logo-${quote.symbol}`}
          />
          <Text
            testID={`heat-map-crypto-symbol-${quote.symbol}`}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.72}
            style={[
              styles.tileSymbol,
              styles.tileCryptoSymbol,
              { color: colors.foreground },
            ]}
          >
            {quote.symbol}
          </Text>
        </View>
      ) : instrument ? (
        <View style={styles.tileInstrumentIdentity}>
          <HeatMapInstrumentIcon
            kind={instrument.icon}
            colors={colors}
            testID={`heat-map-instrument-icon-${quote.symbol}`}
          />
          <Text
            testID={`heat-map-instrument-name-${quote.symbol}`}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.58}
            style={[
              styles.tileSymbol,
              styles.tileInstrumentName,
              largerTickerLabel ? styles.tileInstrumentNameEmphasized : null,
              { color: colors.foreground },
            ]}
          >
            {instrument.name}
          </Text>
        </View>
      ) : (
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.72}
          style={[
            styles.tileSymbol,
            largerTickerLabel ? styles.tileSymbolEmphasized : null,
            { color: colors.foreground },
          ]}
        >
          {quote.symbol}
        </Text>
      )}
      <Text testID={`heat-map-change-${quote.symbol}`} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={[styles.tileChange, { color: tone }]}>{label}</Text>
      <Text testID={`heat-map-price-${quote.symbol}`} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82} style={[styles.tilePrice, { color: colors.foreground }]}>{formatPrice(quote.price, quote.symbol, quote.assetType === 'cryptocurrency')}</Text>
      <Text testID={`heat-map-session-${quote.symbol}`} numberOfLines={1} style={[styles.tileSession, { color: colors.foreground }]}>{session}</Text>
      {showNextOpen && nextOpen && <Text testID={`heat-map-next-open-${quote.symbol}`} numberOfLines={2} style={[styles.tileNextOpen, { color: colors.foreground }]}>{nextOpen}</Text>}
      <Text testID={`heat-map-quote-age-${quote.symbol}`} numberOfLines={1} style={[styles.tileAge, { color: colors.mutedForeground }]}>{age}</Text>
      {quote.returnBasis === 'price_return_proxy' && <Text numberOfLines={1} style={[styles.tileBasis, { color: colors.mutedForeground }]}>Price-return proxy</Text>}
      {period === 'max' && <Text numberOfLines={1} style={[styles.tileBasis, { color: colors.mutedForeground }]}>Since {quote.historyStartDate ?? 'unknown'}</Text>}
        </View>
        </Animated.View>
      </Reanimated.View>
    </Reanimated.View>
  );
  const interaction = editing ? (
    <TouchableOpacity
      testID={`heat-map-remove-tile-${quote.symbol}`}
      accessibilityRole="button"
      accessibilityLabel={`Remove ${quote.symbol} from your custom heat map`}
      accessibilityHint={dragEnabled ? 'Tap to remove. Long press and drag to change position.' : 'Removes this ticker from the custom map.'}
      accessibilityActions={accessibilityActions}
      onAccessibilityAction={onAccessibilityAction}
      disabled={removing}
      onPress={onRemove}
      activeOpacity={0.78}
      style={[styles.editTileButton, { width, height, opacity: removing ? 0.72 : 1 }]}
    >
      {tile}
      <View style={[styles.tileRemoveBadge, { right: width * 0.18, backgroundColor: colors.sellColor }]}>
        <MaterialCommunityIcons name="close" size={11} color="#FFFFFF" />
      </View>
    </TouchableOpacity>
  ) : (
    <TouchableOpacity
      testID={`heat-map-open-detail-${quote.symbol}`}
      accessibilityRole="button"
      accessibilityLabel={`${identityLabel}, ${formatPrice(quote.price, quote.symbol, quote.assetType === 'cryptocurrency')}, ${label}. View market details.`}
      accessibilityHint={dragEnabled ? 'Tap for market details. Long press and drag to change position.' : 'Opens the market detail card.'}
      accessibilityActions={accessibilityActions}
      onAccessibilityAction={onAccessibilityAction}
      onPress={onSelect}
      activeOpacity={0.86}
      style={{ width, height }}
    >
      {tile}
    </TouchableOpacity>
  );
  return dragEnabled ? (
    <GestureDetector gesture={dragGesture} touchAction="pan-y">
      <View collapsable={false} style={{ width, height }}>{interaction}</View>
    </GestureDetector>
  ) : interaction;
}

function UnavailableHexTile({
  name, symbol, width, height, colors, onSelect, onRemove, removing = false,
}: {
  name: string;
  symbol: string;
  width: number;
  height: number;
  colors: ReturnType<typeof useColors>;
  onSelect?: () => void;
  onRemove?: () => void;
  removing?: boolean;
}) {
  const tile = (
    <View style={[styles.unavailableHex, { width, height }]}>
      <Svg width={width} height={height} viewBox="0 0 100 86.6" style={StyleSheet.absoluteFill}>
        <Polygon points="1,43.3 25,1 75,1 99,43.3 75,85.6 25,85.6" fill={colors.card} stroke={colors.border} strokeWidth="1.5" />
      </Svg>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.58} style={[styles.unavailableHexName, { color: colors.foreground }]}>{name}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.64} style={[styles.unavailableHexSymbol, { color: colors.mutedForeground }]}>{symbol}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.62} style={[styles.unavailableHexStatus, { color: colors.mutedForeground }]}>Quote unavailable</Text>
    </View>
  );

  return <View style={{ width, height }}>
    {onSelect
      ? <TouchableOpacity
          testID={`heat-map-unavailable-hex-${symbol}`}
          accessibilityRole="button"
          accessibilityLabel={`View ${name} data and run AI commodity analysis; quote unavailable`}
          onPress={onSelect}
        >{tile}</TouchableOpacity>
      : <View
          testID={`heat-map-unavailable-hex-${symbol}`}
          accessibilityRole="image"
          accessibilityLabel={`${name}, ${symbol}, quote unavailable`}
        >{tile}</View>}
    {onRemove && <TouchableOpacity
      testID={`heat-map-remove-unavailable-${symbol}`}
      accessibilityRole="button"
      accessibilityLabel={`Remove ${symbol} from your custom heat map`}
      disabled={removing}
      onPress={onRemove}
      style={[styles.unavailableHexBadge, { backgroundColor: colors.card, opacity: removing ? 0.55 : 1 }]}
    >
      <MaterialCommunityIcons name="close" size={12} color={colors.sellColor} />
    </TouchableOpacity>}
  </View>;
}

function LoadingHexagon({ index, width, height, delayMs, colors, theme, reduceMotion }: {
  index: number;
  width: number;
  height: number;
  delayMs: number;
  colors: ReturnType<typeof useColors>;
  theme: HeatMapLoadingTheme;
  reduceMotion: boolean;
}) {
  const progress = useSharedValue(reduceMotion ? 1 : 0);
  const pulse = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(progress);
    cancelAnimation(pulse);
    if (reduceMotion) {
      progress.value = 1;
      pulse.value = 0;
      return () => {
        cancelAnimation(progress);
        cancelAnimation(pulse);
      };
    }

    progress.value = withDelay(
      delayMs,
      withTiming(1, {
        duration: LOADING_HEX_REVEAL_MS,
        easing: ReanimatedEasing.out(ReanimatedEasing.cubic),
      }),
    );
    pulse.value = withDelay(
      delayMs + LOADING_HEX_REVEAL_MS,
      withRepeat(
        withSequence(
          withTiming(1, {
            duration: LOADING_HEX_PULSE_HALF_CYCLE_MS,
            easing: ReanimatedEasing.inOut(ReanimatedEasing.cubic),
          }),
          withTiming(0, {
            duration: LOADING_HEX_PULSE_HALF_CYCLE_MS,
            easing: ReanimatedEasing.inOut(ReanimatedEasing.cubic),
          }),
        ),
        -1,
      ),
    );
    return () => {
      cancelAnimation(progress);
      cancelAnimation(pulse);
    };
  }, [delayMs, progress, pulse, reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 0.12 + progress.value * 0.5 + pulse.value * 0.16,
    transform: [{ scale: 0.88 + progress.value * 0.12 + pulse.value * 0.028 }],
  }));
  const hexColors = getHeatMapLoadingHexColors(theme, index, colors);

  return (
    <Reanimated.View
      testID={`heat-map-loading-hex-${index}`}
      accessible={false}
      style={[{ width, height }, animatedStyle]}
    >
      <Svg width={width} height={height} viewBox="0 0 100 86.6" style={StyleSheet.absoluteFill}>
        <Polygon
          points="1,43.3 25,1 75,1 99,43.3 75,85.6 25,85.6"
          fill={hexColors.fill}
          fillOpacity={0.88}
          stroke={hexColors.stroke}
          strokeOpacity={0.9}
          strokeWidth={theme === 'standard' ? '1.5' : '1.8'}
        />
        <Polygon
          points="7,43.3 28,7 72,7 93,43.3 72,79.6 28,79.6"
          fill="none"
          stroke={hexColors.inset}
          strokeOpacity={theme === 'standard' ? '0.48' : '0.72'}
          strokeWidth="0.9"
        />
        <Polygon
          points="17,43.3 32,17.3 68,17.3 83,43.3 68,69.3 32,69.3"
          fill="none"
          stroke={hexColors.glint}
          strokeOpacity="0.42"
          strokeWidth="0.7"
        />
      </Svg>
    </Reanimated.View>
  );
}

function HeatMapLoadingState({ contentWidth, tileWidth, tileHeight, colors, theme, reduceMotion }: {
  contentWidth: number;
  tileWidth: number;
  tileHeight: number;
  colors: ReturnType<typeof useColors>;
  theme: HeatMapLoadingTheme;
  reduceMotion: boolean;
}) {
  const layout = useMemo(
    () => layoutHoneycomb(LOADING_HEX_COUNT, contentWidth, tileWidth),
    [contentWidth, tileWidth],
  );
  const delays = useMemo(
    () => getHeatMapLoadingDelays(layout.positions.length),
    [layout.positions.length],
  );
  const themeAccent = theme === 'neonGucci' ? colors.buyColor : colors.gold;
  const panelBackground = theme === 'patriot'
    ? colors.steelShadow
    : theme === 'neonGucci'
      ? colors.background
      : colors.card;
  const panelBorder = theme === 'standard' ? colors.border : colors.goldMuted;
  const scanLabel = theme === 'patriot'
    ? 'PATRIOT MODE · STEEL SCAN'
    : theme === 'neonGucci'
      ? 'NEON GUCCI · LIVE SCAN'
      : 'LIVE MARKET SCAN';

  return (
    <View
      testID="heat-map-loading-state"
      style={[
        styles.loadingPanel,
        {
          backgroundColor: panelBackground,
          borderColor: panelBorder,
          borderWidth: theme === 'standard' ? 1 : 1.5,
        },
      ]}
    >
      <View style={[styles.loadingTrim, { backgroundColor: themeAccent }]} />
      <Text style={[styles.loadingKicker, { color: themeAccent }]}>{scanLabel}</Text>
      <View style={styles.loadingHeader}>
        <MaterialCommunityIcons name="chart-timeline-variant" size={19} color={themeAccent} accessible={false} />
        <Text accessibilityRole="header" style={[styles.loadingTitle, { color: colors.foreground }]}>
          Loading selected market
        </Text>
      </View>
      <View
        style={[styles.loadingHoneycomb, { width: contentWidth, height: layout.height }]}
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {layout.positions.map((position) => (
          <View
            key={position.index}
            style={{
              position: 'absolute',
              left: position.left,
              top: position.top,
            }}
          >
            <LoadingHexagon
              index={position.index}
              width={tileWidth}
              height={tileHeight}
              delayMs={delays[position.index] ?? 0}
              colors={colors}
              theme={theme}
              reduceMotion={reduceMotion}
            />
          </View>
        ))}
      </View>
      <Text style={[styles.stateCopy, { color: colors.mutedForeground }]}>
        Preparing one quote batch for this category and return window.
      </Text>
    </View>
  );
}

export default function HeatMapScreen() {
  const colors = useColors();
  const { awardAchievement } = useAchievements();
  const themeState = useContext(AmericanModeContext);
  const loadingTheme = getHeatMapLoadingTheme(
    themeState?.isActive ?? false,
    themeState?.neonGucciActive ?? false,
  );
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width: viewportWidth } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const scrollGesture = useMemo(() => Gesture.Native(), []);
  const [category, setCategory] = useState<GetMarketHeatMapCategory>('stocks');
  const [period, setPeriod] = useState<GetMarketHeatMapPeriod>('1d');
  const [customSymbols, setCustomSymbols] = useState<string[]>([]);
  const [storageReady, setStorageReady] = useState(false);
  const [storageLoadError, setStorageLoadError] = useState<'read' | 'malformed' | null>(null);
  const [isResettingSavedTickers, setIsResettingSavedTickers] = useState(false);
  const [isEditingCustomMap, setIsEditingCustomMap] = useState(false);
  const [removingSymbol, setRemovingSymbol] = useState<string | null>(null);
  const [customReorderAnnouncement, setCustomReorderAnnouncement] = useState('');
  const [draggingSymbol, setDraggingSymbol] = useState<string | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const customSymbolsRef = useRef(customSymbols);
  const persistedCustomSymbolsRef = useRef<string[]>([]);
  const customSymbolsWriteQueue = useRef<Promise<void>>(Promise.resolve());
  const dragVisibleSymbolsRef = useRef<string[]>([]);
  const draggedSymbolRef = useRef<string | null>(null);
  customSymbolsRef.current = customSymbols;
  const [lastRemovedTicker, setLastRemovedTicker] = useState<{ symbol: string; index: number } | null>(null);
  const [symbolInput, setSymbolInput] = useState('');
  const [customAssetType, setCustomAssetType] = useState<CustomHeatMapAssetType>('stocks');
  const [selectedCustomAssetSymbols, setSelectedCustomAssetSymbols] = useState<string[]>([]);
  const [isAddingSelectedAssets, setIsAddingSelectedAssets] = useState(false);
  const [debouncedSymbolSearch, setDebouncedSymbolSearch] = useState('');
  const [formError, setFormError] = useState('');
  const [customBatchFeedback, setCustomBatchFeedback] = useState<{
    message: string;
    kind: 'success' | 'error';
  } | null>(null);
  const [nowSeconds, setNowSeconds] = useState(() => Date.now() / 1000);
  const [filters, setFilters] = useState<HeatMapFilters>(EMPTY_FILTERS);
  const [draftFilters, setDraftFilters] = useState<HeatMapFilters>(EMPTY_FILTERS);
  const [returnSort, setReturnSort] = useState<HeatMapReturnSort>('default');
  const [draftReturnSort, setDraftReturnSort] = useState<HeatMapReturnSort>('default');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const watchlist = useWatchlist();
  const [selectedQuote, setSelectedQuote] = useState<HeatMapQuote | null>(null);
  const [selectedUnavailableCommodity, setSelectedUnavailableCommodity] = useState<{ symbol: string; name: string } | null>(null);
  const [restoreDetailWithoutAnimation, setRestoreDetailWithoutAnimation] = useState(false);
  const detailReturnRef = useRef<{
    quote: HeatMapQuote | null;
    unavailableCommodity: { symbol: string; name: string } | null;
  } | null>(null);
  const directionPulse = useRef(new Animated.Value(0)).current;
  const removeInProgress = useRef(false);
  const customStorageReadId = useRef(0);
  const lastScheduledOpenRefresh = useRef<string | null>(null);
  const heatMapRefreshInFlight = useRef(false);
  const dismissDetailForNavigation = useCallback(() => {
    detailReturnRef.current = {
      quote: selectedQuote,
      unavailableCommodity: selectedUnavailableCommodity,
    };
    setRestoreDetailWithoutAnimation(false);
    setSelectedQuote(null);
    setSelectedUnavailableCommodity(null);
  }, [selectedQuote, selectedUnavailableCommodity]);
  useFocusEffect(useCallback(() => {
    const returnDetail = detailReturnRef.current;
    if (!returnDetail) return;
    detailReturnRef.current = null;
    setRestoreDetailWithoutAnimation(true);
    setSelectedQuote(returnDetail.quote);
    setSelectedUnavailableCommodity(returnDetail.unavailableCommodity);
  }, []));
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
  const instrumentSearchEnabled = category === 'custom' && debouncedSymbolSearch.length >= 2;
  const etfSearchParams = { q: debouncedSymbolSearch, category: 'etfs' as const };
  const commoditySearchParams = { q: debouncedSymbolSearch, category: 'commodities' as const };
  const futuresSearchParams = { q: debouncedSymbolSearch, category: 'futures' as const };
  const cryptoSearchParams = { q: debouncedSymbolSearch, category: 'cryptocurrency' as const };
  const etfSearch = useSearchHeatMapInstruments(etfSearchParams, {
    query: {
      queryKey: getSearchHeatMapInstrumentsQueryKey(etfSearchParams),
      enabled: instrumentSearchEnabled,
      staleTime: 45_000,
    },
  });
  const commoditySearch = useSearchHeatMapInstruments(commoditySearchParams, {
    query: {
      queryKey: getSearchHeatMapInstrumentsQueryKey(commoditySearchParams),
      enabled: instrumentSearchEnabled,
      staleTime: 45_000,
    },
  });
  const futuresSearch = useSearchHeatMapInstruments(futuresSearchParams, {
    query: {
      queryKey: getSearchHeatMapInstrumentsQueryKey(futuresSearchParams),
      enabled: instrumentSearchEnabled,
      staleTime: 45_000,
    },
  });
  const cryptoSearch = useSearchHeatMapInstruments(cryptoSearchParams, {
    query: {
      queryKey: getSearchHeatMapInstrumentsQueryKey(cryptoSearchParams),
      enabled: instrumentSearchEnabled,
      staleTime: 45_000,
    },
  });

  useEffect(() => {
    const interval = setInterval(() => setNowSeconds(Date.now() / 1000), 60_000);
    return () => clearInterval(interval);
  }, []);
  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSymbolSearch(symbolInput.trim()), 300);
    return () => clearTimeout(timeout);
  }, [symbolInput]);
  const loadSavedCustomSymbols = useCallback(async () => {
    const readId = ++customStorageReadId.current;
    setStorageReady(false);
    try {
      const value = await AsyncStorage.getItem(STORAGE_KEY);
      let symbols: string[] = [];
      let malformed = false;
      if (value !== null) {
        try {
          const parsed: unknown = JSON.parse(value);
          if (Array.isArray(parsed)) symbols = normalizeCustomHeatMapSymbols(parsed);
          else malformed = true;
        } catch {
          malformed = true;
        }
      }
      if (readId !== customStorageReadId.current) return;
      customSymbolsRef.current = malformed ? [] : symbols;
      persistedCustomSymbolsRef.current = malformed ? [] : symbols;
      setCustomSymbols(malformed ? [] : symbols);
      setStorageLoadError(malformed ? 'malformed' : null);
      setFormError('');
      if (!malformed) awardCustomMapMilestones(symbols.length);
    } catch {
      if (readId !== customStorageReadId.current) return;
      setStorageLoadError('read');
    } finally {
      if (readId === customStorageReadId.current) setStorageReady(true);
    }
  }, []);
  useEffect(() => {
    void loadSavedCustomSymbols();
    return () => { customStorageReadId.current += 1; };
  }, [loadSavedCustomSymbols]);

  const requestedSector: GetMarketHeatMapSector | null = category === 'stocks'
    && filters.sector !== 'Unknown'
    && STOCK_SECTORS.includes(filters.sector as GetMarketHeatMapSector)
    ? filters.sector as GetMarketHeatMapSector
    : null;
  const canUseFastSnapshot = category === 'stocks' && period === '1d' && requestedSector === null;
  const marketBreadthQuery = useGetMarketBreadth({
    query: {
      queryKey: getGetMarketBreadthQueryKey(),
      enabled: canUseFastSnapshot,
      staleTime: 45_000,
      refetchInterval: 60_000,
      refetchIntervalInBackground: false,
    },
  });
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
  const instrumentSearchStates = [
    { query: etfSearch, params: etfSearchParams },
    { query: commoditySearch, params: commoditySearchParams },
    { query: futuresSearch, params: futuresSearchParams },
    { query: cryptoSearch, params: cryptoSearchParams },
  ].map(({ query }) => ({
    query,
    isCurrent: isCustomSearchInput && isStockSearchCurrent({
      input: searchText,
      settledQuery: debouncedSymbolSearch,
      resultQuery: getStockSearchQueryFromKey(query.queryKey),
      isPlaceholderData: query.isPlaceholderData,
    }),
  }));
  const isCurrentCustomInstrumentSearch = isCustomSearchInput
    && instrumentSearchStates.every(({ isCurrent }) => isCurrent);
  const customInstrumentSuggestions: HeatMapInstrumentSuggestion[] = instrumentSearchStates
    .flatMap(({ query, isCurrent }) => isCurrent ? query.data ?? [] : []);
  const instrumentSearchIsFetching = !isCurrentCustomInstrumentSearch
    || instrumentSearchStates.some(({ query }) => query.isFetching);
  const instrumentSearchHasError = isCurrentCustomInstrumentSearch
    && instrumentSearchStates.some(({ query }) => query.isError);
  const instrumentSearchHasNoSuccess = isCurrentCustomInstrumentSearch
    && instrumentSearchStates.every(({ query }) => query.isError);
  const instrumentSearchIsSettled = isCurrentCustomInstrumentSearch
    && instrumentSearchStates.every(({ query }) => !query.isFetching);
  const customAssetChoices = searchText.length > 0
    ? searchCustomHeatMapAssets(searchText)
    : customAssetType === 'stocks'
      ? []
      : CUSTOM_HEAT_MAP_ASSETS[customAssetType].map((asset) => ({ asset, assetType: customAssetType }));
  const visibleInstrumentSuggestions = customInstrumentSuggestions.filter(
    (suggestion) => !customAssetChoices.some(({ asset }) => asset.symbol === suggestion.symbol),
  );
  const params = useMemo(() => ({
    category,
    period,
    ...(category === 'custom' ? { symbols: customSymbols } : {}),
    ...(requestedSector ? { sector: requestedSector } : {}),
  }), [category, period, customSymbols, requestedSector]);
  const queryKeyParams = useMemo(() => category === 'custom'
    ? { ...params, symbols: [...customSymbols].sort() }
    : params, [category, customSymbols, params]);
  const mapQuery = useGetMarketHeatMap(params, {
    query: {
      enabled: category !== 'custom' || (storageReady && customSymbols.length > 0),
      queryKey: getGetMarketHeatMapQueryKey(queryKeyParams),
    },
  });
  const mapQueryRefetch = useRef(mapQuery.refetch);
  mapQueryRefetch.current = mapQuery.refetch;
  const refetchHeatMap = useCallback(async () => {
    if (heatMapRefreshInFlight.current) return null;
    heatMapRefreshInFlight.current = true;
    try {
      return await mapQueryRefetch.current();
    } finally {
      heatMapRefreshInFlight.current = false;
    }
  }, []);

  const fullResponseMatches = heatMapResponseMatchesSelection(
    mapQuery.data,
    category,
    period,
    category === 'custom' ? customSymbols : undefined,
    requestedSector,
  );
  const breadthSnapshotQuotes = (marketBreadthQuery.data?.quotes ?? [])
    .filter((quote) => isDisplayableHeatMapQuote(quote, nowSeconds));
  const showingBreadthSnapshot = !fullResponseMatches && canUseFastSnapshot
    && hasUsableHeatMapPerformanceSnapshot(breadthSnapshotQuotes);
  const response = fullResponseMatches
    ? mapQuery.data
    : showingBreadthSnapshot
      ? marketBreadthQuery.data
      : undefined;
  const responseMatches = heatMapResponseMatchesSelection(
    response,
    category,
    period,
    category === 'custom' ? customSymbols : undefined,
    requestedSector,
  );
  const responseUpdatedAtRef = useRef(response?.updatedAt);
  responseUpdatedAtRef.current = response?.updatedAt;
  const sourceQuotes = responseMatches ? uniqueHeatMapQuotesBySymbol(response!.quotes) : [];
  const scheduledRegularOpenTimestamp = responseMatches
    ? getHeatMapRegularOpenRefreshTimestamp(sourceQuotes)
    : null;
  const scheduledOpenRefreshKey = scheduledRegularOpenTimestamp === null
    ? null
    : `${JSON.stringify(params)}:${scheduledRegularOpenTimestamp}`;
  const shouldRefreshOnForegroundCadence = responseMatches
    && shouldRefreshHeatMapOnForegroundCadence(category, sourceQuotes);
  useFocusEffect(useCallback(() => {
    if (!shouldRefreshOnForegroundCadence) return;

    let isFocused = true;
    let appIsActive = AppState?.currentState !== 'background' && AppState?.currentState !== 'inactive';
    let interval: ReturnType<typeof setInterval> | null = null;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;
    const isCryptoCategory = category === 'cryptocurrency';
    const stopRetry = () => {
      if (retryTimeout === null) return;
      clearTimeout(retryTimeout);
      retryTimeout = null;
    };
    const refresh = (allowRetry = isCryptoCategory) => {
      if (!isFocused || !appIsActive) return;
      void (async () => {
        try {
          const result = await refetchHeatMap();
          if (result === null || !result.isError) return;
        } catch {
          // Crypto refreshes allow one delayed retry for resolved and thrown failures.
        }
        if (!isCryptoCategory || !allowRetry || !isFocused || !appIsActive || retryTimeout !== null) return;
        retryTimeout = setTimeout(() => {
          retryTimeout = null;
          refresh(false);
        }, SCHEDULED_OPEN_REFRESH_RETRY_DELAY_MS);
      })();
    };
    const startInterval = () => {
      if (interval !== null) return;
      const intervalMs = isCryptoCategory
        ? HEAT_MAP_CRYPTO_REFRESH_INTERVAL_MS
        : HEAT_MAP_REGULAR_SESSION_REFRESH_INTERVAL_MS;
      interval = setInterval(() => refresh(), intervalMs);
    };
    const stopInterval = () => {
      if (interval === null) return;
      clearInterval(interval);
      interval = null;
    };
    const appStateSubscription = AppState?.addEventListener?.('change', (nextState) => {
      const wasActive = appIsActive;
      appIsActive = nextState === 'active';
      if (!appIsActive) {
        stopInterval();
        stopRetry();
        return;
      }
      startInterval();
      if (wasActive) return;
      if (!isCryptoCategory) {
        refresh();
        return;
      }

      const resumedAtSeconds = Date.now() / 1000;
      setNowSeconds(resumedAtSeconds);
      if (shouldRefreshCryptoHeatMapOnResume(category, responseUpdatedAtRef.current, resumedAtSeconds)) {
        refresh();
      }
    });
    if (appIsActive) startInterval();

    return () => {
      isFocused = false;
      stopInterval();
      stopRetry();
      appStateSubscription?.remove();
    };
  }, [category, shouldRefreshOnForegroundCadence, refetchHeatMap]));
  useFocusEffect(useCallback(() => {
    if (
      scheduledRegularOpenTimestamp === null ||
      scheduledOpenRefreshKey === null ||
      lastScheduledOpenRefresh.current === scheduledOpenRefreshKey
    ) {
      return;
    }

    let isActive = true;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;
    const refreshAt = scheduledRegularOpenTimestamp * 1000 + 1_500;
    const retryOnceIfFailed = (allowRetry: boolean) => {
      void (async () => {
        try {
          const result = await refetchHeatMap();
          if (result === null) return;
          if (!result.isError) return;
        } catch {
          // Some query configurations reject instead of returning an error result.
        }
        if (!allowRetry || !isActive) return;
        retryTimeout = setTimeout(() => {
          if (!isActive) return;
          retryOnceIfFailed(false);
        }, SCHEDULED_OPEN_REFRESH_RETRY_DELAY_MS);
      })();
    };
    const refreshOnce = () => {
      if (lastScheduledOpenRefresh.current === scheduledOpenRefreshKey) return;
      lastScheduledOpenRefresh.current = scheduledOpenRefreshKey;
      retryOnceIfFailed(true);
    };
    const timeout = setTimeout(refreshOnce, Math.max(0, refreshAt - Date.now()));
    const appStateSubscription = AppState?.addEventListener?.('change', (nextState) => {
      if (nextState !== 'active') return;
      const resumedAt = Date.now();
      setNowSeconds(resumedAt / 1000);
      if (resumedAt >= refreshAt) refreshOnce();
    });
    return () => {
      isActive = false;
      clearTimeout(timeout);
      if (retryTimeout !== null) clearTimeout(retryTimeout);
      appStateSubscription?.remove();
    };
  }, [scheduledRegularOpenTimestamp, scheduledOpenRefreshKey, refetchHeatMap]));
  const staleQuotes = sourceQuotes.filter((quote) => !isDisplayableHeatMapQuote(quote, nowSeconds));
  const validAgeQuotes = sourceQuotes.filter((quote) => isDisplayableHeatMapQuote(quote, nowSeconds));
  const selectedQuoteFromBatch = selectedQuote && responseMatches && !mapQuery.isError
    ? validAgeQuotes.find((quote) => quote.symbol.toUpperCase() === selectedQuote.symbol.toUpperCase()) ?? null
    : null;
  const selectedQuoteUnavailable = selectedQuote !== null
    && responseMatches
    && !mapQuery.isError
    && selectedQuoteFromBatch === null;
  useEffect(() => {
    if (!selectedQuoteFromBatch) return;
    setSelectedQuote((current) => current?.symbol.toUpperCase() === selectedQuoteFromBatch.symbol.toUpperCase()
      ? selectedQuoteFromBatch
      : current);
  }, [selectedQuote?.symbol, selectedQuoteFromBatch]);
  const marketStatus = getHeatMapMarketStatus(validAgeQuotes);
  const marketStatusColor = marketStatus === 'closed'
    ? colors.sellColor
    : marketStatus === 'mixed'
      ? colors.primary
      : marketStatus === 'unknown'
        ? colors.mutedForeground
        : colors.buyColor;
  const marketStatusBackground = marketStatus === 'closed'
    ? colors.sellBg
    : marketStatus === 'mixed'
      ? colors.accent
      : marketStatus === 'unknown'
        ? colors.secondary
        : colors.buyBg;
  const showMarketStatus = SHARED_MARKET_STATUS_CATEGORIES.has(category) && validAgeQuotes.length > 0;
  const unavailableSymbols = [...new Set([
    ...(responseMatches ? response!.unavailableSymbols : []),
    ...staleQuotes.map((quote) => quote.symbol),
  ])];
  const freshQuoteSymbols = new Set(validAgeQuotes.map((quote) => quote.symbol));
  const catalogAssetBySymbol = new Map(
    Object.values(CUSTOM_HEAT_MAP_ASSETS).flat().map((asset) => [asset.symbol, asset]),
  );
  const unavailableMapAssets = responseMatches && category === 'commodities'
    ? CUSTOM_HEAT_MAP_ASSETS.commodities.filter((asset) => !freshQuoteSymbols.has(asset.symbol))
    : responseMatches && category === 'custom'
      ? customSymbols
        .filter((symbol) => !freshQuoteSymbols.has(symbol))
        .map((symbol) => ({ symbol, name: catalogAssetBySymbol.get(symbol)?.name ?? symbol }))
      : [];

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
  const sortedQuotes = useMemo(
    () => sortHeatMapQuotesByReturn(filterableQuotes, returnSort),
    [filterableQuotes, returnSort],
  );
  const toneColor = summary.tone === 'HOT' ? colors.buyColor : summary.tone === 'COLD' ? colors.sellColor : colors.holdColor;
  const averageReturnColor = summary.averageReturn === null
    ? colors.mutedForeground
    : summary.averageReturn > 0.25
      ? colors.buyColor
      : summary.averageReturn < -0.25
        ? colors.sellColor
        : colors.holdColor;
  const averageReturnLabel = summary.averageReturn === null
    ? '—'
    : `${summary.averageReturn > 0 ? '+' : ''}${summary.averageReturn.toFixed(2)}%`;
  const directionalLabel = summary.tone === 'HOT' ? 'Market direction rising' : summary.tone === 'COLD' ? 'Market direction falling' : 'Market direction sideways';
  const directionalWord = summary.tone === 'HOT' ? 'Rising' : summary.tone === 'COLD' ? 'Falling' : 'Sideways';
  const directionScale = directionPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
  const activeFilterCount = countActiveHeatMapFilters(filters) + Number(returnSort !== 'default');
  const draftSelectionCount = countActiveHeatMapFilters(draftFilters) + Number(draftReturnSort !== 'default');

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
    if (returnSort !== 'default') {
      return [{
        name: returnSort === 'highest' ? 'Highest returns' : 'Lowest returns',
        quotes: sortedQuotes,
      }];
    }
    if (category === 'custom') {
      const order = new Map(customSymbols.map((symbol, index) => [symbol, index]));
      return [{
        name: '',
        quotes: [...filterableQuotes].sort(
          (left, right) => (order.get(left.symbol) ?? Number.MAX_SAFE_INTEGER)
            - (order.get(right.symbol) ?? Number.MAX_SAFE_INTEGER),
        ),
      }];
    }
    if (category !== 'stocks') return [{ name: '', quotes: filterableQuotes }];
    const grouped = new Map<string, HeatMapQuote[]>();
    filterableQuotes.forEach((quote) => {
      const sector = quote.sector?.trim() || 'Unknown';
      grouped.set(sector, [...(grouped.get(sector) ?? []), quote]);
    });
    return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, items]) => ({ name, quotes: items }));
  }, [category, customSymbols, filterableQuotes, returnSort, sortedQuotes]);
  const tileSymbols = useMemo(
    () => sectors.flatMap((group) => group.quotes.map((quote) => quote.symbol)),
    [sectors],
  );
  const tileSymbolKey = tileSymbols.join('\u0000');
  const revealDelayBySymbol = useMemo(() => {
    const symbols = tileSymbolKey ? tileSymbolKey.split('\u0000') : [];
    const delays = getHeatMapRevealDelays(symbols.length, HEX_REVEAL_SPREAD_MS);
    return new Map(symbols.map((symbol, index) => [symbol, delays[index] ?? 0]));
  }, [tileSymbolKey]);
  const editFallbackSymbols = category === 'custom' && isEditingCustomMap && !responseMatches
    ? customSymbols
    : [];

  const contentWidth = Math.max(0, viewportWidth - 36);
  const tileWidth = getHeatMapTileWidth(contentWidth);
  const tileHeight = tileWidth * Math.sqrt(3) / 2;
  const unavailableLayout = layoutHoneycomb(unavailableMapAssets.length, contentWidth, tileWidth);
  const honeycombLayouts = useMemo(
    () => sectors.map((group) => layoutHoneycomb(group.quotes.length, contentWidth, tileWidth)),
    [contentWidth, sectors, tileWidth],
  );
  const honeycombSymbolLists = useMemo(
    () => sectors.map((group) => group.quotes.map((quote) => quote.symbol)),
    [sectors],
  );
  const canAddCustomSymbol = storageReady
    && !storageLoadError
    && Boolean(symbolInput.trim())
    && !validateSymbol.isPending
    && customSymbols.length < MAX_CUSTOM_HEAT_MAP_SYMBOLS;

  function enqueueSymbolsWrite(next: string[]) {
    const write = customSymbolsWriteQueue.current
      .catch(() => undefined)
      .then(async () => {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        persistedCustomSymbolsRef.current = next;
      });
    customSymbolsWriteQueue.current = write;
    return write;
  }
  async function persistSymbols(next: string[]) {
    await enqueueSymbolsWrite(next);
    customSymbolsRef.current = next;
    setCustomSymbols(next);
    setFormError('');
  }
  const startCustomMapDrag = useCallback((symbol: string, visibleSymbols: string[], index: number) => {
    if (removeInProgress.current || draggedSymbolRef.current) return;
    draggedSymbolRef.current = symbol;
    dragVisibleSymbolsRef.current = visibleSymbols;
    setDraggingSymbol(symbol);
    setDropTargetIndex(index);
  }, []);
  const updateCustomMapDragTarget = useCallback((symbol: string, index: number) => {
    if (draggedSymbolRef.current !== symbol) return;
    setDropTargetIndex(index);
  }, []);
  const finishCustomMapDrag = useCallback((symbol: string, index: number) => {
    if (draggedSymbolRef.current !== symbol) return;
    const visibleSymbols = dragVisibleSymbolsRef.current;
    const currentSymbols = customSymbolsRef.current;
    draggedSymbolRef.current = null;
    dragVisibleSymbolsRef.current = [];
    setDraggingSymbol(null);
    setDropTargetIndex(null);

    const reorderedVisible = swapCustomHeatMapSymbolWithIndex(visibleSymbols, symbol, index);
    if (reorderedVisible === visibleSymbols) return;
    const nextSymbols = mergeReorderedSubset(currentSymbols, reorderedVisible);
    if (nextSymbols.every((item, itemIndex) => item === currentSymbols[itemIndex])) return;

    setFormError('');
    customSymbolsRef.current = nextSymbols;
    setCustomSymbols(nextSymbols);
    setLastRemovedTicker(null);
    const announcement = `${symbol} moved to position ${nextSymbols.indexOf(symbol) + 1} of ${nextSymbols.length}.`;
    setCustomReorderAnnouncement(announcement);
    if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(announcement);
    void enqueueSymbolsWrite(nextSymbols).catch(() => {
      if (customSymbolsRef.current !== nextSymbols) return;
      const persistedSymbols = [...persistedCustomSymbolsRef.current];
      customSymbolsRef.current = persistedSymbols;
      setCustomSymbols(persistedSymbols);
      setFormError(`Couldn't reorder ${symbol} on this device. Try again.`);
    });
  }, []);
  function awardCustomMapMilestones(count: number) {
    if (count >= 1) void awardAchievement('first-custom-instrument');
    if (count >= 5) void awardAchievement('custom-map-5');
    if (count >= 10) void awardAchievement('custom-map-10');
  }
  async function resetMalformedSavedTickers() {
    if (!storageReady || storageLoadError !== 'malformed' || isResettingSavedTickers) return;
    setIsResettingSavedTickers(true);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([]));
      customSymbolsRef.current = [];
      persistedCustomSymbolsRef.current = [];
      setCustomSymbols([]);
      setStorageLoadError(null);
      setFormError('');
      setLastRemovedTicker(null);
      setIsEditingCustomMap(false);
    } catch {
      setFormError("Couldn't reset saved tickers on this device. Try again.");
    } finally {
      setIsResettingSavedTickers(false);
    }
  }
  async function addSymbol(rawSymbol = symbolInput) {
    const symbol = rawSymbol.trim().toUpperCase();
    if (!symbol) return;
    if (validateSymbol.isPending || isAddingSelectedAssets) return;
    setCustomBatchFeedback(null);
    if (customSymbols.includes(symbol)) { setFormError(`${symbol} is already in your map.`); return; }
    if (customSymbols.length >= MAX_CUSTOM_HEAT_MAP_SYMBOLS) {
      setFormError(`A custom map can contain at most ${MAX_CUSTOM_HEAT_MAP_SYMBOLS} tickers.`); return;
    }
    setFormError('');
    setSymbolInput(symbol);
    Keyboard.dismiss();
    if (isSupportedCustomMapCommoditySymbol(symbol)) {
      const next = appendCustomHeatMapSymbolInSavedOrder(customSymbols, symbol);
      try { await persistSymbols(next); }
      catch { setFormError(`Couldn't save ${symbol} on this device. Try again.`); return; }
      awardCustomMapMilestones(next.length);
      setLastRemovedTicker(null);
      setSymbolInput('');
      setCustomBatchFeedback({ message: `Added ${symbol} to your custom map.`, kind: 'success' });
      return;
    }
    try {
      const quote = await validateSymbol.mutateAsync({ data: { symbol } });
      if (!customSymbols.includes(quote.symbol)) {
        const next = appendCustomHeatMapSymbolInSavedOrder(customSymbols, quote.symbol);
        try { await persistSymbols(next); }
        catch { setFormError(`Couldn't save ${quote.symbol} on this device. Try again.`); return; }
        awardCustomMapMilestones(next.length);
        setLastRemovedTicker(null);
      }
      setSymbolInput('');
    } catch (error) {
      setFormError(`${symbol}: ${getCustomHeatMapValidationFailureReason(error)} It wasn't added.`);
    }
  }
  function toggleCustomAssetSelection(symbol: string) {
    setCustomBatchFeedback(null);
    setFormError('');
    if (selectedCustomAssetSymbols.includes(symbol)) {
      setSelectedCustomAssetSymbols((current) => current.filter((item) => item !== symbol));
      return;
    }
    if (customSymbols.length + selectedCustomAssetSymbols.length >= MAX_CUSTOM_HEAT_MAP_SYMBOLS) {
      setFormError(`A custom map can contain at most ${MAX_CUSTOM_HEAT_MAP_SYMBOLS} tickers.`);
      return;
    }
    setSelectedCustomAssetSymbols((current) => [...current, symbol]);
  }
  async function addSelectedCustomAssets() {
    if (isAddingSelectedAssets || !storageReady || storageLoadError || selectedCustomAssetSymbols.length === 0) return;
    setCustomBatchFeedback(null);
    const plan = planCustomHeatMapBatchAdd(customSymbols, selectedCustomAssetSymbols);
    if (plan.symbolsToAdd.length === 0) {
      setSelectedCustomAssetSymbols([]);
      setFormError(plan.alreadyAddedCount
        ? 'Those instruments are already in your map.'
        : `A custom map can contain at most ${MAX_CUSTOM_HEAT_MAP_SYMBOLS} tickers.`);
      return;
    }

    setIsAddingSelectedAssets(true);
    setFormError('');
    Keyboard.dismiss();
    let nextSymbols = [...customSymbols];
    const addedSymbols: string[] = [];
    const failedInstruments: { symbol: string; reason: string }[] = [];
    let alreadyAddedCount = plan.alreadyAddedCount;
    let overLimitCount = plan.overLimitCount;
    try {
      for (const symbol of plan.symbolsToAdd) {
        try {
          const normalizedSymbol = isSupportedCustomMapCommoditySymbol(symbol)
            ? symbol.trim().toUpperCase()
            : (await validateSymbol.mutateAsync({ data: { symbol } })).symbol;
          if (nextSymbols.includes(normalizedSymbol)) {
            alreadyAddedCount += 1;
          } else if (nextSymbols.length >= MAX_CUSTOM_HEAT_MAP_SYMBOLS) {
            overLimitCount += 1;
          } else {
            nextSymbols = appendCustomHeatMapSymbolInSavedOrder(nextSymbols, normalizedSymbol);
            addedSymbols.push(normalizedSymbol);
          }
        } catch (error) {
          failedInstruments.push({
            symbol,
            reason: getCustomHeatMapValidationFailureReason(error),
          });
        }
      }

      if (addedSymbols.length > 0) {
        try {
          await persistSymbols(nextSymbols);
        } catch {
          setFormError("Couldn't save the selected instruments on this device. Try again.");
          return;
        }
        awardCustomMapMilestones(nextSymbols.length);
        setLastRemovedTicker(null);
      }

      setSelectedCustomAssetSymbols(failedInstruments.map(({ symbol }) => symbol));
      const feedback = [
        addedSymbols.length > 0 ? `Added ${addedSymbols.length} instrument${addedSymbols.length === 1 ? '' : 's'}.` : '',
        alreadyAddedCount > 0 ? `Skipped ${alreadyAddedCount} already in your map.` : '',
        overLimitCount > 0 ? `Skipped ${overLimitCount}; the map limit is ${MAX_CUSTOM_HEAT_MAP_SYMBOLS}.` : '',
        failedInstruments.length > 0
          ? `Couldn't add:\n${failedInstruments.map(({ symbol, reason }) => `${symbol}: ${reason}`).join('\n')}`
          : '',
      ].filter(Boolean).join('\n');
      if (feedback) {
        setCustomBatchFeedback({
          message: feedback,
          kind: failedInstruments.length > 0 || (addedSymbols.length === 0 && overLimitCount > 0) ? 'error' : 'success',
        });
      }
    } finally {
      setIsAddingSelectedAssets(false);
    }
  }
  async function removeSymbol(symbol: string) {
    if (removeInProgress.current) return;
    const { symbols: next, removedIndex } = removeCustomHeatMapSymbolFromSavedOrder(customSymbols, symbol);
    if (removedIndex === -1) return;
    removeInProgress.current = true;
    setRemovingSymbol(symbol);
    try {
      await persistSymbols(next);
      setLastRemovedTicker({ symbol, index: removedIndex });
      if (next.length === 0) setIsEditingCustomMap(false);
    }
    catch { setFormError(`Couldn't remove ${symbol} from this device. Try again.`); }
    finally {
      removeInProgress.current = false;
      setRemovingSymbol(null);
    }
  }
  async function moveSymbol(symbol: string, direction: 'up' | 'down') {
    if (removeInProgress.current) return;
    const next = moveCustomHeatMapSymbol(customSymbols, symbol, direction);
    if (next === customSymbols) return;
    removeInProgress.current = true;
    setRemovingSymbol(symbol);
    try {
      await persistSymbols(next);
      setLastRemovedTicker(null);
      const announcement = `${symbol} moved to position ${next.indexOf(symbol) + 1} of ${next.length}.`;
      setCustomReorderAnnouncement(announcement);
      if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(announcement);
    } catch {
      setFormError(`Couldn't reorder ${symbol} on this device. Try again.`);
    } finally {
      removeInProgress.current = false;
      setRemovingSymbol(null);
    }
  }
  async function restoreLastRemovedTicker() {
    if (!lastRemovedTicker || removeInProgress.current) return;
    if (customSymbols.includes(lastRemovedTicker.symbol)) {
      setLastRemovedTicker(null);
      return;
    }
    if (customSymbols.length >= MAX_CUSTOM_HEAT_MAP_SYMBOLS) {
      setFormError(`There's no room to restore ${lastRemovedTicker.symbol}. Remove another ticker first.`);
      return;
    }
    removeInProgress.current = true;
    setRemovingSymbol(lastRemovedTicker.symbol);
    const next = [...customSymbols];
    next.splice(Math.min(lastRemovedTicker.index, next.length), 0, lastRemovedTicker.symbol);
    try {
      await persistSymbols(next);
      setLastRemovedTicker(null);
      setIsEditingCustomMap(true);
    } catch {
      setFormError(`Couldn't restore ${lastRemovedTicker.symbol} on this device. Try again.`);
    } finally {
      removeInProgress.current = false;
      setRemovingSymbol(null);
    }
  }
  function selectCategory(nextCategory: GetMarketHeatMapCategory) {
    setCategory(nextCategory);
    setIsEditingCustomMap(false);
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
  const busy = !responseMatches || (category === 'custom' && !storageReady);

  return (
    <AmericanSteelBackground>
      <View style={styles.screen}>
        <GestureDetector gesture={scrollGesture}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            scrollEnabled={draggingSymbol === null}
            contentContainerStyle={[styles.scrollContent, { paddingTop: topPad + 12, paddingBottom: bottomPad + 18 }]}
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
              onPress={() => { setDraftFilters(filters); setDraftReturnSort(returnSort); setDrawerOpen(true); }}
              style={[styles.filterButton, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <MaterialCommunityIcons name="tune-variant" size={17} color={colors.foreground} />
              <Text style={[styles.filterButtonText, { color: colors.foreground }]}>Filter</Text>
              {activeFilterCount > 0 && <Text style={[styles.filterCount, { color: colors.primaryForeground, backgroundColor: colors.primary }]}>{activeFilterCount}</Text>}
            </TouchableOpacity>
          </View>

          <View style={styles.periodHeader}>
            <View style={styles.periodCopy}><Text style={[styles.periodKicker, { color: colors.mutedForeground }]}>SELECTED RETURN WINDOW</Text>
              <Text testID="heat-map-selected-period" style={[styles.periodTitle, { color: colors.heading }]}>{PERIODS.find((item) => item.id === period)?.label} <Text style={{ color: colors.mutedForeground }}>performance</Text></Text></View>
            <View style={styles.periodMeta}>
              {showMarketStatus && <View
                testID="heat-map-market-status"
                accessible
                accessibilityRole="text"
                accessibilityLabel={MARKET_STATUS_ACCESSIBILITY_LABELS[marketStatus]}
                style={[styles.marketStatusBadge, { borderColor: marketStatusColor, backgroundColor: marketStatusBackground }]}
              >
                <View style={[styles.marketStatusDot, { backgroundColor: marketStatusColor }]} />
                <Text
                  testID="heat-map-market-status-label"
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.75}
                  style={[styles.marketStatusText, { color: marketStatusColor }]}
                >
                  {MARKET_STATUS_LABELS[marketStatus]}
                </Text>
              </View>}
              <Text style={[styles.timestamp, { color: colors.mutedForeground }]}>{formatUpdated(responseMatches ? response!.updatedAt : undefined)}</Text>
            </View>
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
              <View style={styles.summaryAverage}>
                <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>AVG RETURN</Text>
                <Text
                  testID="heat-map-average-return"
                  accessibilityRole="text"
                  accessibilityLabel={`Average return ${averageReturnLabel}, based on ${summary.quoted} hexagons with available returns`}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.75}
                  style={[styles.summaryValue, styles.averageReturnValue, { color: averageReturnColor }]}
                >
                  {averageReturnLabel}
                </Text>
              </View>
            </View>
            <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
            <View style={styles.summaryCount}><Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>COUNTED</Text>
              <Text testID="heat-map-counted-quotes" style={[styles.countValue, { color: colors.foreground }]}>{summary.quoted}</Text></View>
            <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
            <View style={styles.summaryCount}><Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>UP / DOWN</Text>
              <Text style={[styles.countValue, { color: colors.foreground }]}>{summary.positive}<Text style={{ color: colors.mutedForeground }}> / </Text>{summary.negative}</Text></View>
          </View>
          <Text style={[styles.summaryNote, { color: colors.mutedForeground }]}>Breadth and average use the {PERIODS.find((item) => item.id === period)?.label} return where available; missing history is excluded.</Text>

          {category === 'custom' && <View style={[styles.customPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.customHeader}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Your watch map</Text>
              {sectors.length === 0 && customSymbols.length > 0 && <TouchableOpacity
                testID="heat-map-custom-edit"
                accessibilityRole="button"
                accessibilityLabel={isEditingCustomMap ? 'Done editing custom heat map' : 'Edit custom heat map'}
                accessibilityState={{ selected: isEditingCustomMap }}
                onPress={() => setIsEditingCustomMap((current) => !current)}
                style={[styles.editButton, { borderColor: colors.border, backgroundColor: colors.background }]}
              >
                <MaterialCommunityIcons name={isEditingCustomMap ? 'check' : 'pencil-outline'} size={13} color={colors.primary} />
                <Text style={[styles.editButtonText, { color: colors.primary }]}>{isEditingCustomMap ? 'Done' : 'Edit'}</Text>
              </TouchableOpacity>}
            </View>
            <Text style={[styles.customHint, { color: colors.mutedForeground }]}>Build a mixed map of stocks, ETFs, commodities, futures, and crypto. {customSymbols.length}/{MAX_CUSTOM_HEAT_MAP_SYMBOLS}; saved on this device.</Text>
            {customSymbols.length > 1 && <Text
              testID="heat-map-drag-reorder-hint"
              style={[styles.editFallbackHint, { color: colors.mutedForeground }]}
            >
              {returnSort === 'default'
                ? 'Long-press a hexagon and drag it to change its position.'
                : 'Switch historical return sort to Default to arrange hexagons by dragging.'}
            </Text>}
            {customReorderAnnouncement !== '' && <Text
              testID="heat-map-custom-reorder-announcement"
              accessibilityLiveRegion="polite"
              style={[styles.editFallbackHint, { color: colors.mutedForeground }]}
            >
              {customReorderAnnouncement}
            </Text>}
            {lastRemovedTicker && <View testID="heat-map-custom-undo-banner" style={[styles.undoBanner, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <Text style={[styles.undoMessage, { color: colors.foreground }]}>{lastRemovedTicker.symbol} removed</Text>
              <TouchableOpacity
                testID="heat-map-custom-undo"
                accessibilityRole="button"
                accessibilityLabel={`Undo removing ${lastRemovedTicker.symbol}`}
                disabled={removingSymbol !== null || validateSymbol.isPending}
                onPress={() => void restoreLastRemovedTicker()}
                style={[styles.undoButton, { borderColor: colors.primary, opacity: removingSymbol !== null || validateSymbol.isPending ? 0.55 : 1 }]}
              >
                <MaterialCommunityIcons name="undo-variant" size={14} color={colors.primary} />
                <Text style={[styles.undoButtonText, { color: colors.primary }]}>Undo</Text>
              </TouchableOpacity>
            </View>}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.customAssetTypeRail} contentContainerStyle={styles.customAssetTypeOptions}>
              {CUSTOM_HEAT_MAP_ASSET_TYPES.map((assetType) => {
                const selected = customAssetType === assetType.id;
                return <TouchableOpacity
                  key={assetType.id}
                  testID={`heat-map-custom-type-${assetType.id}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => {
                    setCustomAssetType(assetType.id);
                    setSymbolInput('');
                    setFormError('');
                  }}
                  style={[
                    styles.customAssetTypeOption,
                    { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primary : colors.background },
                  ]}
                >
                  <Text style={[styles.customAssetTypeText, { color: selected ? colors.primaryForeground : colors.foreground }]}>{assetType.label}</Text>
                </TouchableOpacity>;
              })}
            </ScrollView>
            <Text style={[styles.searchHint, styles.customAssetTypeHint, { color: colors.mutedForeground }]}>
              {searchText
                ? 'Matching instruments appear across all types. Choose a type above to browse.'
                : `Search by name or ticker, or browse supported ${CUSTOM_HEAT_MAP_ASSET_TYPES.find((item) => item.id === customAssetType)?.label.toLowerCase()}.`}
            </Text>
            <View style={styles.addRow}><TextInput testID="heat-map-custom-input" accessibilityLabel="Search supported instruments or enter a ticker" value={symbolInput} editable={storageReady && !storageLoadError && !isAddingSelectedAssets} onFocus={() => setIsEditingCustomMap(false)} onChangeText={(value) => { setSymbolInput(value); setFormError(''); setCustomBatchFeedback(null); }}
              placeholder="Search name or enter ticker" placeholderTextColor={colors.mutedForeground} autoCapitalize="none" autoCorrect={false} maxLength={80}
              returnKeyType="done" onSubmitEditing={() => void addSymbol()} style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.input }]} />
              <TouchableOpacity testID="heat-map-custom-add" accessibilityRole="button" accessibilityLabel="Add ticker to custom map"
                disabled={!canAddCustomSymbol || isAddingSelectedAssets} onPress={() => void addSymbol()}
                style={[styles.addButton, { backgroundColor: colors.primary, opacity: canAddCustomSymbol && !isAddingSelectedAssets ? 1 : 0.55 }]}>
                {validateSymbol.isPending ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : <MaterialCommunityIcons name="plus" size={20} color={colors.primaryForeground} />}
              </TouchableOpacity></View>
            {(customAssetType !== 'stocks' || searchText.length > 0) && <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={[styles.suggestionsPanel, { backgroundColor: colors.background, borderColor: colors.border }]}
              contentContainerStyle={styles.customAssetChoices}
              testID="heat-map-custom-asset-choices"
            >
              {customAssetChoices.map((asset) => {
                const alreadyAdded = customSymbols.includes(asset.asset.symbol);
                const selected = selectedCustomAssetSymbols.includes(asset.asset.symbol);
                const assetTypeLabel = CUSTOM_HEAT_MAP_ASSET_TYPES.find((item) => item.id === asset.assetType)?.label ?? 'Instrument';
                const selectionAtLimit = !selected
                  && customSymbols.length + selectedCustomAssetSymbols.length >= MAX_CUSTOM_HEAT_MAP_SYMBOLS;
                return <TouchableOpacity
                  key={`${asset.assetType}-${asset.asset.symbol}`}
                  testID={`heat-map-custom-pick-${asset.asset.symbol}`}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected, disabled: alreadyAdded || selectionAtLimit || isAddingSelectedAssets }}
                  accessibilityLabel={`${alreadyAdded ? 'Already added' : selected ? 'Deselect' : 'Select'} ${asset.asset.name}, ${asset.asset.symbol}, ${assetTypeLabel}`}
                  disabled={alreadyAdded || selectionAtLimit || isAddingSelectedAssets}
                  onPress={() => toggleCustomAssetSelection(asset.asset.symbol)}
                  style={[
                    styles.customAssetChoice,
                    {
                      borderColor: alreadyAdded ? colors.border : selected ? colors.primary : colors.border,
                      backgroundColor: alreadyAdded ? colors.secondary : selected ? colors.primary : colors.card,
                      opacity: alreadyAdded || selectionAtLimit || isAddingSelectedAssets ? 0.65 : 1,
                    },
                  ]}
                >
                  <Text numberOfLines={1} style={[styles.customAssetChoiceName, { color: selected ? colors.primaryForeground : colors.foreground }]}>{asset.asset.name}</Text>
                  <Text style={[styles.customAssetChoiceType, { color: selected ? colors.primaryForeground : colors.mutedForeground }]}>{assetTypeLabel}</Text>
                  <View style={styles.customAssetChoiceFooter}>
                    <Text style={[styles.customAssetChoiceSymbol, { color: selected ? colors.primaryForeground : colors.primary }]}>{alreadyAdded ? 'Added' : selected ? 'Selected' : asset.asset.symbol}</Text>
                    {!alreadyAdded && <MaterialCommunityIcons
                      name={selected ? 'checkbox-marked' : 'checkbox-blank-outline'}
                      size={15}
                      color={selected ? colors.primaryForeground : colors.primary}
                    />}
                  </View>
                </TouchableOpacity>;
              })}
              {customAssetChoices.length === 0 && <Text style={[styles.searchHint, { color: colors.mutedForeground }]}>No supported instruments match. You can still enter a ticker.</Text>}
            </ScrollView>}
            {selectedCustomAssetSymbols.length > 0 && <View style={styles.batchAddRow}>
              <Text style={[styles.batchAddHint, { color: colors.mutedForeground }]}>
                {selectedCustomAssetSymbols.length} selected · {Math.max(0, MAX_CUSTOM_HEAT_MAP_SYMBOLS - customSymbols.length - selectedCustomAssetSymbols.length)} spaces left
              </Text>
              <TouchableOpacity
                testID="heat-map-custom-batch-add"
                accessibilityRole="button"
                accessibilityLabel={`Add ${selectedCustomAssetSymbols.length} selected instruments`}
                disabled={!storageReady || !!storageLoadError || isAddingSelectedAssets || validateSymbol.isPending}
                onPress={() => void addSelectedCustomAssets()}
                style={[
                  styles.batchAddButton,
                  {
                    backgroundColor: colors.primary,
                    opacity: !storageReady || !!storageLoadError || isAddingSelectedAssets || validateSymbol.isPending ? 0.55 : 1,
                  },
                ]}
              >
                {isAddingSelectedAssets
                  ? <ActivityIndicator size="small" color={colors.primaryForeground} />
                  : <MaterialCommunityIcons name="plus" size={15} color={colors.primaryForeground} />}
                <Text style={[styles.batchAddButtonText, { color: colors.primaryForeground }]}>
                  {isAddingSelectedAssets ? 'Adding' : `Add ${selectedCustomAssetSymbols.length}`}
                </Text>
              </TouchableOpacity>
            </View>}
            {isCustomSearchInput && <View testID="heat-map-custom-suggestions" style={[styles.suggestionsPanel, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <Text style={[styles.stockSearchHeading, { color: colors.mutedForeground }]}>Stocks</Text>
              {customSuggestions.map((suggestion, index) => {
                const { alreadyAdded, selected, selectionAtLimit } = getStockSearchSuggestionSelectionState(
                  suggestion.symbol,
                  customSymbols,
                  selectedCustomAssetSymbols,
                  MAX_CUSTOM_HEAT_MAP_SYMBOLS,
                );
                return <View
                  key={suggestion.symbol}
                  style={[
                    styles.suggestionRow,
                    index < customSuggestions.length - 1 && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
                  ]}
                >
                  <TouchableOpacity
                    testID={`heat-map-custom-suggestion-${suggestion.symbol}`}
                    accessibilityRole="button"
                    accessibilityLabel={`Add ${suggestion.name}, ticker ${suggestion.symbol}, ${suggestion.exchange}`}
                    disabled={alreadyAdded || validateSymbol.isPending || isAddingSelectedAssets || customSymbols.length >= MAX_CUSTOM_HEAT_MAP_SYMBOLS}
                    onPress={() => void addSymbol(suggestion.symbol)}
                    style={styles.stockSuggestionAdd}
                  >
                    <View style={styles.suggestionCopy}>
                      <Text numberOfLines={1} style={[styles.suggestionName, { color: colors.foreground }]}>{suggestion.name}</Text>
                      <Text numberOfLines={1} style={[styles.suggestionExchange, { color: colors.mutedForeground }]}>{suggestion.exchange}</Text>
                    </View>
                    <Text style={[styles.suggestionSymbol, { color: alreadyAdded ? colors.mutedForeground : colors.primary }]}>
                      {alreadyAdded ? 'Added' : suggestion.symbol}
                    </Text>
                    {!alreadyAdded && <MaterialCommunityIcons name="plus" size={17} color={colors.primary} />}
                  </TouchableOpacity>
                  {!alreadyAdded && <TouchableOpacity
                    testID={`heat-map-custom-select-${suggestion.symbol}`}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected, disabled: selectionAtLimit || isAddingSelectedAssets }}
                    accessibilityLabel={`${selected ? 'Deselect' : 'Select'} ${suggestion.name}, ticker ${suggestion.symbol}, for batch adding`}
                    disabled={selectionAtLimit || isAddingSelectedAssets}
                    onPress={() => toggleCustomAssetSelection(suggestion.symbol)}
                    style={[
                      styles.stockSuggestionSelect,
                      { opacity: selectionAtLimit || isAddingSelectedAssets ? 0.55 : 1 },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name={selected ? 'checkbox-marked' : 'checkbox-blank-outline'}
                      size={19}
                      color={selected ? colors.primary : colors.mutedForeground}
                    />
                  </TouchableOpacity>}
                </View>;
              })}
              {customSearchFeedback?.kind === 'loading' && <View style={styles.searchStatus}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={[styles.searchHint, { color: colors.mutedForeground }]}>{customSearchFeedback.message}</Text>
              </View>}
              {customSearchFeedback && customSearchFeedback.kind !== 'loading' && <Text style={[styles.searchHint, { color: colors.mutedForeground }]}>
                {customSearchFeedback.message}
              </Text>}
            </View>}
            {isCustomSearchInput && <View testID="heat-map-custom-instrument-suggestions" style={[styles.suggestionsPanel, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <Text style={[styles.stockSearchHeading, { color: colors.mutedForeground }]}>ETFs, commodities, futures & crypto</Text>
              {visibleInstrumentSuggestions.map((suggestion, index) => {
                const alreadyAdded = customSymbols.includes(suggestion.symbol);
                const categoryLabel = suggestion.category === 'etf'
                  ? 'ETF'
                  : suggestion.category === 'commodity'
                    ? 'Commodity'
                    : suggestion.category === 'future'
                      ? 'Future'
                      : `Crypto · quote ${suggestion.symbol.slice(suggestion.symbol.lastIndexOf('-') + 1)}`;
                return <TouchableOpacity
                  key={suggestion.symbol}
                  testID={`heat-map-custom-instrument-${suggestion.symbol}`}
                  accessibilityRole="button"
                  accessibilityLabel={`${alreadyAdded ? 'Already added' : 'Add'} ${suggestion.name}, ticker ${suggestion.symbol}, ${categoryLabel}, ${suggestion.exchange}`}
                  disabled={alreadyAdded || validateSymbol.isPending || isAddingSelectedAssets || customSymbols.length >= MAX_CUSTOM_HEAT_MAP_SYMBOLS}
                  onPress={() => void addSymbol(suggestion.symbol)}
                  style={[styles.suggestionRow, index < visibleInstrumentSuggestions.length - 1 && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }, alreadyAdded && { opacity: 0.65 }]}
                >
                  <View style={styles.suggestionCopy}>
                    <Text numberOfLines={1} style={[styles.suggestionName, { color: colors.foreground }]}>{suggestion.name}</Text>
                    <Text numberOfLines={1} style={[styles.suggestionExchange, { color: colors.mutedForeground }]}>{categoryLabel} · {suggestion.exchange}</Text>
                  </View>
                  <Text style={[styles.suggestionSymbol, { color: colors.primary }]}>{alreadyAdded ? 'Added' : suggestion.symbol}</Text>
                  {!alreadyAdded && <MaterialCommunityIcons name="plus" size={17} color={colors.primary} />}
                </TouchableOpacity>;
              })}
              {visibleInstrumentSuggestions.length === 0 && instrumentSearchIsFetching && <View style={styles.searchStatus}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={[styles.searchHint, { color: colors.mutedForeground }]}>Searching supported instruments…</Text>
              </View>}
              {visibleInstrumentSuggestions.length === 0 && instrumentSearchIsSettled && instrumentSearchHasNoSuccess && <Text style={[styles.searchHint, { color: colors.mutedForeground }]}>
                Instrument search is unavailable. You can enter a ticker and validate it directly.
              </Text>}
              {visibleInstrumentSuggestions.length === 0 && instrumentSearchIsSettled && !instrumentSearchHasNoSuccess && <Text style={[styles.searchHint, { color: colors.mutedForeground }]}>
                {instrumentSearchHasError
                  ? 'Some instrument categories could not be searched. Try another name or enter a ticker to validate it.'
                  : 'No supported instrument matches. Try another name or enter a ticker to validate it.'}
              </Text>}
              {visibleInstrumentSuggestions.length > 0 && instrumentSearchIsSettled && instrumentSearchHasError && <Text style={[styles.searchHint, { color: colors.mutedForeground }]}>
                Some instrument categories could not be searched.
              </Text>}
            </View>}
          {storageLoadError && <View style={styles.storageReadError}>
              <Text testID="heat-map-storage-error" style={[styles.formError, { color: colors.sellColor }]}>
                {storageLoadError === 'malformed'
                  ? "Saved tickers couldn't be read because their device data is invalid. It hasn't been changed."
                  : "Couldn't load saved tickers from this device."}
              </Text>
              {storageLoadError === 'malformed' && <Text style={[styles.searchHint, { color: colors.mutedForeground }]}>
                Resetting replaces the unreadable saved value with an empty list.
              </Text>}
              <TouchableOpacity
                testID="heat-map-storage-retry"
                accessibilityRole="button"
                accessibilityLabel="Retry loading saved tickers"
                disabled={!storageReady || isResettingSavedTickers}
                onPress={() => void loadSavedCustomSymbols()}
                style={[styles.retryButton, { borderColor: colors.border, opacity: storageReady && !isResettingSavedTickers ? 1 : 0.55 }]}
              >
                {!storageReady
                  ? <ActivityIndicator size="small" color={colors.primary} />
                  : <Text style={[styles.retryText, { color: colors.primary }]}>Retry</Text>}
              </TouchableOpacity>
              {storageLoadError === 'malformed' && <TouchableOpacity
                testID="heat-map-storage-reset"
                accessibilityRole="button"
                accessibilityLabel="Replace unreadable saved tickers with an empty list"
                disabled={!storageReady || isResettingSavedTickers}
                onPress={() => void resetMalformedSavedTickers()}
                style={[styles.retryButton, { borderColor: colors.sellColor, opacity: storageReady && !isResettingSavedTickers ? 1 : 0.55 }]}
              >
                {isResettingSavedTickers
                  ? <ActivityIndicator size="small" color={colors.sellColor} />
                  : <Text style={[styles.retryText, { color: colors.sellColor }]}>Reset saved tickers</Text>}
              </TouchableOpacity>}
            </View>}
            {!!formError && <Text testID="heat-map-custom-error" style={[styles.formError, { color: colors.sellColor }]}>{formError}</Text>}
            {customBatchFeedback && <Text
              testID="heat-map-custom-batch-feedback"
              style={[styles.formError, { color: customBatchFeedback.kind === 'error' ? colors.sellColor : colors.primary }]}
            >
              {customBatchFeedback.message}
            </Text>}
            {!!editFallbackSymbols.length && <View style={styles.editFallbackList}>
              <Text style={[styles.editFallbackHint, { color: colors.mutedForeground }]}>No visible hexagon for these tickers. Tap to remove:</Text>
              <View style={styles.editFallbackItems}>{editFallbackSymbols.map((symbol) => <TouchableOpacity
                key={symbol}
                testID={`heat-map-remove-unavailable-${symbol}`}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${symbol} from your custom heat map`}
                disabled={removingSymbol !== null}
                onPress={() => void removeSymbol(symbol)}
                style={[styles.editFallbackItem, { borderColor: colors.border, opacity: removingSymbol === symbol ? 0.6 : 1 }]}
              >
                <Text style={[styles.editFallbackTicker, { color: colors.foreground }]}>{symbol}</Text>
                <MaterialCommunityIcons name="close" size={13} color={colors.sellColor} />
              </TouchableOpacity>)}</View>
            </View>}
          </View>}

          {!!staleQuotes.length && <View style={[styles.notice, styles.staleNotice, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <MaterialCommunityIcons name="clock-alert-outline" size={15} color={colors.gold} />
            <Text style={[styles.noticeText, { color: colors.mutedForeground }]}>Stale or invalid quote timestamps are excluded: {staleQuotes.map((quote) => quote.symbol).join(', ')}.</Text>
          </View>}
          {mapQuery.isError && responseMatches && <View style={[styles.notice, styles.staleNotice, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <MaterialCommunityIcons name="alert-circle-outline" size={15} color={colors.gold} />
            <Text style={[styles.noticeText, { color: colors.mutedForeground }]}>Refresh failed. Showing the last successful quote batch from {formatUpdated(response!.updatedAt).replace('Updated ', '')}.</Text>
          </View>}
          {showingBreadthSnapshot && mapQuery.isFetching && <View testID="heat-map-fast-snapshot-note" style={[styles.notice, styles.staleNotice, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <MaterialCommunityIcons name="clock-outline" size={15} color={colors.primary} />
            <Text style={[styles.noticeText, { color: colors.mutedForeground }]}>Quick 1D quotes are shown while detailed history and risk labels load.</Text>
          </View>}

          {category === 'custom' && storageReady && !storageLoadError && customSymbols.length === 0
            ? stateCard('hexagon-multiple-outline', 'Build a personal comparison', 'Add supported tickers above. Curated instruments can be saved while their fresh quote is pending; your symbols stay on this device.')
              : mapQuery.isError && !responseMatches
              ? stateCard('alert-circle-outline', 'Market data is unavailable', "This quote batch couldn't be refreshed.", <TouchableOpacity testID="heat-map-retry" onPress={() => mapQuery.refetch()} style={[styles.retryButton, { borderColor: colors.border }]}><Text style={[styles.retryText, { color: colors.primary }]}>Try again</Text></TouchableOpacity>)
              : busy
                ? <HeatMapLoadingState
                    key={JSON.stringify(params)}
                    contentWidth={contentWidth}
                    tileWidth={tileWidth}
                    tileHeight={tileHeight}
                    colors={colors}
                    theme={loadingTheme}
                    reduceMotion={reduceMotion}
                  />
                : filterableQuotes.length === 0 && activeFilterCount > 0 && unavailableMapAssets.length === 0
                  ? stateCard('filter-off-outline', 'No matches for these filters', 'Clear or adjust a filter to see instruments in this map.')
                  : filterableQuotes.length === 0 && unavailableMapAssets.length === 0
                    ? stateCard('chart-box-outline', 'No current quotes', unavailableSymbols.length ? `No recent valid quotes for ${unavailableSymbols.join(', ')}.` : 'There are no current quotes available in this market.')
                    : <View style={styles.mapWrap}>
                      {filterableQuotes.length > 0 && sectors.map((group, groupIndex) => {
                        const layout = honeycombLayouts[groupIndex];
                        const visibleSymbols = honeycombSymbolLists[groupIndex] ?? [];
                        const dragEnabled = category === 'custom'
                          && returnSort === 'default'
                          && visibleSymbols.length > 1
                          && removingSymbol === null
                          && storageReady
                          && !storageLoadError;
                        const dropPosition = groupIndex === 0 && dropTargetIndex !== null
                          ? layout.positions[dropTargetIndex]
                          : undefined;
                        return <View key={group.name || 'all'} style={styles.sectorGroup}>
                          {(category === 'stocks' || category === 'custom') && <View style={styles.sectorHeading}>
                            <Text style={[styles.sectorName, { color: colors.foreground }]}>{group.name}</Text>
                            {category === 'custom' && groupIndex === 0
                              ? <TouchableOpacity
                                  testID="heat-map-custom-edit"
                                  accessibilityRole="button"
                                  accessibilityLabel={isEditingCustomMap ? 'Done editing custom heat map' : 'Edit custom heat map'}
                                  accessibilityState={{ selected: isEditingCustomMap }}
                                  onPress={() => setIsEditingCustomMap((current) => !current)}
                                  style={[styles.editButton, { borderColor: colors.border, backgroundColor: colors.card }]}
                                >
                                  <MaterialCommunityIcons name={isEditingCustomMap ? 'check' : 'pencil-outline'} size={13} color={colors.primary} />
                                  <Text style={[styles.editButtonText, { color: colors.primary }]}>{isEditingCustomMap ? 'Done' : 'Edit'}</Text>
                                </TouchableOpacity>
                              : <Text style={[styles.sectorCount, { color: colors.mutedForeground }]}>{group.quotes.length} instruments</Text>}
                          </View>}
                          <View style={[styles.honeycomb, { width: contentWidth, height: layout.height }]}>
                            {category === 'custom' && draggingSymbol && dropPosition && <View
                              testID="heat-map-drag-drop-target"
                              pointerEvents="none"
                              style={[styles.dropTargetOutline, { left: dropPosition.left, top: dropPosition.top, width: tileWidth, height: tileHeight }]}
                            >
                              <Svg width={tileWidth} height={tileHeight} viewBox="0 0 100 86.6">
                                <Polygon points="1,43.3 25,1 75,1 99,43.3 75,85.6 25,85.6" fill="transparent" stroke={colors.primary} strokeWidth="3" strokeDasharray="5,3" />
                              </Svg>
                            </View>}
                            {layout.positions.map((position) => {
                              const quote = group.quotes[position.index];
                              return <Reanimated.View
                                key={quote.symbol}
                                style={[
                                  styles.hexPosition,
                                  {
                                    left: position.left,
                                    top: position.top,
                                    width: tileWidth,
                                    height: tileHeight,
                                    zIndex: draggingSymbol === quote.symbol ? 20 : 0,
                                    elevation: draggingSymbol === quote.symbol ? 8 : 0,
                                  },
                                ]}
                              >
                                <HexTile
                                  quote={quote}
                                  width={tileWidth}
                                  height={tileHeight}
                                  colors={colors}
                                  scrollGesture={scrollGesture}
                                  period={period}
                                  category={category}
                                  editing={category === 'custom' && isEditingCustomMap}
                                  reduceMotion={reduceMotion}
                                  revealDelayMs={revealDelayBySymbol.get(quote.symbol) ?? 0}
                                  removing={removingSymbol !== null}
                                  onRemove={() => void removeSymbol(quote.symbol)}
                                   onSelect={() => {
                                     setSelectedUnavailableCommodity(null);
                                     setSelectedQuote(quote);
                                   }}
                                  dragEnabled={dragEnabled}
                                  dragging={draggingSymbol === quote.symbol}
                                  positionIndex={position.index}
                                  positionLeft={position.left}
                                  positionTop={position.top}
                                  positions={layout.positions}
                                  visibleSymbols={visibleSymbols}
                                  onDragStart={startCustomMapDrag}
                                  onDragTarget={updateCustomMapDragTarget}
                                  onDragEnd={finishCustomMapDrag}
                                  onMoveAccessibility={(direction) => void moveSymbol(quote.symbol, direction)}
                                />
                              </Reanimated.View>;
                            })}
                          </View>
                        </View>;
                      })}
                      {!!unavailableMapAssets.length && <View testID="heat-map-unavailable-map-assets" style={styles.unavailableMapSection}>
                        <View testID="heat-map-unavailable-map-divider" style={[styles.unavailableDivider, { backgroundColor: colors.border }]} />
                        <View style={[styles.notice, { backgroundColor: colors.card, borderColor: colors.border }]}>
                          <MaterialCommunityIcons name="information-outline" size={15} color={colors.primary} />
                          <Text testID="heat-map-unavailable-map-note" style={[styles.noticeText, { color: colors.mutedForeground }]}>
                            These instruments will be displayed as usual when a quote is available.
                          </Text>
                        </View>
                        <View style={[styles.honeycomb, { width: contentWidth, height: unavailableLayout.height }]}>
                          {unavailableLayout.positions.map((position) => {
                            const asset = unavailableMapAssets[position.index];
                            const isCommodity = category === 'commodities'
                              || isSupportedCustomMapCommoditySymbol(asset.symbol);
                            const onSelect = isCommodity
                              ? () => {
                                  setSelectedQuote(null);
                                  setSelectedUnavailableCommodity({ symbol: asset.symbol, name: asset.name });
                                }
                              : undefined;
                            const onRemove = category === 'custom' && isEditingCustomMap
                              ? () => void removeSymbol(asset.symbol)
                              : undefined;
                            return <View
                              key={asset.symbol}
                              style={[styles.hexPosition, { left: position.left, top: position.top, width: tileWidth, height: tileHeight }]}
                            >
                              <UnavailableHexTile
                                name={asset.name}
                                symbol={asset.symbol}
                                width={tileWidth}
                                height={tileHeight}
                                colors={colors}
                                onSelect={onSelect}
                                onRemove={onRemove}
                                removing={removingSymbol === asset.symbol}
                              />
                            </View>;
                          })}
                        </View>
                      </View>}
                      {!!unavailableSymbols.length && category !== 'commodities' && category !== 'custom' && <Text style={[styles.unavailable, { color: colors.mutedForeground }]}>No recent quote: {unavailableSymbols.join(' · ')}</Text>}
          {!!filterableQuotes.some((quote) => quote.returnPercent === null) && <View style={[styles.notice, { backgroundColor: colors.card, borderColor: colors.border }]}>
                        <MaterialCommunityIcons name="information-outline" size={15} color={colors.primary} />
            <Text testID="heat-map-unavailable-return-note" style={[styles.noticeText, { color: colors.mutedForeground }]}>
              Unavailable means there is not enough price history for the selected period; the map does not substitute a shorter return.
            </Text>
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
        </GestureDetector>
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
          <View testID="heat-map-filter-drawer-root" style={styles.drawerRoot}>
            <Pressable testID="heat-map-filter-backdrop" accessibilityRole="button" accessibilityLabel="Close filters" onPress={() => setDrawerOpen(false)} style={styles.drawerBackdrop} />
            <View testID="heat-map-filter-drawer" style={[styles.drawer, { backgroundColor: colors.background, paddingTop: Math.max(insets.top, 18) + 12, paddingBottom: Math.max(insets.bottom, 14) }]}>
              <View style={styles.drawerHeader}>
                <View><Text style={[styles.drawerKicker, { color: colors.gold }]}>REFINE THE FIELD</Text><Text style={[styles.drawerTitle, { color: colors.heading }]}>Filters</Text></View>
                <TouchableOpacity testID="heat-map-filter-close" accessibilityRole="button" accessibilityLabel="Close filters" onPress={() => setDrawerOpen(false)} style={[styles.drawerClose, { borderColor: colors.border }]}>
                  <MaterialCommunityIcons name="close" size={20} color={colors.foreground} />
                </TouchableOpacity>
              </View>
              <Text testID="heat-map-filter-selection-count" style={[styles.drawerFeedback, { color: colors.mutedForeground }]}>{draftSelectionCount} selected · filters and sorting apply to this map</Text>
              <ScrollView testID="heat-map-filter-scroll" style={styles.drawerScroll} contentContainerStyle={styles.drawerScrollContent} showsVerticalScrollIndicator>
                <FilterSection title="Return period">{PERIODS.map((item) => <FilterChoice key={item.id} label={item.label} selected={period === item.id}
                  onPress={() => setPeriod(item.id)} testID={`heat-map-drawer-period-${item.id}`} />)}</FilterSection>
                <FilterSection title="Historical return sort">
                  <FilterChoice label="Default" selected={draftReturnSort === 'default'} onPress={() => setDraftReturnSort('default')} testID="heat-map-sort-default" />
                  <FilterChoice label="Highest first" selected={draftReturnSort === 'highest'} onPress={() => setDraftReturnSort('highest')} testID="heat-map-sort-highest" />
                  <FilterChoice label="Lowest first" selected={draftReturnSort === 'lowest'} onPress={() => setDraftReturnSort('lowest')} testID="heat-map-sort-lowest" />
                </FilterSection>
                <Text testID="heat-map-sort-explanation" style={[styles.riskExplanation, { color: colors.mutedForeground }]}>
                  Sorts every hexagon by the selected return period. Hexagons without enough history stay at the end.
                </Text>
                {supportsSectorFilter && <FilterSection title="Sector">{choices.sectors.map((value) => <FilterChoice key={value} label={value} selected={draftFilters.sector === value} onPress={() => toggleFilter('sector', value)} testID={`heat-map-filter-sector-${value}`} />)}</FilterSection>}
                {supportsMarketCapFilter && <FilterSection title="Market cap (USD)">{CAP_BUCKETS.map((value) => <FilterChoice key={value} label={CAP_BUCKET_LABELS[value]} selected={draftFilters.marketCap === value} onPress={() => toggleFilter('marketCap', value)} testID={`heat-map-filter-cap-${value}`} />)}</FilterSection>}
                {choices.exchanges.length > 0 && <FilterSection title="Exchange">{choices.exchanges.map((value) => <FilterChoice key={value} label={value} selected={draftFilters.exchange === value} onPress={() => toggleFilter('exchange', value)} testID={`heat-map-filter-exchange-${value}`} />)}</FilterSection>}
                <FilterSection title="Historical risk">{RISK_BANDS.map((value) => <FilterChoice key={value} label={RISK_BAND_LABELS[value]} selected={draftFilters.risk === value} onPress={() => toggleFilter('risk', value)} testID={`heat-map-filter-risk-${value}`} />)}
                  {choices.hasUnknownRisk && <FilterChoice label="Unknown" selected={draftFilters.risk === 'Unknown'} onPress={() => toggleFilter('risk', 'Unknown')} testID="heat-map-filter-risk-Unknown" />}</FilterSection>
                <Text testID="heat-map-filter-risk-explanation" style={[styles.riskExplanation, { color: colors.mutedForeground }]}>Risk uses trailing-year daily returns, annualized with 252 trading days (stocks and funds) or 365 days (crypto); at least 60 observations are required. These labels describe historical volatility, not personal suitability. Unknown means history is insufficient.</Text>
              </ScrollView>
              <View testID="heat-map-filter-actions" style={[styles.drawerActions, { borderTopColor: colors.border }]}>
                <TouchableOpacity testID="heat-map-filter-reset" accessibilityRole="button" onPress={() => { setDraftFilters(EMPTY_FILTERS); setFilters(EMPTY_FILTERS); setDraftReturnSort('default'); setReturnSort('default'); }} style={[styles.resetButton, { borderColor: colors.border }]}>
                  <Text style={[styles.resetText, { color: colors.foreground }]}>Clear all</Text>
                </TouchableOpacity>
                <TouchableOpacity testID="heat-map-filter-apply" accessibilityRole="button" onPress={() => { setFilters(draftFilters); setReturnSort(draftReturnSort); setDrawerOpen(false); }}
                  style={[styles.applyButton, { backgroundColor: colors.primary }]}>
                  <Text style={[styles.applyText, { color: colors.primaryForeground }]}>Apply filters</Text><Text style={[styles.applyCount, { color: colors.primaryForeground }]}>{draftSelectionCount}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
        <HeatMapDetailModal
          animationType={restoreDetailWithoutAnimation ? 'none' : 'slide'}
          quote={selectedQuote}
          unavailableCommodity={selectedUnavailableCommodity}
          isWatched={watchlist.isWatched(selectedQuote?.symbol ?? selectedUnavailableCommodity?.symbol ?? '')}
          onAddToWatchlist={() => {
            const symbol = selectedQuote?.symbol ?? selectedUnavailableCommodity?.symbol;
            if (symbol) void watchlist.add(symbol);
          }}
          quoteUnavailable={selectedQuoteUnavailable}
          visible={selectedQuote !== null || selectedUnavailableCommodity !== null}
          canAnalyzeStock={(category === 'stocks' || category === 'custom') && selectedQuote?.assetType === 'stock'}
          canAnalyzeEtf={(category === 'etfs' || category === 'custom') && selectedQuote?.assetType === 'etf'}
          canAnalyzeCommodity={(category === 'commodities' || category === 'custom')
            && (selectedQuote?.assetType === 'commodity' || selectedUnavailableCommodity !== null)}
          onClose={() => {
            setRestoreDetailWithoutAnimation(false);
            setSelectedQuote(null);
            setSelectedUnavailableCommodity(null);
          }}
          onAnalyzeStock={() => {
            if ((category !== 'stocks' && category !== 'custom') || selectedQuote?.assetType !== 'stock') return;
            const analysisSymbol = selectedQuote.symbol;
            dismissDetailForNavigation();
            setTimeout(() => router.push(`/analysis/${encodeURIComponent(analysisSymbol)}`), 350);
          }}
          onAnalyzeEtf={() => {
            if ((category !== 'etfs' && category !== 'custom') || selectedQuote?.assetType !== 'etf') return;
            const analysisSymbol = selectedQuote.symbol;
            dismissDetailForNavigation();
            setTimeout(() => router.push(`/analysis/${encodeURIComponent(analysisSymbol)}`), 350);
          }}
          onAnalyzeCommodity={() => {
            if ((category !== 'commodities' && category !== 'custom')
              || (selectedQuote?.assetType !== 'commodity' && selectedUnavailableCommodity === null)) return;
            const analysisSymbol = selectedQuote?.symbol ?? selectedUnavailableCommodity?.symbol;
            if (!analysisSymbol) return;
            dismissDetailForNavigation();
            setTimeout(() => router.push(`/analysis/${encodeURIComponent(analysisSymbol)}`), 350);
          }}
          onOpenChart={() => {
            const chartSymbol = selectedQuote?.symbol ?? selectedUnavailableCommodity?.symbol;
            if (!chartSymbol) return;
            const chartName = selectedQuote?.name || selectedUnavailableCommodity?.name || chartSymbol;
            const chartAssetType = selectedQuote?.assetType ?? 'commodity';
            dismissDetailForNavigation();
            // The detail card is a native Modal. Let its dismissal finish before
            // pushing the chart route so the new screen is not rendered behind it.
            setTimeout(() => {
              router.push({
                pathname: '/heat-map-chart',
                params: {
                  symbol: chartSymbol,
                  name: chartName,
                  assetType: chartAssetType,
                },
              });
            }, 350);
          }}
          onRefreshQuote={async (symbol) => {
            try {
              const result = await mapQuery.refetch();
              if (result.isError) return null;
              const refreshedQuote = result.data?.quotes.find(
                (item) => item.symbol.toUpperCase() === symbol.toUpperCase(),
              ) ?? null;
              if (refreshedQuote) {
                setSelectedQuote((current) => current?.symbol.toUpperCase() === symbol.toUpperCase()
                  ? refreshedQuote
                  : current);
              }
              return refreshedQuote;
            } catch {
              return null;
            }
          }}
        />
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
  periodCopy: { flex: 1, minWidth: 0, marginRight: 8 },
  periodMeta: { maxWidth: '50%', alignItems: 'flex-end', gap: 4 },
  marketStatusBadge: { maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 9, paddingHorizontal: 7, paddingVertical: 4 },
  marketStatusDot: { width: 6, height: 6, borderRadius: 3 },
  marketStatusText: { flexShrink: 1, fontFamily: 'Inter_700Bold', fontSize: 8, letterSpacing: 0.35 },
  periodKicker: { fontFamily: 'Inter_600SemiBold', fontSize: 8, letterSpacing: 1.2 },
  periodTitle: { fontFamily: 'Inter_700Bold', fontSize: 20, marginTop: 4 },
  timestamp: { fontFamily: 'Inter_400Regular', fontSize: 9, textAlign: 'right', marginBottom: 3, flexShrink: 1 },
  periodRail: { flexDirection: 'row', justifyContent: 'space-between', gap: 4, marginBottom: 17 },
  periodOption: { flex: 1, minWidth: 0, height: 32, borderWidth: 1, borderRadius: 9, justifyContent: 'center', alignItems: 'center' },
  periodOptionText: { fontFamily: 'Inter_600SemiBold', fontSize: 10 },
  summaryPanel: { minHeight: 72, borderWidth: 1, borderRadius: 15, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10 },
  summaryTone: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 },
  summaryAverage: { width: 74, minWidth: 58, flexShrink: 1, minHeight: 43, alignItems: 'center', justifyContent: 'center' },
  summaryLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 8, letterSpacing: 0.8 },
  summaryValue: { fontFamily: 'Inter_700Bold', fontSize: 13, marginTop: 3, letterSpacing: 0.5 },
  averageReturnValue: { fontSize: 15, letterSpacing: 0, textAlign: 'center' },
  directionWord: { fontFamily: 'Inter_600SemiBold', fontSize: 9, marginTop: 1 },
  summaryDivider: { width: 1, height: 32, marginHorizontal: 8 },
  summaryCount: { alignItems: 'center', minWidth: 52 },
  countValue: { fontFamily: 'Inter_700Bold', fontSize: 14, marginTop: 5 },
  summaryNote: { fontFamily: 'Inter_400Regular', fontSize: 9, lineHeight: 14, textAlign: 'right', marginTop: 7, marginBottom: 15 },
  customPanel: { borderWidth: 1, borderRadius: 15, padding: 14, marginBottom: 16 },
  customHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  sectionTitle: { fontFamily: 'Inter_700Bold', fontSize: 15 },
  customHint: { fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 16, marginTop: 4 },
  customAssetTypeRail: { marginTop: 12, flexGrow: 0 },
  customAssetTypeOptions: { gap: 7, paddingRight: 2 },
  customAssetTypeOption: { minHeight: 31, borderWidth: 1, borderRadius: 16, paddingHorizontal: 11, alignItems: 'center', justifyContent: 'center' },
  customAssetTypeText: { fontFamily: 'Inter_600SemiBold', fontSize: 10 },
  customAssetTypeHint: { marginTop: 2, paddingHorizontal: 0, paddingVertical: 5 },
  customAssetChoices: { gap: 7, padding: 8 },
  customAssetChoice: { width: 150, minHeight: 68, borderWidth: 1, borderRadius: 9, paddingHorizontal: 9, paddingVertical: 7, justifyContent: 'center' },
  customAssetChoiceName: { fontFamily: 'Inter_600SemiBold', fontSize: 10 },
  customAssetChoiceType: { fontFamily: 'Inter_400Regular', fontSize: 8, marginTop: 3 },
  customAssetChoiceSymbol: { fontFamily: 'Inter_700Bold', fontSize: 9, marginTop: 2 },
  customAssetChoiceFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 5 },
  batchAddRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 8 },
  batchAddHint: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 10 },
  batchAddButton: { minHeight: 36, borderRadius: 10, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  batchAddButtonText: { fontFamily: 'Inter_700Bold', fontSize: 10 },
  stockSearchHeading: { fontFamily: 'Inter_700Bold', fontSize: 9, paddingHorizontal: 11, paddingTop: 9, paddingBottom: 2, textTransform: 'uppercase', letterSpacing: 0.7 },
  storageReadError: { alignItems: 'flex-start', gap: 2 },
  undoBanner: { minHeight: 40, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, marginTop: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  undoMessage: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 11 },
  undoButton: { minHeight: 28, borderWidth: 1, borderRadius: 8, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  undoButtonText: { fontFamily: 'Inter_700Bold', fontSize: 10 },
  addRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  input: { flex: 1, height: 48, borderRadius: 11, borderWidth: 1, paddingHorizontal: 12, fontFamily: 'Inter_500Medium', fontSize: 14 },
  addButton: { width: 48, height: 48, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  suggestionsPanel: { marginTop: 8, borderWidth: 1, borderRadius: 11, overflow: 'hidden' },
  suggestionRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 11, paddingVertical: 8 },
  stockSuggestionAdd: { flex: 1, minWidth: 0, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10 },
  stockSuggestionSelect: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  suggestionCopy: { flex: 1, minWidth: 0 },
  suggestionName: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  suggestionExchange: { fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 3 },
  suggestionSymbol: { fontFamily: 'Inter_700Bold', fontSize: 11 },
  searchStatus: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 11 },
  searchHint: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 10, lineHeight: 15, paddingHorizontal: 11, paddingVertical: 10 },
  formError: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 8 },
  editButton: { minHeight: 27, borderWidth: 1, borderRadius: 8, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  editButtonText: { fontFamily: 'Inter_700Bold', fontSize: 10 },
  editFallbackList: { marginTop: 10, gap: 7 },
  editFallbackHint: { fontFamily: 'Inter_400Regular', fontSize: 10, lineHeight: 14 },
  editFallbackItems: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  editFallbackItem: { minHeight: 28, borderWidth: 1, borderRadius: 9, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', gap: 6 },
  editFallbackTicker: { fontFamily: 'Inter_600SemiBold', fontSize: 10 },
  reorderList: { gap: 7, marginTop: 4 },
  reorderRow: { minHeight: 48, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  reorderPosition: { width: 22, fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  reorderSymbol: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  reorderButton: { width: 44, height: 44, borderWidth: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  statePanel: { minHeight: 170, borderWidth: 1, borderStyle: 'dashed', borderRadius: 17, alignItems: 'center', justifyContent: 'center', padding: 22, gap: 8, marginTop: 3 },
  stateTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 14, textAlign: 'center', marginTop: 3 },
  stateCopy: { fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 17, textAlign: 'center', maxWidth: 280 },
  loadingPanel: { minHeight: 170, borderWidth: 1, borderRadius: 17, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 14, gap: 5, marginTop: 3 },
  loadingHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  loadingTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 14, textAlign: 'center' },
   loadingTrim: { width: '100%', height: 2, borderRadius: 1, marginBottom: 3 },
   loadingKicker: { fontFamily: 'Inter_700Bold', fontSize: 8, letterSpacing: 1.4, marginBottom: 1 },
  loadingHoneycomb: { alignSelf: 'center', position: 'relative', marginVertical: 4 },
  retryButton: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 15, paddingVertical: 8, marginTop: 6 },
  retryText: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  mapWrap: { gap: 18 },
  unavailableMapSection: { gap: 8, marginTop: 4 },
  unavailableDivider: { width: '100%', height: 1 },
  sectorGroup: { gap: 7 },
  sectorHeading: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 3 },
  sectorName: { flex: 1, marginRight: 8, fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  sectorCount: { fontFamily: 'Inter_400Regular', fontSize: 9 },
  honeycomb: { alignSelf: 'center', position: 'relative' },
  hexPosition: { position: 'absolute' },
  dropTargetOutline: { position: 'absolute', zIndex: 1 },
  tile: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, gap: 1 },
  hexDragging: { zIndex: 30, elevation: 9 },
  tileInstrument: { gap: 0 },
  tileCrypto: { gap: 0 },
  tileInstrumentIdentity: { width: '100%', alignItems: 'center', justifyContent: 'center' },
  tileInstrumentName: { width: '100%', minWidth: 0, maxWidth: '100%', textAlign: 'center', fontSize: 11, lineHeight: 13, letterSpacing: 0.3 },
  tileInstrumentNameEmphasized: { fontSize: 14, lineHeight: 16 },
  tileCryptoSymbol: { maxWidth: '96%', fontSize: 10, lineHeight: 11, letterSpacing: 0.1 },
  editTileButton: { alignItems: 'center', justifyContent: 'center' },
  tileRemoveBadge: { position: 'absolute', top: 9, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  tileSymbol: { maxWidth: '92%', fontFamily: 'Inter_700Bold', fontSize: 13, letterSpacing: 0.2 },
  tileSymbolEmphasized: { fontSize: 16 },
  tileChange: { maxWidth: '92%', fontFamily: 'Inter_700Bold', fontSize: 12 },
  tilePrice: { maxWidth: '92%', fontFamily: 'Inter_600SemiBold', fontSize: 11, letterSpacing: 0.1 },
  tileSession: { maxWidth: '94%', fontFamily: 'Inter_600SemiBold', fontSize: 8, letterSpacing: 0.05 },
  tileNextOpen: { maxWidth: '94%', fontFamily: 'Inter_600SemiBold', fontSize: 7.2, lineHeight: 8.4, textAlign: 'center' },
  tileAge: { maxWidth: '94%', fontFamily: 'Inter_400Regular', fontSize: 8 },
  unavailableHex: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 7, gap: 1 },
  unavailableHexName: { maxWidth: '78%', fontFamily: 'Inter_700Bold', fontSize: 10, lineHeight: 12, textAlign: 'center' },
  unavailableHexSymbol: { maxWidth: '82%', fontFamily: 'Inter_600SemiBold', fontSize: 8, textAlign: 'center' },
  unavailableHexStatus: { maxWidth: '84%', fontFamily: 'Inter_400Regular', fontSize: 7, lineHeight: 9, textAlign: 'center' },
  unavailableHexBadge: { position: 'absolute', top: 10, right: 13, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  unavailableHexRemoveBadge: { right: 13 },
  tileBasis: { maxWidth: '94%', fontFamily: 'Inter_400Regular', fontSize: 7, letterSpacing: -0.1 },
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
