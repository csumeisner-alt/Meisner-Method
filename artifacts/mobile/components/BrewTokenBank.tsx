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
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import type { ColorScheme } from '@/constants/colors';
import { BREW_TOKEN_WIN_PROBABILITY } from '@/lib/brewTokenLogic';

export function BrewCoin({ colors, size = 66 }: { colors: ColorScheme; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 66 66" accessibilityLabel="Gold Brew Token with beer outline">
      <Circle cx="33" cy="33" r="29" fill={colors.goldMuted} opacity={0.35} />
      <Circle cx="33" cy="33" r="25" fill={colors.gold} stroke={colors.foreground} strokeOpacity={0.55} strokeWidth="1.5" />
      <Circle cx="33" cy="33" r="20" fill="none" stroke={colors.primaryForeground} strokeOpacity={0.32} strokeWidth="1" />
      <Path d="M24 27h15v13H24z" fill="none" stroke={colors.primaryForeground} strokeWidth="2" />
      <Path d="M39 30h3.5a3 3 0 0 1 0 6H39" fill="none" stroke={colors.primaryForeground} strokeWidth="2" />
      <Path d="M24 31h15M27 23v4M31 23v4M35 23v4" fill="none" stroke={colors.primaryForeground} strokeWidth="2" strokeLinecap="round" />
      <Line x1="27" y1="44" x2="39" y2="44" stroke={colors.primaryForeground} strokeOpacity={0.5} strokeWidth="1.5" strokeLinecap="round" />
    </Svg>
  );
}

type Props = {
  visible: boolean;
  colors: ColorScheme;
  tokens: number;
  quotesViewed: number;
  onClose: () => void;
  onResolveBet: (bet: number, won: boolean) => Promise<void>;
};

