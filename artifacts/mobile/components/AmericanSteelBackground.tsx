import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useColors } from '@/hooks/useColors';
import { useAmericanMode } from '@/contexts/AmericanModeContext';

interface Props {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * Premium Patriot Mode surface: a dark brushed-steel field with restrained
 * diagonal grain. Normal mode stays a plain view so existing screens remain
 * visually unchanged.
 */
export function AmericanSteelBackground({ children, style }: Props) {
  const colors = useColors();
  const { isActive } = useAmericanMode();

  return (
    <View style={[styles.root, { backgroundColor: colors.background }, style]}>
      {isActive && (
        <>
          <LinearGradient
            colors={[colors.steelShadow, colors.background, colors.steelHighlight, colors.background, colors.steelShadow]}
            locations={[0, 0.22, 0.48, 0.7, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <View style={styles.grain} pointerEvents="none">
            {Array.from({ length: 18 }, (_, index) => (
              <View
                key={index}
                style={[
                  styles.brush,
                  {
                    top: `${index * 6.5}%`,
                    backgroundColor: index % 3 === 0 ? '#ffffff' : '#000000',
                    opacity: index % 3 === 0 ? 0.035 : 0.05,
                  },
                ]}
              />
            ))}
          </View>
        </>
      )}
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden' },
  content: { flex: 1 },
  grain: { ...StyleSheet.absoluteFillObject, transform: [{ rotate: '-8deg' }, { scale: 1.2 }] },
  brush: { position: 'absolute', left: -40, right: -40, height: 1 },
});