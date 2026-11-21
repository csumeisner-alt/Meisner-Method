import React from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type { FlagSelectionId } from '@/lib/achievements';
import { MMLogo } from '@/components/MMLogo';
import { TitleFlagBadge } from '@/components/TitleFlagBadge';

type AnalyzeBrandHeaderProps = {
  flagId: FlagSelectionId;
  unlocked: boolean;
  flagSize: number;
  headingColor: string;
  mutedForeground: string;
  neonGucciActive: boolean;
  onTitleRowLayout: (width: number) => void;
  onBrandNameLayout: (width: number) => void;
};

export function AnalyzeBrandHeader({
  flagId,
  unlocked,
  flagSize,
  headingColor,
  mutedForeground,
  neonGucciActive,
  onTitleRowLayout,
  onBrandNameLayout,
}: AnalyzeBrandHeaderProps) {
  const { fontScale } = useWindowDimensions();
  const flagHeight = flagSize * 0.625;
  const titleRowHeight = Math.max(26 * fontScale, unlocked ? flagHeight : 0);

  return (
    <>
      <MMLogo size={36} />
      <View style={styles.brandText}>
        <View
          testID="analyze-brand-title-row"
          onLayout={(event) => onTitleRowLayout(event.nativeEvent.layout.width)}
          style={[styles.brandTitleRow, { minHeight: titleRowHeight }]}
        >
          <Text
            testID="analyze-brand-title"
            numberOfLines={1}
            onLayout={(event) => onBrandNameLayout(event.nativeEvent.layout.width)}
            adjustsFontSizeToFit
            minimumFontScale={0.6}
            style={[
              styles.brandName,
              { color: headingColor, fontFamily: 'Inter_700Bold', letterSpacing: 0.8, lineHeight: 26 * fontScale },
            ]}
          >
            Meisner Method
          </Text>
          {unlocked && flagSize > 0 && (
            <TitleFlagBadge
              flagId={flagId}
              unlocked={unlocked}
              size={flagSize}
              testID="analyze-title-flag"
              style={styles.titleFlagBadge}
            />
          )}
        </View>
        <Text
          testID="analyze-brand-tagline"
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
          style={[
            styles.tagline,
            { color: mutedForeground, fontFamily: 'Inter_400Regular', lineHeight: 16 * fontScale },
          ]}
        >
          AI-powered market intelligence
        </Text>
        {neonGucciActive && (
          <View style={styles.neonThemeBadge}>
            <View style={styles.neonThemeDot} />
            <Text style={styles.neonThemeBadgeText}>HYBRID NEON GUCCI · ACTIVE</Text>
          </View>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  brandText: { flex: 1, minWidth: 0, position: 'relative' },
  brandTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, overflow: 'visible' },
  titleFlagBadge: { flexShrink: 0 },
  brandName: { fontSize: 21, lineHeight: 26, flexShrink: 1 },
  tagline: { fontSize: 12, marginTop: 1 },
  neonThemeBadge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8, backgroundColor: 'rgba(85,236,255,0.12)', borderWidth: 1, borderColor: '#55ecff' },
  neonThemeDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#55ecff' },
  neonThemeBadgeText: { color: '#b9ffcf', fontSize: 7, fontWeight: '800', letterSpacing: 0.55 },
});
