import React, { useEffect, useRef, useState } from 'react';
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
  currentPrice?: number | null;
  priceChange?: number | null;
  priceChangePercent?: number | null;
  volume?: number | null;
  name?: string;
};

type MarketSnapshot = {
  total: number;
  advancers: number;
  decliners: number;
  unchanged: number;
  topGainers: TrendingTicker[];
  topDecliners: TrendingTicker[];
  mostActive: TrendingTicker[];
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

function buildMarketSnapshot(tickers: TrendingTicker[]): MarketSnapshot {
  const valid = tickers
    .filter(ticker => (
      Number.isFinite(ticker.priceChangePercent) &&
      Number.isFinite(ticker.volume)
    ));
  const gainers = valid
    .filter(ticker => (ticker.priceChangePercent ?? 0) > 0)
    .sort((a, b) => (b.priceChangePercent ?? 0) - (a.priceChangePercent ?? 0));
  const decliners = valid
    .filter(ticker => (ticker.priceChangePercent ?? 0) < 0)
    .sort((a, b) => (a.priceChangePercent ?? 0) - (b.priceChangePercent ?? 0));

  return {
    total: valid.length,
    advancers: gainers.length,
    decliners: decliners.length,
    unchanged: valid.length - gainers.length - decliners.length,
    topGainers: gainers.slice(0, 2),
    topDecliners: decliners.slice(0, 2),
    mostActive: [...valid]
      .sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0))
      .slice(0, 3),
  };
}

function formatCompactNumber(value: number | null | undefined) {
  if (!Number.isFinite(value)) return '—';
  if ((value ?? 0) >= 1e9) return `${((value ?? 0) / 1e9).toFixed(1)}B`;
  if ((value ?? 0) >= 1e6) return `${((value ?? 0) / 1e6).toFixed(1)}M`;
  if ((value ?? 0) >= 1e3) return `${((value ?? 0) / 1e3).toFixed(1)}K`;
  return `${Math.round(value ?? 0)}`;
}

function formatPercent(value: number | null | undefined) {
  if (!Number.isFinite(value)) return '—';
  return `${(value ?? 0) >= 0 ? '+' : ''}${(value ?? 0).toFixed(2)}%`;
}

function formatPrice(value: number | null | undefined) {
  if (!Number.isFinite(value)) return '—';
  return `$${(value ?? 0).toFixed(2)}`;
}

function SnapshotStat({
  label,
  value,
  color,
  colors,
}: {
  label: string;
  value: number;
  color: string;
  colors: ColorScheme;
}) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color, fontFamily: 'Inter_700Bold' }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }]}>
        {label}
      </Text>
    </View>
  );
}

