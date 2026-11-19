/**
 * Drag-to-reorder watchlist component.
 *
 * A platform-specific long-press on a row's main card area activates drag mode.
 * Dragging repositions the row in real time with a shadow "lift" effect. On
 * release the new order is committed and the parent is notified via `onReorder`.
 *
 * Implementation notes:
 * - Per-row drag gestures cover the card's main area and recognize
 *   simultaneously with the parent scroll gesture; action buttons stay separate.
 * - Shared values (draggedIdx, hoverIdx, dragTranslationY) run on the UI
 *   thread; React state (localOrder, ghostSymbol) is updated via runOnJS
 *   only at drag start/end to avoid JS-thread jank during the drag.
 * - Each WatchRow reads the shared values in useAnimatedStyle and shifts
 *   itself without JS involvement during the gesture.
 * - The floating ghost clone is driven by the same shared values and rendered
 *   with pointerEvents="none" so it never intercepts touches.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
  type SharedValue,
} from 'react-native-reanimated';
import { Gesture, GestureDetector, type GestureType } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { syncLocalOrder } from '@/lib/watchlistFilter';
import { useFocusEffect } from 'expo-router';
import { finishWatchlistDrag } from '@/lib/watchlistDrag';
import { reserveInteraction, releaseInteraction } from '@/lib/interactionOwnership';

// ── Constants ────────────────────────────────────────────────────────────────

/** Total vertical space (row height + margin) for one list item. */
const ITEM_HEIGHT = 76;
/** Visual height of the row card itself. */
const ROW_HEIGHT = 68;

// ── Types ────────────────────────────────────────────────────────────────────

export interface WatchlistItem {
  symbol: string;
  createdAt: string;
  sortOrder?: number;
}

export interface QuoteData {
  currentPrice: number;
  priceChange: number;
  priceChangePercent: number;
}

export interface AlertData {
  id: string;
  symbol: string;
  direction: 'above' | 'below';
  targetPrice: number;
  firedAt: string | null;
}

interface Props {
  items: WatchlistItem[];
  quotes: Map<string, QuoteData>;
  activeAlertFor: (symbol: string) => AlertData | null;
  onNavigate: (symbol: string) => void;
  onRemove: (symbol: string) => void;
  onReorder: (symbols: string[]) => void;
  onOpenAlert: (symbol: string, price?: number) => void;
  /** Native scroll gesture used to coordinate row dragging and list scrolling. */
  scrollGesture: GestureType;
  /** Called when drag starts/ends so the parent can disable outer scroll. */
  onDragActive?: (active: boolean) => void;
  colors: ReturnType<typeof import('@/hooks/useColors').useColors>;
  formatPrice: (p: number) => string;
  formatPct: (p: number) => string;
}

// ── WatchRow ─────────────────────────────────────────────────────────────────

interface WatchRowProps {
  item: WatchlistItem;
  index: number;
  dragGesture: ReturnType<typeof Gesture.Pan> | ReturnType<typeof Gesture.Simultaneous>;
  draggedIdx: SharedValue<number>;
  hoverIdx: SharedValue<number>;
  quote?: QuoteData;
  alert: AlertData | null;
  onNavigate: (s: string) => void;
  onRemove: (s: string) => void;
  onOpenAlert: (s: string, price?: number) => void;
  colors: Props['colors'];
  formatPrice: (p: number) => string;
  formatPct: (p: number) => string;
}

