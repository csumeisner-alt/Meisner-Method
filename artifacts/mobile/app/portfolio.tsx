import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Modal,
  Pressable,
  Platform,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  RefreshControl,
  Animated,
  Easing,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import { useColors } from '@/hooks/useColors';
import { BottomTabBar } from '@/components/BottomTabBar';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Trade {
  id: string;
  symbol: string;
  type: 'buy' | 'sell';
  shares: number;
  pricePerShare: number;
  date: string;
}

interface Quote {
  currentPrice: number;
  priceChange: number;
  priceChangePercent: number;
}

interface Position {
  symbol: string;
  netShares: number;
  avgCost: number;
  avgSellPrice: number;
  totalBuyShares: number;
  totalSellShares: number;
  realizedPnL: number;
  unrealizedPnL: number;
  marketValue: number;
  costBasis: number;
  currentPrice: number | null;
  pctChange: number | null;
  trades: Trade[];
}

interface TradeGrade {
  grade: string;
  color: string;
  bgColor: string;
  label: string;
  context: string;
  returnPct: number;
  holdDays: number;
  profit: number;
  avgCost: number;
  compositeScore: number;
  celebrate: boolean; // A- or better
}

type PortfolioTab = 'positions' | 'trades';

// ─── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'meisner_portfolio_trades';
const BASE_URL = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

const SPARKLE_EMOJIS = ['✨', '⭐', '💫', '🌟', '🎉', '💎', '🏆', '🔥'];

const COMPLIMENTS_APLUS = [
  "Oh my gosh! That was absolutely flawless! You're a market genius — seriously, that trade was art!",
  "WOW! That return in that timeframe? You are on a completely different level! The market doesn't know what hit it!",
  "Incredible! That's one of the most impressive trades I've ever seen! You're built different!",
];
const COMPLIMENTS_A = [
  "Amazing trade! Your timing was spot-on and you absolutely cashed in. Keep going, you're on fire!",
  "That was brilliant! Your market instincts are seriously sharp. Most people only dream of returns like that!",
  "Beautiful trade! You read the market perfectly. You're making some serious moves!",
];
const COMPLIMENTS_AMINUS = [
  "Nice trade! A solid return with great timing — you're definitely getting the hang of this. Well done!",
  "Great job! That profit shows you know when to pull the trigger. Smart trading!",
  "Well done! That was a really solid, disciplined trade. You should be proud of that one!",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtCurrency = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
const fmtPct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
const fmtNum = (n: number, d = 4) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: d });

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function formatDateShort(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}