export function BrewTokenBank({ visible, colors, tokens, quotesViewed, onClose, onResolveBet }: Props) {
  const insets = useSafeAreaInsets();
  const [selectedBet, setSelectedBet] = useState(1);
  const [result, setResult] = useState<'won' | 'lost' | null>(null);
  const [resolving, setResolving] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const bet = Math.min(Math.max(selectedBet, 1), Math.max(tokens, 1));
  const canPlay = tokens > 0 && !resolving;

  const handleBet = () => {
    if (!canPlay) return;
    const won = Math.random() < BREW_TOKEN_WIN_PROBABILITY;
    setResult(null);
    setResolving(true);
    timerRef.current = setTimeout(() => {
      void onResolveBet(bet, won).finally(() => {
        setResult(won ? 'won' : 'lost');
        setResolving(false);
      });
    }, 650);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.overlay, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
        <View style={[styles.shell, { backgroundColor: colors.card, borderColor: colors.goldMuted }]}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={[styles.eyebrow, { color: colors.gold, fontFamily: 'Inter_600SemiBold' }]}>WEEKEND FEATURE</Text>
              <Text style={[styles.title, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
                THE CENTRAL BANK
              </Text>
              <Text style={[styles.subtitle, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                OF BAD DECISIONS
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close Central Bank">
              <Feather name="x" size={21} color={colors.mutedForeground} />
            </Pressable>
          </View>

          <View style={[styles.vault, { backgroundColor: colors.steelShadow, borderColor: colors.goldMuted }]}>
            <View style={styles.coinStage}>
              <BrewCoin colors={colors} size={76} />
            </View>
            <Text style={[styles.vaultLabel, { color: colors.gold, fontFamily: 'Inter_600SemiBold' }]}>BREW TOKEN RESERVE</Text>
            <Text style={[styles.balance, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>{tokens}</Text>
            <Text style={[styles.balanceLabel, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
              {tokens === 1 ? 'TOKEN AVAILABLE' : 'TOKENS AVAILABLE'}
            </Text>
          </View>

          <View style={styles.betRow}>
            <View>
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }]}>DEPOSIT</Text>
              <Text style={[styles.betValue, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>{bet} {bet === 1 ? 'TOKEN' : 'TOKENS'}</Text>
            </View>
            <View style={styles.stepper}>
              <Pressable
                onPress={() => setSelectedBet(value => Math.max(1, value - 1))}
                disabled={!canPlay || bet <= 1}
                style={[styles.stepButton, { borderColor: colors.border }, (!canPlay || bet <= 1) && styles.disabled]}
                accessibilityRole="button"
                accessibilityLabel="Decrease Brew Token deposit"
              >
                <Feather name="minus" size={16} color={colors.foreground} />
              </Pressable>
              <Pressable
                onPress={() => setSelectedBet(value => Math.min(Math.max(tokens, 1), value + 1))}
                disabled={!canPlay || bet >= tokens}
                style={[styles.stepButton, { borderColor: colors.border }, (!canPlay || bet >= tokens) && styles.disabled]}
                accessibilityRole="button"
                accessibilityLabel="Increase Brew Token deposit"
              >
                <Feather name="plus" size={16} color={colors.foreground} />
              </Pressable>
            </View>
          </View>

          <Text style={[styles.rules, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
            55% chance to double your deposit. 45% chance to lose only the tokens deposited.
          </Text>

          {result && (
            <Text style={[styles.result, { color: result === 'won' ? colors.buyColor : colors.sellColor, fontFamily: 'Inter_700Bold' }]}>
              {result === 'won' ? `THE BANK PAID ${bet} ${bet === 1 ? 'TOKEN' : 'TOKENS'}.` : `THE BANK KEPT ${bet} ${bet === 1 ? 'TOKEN' : 'TOKENS'}.`}
            </Text>
          )}

          <Pressable
            onPress={handleBet}
            disabled={!canPlay}
            style={[styles.depositButton, { backgroundColor: colors.gold }, !canPlay && styles.disabled]}
            accessibilityRole="button"
            accessibilityLabel="Deposit Brew Tokens"
          >
            {resolving ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <Text style={[styles.depositButtonText, { color: colors.primaryForeground, fontFamily: 'Inter_700Bold' }]}>
                {tokens === 0 ? 'RESERVE EMPTY' : 'TOSS TOKENS INTO THE BANK'}
              </Text>
            )}
          </Pressable>

          <Text style={[styles.footnote, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
            Fictional tokens only · no cash value · {quotesViewed} quotes logged
          </Text>
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
    paddingHorizontal: 16,
    backgroundColor: 'rgba(0,0,0,0.86)',
  },
  shell: {
    width: '100%',
    maxWidth: 460,
    borderWidth: 1,
    borderRadius: 16,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.45,
    shadowRadius: 24,
    elevation: 14,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 17 },
  headerCopy: { gap: 2 },
  eyebrow: { fontSize: 9, letterSpacing: 1.2 },
  title: { fontSize: 19, letterSpacing: 1.1, marginTop: 2 },
  subtitle: { fontSize: 11, letterSpacing: 2.5 },
  vault: { alignItems: 'center', borderWidth: 1, borderRadius: 10, paddingVertical: 16 },
  coinStage: { marginBottom: 5 },
  vaultLabel: { fontSize: 9, letterSpacing: 1.3 },
  balance: { fontSize: 35, lineHeight: 40, marginTop: 2 },
  balanceLabel: { fontSize: 9, letterSpacing: 1.1 },
  betRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18 },
  sectionLabel: { fontSize: 9, letterSpacing: 1 },
  betValue: { fontSize: 18, marginTop: 3 },
  stepper: { flexDirection: 'row', gap: 7 },
  stepButton: { width: 36, height: 34, borderWidth: 1, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.4 },
  rules: { fontSize: 11, lineHeight: 17, marginTop: 13 },
  result: { fontSize: 11, letterSpacing: 0.7, marginTop: 12 },
  depositButton: { minHeight: 46, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginTop: 17, paddingHorizontal: 12 },
  depositButtonText: { fontSize: 11, letterSpacing: 0.7, textAlign: 'center' },
  footnote: { fontSize: 9, textAlign: 'center', marginTop: 13 },
});