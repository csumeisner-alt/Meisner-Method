import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ColorScheme } from '@/constants/colors';

const BASE_URL = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

type TrendingTicker = {
  symbol: string;
  priceChangePercent: number;
  volume: number;
};

const BIDEN_QUOTES = [
  `You cannot go to a 7‑11 or a Dunkin’ Donuts unless you have a slight Indian accent… I’m not joking.`,
  `I may be Irish, but I’m not stupid.`,
  `I got hairy legs… that turn blonde in the sun.`,
  `Now we have over 120 million dead from COVID.`,
  `If you have a problem figuring out whether you’re for me or Trump, then you ain’t black.`,
  `But we cannot let this – we’ve never allowed any crisis from a Civil War straight through to a pandemic in ‘17, all the way around, ’16, we have never, never let our democracy take second fiddle, we can both have a democracy and elections and at the same time protect the public health.`,
  `Poor kids are just as bright and just as talented as white kids.`,
  `When the stock market crashed, Franklin Roosevelt got on the television and didn’t just talk about the princes of greed. He said, ‘Look, here’s what happened.’`,
  `He’s going to let the big banks once again write their own rules – unchain Wall Street. ` +
    `They’re gonna put y’all back in chains.`,
  `But I've never been a big fan of trickle-down economics. The—it was a hammer that was hammering working people. ` +
    `My dad used to say—my dad was a well-read man who didn't get to—he got accepted to go to Hopkins and—but during the war, ` +
    `he never got to go. But my dad used to talk about—he said, "Dad"—"Joey, not a whole lot trickles down on my kitchen table at the end of the month.`,
  `Black businesses ownership—back—Black businesses ownership is doubling. Hispanic business ownership is up by 40 percent since the pandemic. ` +
    `The share of women in business is also on the rise.`,
  `That’s why I and so damn many other people I grew up have cancer.`,
  `Lets go Brandon I agree.`,
];

function buildMarketSummary(tickers: TrendingTicker[]): string {
  const valid = tickers
    .filter(ticker => Number.isFinite(ticker.priceChangePercent))
    .sort((a, b) => (b.volume || 0) - (a.volume || 0));
  const gainers = valid.filter(ticker => ticker.priceChangePercent > 0);
  const decliners = valid.filter(ticker => ticker.priceChangePercent < 0);

  if (valid.length === 0) {
    return `Today’s tape is focused on momentum and volume: traders are watching whether early moves broaden beyond a few active names. Follow-through matters more than any single print in a session like this.`;
  }

  const active = valid[0]!.symbol;
  const leaders = gainers.slice(0, 2).map(ticker => ticker.symbol).join(' and ');
  const laggards = decliners.slice(0, 2).map(ticker => ticker.symbol).join(' and ');

  if (leaders && laggards) {
    return `Today’s tape is being driven by buying interest in ${leaders}, with ${laggards} showing the other side of the move. Volume is concentrated in ${active}, so breadth and follow-through are the key tells.`;
  }

  if (leaders) {
    return `Today’s tape is being driven by upside momentum in ${leaders}, led by the most-active names. Traders are watching whether that strength broadens beyond ${active} before calling it a durable move.`;
  }

  if (laggards) {
    return `Today’s tape is being driven by downside pressure in ${laggards}, with ${active} drawing the most attention. Traders are watching for stabilization and whether selling spreads across the active list.`;
  }

  return `Today’s tape is quiet but volume is still the signal: ${active} is the most-active name in the snapshot. Traders are waiting for a clearer directional move before committing to a trend.`;
}

function formatTapeDate() {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).toUpperCase();
}

