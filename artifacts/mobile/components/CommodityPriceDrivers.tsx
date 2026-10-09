import React from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { getCommodityPriceDrivers } from '@/lib/commodityPriceDrivers';

export function CommodityPriceDrivers({
  symbol,
  colors,
}: {
  symbol: string;
  colors: ReturnType<typeof useColors>;
}) {
  const drivers = getCommodityPriceDrivers(symbol);
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
      {cards.length ? (
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
  title: { fontFamily: 'Inter_700Bold', fontSize: 15, letterSpacing: -0.15 },
  caption: { fontFamily: 'Inter_400Regular', fontSize: 9, lineHeight: 13, marginTop: 2 },
  cards: { gap: 8 },
  card: { borderWidth: 1, borderLeftWidth: 3, borderRadius: 12, padding: 11 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardTitle: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 0.1 },
  cardBody: { fontFamily: 'Inter_400Regular', fontSize: 10, lineHeight: 15, marginTop: 6 },
  unavailable: { fontFamily: 'Inter_400Regular', fontSize: 10, lineHeight: 15 },
  disclaimer: { fontFamily: 'Inter_400Regular', fontSize: 9, lineHeight: 13 },
});
