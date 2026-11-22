import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { View } from 'react-native';
import { AnalyzeBrandHeader } from '../../components/AnalyzeBrandHeader';
import { ALL_PREMIUM_FLAGS, DEFAULT_FLAG_ID, PRIDE_FLAG, type FlagSelectionId } from '../../lib/achievements';

const testWindow = globalThis as typeof globalThis & {
  __setAnalyzeHeaderFontScale?: (scale: number) => void;
  __setAnalyzeHeaderFlag?: (flag: 'default' | 'heritage' | 'pride') => void;
  __setAnalyzeHeaderUnlocked?: (unlocked: boolean) => void;
  __analyzeHeaderFontScale?: number;
};

function AnalyzeHeaderFixture() {
  const [refresh, setRefresh] = useState(0);
  const [flagId, setFlagId] = useState<FlagSelectionId>(DEFAULT_FLAG_ID);
  const [unlocked, setUnlocked] = useState(false);
  const [titleRowWidth, setTitleRowWidth] = useState(0);
  const [brandNameWidth, setBrandNameWidth] = useState(0);
  const targetFlagSize = 36 / 0.625;
  const flagSize = titleRowWidth - brandNameWidth - 6 >= targetFlagSize ? targetFlagSize : 0;

  testWindow.__setAnalyzeHeaderFontScale = (scale) => {
    testWindow.__analyzeHeaderFontScale = scale;
    setRefresh((value) => value + 1);
  };
  testWindow.__setAnalyzeHeaderFlag = (flag) => {
    setFlagId(
      flag === 'pride'
        ? PRIDE_FLAG.id
        : flag === 'heritage'
          ? ALL_PREMIUM_FLAGS.find((item) => item.artwork === 'gadsden')!.id
          : DEFAULT_FLAG_ID,
    );
    setRefresh((value) => value + 1);
  };
  testWindow.__setAnalyzeHeaderUnlocked = (value) => {
    setUnlocked(value);
    setRefresh((current) => current + 1);
  };

  return (
    <View
      testID="analyze-header-fixture"
      style={{ width: '100%', paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', backgroundColor: '#10151c' }}
    >
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <AnalyzeBrandHeader
          flagId={flagId}
          unlocked={unlocked}
          flagSize={flagSize}
          headingColor="#ffffff"
          mutedForeground="#b8c2d0"
          neonGucciActive={false}
          onTitleRowLayout={setTitleRowWidth}
          onBrandNameLayout={setBrandNameWidth}
        />
        <View testID="analyze-info" style={{ width: 15, height: 18, marginLeft: 'auto', marginRight: 2 }} />
      </View>
      <View style={{ width: 36, height: 36 }} />
      <View style={{ position: 'absolute', width: 0, height: 0, opacity: 0 }}>{refresh}</View>
    </View>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('Analyze header fixture root was not found.');
createRoot(root).render(<AnalyzeHeaderFixture />);
