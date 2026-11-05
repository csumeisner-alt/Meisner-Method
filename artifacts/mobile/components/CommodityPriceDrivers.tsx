import React, { useEffect, useState } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { loadCommodityPriceDrivers, type CommodityPriceDrivers as CommodityDriverData } from '@/lib/commodityPriceDrivers';

const DRIVER_REQUEST_TIMEOUT_MS = 8_000;

type DriverState =
  | { symbol: string; status: 'ready'; drivers: CommodityDriverData }
  | { symbol: string; status: 'unavailable'; drivers: null }
  | { symbol: string; status: 'error'; drivers: null };

export function CommodityPriceDrivers({
  symbol,
  visible,
  colors,
}: {
  symbol: string;
  visible: boolean;
  colors: ReturnType<typeof useColors>;
}) {
  const [driverState, setDriverState] = useState<DriverState | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const currentState = driverState?.symbol === symbol ? driverState : null;
  const status = !visible ? 'hidden' : currentState?.status ?? 'loading';
  const drivers = currentState?.status === 'ready' ? currentState.drivers : null;

  useEffect(() => {
    if (!visible) return;

    let isCurrent = true;
    let didTimeout = false;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      if (!isCurrent) return;
      didTimeout = true;
      setDriverState({ symbol, status: 'error', drivers: null });
      controller.abort();
    }, DRIVER_REQUEST_TIMEOUT_MS);

    void loadCommodityPriceDrivers(symbol, controller.signal)
      .then((result) => {
        if (!isCurrent || didTimeout || controller.signal.aborted) return;
        setDriverState(result
          ? { symbol, status: 'ready', drivers: result }
          : { symbol, status: 'unavailable', drivers: null });
      })
      .catch(() => {
        if (isCurrent && !didTimeout && !controller.signal.aborted) {
          setDriverState({ symbol, status: 'error', drivers: null });
        }
      })
      .finally(() => clearTimeout(timeoutId));

    return () => {
      isCurrent = false;
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [retryCount, symbol, visible]);

  if (!visible) return null;

  const cards = drivers
    ? [
      {
        key: 'up',
        title: 'Can push prices higher',
        body: drivers.up,
        color: colors.buyColor,
        icon: 'trending-up' as const,
      },
      {
        key: 'down',
        title: 'Can push prices lower',
        body: drivers.down,
        color: colors.sellColor,
        icon: 'trending-down' as const,
      },
    ]
    : [];

  return (
    <View testID="heat-map-commodity-price-drivers" style={styles.section}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.foreground }]}>Typical price drivers</Text>
        <Text style={[styles.caption, { color: colors.mutedForeground }]}>
          Common influences on this market
        </Text>
      </View>
      {status === 'loading' ? (
        <View testID="heat-map-commodity-driver-loading" style={styles.loading}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={[styles.unavailable, { color: colors.mutedForeground }]}>
            Loading typical price drivers…
          </Text>
        </View>
      ) : status === 'error' ? (
        <View testID="heat-map-commodity-driver-error" style={styles.errorBlock}>
          <Text style={[styles.unavailable, { color: colors.mutedForeground }]}>
            Could not load commodity price drivers. Please try again.
          </Text>
          <Pressable
            testID="heat-map-commodity-driver-retry"
            accessibilityRole="button"
            accessibilityLabel="Retry loading commodity price drivers"
            onPress={() => setRetryCount((count) => count + 1)}
            style={[styles.retryButton, { borderColor: colors.border }]}
          >
            <MaterialCommunityIcons name="refresh" size={14} color={colors.primary} />
            <Text style={[styles.retryText, { color: colors.primary }]}>Retry</Text>
          </Pressable>
        </View>
      ) : cards.length ? (
        <View style={styles.cards}>
          {cards.map((card) => (
            <View
              key={card.key}
              testID={`heat-map-commodity-driver-${card.key}`}
              style={[
                styles.card,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  borderLeftColor: card.color,
                },
              ]}
            >
              <View style={styles.cardHeader}>
                <MaterialCommunityIcons name={card.icon} size={15} color={card.color} />
                <Text style={[styles.cardTitle, { color: card.color }]}>{card.title}</Text>
              </View>
              <Text style={[styles.cardBody, { color: colors.foreground }]}>{card.body}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={[styles.unavailable, { color: colors.mutedForeground }]}>
          Commodity-specific drivers are not available for this symbol yet.
        </Text>
      )}
      <Text style={[styles.disclaimer, { color: colors.mutedForeground }]}>
        These are common influences, not predictions. Prices can move the other way, especially when news is already priced in.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 9, marginTop: 21 },
  header: { marginBottom: 1 },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  errorBlock: { alignItems: 'flex-start', gap: 8 },
  retryButton: { minHeight: 44, borderWidth: 1, borderRadius: 9, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 6 },
  retryText: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 16, letterSpacing: -0.15 },
  caption: { fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 16, marginTop: 2 },
  cards: { gap: 8 },
  card: { borderWidth: 1, borderLeftWidth: 3, borderRadius: 12, padding: 12 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  cardTitle: { fontFamily: 'Inter_700Bold', fontSize: 12, letterSpacing: 0.1 },
  cardBody: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19, marginTop: 7 },
  unavailable: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18 },
  disclaimer: { fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 16 },
});
