import React, { useState } from 'react';
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
  const [brandNameWidth, setBrandNameWidth] = useState(0);
  const titleRowHeight = 26 * fontScale;

  return (
    <>
      <View testID="analyze-brand-logo" style={styles.brandLogo}>
        <MMLogo size={36} />
      </View>
      <View testID="analyze-brand-copy" style={styles.brandText}>
        <View
          testID="analyze-brand-title-row"
          onLayout={(event) => onTitleRowLayout(event.nativeEvent.layout.width)}
          style={[styles.brandTitleRow, { minHeight: titleRowHeight }]}
        >
          <Text
            testID="analyze-brand-title"
            numberOfLines={1}
            onLayout={(event) => {
              const width = event.nativeEvent.layout.width;
              setBrandNameWidth((current) => Math.abs(current - width) < 0.5 ? current : width);
              onBrandNameLayout(width);
            }}
            style={[
              styles.brandName,
              { color: headingColor, fontFamily: 'Inter_700Bold', letterSpacing: 0.8, lineHeight: 26 * fontScale },
            ]}
          >
            Meisner Method
          </Text>
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
        {unlocked && flagSize > 0 && (
          <View
            pointerEvents="none"
            style={[styles.titleFlagOverlay, { left: brandNameWidth + 6 }]}
          >
            <TitleFlagBadge
              flagId={flagId}
              unlocked={unlocked}
              size={flagSize}
              testID="analyze-title-flag"
              style={styles.titleFlagBadge}
            />
          </View>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  brandLogo: { width: 36, height: 36, flexShrink: 0 },
  brandText: { flex: 1, minWidth: 0, position: 'relative' },
  brandTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, overflow: 'visible' },
  titleFlagOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'flex-start',
    zIndex: 2,
  },
  titleFlagBadge: { flexShrink: 0 },
  brandName: { fontSize: 21, lineHeight: 26, flexShrink: 0 },
  tagline: { fontSize: 12, marginTop: 1 },
  neonThemeBadge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8, backgroundColor: 'rgba(85,236,255,0.12)', borderWidth: 1, borderColor: '#55ecff' },
  neonThemeDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#55ecff' },
  neonThemeBadgeText: { color: '#b9ffcf', fontSize: 7, fontWeight: '800', letterSpacing: 0.55 },
});
