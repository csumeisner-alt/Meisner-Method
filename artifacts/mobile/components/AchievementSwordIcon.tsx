import React from 'react';
import { View, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ACHIEVEMENT_SWORD_COLOR, NEON_GUCCI_DECOR } from '@/constants/colors';
import { useColors } from '@/hooks/useColors';

type AchievementSwordIconProps = {
  isPatriotModeActive: boolean;
  neonGucciActive: boolean;
  size?: number;
};

export function AchievementSwordIcon({
  isPatriotModeActive,
  neonGucciActive,
  size = 20,
}: AchievementSwordIconProps) {
  const colors = useColors();
  const showGlow = isPatriotModeActive || neonGucciActive;

  return (
    <View style={styles.stage}>
      {showGlow && (
        <View
          style={[
            styles.glow,
            {
              backgroundColor: neonGucciActive ? 'rgba(85,236,255,0.10)' : 'rgba(214,173,84,0.12)',
              borderWidth: neonGucciActive ? 1 : 0,
              borderColor: neonGucciActive ? 'rgba(140,243,207,0.42)' : 'transparent',
              shadowColor: neonGucciActive ? NEON_GUCCI_DECOR.cyan : colors.gold,
            },
          ]}
        />
      )}
      <MaterialCommunityIcons
        name="sword"
        size={size}
        color={neonGucciActive ? NEON_GUCCI_DECOR.mint : ACHIEVEMENT_SWORD_COLOR}
        style={neonGucciActive ? styles.neonSword : undefined}
        accessible={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  glow: {
    position: 'absolute',
    width: 25,
    height: 25,
    borderRadius: 13,
    shadowOpacity: 0.42,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  neonSword: {
    textShadowColor: NEON_GUCCI_DECOR.cyan,
    textShadowRadius: 3,
    textShadowOffset: { width: 0, height: 0 },
  },
});