export function TrainingTapeModal({
  visible,
  colors,
  onClose,
  onQuoteViewed,
}: {
  visible: boolean;
  colors: ColorScheme;
  onClose: () => void;
  onQuoteViewed?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [quoteMode, setQuoteMode] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) return;

    let cancelled = false;
    const useQuote = Math.random() < 0.15;
    setQuoteMode(useQuote);

    if (useQuote) {
      const index = Math.floor(Math.random() * BIDEN_QUOTES.length);
      setMessage(BIDEN_QUOTES[index] ?? BIDEN_QUOTES[0]);
      setLoading(false);
      onQuoteViewed?.();
      return () => {
        cancelled = true;
      };
    }

    setMessage('');
    setLoading(true);
    fetch(`${BASE_URL}/api/stocks/trending`)
      .then(async response => {
        if (!response.ok) throw new Error(`Market tape request failed: ${response.status}`);
        return await response.json() as TrendingTicker[];
      })
      .then(data => {
        if (!cancelled) setMessage(buildMarketSummary(Array.isArray(data) ? data : []));
      })
      .catch(() => {
        if (!cancelled) {
          setMessage(`The live tape is temporarily offline. Today’s market still comes down to momentum, volume, and whether early moves find broader follow-through.`);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [onQuoteViewed, visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View
        style={[
          styles.overlay,
          {
            paddingTop: insets.top + 18,
            paddingBottom: insets.bottom + 18,
          },
        ]}
      >
        <View style={[styles.shell, { backgroundColor: colors.steelShadow, borderColor: colors.gold }]}>
          <View style={[styles.topRule, { backgroundColor: colors.goldMuted }]} />
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={[styles.brand, { color: colors.gold, fontFamily: 'Inter_700Bold' }]}>
                MEISNER METHOD
              </Text>
              <Text style={[styles.tapeId, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                TRAINING TAPE 01
              </Text>
            </View>
            <View style={styles.headerRight}>
              <View style={styles.record}>
                <View style={styles.recordDot} />
                <Text style={[styles.recordText, { color: colors.sellColor, fontFamily: 'Inter_700Bold' }]}>REC</Text>
              </View>
              <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close training tape">
                <Feather name="x" size={20} color={colors.mutedForeground} />
              </Pressable>
            </View>
          </View>

          <View style={[styles.display, { backgroundColor: colors.background, borderColor: colors.goldMuted }]}>
            <View style={styles.scanlineOne} />
            <View style={styles.scanlineTwo} />
            <Text style={[styles.displayLabel, { color: colors.goldMuted, fontFamily: 'Inter_600SemiBold' }]}>
              {quoteMode ? 'ARCHIVE VOICE / OFF-SCRIPT' : 'TODAY’S MARKET TAPE'}
            </Text>
            {loading ? (
              <ActivityIndicator color={colors.gold} style={styles.loader} />
            ) : (
              <Text style={[styles.message, { color: colors.foreground, fontFamily: 'Inter_500Medium' }, quoteMode && styles.quote]}>
                {message}
              </Text>
            )}
          </View>

          <View style={styles.footer}>
            <Feather name="radio" size={13} color={colors.goldMuted} />
            <Text style={[styles.footerText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
              {quoteMode ? 'ARCHIVAL RECORDING' : 'LIVE MARKET SNAPSHOT'}  •  {formatTapeDate()}
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 18,
    backgroundColor: 'rgba(0,0,0,0.88)',
  },
  shell: {
    width: '100%',
    maxWidth: 460,
    borderWidth: 1,
    borderRadius: 5,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.45,
    shadowRadius: 24,
    elevation: 12,
  },
  topRule: {
    height: 3,
    marginBottom: 15,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  headerCopy: {
    gap: 3,
  },
  brand: {
    fontSize: 13,
    letterSpacing: 1.6,
  },
  tapeId: {
    fontSize: 9,
    letterSpacing: 1.2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15,
  },
  record: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  recordDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#ff3b3b',
  },
  recordText: {
    fontSize: 9,
    letterSpacing: 1,
  },
  display: {
    minHeight: 210,
    borderWidth: 1,
    borderRadius: 3,
    padding: 18,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  scanlineOne: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 34,
    height: 1,
    backgroundColor: 'rgba(214,173,84,0.08)',
  },
  scanlineTwo: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 34,
    height: 1,
    backgroundColor: 'rgba(214,173,84,0.08)',
  },
  displayLabel: {
    fontSize: 10,
    letterSpacing: 1.3,
    marginBottom: 16,
  },
  loader: {
    marginVertical: 22,
  },
  message: {
    fontSize: 16,
    lineHeight: 25,
    letterSpacing: 0.2,
  },
  quote: {
    fontSize: 15,
    lineHeight: 24,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 14,
  },
  footerText: {
    fontSize: 9,
    letterSpacing: 0.8,
  },
});