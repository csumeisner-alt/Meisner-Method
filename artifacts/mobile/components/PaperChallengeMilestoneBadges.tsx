import React from 'react';
import { Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import {
  PAPER_CHALLENGE_MILESTONE_LABELS,
  type PaperChallengeMilestoneId,
} from '@/lib/paperChallenge';

type Props = {
  milestones: PaperChallengeMilestoneId[];
  compact?: boolean;
};

export function PaperChallengeMilestoneBadges({ milestones, compact = false }: Props) {
  const colors = useColors();
  if (milestones.length === 0) return null;

  return (
    <View
      testID="paper-event-milestone-badges"
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: compact ? 7 : 16 }}
    >
      {milestones.map((milestone) => (
        <View
          key={milestone}
          testID={`paper-event-milestone-${milestone}`}
          style={{
            minHeight: compact ? 22 : 26,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
            paddingHorizontal: compact ? 7 : 9,
            paddingVertical: compact ? 3 : 5,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: colors.primary,
            backgroundColor: colors.card,
          }}
        >
          <Feather name="award" size={compact ? 10 : 12} color={colors.primary} />
          <Text style={{
            color: colors.primary,
            fontFamily: 'Inter_700Bold',
            fontSize: compact ? 8 : 9,
            letterSpacing: 0.35,
          }}>
            {PAPER_CHALLENGE_MILESTONE_LABELS[milestone]}
          </Text>
        </View>
      ))}
    </View>
  );
}