async function fetchQuote(symbol: string): Promise<Quote> {
  const res = await fetch(`${BASE_URL}/api/stocks/quote/${symbol}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json() as Quote & { error?: string };
  if (data.error) throw new Error(data.error);
  return data;
}

function computePositions(trades: Trade[], quotes: Record<string, Quote | null>): Position[] {
  const bySymbol: Record<string, Trade[]> = {};
  for (const t of trades) {
    if (!bySymbol[t.symbol]) bySymbol[t.symbol] = [];
    bySymbol[t.symbol].push(t);
  }
  return Object.entries(bySymbol).map(([symbol, sysTrades]) => {
    const sorted = [...sysTrades].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    let buyShares = 0, buyTotal = 0, sellShares = 0, sellTotal = 0;
    for (const t of sorted) {
      if (t.type === 'buy') { buyShares += t.shares; buyTotal += t.shares * t.pricePerShare; }
      else { sellShares += t.shares; sellTotal += t.shares * t.pricePerShare; }
    }
    const netShares = buyShares - sellShares;
    const avgCost = buyShares > 0 ? buyTotal / buyShares : 0;
    const avgSellPrice = sellShares > 0 ? sellTotal / sellShares : 0;
    const realizedPnL = sellShares > 0 ? sellShares * (avgSellPrice - avgCost) : 0;
    const q = quotes[symbol];
    const currentPrice = q?.currentPrice ?? null;
    const costBasis = netShares * avgCost;
    const marketValue = currentPrice != null ? netShares * currentPrice : 0;
    const unrealizedPnL = currentPrice != null ? netShares * (currentPrice - avgCost) : 0;
    const pctChange = avgCost > 0 && currentPrice != null
      ? ((currentPrice - avgCost) / avgCost) * 100 : null;
    return { symbol, netShares, avgCost, avgSellPrice, totalBuyShares: buyShares,
      totalSellShares: sellShares, realizedPnL, unrealizedPnL, marketValue,
      costBasis, currentPrice, pctChange, trades: sorted };
  });
}

function availableToSell(symbol: string, trades: Trade[], excludeId?: string): number {
  return trades
    .filter(t => t.symbol === symbol && t.id !== excludeId)
    .reduce((n, t) => (t.type === 'buy' ? n + t.shares : n - t.shares), 0);
}

/** Compute A+→F- grade for a sell trade. */
function computeSellGrade(sellTrade: Trade, allTrades: Trade[]): TradeGrade | null {
  if (sellTrade.type !== 'sell') return null;

  const sellDate = new Date(sellTrade.date);

  // All buy trades for this symbol before (or on) the sell date
  const priorBuys = allTrades.filter(
    t => t.symbol === sellTrade.symbol && t.type === 'buy'
      && t.id !== sellTrade.id
      && new Date(t.date) <= sellDate
  );
  if (!priorBuys.length) return null;

  const totalBuyShares = priorBuys.reduce((s, t) => s + t.shares, 0);
  const totalBuyCost = priorBuys.reduce((s, t) => s + t.shares * t.pricePerShare, 0);
  const avgCost = totalBuyCost / totalBuyShares;

  const profit = (sellTrade.pricePerShare - avgCost) * sellTrade.shares;
  const returnPct = ((sellTrade.pricePerShare - avgCost) / avgCost) * 100;

  const firstBuy = priorBuys.reduce((e, t) =>
    new Date(t.date) < new Date(e.date) ? t : e
  );
  const holdDays = Math.max(0, Math.floor(
    (sellDate.getTime() - new Date(firstBuy.date).getTime()) / 86_400_000
  ));

  // Time multiplier — reward quick profits, penalise slow losses
  function timeMult(days: number, positive: boolean): number {
    if (positive) {
      if (days <= 3)   return 3.0;
      if (days <= 7)   return 2.5;
      if (days <= 14)  return 2.0;
      if (days <= 30)  return 1.6;
      if (days <= 60)  return 1.3;
      if (days <= 90)  return 1.1;
      if (days <= 180) return 1.0;
      if (days <= 365) return 0.85;
      return 0.7;
    } else {
      if (days <= 3)   return 0.3;
      if (days <= 7)   return 0.4;
      if (days <= 14)  return 0.55;
      if (days <= 30)  return 0.7;
      if (days <= 60)  return 0.85;
      if (days <= 90)  return 1.0;
      if (days <= 180) return 1.15;
      if (days <= 365) return 1.3;
      return 1.5;
    }
  }

  const compositeScore = returnPct * timeMult(holdDays, returnPct >= 0);

  // Grade mapping
  let grade: string, color: string, bgColor: string, label: string;
  if      (compositeScore >= 75)  { grade = 'A+'; color = '#00e5a0'; bgColor = '#001a12'; label = 'Market Genius' }
  else if (compositeScore >= 50)  { grade = 'A';  color = '#00e5a0'; bgColor = '#001a12'; label = 'Excellent Trade' }
  else if (compositeScore >= 30)  { grade = 'A-'; color = '#00e5a0'; bgColor = '#001a12'; label = 'Great Trade' }
  else if (compositeScore >= 18)  { grade = 'B+'; color = '#4ade80'; bgColor = '#0a1a0e'; label = 'Solid Profit' }
  else if (compositeScore >= 10)  { grade = 'B';  color = '#4ade80'; bgColor = '#0a1a0e'; label = 'Good Trade' }
  else if (compositeScore >= 4)   { grade = 'B-'; color = '#86efac'; bgColor = '#0a1a0e'; label = 'Decent Trade' }
  else if (compositeScore >= 1)   { grade = 'C+'; color = '#fbbf24'; bgColor = '#1a1200'; label = 'Small Gain' }
  else if (compositeScore >= -2)  { grade = 'C';  color = '#f59e0b'; bgColor = '#1a1200'; label = 'Break Even' }
  else if (compositeScore >= -6)  { grade = 'C-'; color = '#f59e0b'; bgColor = '#1a1200'; label = 'Minor Loss' }
  else if (compositeScore >= -12) { grade = 'D+'; color = '#fb923c'; bgColor = '#1a0800'; label = 'Weak Trade' }
  else if (compositeScore >= -20) { grade = 'D';  color = '#f97316'; bgColor = '#1a0800'; label = 'Poor Trade' }
  else if (compositeScore >= -30) { grade = 'D-'; color = '#f97316'; bgColor = '#1a0800'; label = 'Bad Trade' }
  else if (compositeScore >= -45) { grade = 'F+'; color = '#ff3b3b'; bgColor = '#1a0000'; label = 'Big Loss' }
  else if (compositeScore >= -60) { grade = 'F';  color = '#ff3b3b'; bgColor = '#1a0000'; label = 'Heavy Loss' }
  else                             { grade = 'F-'; color = '#ff3b3b'; bgColor = '#1a0000'; label = 'Wipeout' }

  const holdStr = holdDays === 0 ? 'same day'
    : holdDays === 1 ? '1 day' : `${holdDays} days`;
  let context: string;
  if (returnPct >= 0) {
    if (holdDays <= 7) context = `Lightning flip — ${returnPct.toFixed(1)}% in ${holdStr}`;
    else if (holdDays <= 30) context = `Quick win — ${returnPct.toFixed(1)}% in ${holdStr}`;
    else context = `Patient hold — ${returnPct.toFixed(1)}% over ${holdStr}`;
  } else {
    if (holdDays <= 14) context = `Cut losses fast in ${holdStr} — disciplined exit`;
    else context = `Held ${holdStr} and lost ${Math.abs(returnPct).toFixed(1)}% — exit sooner next time`;
  }

  const celebrate = ['A+', 'A', 'A-'].includes(grade);
  return { grade, color, bgColor, label, context, returnPct, holdDays, profit, avgCost, compositeScore, celebrate };
}

function pickCompliment(grade: string): string {
  const arr = grade === 'A+' ? COMPLIMENTS_APLUS : grade === 'A' ? COMPLIMENTS_A : COMPLIMENTS_AMINUS;
  return arr[Math.floor(Math.random() * arr.length)];
}

// ─── Celebration Overlay ──────────────────────────────────────────────────────

function CelebrationOverlay({
  gradeInfo,
  onDismiss,
}: {
  gradeInfo: TradeGrade;
  onDismiss: () => void;
}) {
  const entryScale = useRef(new Animated.Value(0)).current;
  const bounceY    = useRef(new Animated.Value(0)).current;
  const rotateVal  = useRef(new Animated.Value(0)).current;
  const glowPulse  = useRef(new Animated.Value(0)).current;
  const fadeOut    = useRef(new Animated.Value(1)).current;

  const NUM_PARTICLES = 16;
  const particles = useRef(
    Array.from({ length: NUM_PARTICLES }, (_, i) => {
      const angle = (i / NUM_PARTICLES) * Math.PI * 2 + (Math.random() - 0.5) * 0.6;
      const dist = 90 + Math.random() * 110;
      return {
        angle,
        dist,
        tx: new Animated.Value(0),
        ty: new Animated.Value(0),
        op: new Animated.Value(0),
        sc: new Animated.Value(0.3),
      };
    })
  ).current;

  useEffect(() => {
    // Entry pop
    Animated.spring(entryScale, {
      toValue: 1, tension: 90, friction: 6, useNativeDriver: true,
    }).start();

    // Continuous bounce
    Animated.loop(
      Animated.sequence([
        Animated.timing(bounceY, { toValue: -18, duration: 420, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(bounceY, { toValue: 0,   duration: 420, easing: Easing.in(Easing.quad),  useNativeDriver: true }),
      ])
    ).start();

    // Wiggle rotate
    Animated.loop(
      Animated.sequence([
        Animated.timing(rotateVal, { toValue: 1,  duration: 280, useNativeDriver: true }),
        Animated.timing(rotateVal, { toValue: -1, duration: 280, useNativeDriver: true }),
        Animated.timing(rotateVal, { toValue: 0,  duration: 200, useNativeDriver: true }),
      ])
    ).start();

    // Glow pulse
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowPulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(glowPulse, { toValue: 0, duration: 700, useNativeDriver: true }),
      ])
    ).start();

    // Particle burst — loop every 2.8 s
    function burst() {
      particles.forEach((p, i) => {
        p.tx.setValue(0); p.ty.setValue(0); p.op.setValue(0); p.sc.setValue(0.3);
        Animated.sequence([
          Animated.delay(i * 40),
          Animated.parallel([
            Animated.spring(p.tx, { toValue: Math.cos(p.angle) * p.dist, useNativeDriver: true }),
            Animated.spring(p.ty, { toValue: Math.sin(p.angle) * p.dist, useNativeDriver: true }),
            Animated.timing(p.op, { toValue: 1, duration: 200, useNativeDriver: true }),
            Animated.spring(p.sc, { toValue: 1,  useNativeDriver: true }),
          ]),
          Animated.delay(1200),
          Animated.timing(p.op, { toValue: 0, duration: 600, useNativeDriver: true }),
        ]).start();
      });
    }
    burst();
    const interval = setInterval(burst, 2800);

    // Speak
    try {
      Speech.speak(pickCompliment(gradeInfo.grade), {
        language: 'en-US', pitch: 1.15, rate: 0.92,
      });
    } catch (_) {}

    // Fade out + dismiss after 6.5 s
    const fadeTimer = setTimeout(() => {
      Animated.timing(fadeOut, { toValue: 0, duration: 500, useNativeDriver: true }).start(onDismiss);
    }, 6000);

    return () => {
      clearInterval(interval);
      clearTimeout(fadeTimer);
      try { Speech.stop(); } catch (_) {}
    };
  }, []);

  const spin = rotateVal.interpolate({ inputRange: [-1, 1], outputRange: ['-16deg', '16deg'] });
  const glowOp = glowPulse.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.75] });

  return (
    <Animated.View style={[celebStyles.overlay, { opacity: fadeOut }]} pointerEvents="box-none">
      <Pressable style={StyleSheet.absoluteFillObject} onPress={onDismiss} />

      {/* Particles — anchored at center */}
      <View style={celebStyles.particleAnchor} pointerEvents="none">
        {particles.map((p, i) => (
          <Animated.View
            key={i}
            style={{
              position: 'absolute',
              transform: [{ translateX: p.tx }, { translateY: p.ty }, { scale: p.sc }],
              opacity: p.op,
            }}
          >
            <Text style={celebStyles.particle}>{SPARKLE_EMOJIS[i % SPARKLE_EMOJIS.length]}</Text>
          </Animated.View>
        ))}
      </View>

      {/* Main card */}
      <Animated.View style={[
        celebStyles.card,
        { transform: [{ scale: entryScale }, { translateY: bounceY }] },
      ]}>
        {/* Glow ring behind emoji */}
        <Animated.View style={[celebStyles.glowRing, { backgroundColor: gradeInfo.color, opacity: glowOp }]} />

        {/* Dancing character */}
        <Animated.Text style={[celebStyles.dancer, { transform: [{ rotate: spin }] }]}>
          💃
        </Animated.Text>

        {/* Stars row */}
        <Text style={celebStyles.starsRow}>⭐ ⭐ ⭐</Text>

        {/* Grade display */}
        <View style={[celebStyles.gradePill, { backgroundColor: gradeInfo.bgColor, borderColor: gradeInfo.color }]}>
          <Text style={[celebStyles.gradeSmallLabel, { color: gradeInfo.color }]}>TRADE GRADE</Text>
          <Text style={[celebStyles.gradeBig, { color: gradeInfo.color }]}>{gradeInfo.grade}</Text>
          <Text style={[celebStyles.gradeLabel2, { color: gradeInfo.color }]}>{gradeInfo.label.toUpperCase()}</Text>
        </View>

        {/* Profit */}
        <Text style={[celebStyles.profitAmt, { color: gradeInfo.profit >= 0 ? '#00e5a0' : '#ff3b3b' }]}>
          {gradeInfo.profit >= 0 ? '+' : ''}{fmtCurrency(gradeInfo.profit)}
        </Text>
        <Text style={celebStyles.profitPct}>
          {fmtPct(gradeInfo.returnPct)} in {gradeInfo.holdDays <= 1
            ? (gradeInfo.holdDays === 0 ? 'same day' : '1 day')
            : `${gradeInfo.holdDays} days`}
        </Text>

        <Text style={celebStyles.tapDismiss}>tap anywhere to dismiss</Text>
      </Animated.View>
    </Animated.View>
  );
}

const celebStyles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.82)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  particleAnchor: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  particle: { fontSize: 22 },
  card: {
    alignItems: 'center',
    paddingHorizontal: 36,
    paddingVertical: 28,
    borderRadius: 24,
    backgroundColor: '#111111',
    borderWidth: 1,
    borderColor: 'rgba(192,192,192,0.2)',
    gap: 8,
    minWidth: 280,
  },
  glowRing: {
    position: 'absolute',
    top: 10,
    width: 100,
    height: 100,
    borderRadius: 50,
    opacity: 0.5,
  },
  dancer: { fontSize: 80 },
  starsRow: { fontSize: 20, letterSpacing: 8 },
  gradePill: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  gradeSmallLabel: { fontSize: 9, letterSpacing: 2, fontFamily: 'Inter_600SemiBold', marginBottom: 2 },
  gradeBig: { fontSize: 56, fontFamily: 'Inter_700Bold', lineHeight: 64 },
  gradeLabel2: { fontSize: 11, letterSpacing: 1.5, fontFamily: 'Inter_700Bold' },
  profitAmt: { fontSize: 24, fontFamily: 'Inter_700Bold', marginTop: 4 },
  profitPct: { fontSize: 13, color: 'rgba(192,192,192,0.7)', fontFamily: 'Inter_400Regular' },
  tapDismiss: { fontSize: 10, color: 'rgba(192,192,192,0.35)', fontFamily: 'Inter_400Regular', marginTop: 8 },
});

// ─── Compact Position Row ─────────────────────────────────────────────────────

function PositionRow({
  position, onSell, onBuyMore, colors,
}: {
  position: Position; onSell: () => void; onBuyMore: () => void; colors: any;
}) {
  const isLong = position.netShares > 0;
  const pnl = position.unrealizedPnL;
  const pnlColor = pnl > 0 ? colors.buyColor : pnl < 0 ? colors.sellColor : colors.mutedForeground;

  return (
    <View style={[rowStyles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={rowStyles.leftCol}>
        <Text style={[rowStyles.sym, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>{position.symbol}</Text>
        <View style={[rowStyles.badge, {
          backgroundColor: isLong ? colors.buyBg : colors.sellBg,
          borderColor: isLong ? colors.buyColor : colors.sellColor,
        }]}>
          <Text style={[rowStyles.badgeTxt, { color: isLong ? colors.buyColor : colors.sellColor, fontFamily: 'Inter_700Bold' }]}>
            {isLong ? 'LONG' : 'SHORT'}
          </Text>
        </View>
      </View>
      <View style={rowStyles.midCol}>
        <Text style={[rowStyles.midTop, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>
          {fmtNum(Math.abs(position.netShares), 2)} sh
        </Text>
        <Text style={[rowStyles.midBot, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
          avg {fmtCurrency(position.avgCost)}
        </Text>
      </View>
      <View style={rowStyles.pnlCol}>
        <Text style={[rowStyles.pnlTop, { color: position.currentPrice != null ? pnlColor : colors.mutedForeground, fontFamily: 'Inter_700Bold' }]}>
          {position.currentPrice != null ? `${pnl >= 0 ? '+' : ''}${fmtCurrency(pnl)}` : '—'}
        </Text>
        <Text style={[rowStyles.pnlBot, { color: position.currentPrice != null ? pnlColor : colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
          {position.currentPrice != null && position.pctChange != null ? fmtPct(position.pctChange) : '—'}
        </Text>
      </View>
      <TouchableOpacity
        style={[rowStyles.actionBtn, { borderColor: isLong ? colors.sellColor : colors.buyColor }]}
        onPress={isLong ? onSell : onBuyMore}
        activeOpacity={0.7}
      >
        <Text style={[rowStyles.actionTxt, { color: isLong ? colors.sellColor : colors.buyColor, fontFamily: 'Inter_700Bold' }]}>
          {isLong ? 'SELL' : 'CLOSE'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const rowStyles = StyleSheet.create({
  row: { borderRadius: 10, borderWidth: 1, marginBottom: 6, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 9, gap: 8 },
  leftCol: { width: 60, gap: 4 },
  sym: { fontSize: 15 },
  badge: { borderWidth: 1, borderRadius: 3, paddingHorizontal: 5, paddingVertical: 1, alignSelf: 'flex-start' },
  badgeTxt: { fontSize: 7, letterSpacing: 0.4 },
  midCol: { flex: 1, gap: 3 },
  midTop: { fontSize: 12 },
  midBot: { fontSize: 10 },
  pnlCol: { alignItems: 'flex-end', gap: 3, minWidth: 86 },
  pnlTop: { fontSize: 12 },
  pnlBot: { fontSize: 10 },
  actionBtn: { borderWidth: 1, borderRadius: 5, paddingHorizontal: 8, paddingVertical: 5, minWidth: 40, alignItems: 'center' },
  actionTxt: { fontSize: 9, letterSpacing: 0.5 },
});

// ─── Trade History Card ────────────────────────────────────────────────────────

function TradeCard({
  trade,
  quote,
  gradeInfo,
  expanded,
  onToggleExpand,
  onEdit,
  onDelete,
  colors,
}: {
  trade: Trade;
  quote: Quote | null | undefined;
  gradeInfo: TradeGrade | null;
  expanded: boolean;
  onToggleExpand: () => void;
  onEdit: () => void;
  onDelete: () => void;
  colors: any;
}) {
  const isBuy = trade.type === 'buy';

  return (
    <View style={[tcStyles.card, { backgroundColor: colors.card, borderColor: gradeInfo ? gradeInfo.color + '60' : colors.border }]}>
      {/* Top row: symbol / type badge / grade / actions */}
      <TouchableOpacity style={tcStyles.top} onPress={onToggleExpand} activeOpacity={0.75}>
        <View style={tcStyles.topLeft}>
          <Text style={[tcStyles.symbol, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>{trade.symbol}</Text>
          <View style={[tcStyles.typeBadge, {
            backgroundColor: isBuy ? colors.buyBg : colors.sellBg,
            borderColor: isBuy ? colors.buyColor : colors.sellColor,
          }]}>
            <Text style={[tcStyles.typeBadgeTxt, { color: isBuy ? colors.buyColor : colors.sellColor, fontFamily: 'Inter_700Bold' }]}>
              {isBuy ? 'BUY' : 'SELL'}
            </Text>
          </View>
          <Text style={[tcStyles.date, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
            {formatDateShort(trade.date)}
          </Text>
        </View>

        <View style={tcStyles.topRight}>
          {/* Grade badge — only for sell trades */}
          {gradeInfo && (
            <View style={[tcStyles.gradeBadge, { backgroundColor: gradeInfo.bgColor, borderColor: gradeInfo.color }]}>
              <Text style={[tcStyles.gradeBadgeTxt, { color: gradeInfo.color, fontFamily: 'Inter_700Bold' }]}>
                {gradeInfo.grade}
              </Text>
            </View>
          )}
          <TouchableOpacity onPress={onEdit} style={tcStyles.iconBtn} activeOpacity={0.7}>
            <Feather name="edit-2" size={13} color={colors.mutedForeground} />
          </TouchableOpacity>
          <TouchableOpacity onPress={onDelete} style={tcStyles.iconBtn} activeOpacity={0.7}>
            <Feather name="trash-2" size={13} color={colors.sellColor} />
          </TouchableOpacity>
          <Feather name={expanded ? 'chevron-up' : 'chevron-down'} size={13} color={colors.mutedForeground} />
        </View>
      </TouchableOpacity>

      <View style={[tcStyles.divider, { backgroundColor: colors.border }]} />

      {/* Core metrics row */}
      <View style={tcStyles.metrics}>
        {[
          { label: 'SHARES', value: fmtNum(trade.shares, 4) },
          { label: isBuy ? 'BUY PRICE' : 'SELL PRICE', value: fmtCurrency(trade.pricePerShare) },
          { label: 'TOTAL', value: fmtCurrency(trade.shares * trade.pricePerShare) },
          { label: 'CURRENT', value: quote ? fmtCurrency(quote.currentPrice) : '—' },
        ].map(c => (
          <View key={c.label} style={tcStyles.metricCell}>
            <Text style={[tcStyles.metricLabel, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>{c.label}</Text>
            <Text style={[tcStyles.metricVal, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>{c.value}</Text>
          </View>
        ))}
      </View>

      {/* Expanded analysis — sell trades only */}
      {expanded && gradeInfo && (
        <View style={[tcStyles.analysis, { borderTopColor: colors.border, backgroundColor: gradeInfo.bgColor + '80' }]}>
          <Text style={[tcStyles.analysisTitle, { color: gradeInfo.color, fontFamily: 'Inter_700Bold' }]}>
            TRADE ANALYSIS
          </Text>

          <View style={tcStyles.analysisGrid}>
            <View style={tcStyles.analysisCell}>
              <Text style={[tcStyles.aLabel, { color: colors.mutedForeground }]}>AVG BUY PRICE</Text>
              <Text style={[tcStyles.aVal, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>
                {fmtCurrency(gradeInfo.avgCost)}
              </Text>
            </View>
            <View style={tcStyles.analysisCell}>
              <Text style={[tcStyles.aLabel, { color: colors.mutedForeground }]}>PROFIT / LOSS</Text>
              <Text style={[tcStyles.aVal, {
                color: gradeInfo.profit >= 0 ? colors.buyColor : colors.sellColor,
                fontFamily: 'Inter_700Bold',
              }]}>
                {gradeInfo.profit >= 0 ? '+' : ''}{fmtCurrency(gradeInfo.profit)}
              </Text>
            </View>
            <View style={tcStyles.analysisCell}>
              <Text style={[tcStyles.aLabel, { color: colors.mutedForeground }]}>RETURN %</Text>
              <Text style={[tcStyles.aVal, {
                color: gradeInfo.returnPct >= 0 ? colors.buyColor : colors.sellColor,
                fontFamily: 'Inter_700Bold',
              }]}>
                {fmtPct(gradeInfo.returnPct)}
              </Text>
            </View>
            <View style={tcStyles.analysisCell}>
              <Text style={[tcStyles.aLabel, { color: colors.mutedForeground }]}>HELD FOR</Text>
              <Text style={[tcStyles.aVal, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>
                {gradeInfo.holdDays === 0 ? 'same day'
                  : gradeInfo.holdDays === 1 ? '1 day'
                  : `${gradeInfo.holdDays} days`}
              </Text>
            </View>
          </View>

          {/* Grade breakdown */}
          <View style={[tcStyles.gradeBreakdown, { borderColor: gradeInfo.color + '50' }]}>
            <View style={[tcStyles.gradeLargePill, { backgroundColor: gradeInfo.bgColor, borderColor: gradeInfo.color }]}>
              <Text style={[tcStyles.gradeLarge, { color: gradeInfo.color, fontFamily: 'Inter_700Bold' }]}>
                {gradeInfo.grade}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[tcStyles.gradeTitle, { color: gradeInfo.color, fontFamily: 'Inter_700Bold' }]}>
                {gradeInfo.label}
              </Text>
              <Text style={[tcStyles.gradeContext, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                {gradeInfo.context}
              </Text>
            </View>
          </View>

          {/* Scoring explanation */}
          <Text style={[tcStyles.scoringNote, { color: colors.mutedForeground }]}>
            Score: {gradeInfo.compositeScore.toFixed(1)} pts  ·  A+ requires ≥75 pts (high return × fast execution)
          </Text>
        </View>
      )}

      {/* Expanded analysis — buy trades */}
      {expanded && !gradeInfo && (
        <View style={[tcStyles.analysis, { borderTopColor: colors.border }]}>
          <Text style={[tcStyles.analysisTitle, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>
            OPEN POSITION COST
          </Text>
          <View style={tcStyles.analysisGrid}>
            <View style={tcStyles.analysisCell}>
              <Text style={[tcStyles.aLabel, { color: colors.mutedForeground }]}>COST BASIS</Text>
              <Text style={[tcStyles.aVal, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>
                {fmtCurrency(trade.shares * trade.pricePerShare)}
              </Text>
            </View>
            {quote && (
              <>
                <View style={tcStyles.analysisCell}>
                  <Text style={[tcStyles.aLabel, { color: colors.mutedForeground }]}>MKT VALUE</Text>
                  <Text style={[tcStyles.aVal, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>
                    {fmtCurrency(trade.shares * quote.currentPrice)}
                  </Text>
                </View>
                <View style={tcStyles.analysisCell}>
                  <Text style={[tcStyles.aLabel, { color: colors.mutedForeground }]}>UNREALIZED</Text>
                  <Text style={[tcStyles.aVal, {
                    color: (quote.currentPrice - trade.pricePerShare) >= 0 ? colors.buyColor : colors.sellColor,
                    fontFamily: 'Inter_700Bold',
                  }]}>
                    {fmtPct(((quote.currentPrice - trade.pricePerShare) / trade.pricePerShare) * 100)}
                  </Text>
                </View>
              </>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

const tcStyles = StyleSheet.create({
  card: { borderRadius: 12, borderWidth: 1, marginBottom: 10, overflow: 'hidden' },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, paddingBottom: 10 },
  topLeft: { flexDirection: 'row', alignItems: 'center', gap: 7, flex: 1, flexWrap: 'wrap' },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  symbol: { fontSize: 16 },
  typeBadge: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  typeBadgeTxt: { fontSize: 9, letterSpacing: 0.5 },
  date: { fontSize: 10 },
  gradeBadge: {
    borderWidth: 1.5, borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3,
    marginRight: 4,
  },
  gradeBadgeTxt: { fontSize: 13, letterSpacing: 0.5 },
  iconBtn: { padding: 4 },
  divider: { height: 1, marginHorizontal: 12 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', padding: 12, gap: 10 },
  metricCell: { width: '44%' },
  metricLabel: { fontSize: 8, letterSpacing: 0.8, marginBottom: 2 },
  metricVal: { fontSize: 13 },
  analysis: { borderTopWidth: 1, padding: 12, gap: 10 },
  analysisTitle: { fontSize: 9, letterSpacing: 1.2, marginBottom: 2 },
  analysisGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  analysisCell: { width: '44%' },
  aLabel: { fontSize: 8, letterSpacing: 0.8, marginBottom: 2, fontFamily: 'Inter_400Regular' },
  aVal: { fontSize: 14 },
  gradeBreakdown: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginTop: 2,
  },
  gradeLargePill: {
    borderWidth: 1.5, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  gradeLarge: { fontSize: 24 },
  gradeTitle: { fontSize: 13, marginBottom: 2 },
  gradeContext: { fontSize: 11, lineHeight: 16 },
  scoringNote: { fontSize: 9, letterSpacing: 0.3, fontFamily: 'Inter_400Regular', marginTop: 2 },
});

// ─── Add/Edit Trade Modal ─────────────────────────────────────────────────────

interface TradeForm { symbol: string; type: 'buy' | 'sell'; shares: string; price: string; }

function TradeModal({
  visible, initial, defaultType, defaultSymbol, allTrades, onSave, onClose, colors,
}: {
  visible: boolean; initial?: Trade | null; defaultType?: 'buy' | 'sell'; defaultSymbol?: string;
  allTrades: Trade[]; onSave: (t: Omit<Trade, 'id' | 'date'>) => void; onClose: () => void; colors: any;
}) {
  const [form, setForm] = useState<TradeForm>({ symbol: '', type: 'buy', shares: '', price: '' });
  const [errors, setErrors] = useState<Partial<Record<keyof TradeForm, string>>>({});

  useEffect(() => {
    if (visible) {
      setErrors({});
      if (initial) {
        setForm({ symbol: initial.symbol, type: initial.type, shares: String(initial.shares), price: String(initial.pricePerShare) });
      } else {
        setForm({ symbol: defaultSymbol ?? '', type: defaultType ?? 'buy', shares: '', price: '' });
      }
    }
  }, [visible, initial, defaultType, defaultSymbol]);

  const available = form.type === 'sell' && form.symbol
    ? availableToSell(form.symbol.trim().toUpperCase(), allTrades, initial?.id) : null;

  function validate() {
    const e: Partial<Record<keyof TradeForm, string>> = {};
    if (!form.symbol.trim()) e.symbol = 'Required';
    const s = parseFloat(form.shares);
    if (!form.shares || isNaN(s) || s <= 0) { e.shares = 'Enter valid shares'; }
    else if (form.type === 'sell' && available != null && s > available) {
      e.shares = available <= 0
        ? `No long position in ${form.symbol.trim().toUpperCase()}`
        : `Max ${fmtNum(available, 2)} shares available`;
    }
    const p = parseFloat(form.price);
    if (!form.price || isNaN(p) || p <= 0) e.price = 'Enter valid price';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function submit() {
    if (!validate()) return;
    onSave({ symbol: form.symbol.trim().toUpperCase(), type: form.type, shares: parseFloat(form.shares), pricePerShare: parseFloat(form.price) });
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={mStyles.overlay} onPress={onClose}>
          <Pressable style={[mStyles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[mStyles.title, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
              {initial ? 'Edit Trade' : 'Add Trade'}
            </Text>

            <Text style={[mStyles.label, { color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }]}>TICKER SYMBOL</Text>
            <TextInput
              style={[mStyles.input, { color: colors.foreground, backgroundColor: colors.background, borderColor: errors.symbol ? colors.sellColor : colors.border, fontFamily: 'Inter_600SemiBold' }]}
              value={form.symbol} onChangeText={v => setForm({ ...form, symbol: v.toUpperCase() })}
              placeholder="AAPL" placeholderTextColor={colors.mutedForeground}
              autoCapitalize="characters" autoCorrect={false}
            />
            {errors.symbol && <Text style={[mStyles.error, { color: colors.sellColor }]}>{errors.symbol}</Text>}

            <Text style={[mStyles.label, { color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }]}>TYPE</Text>
            <View style={mStyles.toggle}>
              {(['buy', 'sell'] as const).map(t => (
                <TouchableOpacity key={t}
                  style={[mStyles.toggleBtn, {
                    backgroundColor: form.type === t ? (t === 'buy' ? colors.buyBg : colors.sellBg) : 'transparent',
                    borderColor: form.type === t ? (t === 'buy' ? colors.buyColor : colors.sellColor) : colors.border,
                  }]}
                  onPress={() => setForm({ ...form, type: t })} activeOpacity={0.75}
                >
                  <Text style={[mStyles.toggleText, { color: form.type === t ? (t === 'buy' ? colors.buyColor : colors.sellColor) : colors.mutedForeground, fontFamily: 'Inter_700Bold' }]}>
                    {t.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {form.type === 'sell' && form.symbol.trim() && available != null && (
              <Text style={[mStyles.hint, { color: available > 0 ? colors.buyColor : colors.sellColor }]}>
                {available > 0 ? `Available to sell: ${fmtNum(available, 2)} shares` : `No long position in ${form.symbol.trim().toUpperCase()} — buy first`}
              </Text>
            )}

            <View style={mStyles.row}>
              {[
                { key: 'shares' as const, label: 'SHARES', ph: '10' },
                { key: 'price' as const, label: 'PRICE / SHARE', ph: '150.00' },
              ].map(f => (
                <View key={f.key} style={{ flex: 1 }}>
                  <Text style={[mStyles.label, { color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }]}>{f.label}</Text>
                  <TextInput
                    style={[mStyles.input, { color: colors.foreground, backgroundColor: colors.background, borderColor: errors[f.key] ? colors.sellColor : colors.border, fontFamily: 'Inter_600SemiBold' }]}
                    value={form[f.key]} onChangeText={v => setForm({ ...form, [f.key]: v })}
                    placeholder={f.ph} placeholderTextColor={colors.mutedForeground} keyboardType="decimal-pad"
                  />
                  {errors[f.key] && <Text style={[mStyles.error, { color: colors.sellColor }]}>{errors[f.key]}</Text>}
                </View>
              ))}
            </View>

            <View style={mStyles.btnRow}>
              <TouchableOpacity style={[mStyles.cancelBtn, { borderColor: colors.border }]} onPress={onClose} activeOpacity={0.7}>
                <Text style={[mStyles.cancelText, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[mStyles.saveBtn, { backgroundColor: colors.primary }]} onPress={submit} activeOpacity={0.8}>
                <Text style={[mStyles.saveText, { color: colors.primaryForeground, fontFamily: 'Inter_700Bold' }]}>
                  {initial ? 'Save Changes' : 'Add Trade'}
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const mStyles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.7)' },
  sheet: { borderTopLeftRadius: 18, borderTopRightRadius: 18, borderWidth: 1, borderBottomWidth: 0, padding: 24, paddingBottom: Platform.OS === 'web' ? 24 : 40, gap: 6 },
  title: { fontSize: 18, marginBottom: 8 },
  label: { fontSize: 10, letterSpacing: 0.8, marginBottom: 5, marginTop: 10 },
  hint: { fontSize: 11, marginTop: -2, marginBottom: 4, fontFamily: 'Inter_500Medium' },
  input: { height: 46, borderRadius: 8, borderWidth: 1, paddingHorizontal: 12, fontSize: 15 },
  error: { fontSize: 11, marginTop: 3, fontFamily: 'Inter_400Regular' },
  row: { flexDirection: 'row', gap: 12 },
  toggle: { flexDirection: 'row', gap: 10 },
  toggleBtn: { flex: 1, height: 44, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  toggleText: { fontSize: 14, letterSpacing: 1 },
  btnRow: { flexDirection: 'row', gap: 12, marginTop: 16 },
  cancelBtn: { flex: 1, height: 48, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontSize: 14 },
  saveBtn: { flex: 2, height: 48, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  saveText: { fontSize: 14, letterSpacing: 0.5 },
});

// ─── Summary Card ─────────────────────────────────────────────────────────────

function SummaryCard({ positions, onReset, colors }: { positions: Position[]; onReset: () => void; colors: any }) {
  const open = positions.filter(p => p.netShares !== 0);
  const totalCost = open.reduce((s, p) => s + Math.max(p.costBasis, 0), 0);
  const totalMkt = open.reduce((s, p) => s + p.marketValue, 0);
  const totalUnreal = open.reduce((s, p) => s + p.unrealizedPnL, 0);
  const totalReal = positions.reduce((s, p) => s + p.realizedPnL, 0);
  const totalPnL = totalUnreal + totalReal;
  const totalPct = totalCost > 0 ? (totalUnreal / totalCost) * 100 : 0;
  const isGain = totalPnL >= 0;

  return (
    <View style={[smStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={smStyles.titleRow}>
        <Text style={[smStyles.heading, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>PORTFOLIO SUMMARY</Text>
        <TouchableOpacity style={smStyles.resetBtn} onPress={onReset} activeOpacity={0.7}>
          <Feather name="trash-2" size={12} color={colors.sellColor} />
          <Text style={[smStyles.resetTxt, { color: colors.sellColor, fontFamily: 'Inter_600SemiBold' }]}>RESET</Text>
        </TouchableOpacity>
      </View>
      <View style={smStyles.metricsRow}>
        {[
          { label: 'COST BASIS', val: fmtCurrency(totalCost), color: colors.foreground },
          { label: 'MKT VALUE', val: fmtCurrency(totalMkt), color: colors.foreground },
          { label: 'REALIZED', val: `${totalReal >= 0 ? '+' : ''}${fmtCurrency(totalReal)}`, color: totalReal > 0 ? colors.buyColor : totalReal < 0 ? colors.sellColor : colors.mutedForeground },
        ].map((m, i) => (
          <React.Fragment key={m.label}>
            {i > 0 && <View style={[smStyles.divider, { backgroundColor: colors.border }]} />}
            <View style={smStyles.metricCell}>
              <Text style={[smStyles.metricLabel, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>{m.label}</Text>
              <Text style={[smStyles.metricVal, { color: m.color, fontFamily: 'Inter_700Bold' }]}>{m.val}</Text>
            </View>
          </React.Fragment>
        ))}
      </View>
      <View style={[smStyles.plStrip, { backgroundColor: isGain ? colors.buyBg : colors.sellBg, borderColor: isGain ? colors.buyColor : colors.sellColor }]}>
        <Text style={[smStyles.plLabel, { color: colors.mutedForeground }]}>UNREALIZED</Text>
        <Text style={[smStyles.plVal, { color: totalUnreal >= 0 ? colors.buyColor : colors.sellColor, fontFamily: 'Inter_700Bold' }]}>
          {totalUnreal >= 0 ? '+' : ''}{fmtCurrency(totalUnreal)}{totalPct !== 0 ? `  ${fmtPct(totalPct)}` : ''}
        </Text>
        <Text style={[smStyles.plTotal, { color: isGain ? colors.buyColor : colors.sellColor, fontFamily: 'Inter_700Bold' }]}>
          TOTAL  {totalPnL >= 0 ? '+' : ''}{fmtCurrency(totalPnL)}
        </Text>
      </View>
    </View>
  );
}

const smStyles = StyleSheet.create({
  card: { borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 12 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  heading: { fontSize: 9, letterSpacing: 1 },
  resetBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  resetTxt: { fontSize: 10, letterSpacing: 0.5 },
  metricsRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  metricCell: { flex: 1, gap: 3 },
  divider: { width: 1, height: 32, marginHorizontal: 8 },
  metricLabel: { fontSize: 8, letterSpacing: 0.6 },
  metricVal: { fontSize: 13 },
  plStrip: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
  plLabel: { fontSize: 8, letterSpacing: 0.6, fontFamily: 'Inter_400Regular' },
  plVal: { fontSize: 12 },
  plTotal: { fontSize: 12 },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function PortfolioScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [trades, setTrades] = useState<Trade[]>([]);
  const [quotes, setQuotes] = useState<Record<string, Quote | null>>({});
  const [loadingQuotes, setLoadingQuotes] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [portfolioTab, setPortfolioTab] = useState<PortfolioTab>('positions');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [editTarget, setEditTarget] = useState<Trade | null>(null);
  const [defaultType, setDefaultType] = useState<'buy' | 'sell'>('buy');
  const [defaultSymbol, setDefaultSymbol] = useState<string | undefined>(undefined);
  const [celebration, setCelebration] = useState<TradeGrade | null>(null);

  const topPad = Platform.OS === 'web' ? 16 : insets.top;

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(v => { if (v) setTrades(JSON.parse(v)); });
  }, []);

  const saveTrades = useCallback(async (next: Trade[]) => {
    setTrades(next);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const fetchAllQuotes = useCallback(async (tradeList: Trade[]) => {
    const symbols = [...new Set(tradeList.map(t => t.symbol))];
    if (!symbols.length) return;
    setLoadingQuotes(true);
    const results = await Promise.all(symbols.map(sym => fetchQuote(sym).catch(() => null)));
    const map: Record<string, Quote | null> = {};
    symbols.forEach((sym, i) => { map[sym] = results[i] ?? null; });
    setQuotes(map);
    setLoadingQuotes(false);
  }, []);

  useEffect(() => { if (trades.length) fetchAllQuotes(trades); }, [trades.length]);

  const onRefresh = async () => { setRefreshing(true); await fetchAllQuotes(trades); setRefreshing(false); };

  const allPositions = computePositions(trades, quotes);
  const openPositions = allPositions.filter(p => p.netShares !== 0);

  function handleReset() {
    Alert.alert('Reset Portfolio', 'Permanently delete ALL trades, positions, and history? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete Everything', style: 'destructive', onPress: async () => { setTrades([]); setQuotes({}); await AsyncStorage.removeItem(STORAGE_KEY); } },
    ]);
  }

  function handleSave(data: Omit<Trade, 'id' | 'date'>) {
    if (data.type === 'sell') {
      const avail = availableToSell(data.symbol, trades, editTarget?.id ?? undefined);
      if (avail <= 0) { Alert.alert('No Position', `You don't have any shares of ${data.symbol} to sell.`); return; }
      if (data.shares > avail) { Alert.alert('Too Many Shares', `You only hold ${fmtNum(avail, 2)} shares of ${data.symbol}.`); return; }
    }

    if (editTarget) {
      saveTrades(trades.map(t => t.id === editTarget.id ? { ...t, ...data } : t));
    } else {
      const newTrade: Trade = { id: uid(), date: new Date().toISOString(), ...data };
      const nextTrades = [...trades, newTrade];
      saveTrades(nextTrades);

      // Trigger celebration for A- or better sell trades
      if (data.type === 'sell') {
        const grade = computeSellGrade(newTrade, nextTrades);
        if (grade?.celebrate) {
          setTimeout(() => setCelebration(grade), 600);
        }
      }
    }
    setModalVisible(false);
    setEditTarget(null);
  }

  function openAdd(type: 'buy' | 'sell' = 'buy', symbol?: string) {
    setEditTarget(null); setDefaultType(type); setDefaultSymbol(symbol); setModalVisible(true);
  }

  function handleEdit(trade: Trade) {
    setEditTarget(trade); setDefaultType(trade.type); setDefaultSymbol(trade.symbol); setModalVisible(true);
  }

  function handleDelete(id: string) {
    Alert.alert('Remove Trade', 'Remove this trade?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => saveTrades(trades.filter(t => t.id !== id)) },
    ]);
  }

  const isEmpty = trades.length === 0;

  return (
    <View style={[mainStyles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[mainStyles.header, { paddingTop: topPad + 10, borderBottomColor: colors.border }]}>
        <View style={mainStyles.headerRow}>
          <Text style={[mainStyles.title, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>PORTFOLIO</Text>
          <View style={mainStyles.headerRight}>
            <TouchableOpacity style={mainStyles.iconBtn} onPress={onRefresh} disabled={loadingQuotes || isEmpty} activeOpacity={0.7}>
              {loadingQuotes ? <ActivityIndicator size="small" color={colors.primary} />
                : <Feather name="refresh-cw" size={16} color={isEmpty ? colors.mutedForeground : colors.primary} />}
            </TouchableOpacity>
            <TouchableOpacity style={[mainStyles.addBtn, { backgroundColor: colors.primary }]} onPress={() => openAdd('buy')} activeOpacity={0.8}>
              <Feather name="plus" size={15} color={colors.primaryForeground} />
              <Text style={[mainStyles.addBtnText, { color: colors.primaryForeground, fontFamily: 'Inter_700Bold' }]}>ADD TRADE</Text>
            </TouchableOpacity>
          </View>
        </View>
        {!isEmpty && (
          <View style={[mainStyles.tabRow, { borderBottomColor: colors.border }]}>
            {(['positions', 'trades'] as PortfolioTab[]).map(tab => (
              <TouchableOpacity key={tab}
                style={[mainStyles.tabBtn, portfolioTab === tab && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
                onPress={() => setPortfolioTab(tab)} activeOpacity={0.7}
              >
                <Text style={[mainStyles.tabLabel, {
                  color: portfolioTab === tab ? colors.primary : colors.mutedForeground,
                  fontFamily: portfolioTab === tab ? 'Inter_700Bold' : 'Inter_400Regular',
                }]}>
                  {tab === 'positions' ? `POSITIONS (${openPositions.length})` : `HISTORY (${trades.length})`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* Content */}
      {isEmpty ? (
        <View style={mainStyles.emptyWrap}>
          <Feather name="briefcase" size={40} color="rgba(192,192,192,0.18)" />
          <Text style={[mainStyles.emptyTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>No trades yet</Text>
          <Text style={[mainStyles.emptySub, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>Add a BUY trade to start tracking your real portfolio.</Text>
          <TouchableOpacity style={[mainStyles.emptyBtn, { borderColor: colors.primary }]} onPress={() => openAdd('buy')} activeOpacity={0.75}>
            <Feather name="plus" size={15} color={colors.primary} />
            <Text style={[mainStyles.emptyBtnText, { color: colors.primary, fontFamily: 'Inter_600SemiBold' }]}>ADD TRADE</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[mainStyles.list, { paddingBottom: 24 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        >
          <SummaryCard positions={allPositions} onReset={handleReset} colors={colors} />

          {portfolioTab === 'positions' ? (
            openPositions.length === 0 ? (
              <View style={mainStyles.closedNotice}>
                <Feather name="check-circle" size={28} color={colors.buyColor} />
                <Text style={[mainStyles.closedTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>All positions closed</Text>
                <Text style={[mainStyles.closedSub, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>Realized P&L shown above. Switch to History to review trades.</Text>
              </View>
            ) : (
              openPositions.map(pos => (
                <PositionRow key={pos.symbol} position={pos}
                  onSell={() => openAdd('sell', pos.symbol)}
                  onBuyMore={() => openAdd('buy', pos.symbol)}
                  colors={colors} />
              ))
            )
          ) : (
            [...trades].reverse().map(trade => {
              const gradeInfo = trade.type === 'sell' ? computeSellGrade(trade, trades) : null;
              return (
                <TradeCard key={trade.id} trade={trade}
                  quote={quotes[trade.symbol]}
                  gradeInfo={gradeInfo}
                  expanded={expandedId === trade.id}
                  onToggleExpand={() => setExpandedId(prev => prev === trade.id ? null : trade.id)}
                  onEdit={() => handleEdit(trade)}
                  onDelete={() => handleDelete(trade.id)}
                  colors={colors} />
              );
            })
          )}
        </ScrollView>
      )}

      <BottomTabBar />

      <TradeModal
        visible={modalVisible} initial={editTarget}
        defaultType={defaultType} defaultSymbol={defaultSymbol}
        allTrades={trades} onSave={handleSave}
        onClose={() => { setModalVisible(false); setEditTarget(null); }}
        colors={colors} />

      {/* Celebration overlay */}
      {celebration && (
        <CelebrationOverlay gradeInfo={celebration} onDismiss={() => setCelebration(null)} />
      )}
    </View>
  );
}

const mainStyles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 0, borderBottomWidth: 1 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  title: { fontSize: 18, letterSpacing: 2 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: { padding: 6 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 7 },
  addBtnText: { fontSize: 11, letterSpacing: 0.5 },
  tabRow: { flexDirection: 'row', borderBottomWidth: 1 },
  tabBtn: { flex: 1, paddingVertical: 9, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabLabel: { fontSize: 10, letterSpacing: 0.8 },
  list: { paddingHorizontal: 14, paddingTop: 12 },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 10 },
  emptyTitle: { fontSize: 17, marginTop: 10 },
  emptySub: { fontSize: 13, textAlign: 'center', lineHeight: 19 },
  emptyBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 8, paddingHorizontal: 18, paddingVertical: 9, marginTop: 6 },
  emptyBtnText: { fontSize: 13, letterSpacing: 0.5 },
  closedNotice: { alignItems: 'center', paddingVertical: 32, gap: 8 },
  closedTitle: { fontSize: 16, marginTop: 4 },
  closedSub: { fontSize: 12, textAlign: 'center', lineHeight: 18, paddingHorizontal: 20 },
});