function MoverRow({
  ticker,
  color,
  colors,
}: {
  ticker?: TrendingTicker;
  color: string;
  colors: ColorScheme;
}) {
  if (!ticker) {
    return <Text style={[styles.emptyMover, { color: colors.mutedForeground }]}>—</Text>;
  }

  return (
    <View style={styles.moverRow}>
      <Text style={[styles.moverSymbol, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
        {ticker.symbol}
      </Text>
      <Text style={[styles.moverChange, { color, fontFamily: 'Inter_600SemiBold' }]}>
        {formatPercent(ticker.priceChangePercent)}
      </Text>
    </View>
  );
}

function MarketSnapshotView({ snapshot, colors }: { snapshot: MarketSnapshot; colors: ColorScheme }) {
  if (snapshot.total === 0) {
    return (
      <View style={styles.unavailable}>
        <Feather name="radio" size={18} color={colors.goldMuted} />
        <Text style={[styles.unavailableTitle, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>
          LIVE SNAPSHOT UNAVAILABLE
        </Text>
        <Text style={[styles.unavailableText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
          The market data provider returned no active names.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.snapshot}>
      <View style={[styles.breadthRow, { borderColor: colors.border }]}>
        <SnapshotStat label="ADVANCING" value={snapshot.advancers} color={colors.buyColor} colors={colors} />
        <SnapshotStat label="DECLINING" value={snapshot.decliners} color={colors.sellColor} colors={colors} />
        <SnapshotStat label="FLAT" value={snapshot.unchanged} color={colors.mutedForeground} colors={colors} />
        <SnapshotStat label="TRACKED" value={snapshot.total} color={colors.gold} colors={colors} />
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionLabel, { color: colors.goldMuted, fontFamily: 'Inter_600SemiBold' }]}>
          TOP MOVERS · % TODAY
        </Text>
        <View style={styles.moverColumns}>
          <View style={styles.moverColumn}>
            <Text style={[styles.columnLabel, { color: colors.buyColor, fontFamily: 'Inter_600SemiBold' }]}>GAINERS</Text>
            <MoverRow ticker={snapshot.topGainers[0]} color={colors.buyColor} colors={colors} />
            <MoverRow ticker={snapshot.topGainers[1]} color={colors.buyColor} colors={colors} />
          </View>
          <View style={styles.moverColumn}>
            <Text style={[styles.columnLabel, { color: colors.sellColor, fontFamily: 'Inter_600SemiBold' }]}>DECLINERS</Text>
            <MoverRow ticker={snapshot.topDecliners[0]} color={colors.sellColor} colors={colors} />
            <MoverRow ticker={snapshot.topDecliners[1]} color={colors.sellColor} colors={colors} />
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionLabel, { color: colors.goldMuted, fontFamily: 'Inter_600SemiBold' }]}>
          MOST ACTIVE · VOLUME / PRICE
        </Text>
        <View style={styles.activeRow}>
          {snapshot.mostActive.map(ticker => (
            <View key={ticker.symbol} style={styles.activeItem}>
              <Text style={[styles.activeSymbol, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
                {ticker.symbol}
              </Text>
              <Text style={[styles.activePrice, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                {formatPrice(ticker.currentPrice)}
              </Text>
              <Text
                style={[
                  styles.activeChange,
                  {
                    color: (ticker.priceChangePercent ?? 0) >= 0 ? colors.buyColor : colors.sellColor,
                    fontFamily: 'Inter_600SemiBold',
                  },
                ]}
              >
                {formatPercent(ticker.priceChangePercent)}
              </Text>
              <Text style={[styles.activeVolume, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                {formatCompactNumber(ticker.volume)}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
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
  onQuoteViewed?: (quoteViewId: string) => Promise<{ earnedToken: boolean; halfway: boolean }>;
}) {
  const insets = useSafeAreaInsets();
  const [quoteMode, setQuoteMode] = useState(false);
  const [message, setMessage] = useState('');
  const [marketSnapshot, setMarketSnapshot] = useState<MarketSnapshot | null>(null);
  const [marketError, setMarketError] = useState(false);
  const [loading, setLoading] = useState(false);
  const visibleSessionRef = useRef(false);
  const quoteSessionRef = useRef(0);

  useEffect(() => {
    if (!visible) {
      visibleSessionRef.current = false;
      return;
    }
    if (!visibleSessionRef.current) {
      visibleSessionRef.current = true;
      quoteSessionRef.current += 1;
    }
  }, [visible]);

  useEffect(() => {
    if (!visible) return;

    let cancelled = false;
    const useQuote = Math.random() < 0.15;
    setQuoteMode(useQuote);
    setMarketSnapshot(null);
    setMarketError(false);

    if (useQuote) {
      const index = Math.floor(Math.random() * BIDEN_QUOTES.length);
      const quote = BIDEN_QUOTES[index] ?? BIDEN_QUOTES[0];
      setMessage(quote);
      setLoading(false);
      const rewardPromise = onQuoteViewed?.(`training-tape-${quoteSessionRef.current}`);
      if (rewardPromise) {
        void rewardPromise.then(update => {
          if (cancelled) return;
          if (update.halfway) {
            setMessage(`HALFWAY THERE · 50% COMPLETE\n\n${quote}`);
          } else if (update.earnedToken) {
            setMessage(`BREW TOKEN EARNED · +1 ADDED TO THE CENTRAL BANK\n\n${quote}`);
          }
        });
      }
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
        if (!cancelled) setMarketSnapshot(buildMarketSnapshot(Array.isArray(data) ? data : []));
      })
      .catch(() => {
        if (!cancelled) {
          setMarketError(true);
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
              {quoteMode ? 'ARCHIVE VOICE / OFF-SCRIPT' : 'LIVE MARKET SNAPSHOT'}
            </Text>
            {loading ? (
              <ActivityIndicator color={colors.gold} style={styles.loader} />
            ) : quoteMode ? (
              <Text style={[styles.message, { color: colors.foreground, fontFamily: 'Inter_500Medium' }, styles.quote]}>
                {message}
              </Text>
            ) : marketError ? (
              <View style={styles.unavailable}>
                <Feather name="wifi-off" size={18} color={colors.goldMuted} />
                <Text style={[styles.unavailableTitle, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>
                  LIVE SNAPSHOT OFFLINE
                </Text>
                <Text style={[styles.unavailableText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                  Try opening the tape again for a fresh market read.
                </Text>
              </View>
            ) : marketSnapshot ? (
              <MarketSnapshotView snapshot={marketSnapshot} colors={colors} />
            ) : (
              <ActivityIndicator color={colors.gold} style={styles.loader} />
            )}
          </View>

          <View style={styles.footer}>
            <Feather name="radio" size={13} color={colors.goldMuted} />
            <Text style={[styles.footerText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
              {quoteMode ? 'ARCHIVAL RECORDING' : 'MOST-ACTIVE UNIVERSE'}  •  {formatTapeDate()}
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
    minHeight: 292,
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
  snapshot: {
    width: '100%',
    gap: 13,
  },
  breadthRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    paddingBottom: 11,
  },
  stat: {
    alignItems: 'center',
    minWidth: 45,
  },
  statValue: {
    fontSize: 17,
    lineHeight: 20,
  },
  statLabel: {
    fontSize: 7,
    letterSpacing: 0.5,
    marginTop: 3,
  },
  section: {
    gap: 7,
  },
  sectionLabel: {
    fontSize: 8,
    letterSpacing: 1,
  },
  moverColumns: {
    flexDirection: 'row',
    gap: 18,
  },
  moverColumn: {
    flex: 1,
    gap: 4,
  },
  columnLabel: {
    fontSize: 8,
    letterSpacing: 0.8,
    marginBottom: 1,
  },
  moverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 18,
  },
  moverSymbol: {
    fontSize: 12,
  },
  moverChange: {
    fontSize: 11,
  },
  emptyMover: {
    fontSize: 13,
    lineHeight: 18,
  },
  activeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  activeItem: {
    flex: 1,
    minWidth: 0,
  },
  activeSymbol: {
    fontSize: 11,
  },
  activePrice: {
    fontSize: 9,
    marginTop: 2,
  },
  activeChange: {
    fontSize: 10,
    marginTop: 2,
  },
  activeVolume: {
    fontSize: 8,
    marginTop: 2,
  },
  unavailable: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 18,
  },
  unavailableTitle: {
    fontSize: 11,
    letterSpacing: 0.9,
    textAlign: 'center',
  },
  unavailableText: {
    fontSize: 11,
    lineHeight: 17,
    textAlign: 'center',
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