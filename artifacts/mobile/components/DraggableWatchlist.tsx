/**
 * Drag-to-reorder watchlist component.
 *
 * Long-press (400 ms) on any row activates drag mode.  Dragging repositions
 * the row in real time with a shadow "lift" effect.  On release the new order
 * is committed and the parent is notified via `onReorder`.
 *
 * Implementation notes:
 * - A single GestureDetector with `Gesture.Pan().activateAfterLongPress()`
 *   wraps the whole list so we don't need per-row gesture handlers.
 * - Shared values (draggedIdx, hoverIdx, dragTranslationY) run on the UI
 *   thread; React state (localOrder, ghostSymbol) is updated via runOnJS
 *   only at drag start/end to avoid JS-thread jank during the drag.
 * - Each WatchRow reads the shared values in useAnimatedStyle and shifts
 *   itself without JS involvement during the gesture.
 * - The floating ghost clone is driven by the same shared values and rendered
 *   with pointerEvents="none" so it never intercepts touches.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
  type SharedValue,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { syncLocalOrder } from '@/lib/watchlistFilter';

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
  item, index, draggedIdx, hoverIdx,
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
      {/* Drag handle — visual affordance for the gesture */}
      <Feather
        name="menu"
        size={16}
        color={colors.mutedForeground}
        style={rowStyles.dragHandle}
      />

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
  items, quotes, activeAlertFor,
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

  // UI-thread shared values
  const draggedIdx = useSharedValue(-1);
  const hoverIdx = useSharedValue(-1);
  const dragTranslationY = useSharedValue(0);

  // ── JS callbacks invoked from worklets via runOnJS ──
  const triggerHaptic = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, []);

  const triggerLightHaptic = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const setDragActive = useCallback(
    (active: boolean) => onDragActive?.(active),
    [onDragActive],
  );

  const startGhost = useCallback(
    (idx: number) => {
      const sym = orderedItems[idx]?.symbol ?? null;
      setGhostSymbol(sym);
    },
    [orderedItems],
  );

  const endDrag = useCallback(
    (from: number, to: number) => {
      setGhostSymbol(null);
      onDragActive?.(false);
      if (from < 0 || from >= n || to < 0 || to >= n || from === to) return;
      const newOrder = orderedItems.map((i) => i.symbol);
      const [moved] = newOrder.splice(from, 1);
      newOrder.splice(to, 0, moved);
      setLocalOrder(newOrder);
      onReorder(newOrder);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    [orderedItems, onReorder, onDragActive, n],
  );

  // ── Gesture ──────────────────────────────────────────────────────────────
  const dragGesture = Gesture.Pan()
    .activateAfterLongPress(400)
    .onBegin((e) => {
      const idx = Math.max(0, Math.min(n - 1, Math.floor(e.y / ITEM_HEIGHT)));
      draggedIdx.value = idx;
      hoverIdx.value = idx;
      dragTranslationY.value = 0;
      runOnJS(triggerHaptic)();
      runOnJS(setDragActive)(true);
      runOnJS(startGhost)(idx);
    })
    .onUpdate((e) => {
      if (draggedIdx.value === -1) return;
      dragTranslationY.value = e.translationY;
      const absoluteY = draggedIdx.value * ITEM_HEIGHT + e.translationY;
      hoverIdx.value = Math.max(0, Math.min(n - 1, Math.round(absoluteY / ITEM_HEIGHT)));
    })
    .onFinalize(() => {
      const from = draggedIdx.value;
      const to = hoverIdx.value;
      draggedIdx.value = -1;
      hoverIdx.value = -1;
      dragTranslationY.value = 0;
      if (from !== -1) {
        runOnJS(endDrag)(from, to);
      } else {
        runOnJS(setDragActive)(false);
      }
    });

  const ghostQuote = ghostSymbol ? quotes.get(ghostSymbol) : undefined;
  const ghostAlert = ghostSymbol ? activeAlertFor(ghostSymbol) : null;

  return (
    <GestureDetector gesture={dragGesture}>
      <View style={{ position: 'relative', minHeight: n * ITEM_HEIGHT }}>
        {orderedItems.map((item, index) => (
          <WatchRow
            key={item.symbol}
            item={item}
            index={index}
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
    </GestureDetector>
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
    marginRight: 8,
    opacity: 0.5,
  },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  sym: { fontSize: 16 },
  price: { fontSize: 14 },
  pct: { fontSize: 12 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconBtn: { padding: 8, borderRadius: 8 },
  alertIconBtn: { padding: 10, borderRadius: 8, marginRight: 2 },
});