function WatchRow({
  item, index, dragGesture, draggedIdx, hoverIdx,
  quote, alert, onNavigate, onRemove, onOpenAlert,
  colors, formatPrice, formatPct,
}: WatchRowProps) {
  const up = (quote?.priceChangePercent ?? 0) >= 0;
  const pctColor = up ? colors.buyColor : colors.sellColor;

  const animStyle = useAnimatedStyle(() => {
    const di = draggedIdx.value;
    const hi = hoverIdx.value;

    // No drag active
    if (di === -1) return { opacity: 1, transform: [{ translateY: 0 }] };

    // This is the placeholder (stays in original spot, faded)
    if (index === di) return { opacity: 0.25, transform: [{ translateY: 0 }] };

    // Shift surrounding items to open/close the gap
    const lo = Math.min(di, hi);
    const hi2 = Math.max(di, hi);
    if (index > lo && index <= hi2) {
      const dir = hi > di ? -1 : 1; // dragging down → items above shift up
      return {
        opacity: 1,
        transform: [
          { translateY: withSpring(dir * ITEM_HEIGHT, { damping: 20, stiffness: 200 }) },
        ],
      };
    }

    return {
      opacity: 1,
      transform: [{ translateY: withSpring(0, { damping: 20, stiffness: 200 }) }],
    };
  });

  return (
    <Animated.View
      style={[
        rowStyles.row,
        { backgroundColor: colors.card, borderColor: colors.border },
        animStyle,
      ]}
    >
      {/* Hold anywhere in the main card area to reorder; action buttons stay tappable. */}
      <GestureDetector gesture={dragGesture} touchAction="pan-y">
        <View style={rowStyles.dragRegion}>
          <View
            style={rowStyles.dragHandle}
            accessible
            accessibilityRole="button"
            accessibilityLabel={`Reorder ${item.symbol}`}
            accessibilityHint="Long press anywhere on this ticker card and drag to change its position."
          >
            <Feather name="menu" size={16} color={colors.mutedForeground} />
          </View>

          {/* Ticker + price (navigates on tap) */}
          <TouchableOpacity
            style={{ flex: 1 }}
            onPress={() => onNavigate(item.symbol)}
            activeOpacity={0.75}
          >
            <Text style={[rowStyles.sym, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
              {item.symbol}
            </Text>
            {quote ? (
              <View style={rowStyles.priceRow}>
                <Text style={[rowStyles.price, { color: colors.primary, fontFamily: 'Inter_600SemiBold' }]}>
                  {formatPrice(quote.currentPrice)}
                </Text>
                <Text style={[rowStyles.pct, { color: pctColor, fontFamily: 'Inter_500Medium' }]}>
                  {formatPct(quote.priceChangePercent)}
                </Text>
              </View>
            ) : (
              <ActivityIndicator
                size="small"
                color={colors.mutedForeground}
                style={{ alignSelf: 'flex-start', marginTop: 4 }}
              />
            )}
          </TouchableOpacity>
        </View>
      </GestureDetector>

      {/* Bell + remove */}
      <View style={rowStyles.actions}>
        <TouchableOpacity
          testID={`watchlist-alert-${item.symbol}`}
          accessibilityLabel={`${alert ? 'Edit' : 'Set'} price alert for ${item.symbol}`}
          onPress={() => onOpenAlert(item.symbol, quote?.currentPrice)}
          style={[
            rowStyles.alertIconBtn,
            alert
              ? { backgroundColor: colors.buyBg, borderColor: colors.buyColor, borderWidth: 1 }
              : {},
          ]}
          activeOpacity={0.7}
        >
          <Feather
            name="bell"
            size={20}
            color={alert ? colors.buyColor : colors.mutedForeground}
          />
        </TouchableOpacity>
        <TouchableOpacity
          testID={`watchlist-remove-${item.symbol}`}
          accessibilityLabel={`Remove ${item.symbol} from watchlist`}
          onPress={() => onRemove(item.symbol)}
          style={rowStyles.iconBtn}
          activeOpacity={0.7}
        >
          <Feather name="x" size={16} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

// ── FloatingGhost ─────────────────────────────────────────────────────────────

interface GhostProps {
  symbol: string;
  n: number;
  draggedIdx: SharedValue<number>;
  dragTranslationY: SharedValue<number>;
  quote?: QuoteData;
  alert: AlertData | null;
  colors: Props['colors'];
  formatPrice: (p: number) => string;
  formatPct: (p: number) => string;
}

function FloatingGhost({
  symbol, draggedIdx, dragTranslationY, n,
  quote, alert, colors, formatPrice, formatPct,
}: GhostProps) {
  const up = (quote?.priceChangePercent ?? 0) >= 0;
  const pctColor = up ? colors.buyColor : colors.sellColor;

  const ghostStyle = useAnimatedStyle(() => {
    const di = draggedIdx.value;
    if (di === -1) return { opacity: 0 };
    const clampedY = Math.max(0, Math.min((n - 1) * ITEM_HEIGHT, di * ITEM_HEIGHT + dragTranslationY.value));
    return {
      opacity: 1,
      transform: [{ translateY: clampedY }],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        rowStyles.row,
        rowStyles.ghost,
        {
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          backgroundColor: colors.card,
          borderColor: colors.primary,
          shadowColor: '#000',
          shadowOpacity: 0.3,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 6 },
          elevation: 12,
        },
        ghostStyle,
      ]}
    >
      <Feather name="menu" size={16} color={colors.primary} style={rowStyles.dragHandle} />
      <View style={{ flex: 1 }}>
        <Text style={[rowStyles.sym, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
          {symbol}
        </Text>
        {quote ? (
          <View style={rowStyles.priceRow}>
            <Text style={[rowStyles.price, { color: colors.primary, fontFamily: 'Inter_600SemiBold' }]}>
              {formatPrice(quote.currentPrice)}
            </Text>
            <Text style={[rowStyles.pct, { color: pctColor, fontFamily: 'Inter_500Medium' }]}>
              {formatPct(quote.priceChangePercent)}
            </Text>
          </View>
        ) : null}
      </View>
      <View style={rowStyles.actions}>
        <View
          style={[
            rowStyles.alertIconBtn,
            alert ? { backgroundColor: colors.buyBg, borderColor: colors.buyColor, borderWidth: 1 } : {},
          ]}
        >
          <Feather name="bell" size={20} color={alert ? colors.buyColor : colors.mutedForeground} />
        </View>
        <View style={rowStyles.iconBtn}>
          <Feather name="x" size={16} color={colors.mutedForeground} />
        </View>
      </View>
    </Animated.View>
  );
}

// ── DraggableWatchlist ────────────────────────────────────────────────────────

export function DraggableWatchlist({
  items, quotes, activeAlertFor, scrollGesture,
  onNavigate, onRemove, onReorder, onOpenAlert,
  onDragActive, colors, formatPrice, formatPct,
}: Props) {
  // Local display order — synced from `items` whenever the set of symbols changes
  const [localOrder, setLocalOrder] = useState<string[]>(() => items.map((i) => i.symbol));
  // Symbol of the currently-dragged item (JS state so FloatingGhost renders correctly)
  const [ghostSymbol, setGhostSymbol] = useState<string | null>(null);

  // Keep localOrder in sync with the incoming items. When the symbol *set*
  // changes (filter applied/cleared, add/remove) we adopt the incoming order
  // exactly; when the set is identical we keep the local order so an
  // optimistic drag result isn't clobbered by a stale refresh.
  const itemKey = items.map((i) => i.symbol).join(',');
  useEffect(() => {
    const incoming = items.map((i) => i.symbol);
    setLocalOrder((prev) => syncLocalOrder(prev, incoming));
  }, [itemKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const orderedItems = localOrder
    .map((sym) => items.find((i) => i.symbol === sym))
    .filter((x): x is WatchlistItem => x != null);
  const n = orderedItems.length;
  const orderedItemsRef = useRef(orderedItems);
  const onDragActiveRef = useRef(onDragActive);
  const onReorderRef = useRef(onReorder);
  orderedItemsRef.current = orderedItems;
  onDragActiveRef.current = onDragActive;
  onReorderRef.current = onReorder;

  // UI-thread shared values
  const draggedIdx = useSharedValue(-1);
  const hoverIdx = useSharedValue(-1);
  const dragTranslationY = useSharedValue(0);
  const dragSession = useRef<{ symbol: string; order: string[] } | null>(null);
  const screenFocused = useRef(true);
  const owner = useRef({});
  const orderedKey = orderedItems.map((item) => item.symbol).join(',');

  const cancelDrag = useCallback(() => {
    dragSession.current = null;
    draggedIdx.value = -1;
    hoverIdx.value = -1;
    dragTranslationY.value = 0;
    setGhostSymbol(null);
    releaseInteraction(owner.current);
    onDragActiveRef.current?.(false);
  }, [draggedIdx, hoverIdx, dragTranslationY]);

  useFocusEffect(useCallback(() => {
    screenFocused.current = true;
    return () => {
      screenFocused.current = false;
      cancelDrag();
    };
  }, [cancelDrag]));
  useEffect(() => {
    cancelDrag();
  }, [itemKey, cancelDrag]);

  // ── JS callbacks invoked from worklets via runOnJS ──
  const triggerHaptic = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  }, []);

  const setDragActive = useCallback((active: boolean) => {
    onDragActiveRef.current?.(active);
  }, []);

  const startGhost = useCallback((symbol: string, order: string[]) => {
    if (!screenFocused.current || orderedItemsRef.current.map((item) => item.symbol).join(',') !== order.join(',')) {
      cancelDrag();
      return;
    }
    dragSession.current = { symbol, order };
    reserveInteraction(owner.current);
    setGhostSymbol(symbol);
  }, [cancelDrag]);

  const endDrag = useCallback((symbol: string, to: number, succeeded: boolean) => {
    const session = dragSession.current;
    dragSession.current = null;
    setGhostSymbol(null);
    releaseInteraction(owner.current);
    onDragActiveRef.current?.(false);
    if (!session || session.symbol !== symbol) return;
    const newOrder = finishWatchlistDrag(
      orderedItemsRef.current.map((item) => item.symbol), session.order, symbol, to, succeeded,
    );
    if (!newOrder) return;
    setLocalOrder(newOrder);
    onReorderRef.current(newOrder);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }, []);

  const rowDragGestures = useMemo(
    () => orderedItems.map((item, index) => {
      const symbol = item.symbol;
      const order = orderedItems.map((entry) => entry.symbol);
      const startDrag = () => {
        'worklet';
        draggedIdx.value = index;
        hoverIdx.value = index;
        dragTranslationY.value = 0;
        runOnJS(triggerHaptic)();
        runOnJS(setDragActive)(true);
        runOnJS(startGhost)(symbol, order);
      };
      const pan = Gesture.Pan()
        .simultaneousWithExternalGesture(scrollGesture)
        .onUpdate((event) => {
          if (draggedIdx.value !== index) return;
          dragTranslationY.value = event.translationY;
          const absoluteY = index * ITEM_HEIGHT + event.translationY;
          hoverIdx.value = Math.max(0, Math.min(n - 1, Math.round(absoluteY / ITEM_HEIGHT)));
        })
        .onFinalize((_event, succeeded) => {
          const from = draggedIdx.value;
          const to = hoverIdx.value;
          if (from !== index) return;
          draggedIdx.value = -1;
          hoverIdx.value = -1;
          dragTranslationY.value = 0;
          runOnJS(endDrag)(symbol, to, succeeded);
        });

      if (Platform.OS !== 'web') {
        return pan
          .activateAfterLongPress(420)
          .onStart(startDrag);
      }

      const longPress = Gesture.LongPress()
        .minDuration(320)
        .maxDistance(24)
        .simultaneousWithExternalGesture(scrollGesture)
        .onStart(startDrag)
        .onEnd((_event, succeeded) => {
          // A stationary hold may end without the web pan ever activating.
          // Moving beyond maxDistance fails the long press while the simultaneous
          // pan continues: that is not the end of the drag session.
          if (!succeeded || dragTranslationY.value !== 0) return;
          if (draggedIdx.value !== index) return;
          draggedIdx.value = -1;
          hoverIdx.value = -1;
          dragTranslationY.value = 0;
          runOnJS(endDrag)(symbol, index, false);
        });
      return Gesture.Simultaneous(longPress, pan);
    }),
    [draggedIdx, dragTranslationY, endDrag, hoverIdx, orderedKey, n, scrollGesture, setDragActive, startGhost, triggerHaptic],
  );

  const ghostQuote = ghostSymbol ? quotes.get(ghostSymbol) : undefined;
  const ghostAlert = ghostSymbol ? activeAlertFor(ghostSymbol) : null;

  return (
    <View style={{ position: 'relative', minHeight: n * ITEM_HEIGHT }}>
      {orderedItems.map((item, index) => (
        <WatchRow
          key={item.symbol}
          item={item}
          index={index}
          dragGesture={rowDragGestures[index]}
          draggedIdx={draggedIdx}
          hoverIdx={hoverIdx}
          quote={quotes.get(item.symbol)}
          alert={activeAlertFor(item.symbol)}
          onNavigate={onNavigate}
          onRemove={onRemove}
          onOpenAlert={onOpenAlert}
          colors={colors}
          formatPrice={formatPrice}
          formatPct={formatPct}
        />
      ))}

      {/* Floating ghost — only mounted when a drag is active */}
      {ghostSymbol != null && (
        <FloatingGhost
          symbol={ghostSymbol}
          n={n}
          draggedIdx={draggedIdx}
          dragTranslationY={dragTranslationY}
          quote={ghostQuote}
          alert={ghostAlert}
          colors={colors}
          formatPrice={formatPrice}
          formatPct={formatPct}
        />
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const rowStyles = StyleSheet.create({
  row: {
    height: ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    marginBottom: ITEM_HEIGHT - ROW_HEIGHT,
  },
  ghost: {
    borderWidth: 1.5,
  },
  dragHandle: {
    width: 40,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
    opacity: 0.65,
  },
  dragRegion: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  sym: { fontSize: 16 },
  price: { fontSize: 14 },
  pct: { fontSize: 12 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconBtn: { padding: 8, borderRadius: 8 },
  alertIconBtn: { padding: 10, borderRadius: 8, marginRight: 2 },
});
