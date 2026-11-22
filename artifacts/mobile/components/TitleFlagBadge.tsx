import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { DEFAULT_FLAG_ID, type FlagSelectionId } from '@/lib/achievements';
import { PremiumFlagBadge } from '@/components/PremiumFlagBadge';

type TitleFlagBadgeProps = {
  flagId: FlagSelectionId;
  unlocked: boolean;
  size: number;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

export function TitleFlagBadge({ flagId, unlocked, size, testID, style }: TitleFlagBadgeProps) {
  if (!unlocked) return null;
  const height = size * 0.625;
  const slotStyle = [styles.slot, { width: size, height }, style];

  if (flagId !== DEFAULT_FLAG_ID) {
    return (
      <View testID={testID} style={slotStyle}>
        <PremiumFlagBadge flagId={flagId} size={size} />
      </View>
    );
  }

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="Default U.S. flag"
      testID={testID}
      style={slotStyle}
    >
      <Text style={{ fontSize: size * 0.7, lineHeight: height, includeFontPadding: false }}>🇺🇸</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  slot: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    pointerEvents: 'none',
  },
});
