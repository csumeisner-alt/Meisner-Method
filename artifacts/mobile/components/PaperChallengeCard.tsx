import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import type { PaperChallengeEnrollment, PaperChallengeWindow } from '@/lib/paperChallenge';

type Props = {
  window: PaperChallengeWindow;
  enrollment: PaperChallengeEnrollment | null;
  selectedAccountName: string;
  currentEquity: number;
  ready: boolean;
  onJoin: () => void;
};

const formatMoney = (value: number) => `$${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
const formatDate = (value: number) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

export function PaperChallengeCard({
  window,
  enrollment,
  selectedAccountName,
  currentEquity,
  ready,
  onJoin,
}: Props) {
  const colors = useColors();
  const isEnrolled = enrollment?.eventId === window.id;
  const currentProfit = isEnrolled ? currentEquity - enrollment.startEquity : 0;
  const title = isEnrolled
    ? window.phase === 'ended' ? 'EVENT FINISHED' : 'YOU’RE IN THIS WEEK'
    : window.phase === 'active' ? 'WEEKLY PAPER EVENT' : 'NEXT PAPER EVENT';
  const detail = isEnrolled
    ? `${enrollment.accountName} · ${formatMoney(currentProfit)} since opt-in`
    : window.phase === 'active'
      ? `Use ${selectedAccountName} for this week’s trades.`
      : `${formatDate(window.startAtMs)}–${formatDate(window.endAtMs)} · one event every other week`;

  return (
    <View
      testID="paper-challenge-card"
      style={{
        marginHorizontal: 16,
        marginTop: 10,
        marginBottom: 6,
        padding: 14,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.card,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
        <Feather name="award" size={16} color={colors.primary} />
        <Text style={{ flex: 1, color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 12, letterSpacing: 0.6 }}>
          {title}
        </Text>
        <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium', fontSize: 10 }}>
          {window.phase === 'active' ? 'LIVE' : 'BIWEEKLY'}
        </Text>
      </View>
      <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 8 }}>
        {isEnrolled && window.phase === 'ended'
          ? 'The week is over. Your results are being saved to Settings.'
          : detail}
      </Text>
      {isEnrolled && window.phase === 'active' && (
        <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 12, marginTop: 6 }}>
          Current return: {enrollment.startEquity > 0 ? `${(currentProfit / enrollment.startEquity * 100).toFixed(2)}%` : '—'}
        </Text>
      )}
      {!isEnrolled && window.phase === 'active' && (
        <TouchableOpacity
          testID="join-paper-challenge"
          accessibilityRole="button"
          accessibilityLabel={`Join this week's paper event with ${selectedAccountName}`}
          disabled={!ready || !!enrollment}
          onPress={onJoin}
          activeOpacity={0.75}
          style={{
            alignSelf: 'flex-start',
            marginTop: 10,
            paddingVertical: 9,
            paddingHorizontal: 12,
            borderRadius: 9,
            backgroundColor: !ready || enrollment ? colors.muted : colors.primary,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 7,
          }}
        >
          <Text style={{ color: colors.primaryForeground, fontFamily: 'Inter_700Bold', fontSize: 11 }}>
            OPT IN WITH {selectedAccountName.toUpperCase()}
          </Text>
          <Feather name="arrow-right" size={14} color={colors.primaryForeground} />
        </TouchableOpacity>
      )}
      {enrollment && !isEnrolled && (
        <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 8 }}>
          Saving your previous event before you can join another.
        </Text>
      )}
    </View>
  );
}
