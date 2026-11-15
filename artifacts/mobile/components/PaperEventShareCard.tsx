import React from 'react';
import { ImageBackground, Text, useWindowDimensions, View } from 'react-native';
import { PaperChallengeMilestoneBadges } from '@/components/PaperChallengeMilestoneBadges';
import { useColors } from '@/hooks/useColors';
import {
  LEGACY_PAPER_CHALLENGE_ARTWORK_ID,
  type PaperChallengeMilestoneId,
  type PaperChallengeSummary,
} from '@/lib/paperChallenge';
import { EVENT_ARENA_ARTWORK_SOURCES } from '@/lib/eventArenaArtwork';

type Props = { event: PaperChallengeSummary; milestones?: PaperChallengeMilestoneId[] };

const money = (value: number) => `${value < 0 ? '−' : ''}$${Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function PaperEventShareCard({ event, milestones = [] }: Props) {
  const colors = useColors();
  const { fontScale } = useWindowDimensions();
  const largeText = fontScale >= 1.3;
  const start = new Date(event.eventStartAtMs).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const end = new Date(event.eventEndAtMs).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const symbols = event.symbolsTraded?.length ? event.symbolsTraded.join(' · ') : 'No trades this week';

  return (
    <ImageBackground
      testID={`paper-event-share-artwork-${event.eventId}`}
      source={EVENT_ARENA_ARTWORK_SOURCES[event.artworkId ?? LEGACY_PAPER_CHALLENGE_ARTWORK_ID]}
      resizeMode="cover"
      imageStyle={{ borderRadius: 24, opacity: 0.82 }}
      style={{ width: '100%', maxWidth: 360, minWidth: 0, borderRadius: 24, overflow: 'hidden' }}
    >
      <View
        testID={`paper-event-share-card-${event.eventId}`}
        style={{ padding: 22, borderWidth: 1, borderColor: colors.border, borderRadius: 24, backgroundColor: 'rgba(7,12,20,0.62)' }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 42, height: 42, borderRadius: 13, borderWidth: 1, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
            <Text allowFontScaling={false} style={{ color: colors.primary, fontFamily: 'Inter_700Bold', fontSize: 22 }}>M</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text allowFontScaling style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 12, letterSpacing: 1.4 }}>
              MEISNER METHOD
            </Text>
            <Text allowFontScaling style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium', fontSize: 10, letterSpacing: 1.1, marginTop: 4 }}>
              EVENT ARENA · RESULTS
            </Text>
          </View>
        </View>

        <View style={{ marginTop: 24, paddingTop: 18, borderTopWidth: 1, borderTopColor: colors.border }}>
          <Text allowFontScaling style={{ color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold', fontSize: 11, letterSpacing: 1.2 }}>
            {start} – {end}
          </Text>
          <Text allowFontScaling style={{ color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 1.1, marginTop: 16 }}>
            EVENT RETURN
          </Text>
          <Text
            allowFontScaling
            style={{
              color: event.returnPercent >= 0 ? colors.primary : colors.destructive,
              fontFamily: 'Inter_700Bold',
              fontSize: 44,
              flexShrink: 1,
              minWidth: 0,
              maxWidth: '100%',
              marginTop: 2,
            }}
          >
            {event.returnPercent >= 0 ? '+' : ''}{event.returnPercent.toFixed(2)}%
          </Text>
          <Text allowFontScaling style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 15, marginTop: 2 }}>
            {money(event.netProfit)} net
          </Text>
          <PaperChallengeMilestoneBadges milestones={milestones} />
        </View>

        <View style={{ flexDirection: largeText ? 'column' : 'row', gap: 10, marginTop: 22 }}>
          <View style={{ flex: 1, minWidth: 0, padding: 12, borderRadius: 13, backgroundColor: colors.background }}>
            <Text allowFontScaling style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium', fontSize: 10 }}>STARTING BALANCE</Text>
            <Text allowFontScaling style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 13, marginTop: 6 }}>
              {money(event.startEquity)}
            </Text>
          </View>
          <View style={{ flex: 1, minWidth: 0, padding: 12, borderRadius: 13, backgroundColor: colors.background }}>
            <Text allowFontScaling style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium', fontSize: 10 }}>ENDING BALANCE</Text>
            <Text allowFontScaling style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 13, marginTop: 6 }}>
              {money(event.endEquity)}
            </Text>
          </View>
        </View>

        <View style={{ marginTop: 18 }}>
          <Text allowFontScaling style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>
            {event.buyCount} buys · {event.sellCount} sells · {event.tradeCount} trades
          </Text>
          <Text allowFontScaling numberOfLines={2} style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 7 }}>
            {symbols}
          </Text>
        </View>

        <View style={{ marginTop: 22, paddingTop: 13, borderTopWidth: 1, borderTopColor: colors.border }}>
          <Text allowFontScaling style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium', fontSize: 9, letterSpacing: 1 }}>
            PAPER TRADING · SIMULATED RESULTS
          </Text>
        </View>
      </View>
    </ImageBackground>
  );
}
