import React from 'react';
import { Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useColors } from '@/hooks/useColors';
import type { PaperChallengeSummary } from '@/lib/paperChallenge';

type Props = { event: PaperChallengeSummary };

const money = (value: number) => `${value < 0 ? '−' : ''}$${Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function PaperEventShareCard({ event }: Props) {
  const colors = useColors();
  const start = new Date(event.eventStartAtMs).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const end = new Date(event.eventEndAtMs).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const symbols = event.symbolsTraded?.length ? event.symbolsTraded.join(' · ') : 'No trades this week';

  return (
    <View style={{ width: '100%', maxWidth: 360, borderRadius: 24, overflow: 'hidden' }}>
      <LinearGradient
        colors={[colors.card, colors.background]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ padding: 22, borderWidth: 1, borderColor: colors.border, borderRadius: 24 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 42, height: 42, borderRadius: 13, borderWidth: 1, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: colors.primary, fontFamily: 'Inter_700Bold', fontSize: 22 }}>M</Text>
          </View>
          <View>
            <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 12, letterSpacing: 1.4 }}>
              MEISNER METHOD
            </Text>
            <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium', fontSize: 10, letterSpacing: 1.1, marginTop: 4 }}>
              EVENT ARENA · RESULTS
            </Text>
          </View>
        </View>

        <View style={{ marginTop: 24, paddingTop: 18, borderTopWidth: 1, borderTopColor: colors.border }}>
          <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold', fontSize: 11, letterSpacing: 1.2 }}>
            {start} – {end}
          </Text>
          <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 1.1, marginTop: 16 }}>
            EVENT RETURN
          </Text>
          <Text style={{ color: event.returnPercent >= 0 ? colors.primary : colors.destructive, fontFamily: 'Inter_700Bold', fontSize: 44, marginTop: 2 }}>
            {event.returnPercent >= 0 ? '+' : ''}{event.returnPercent.toFixed(2)}%
          </Text>
          <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 15, marginTop: 2 }}>
            {money(event.netProfit)} net
          </Text>
        </View>

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 22 }}>
          <View style={{ flex: 1, padding: 12, borderRadius: 13, backgroundColor: colors.background }}>
            <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium', fontSize: 10 }}>STARTING BALANCE</Text>
            <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 13, marginTop: 6 }}>
              {money(event.startEquity)}
            </Text>
          </View>
          <View style={{ flex: 1, padding: 12, borderRadius: 13, backgroundColor: colors.background }}>
            <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium', fontSize: 10 }}>ENDING BALANCE</Text>
            <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 13, marginTop: 6 }}>
              {money(event.endEquity)}
            </Text>
          </View>
        </View>

        <View style={{ marginTop: 18 }}>
          <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>
            {event.buyCount} buys · {event.sellCount} sells · {event.tradeCount} trades
          </Text>
          <Text numberOfLines={2} style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 7 }}>
            {symbols}
          </Text>
        </View>

        <View style={{ marginTop: 22, paddingTop: 13, borderTopWidth: 1, borderTopColor: colors.border }}>
          <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium', fontSize: 9, letterSpacing: 1 }}>
            PAPER TRADING · SIMULATED RESULTS
          </Text>
        </View>
      </LinearGradient>
    </View>
  );
}
