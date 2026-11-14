import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Pressable, Text, View } from 'react-native';
import { BrewTokenBank } from '@/components/BrewTokenBank';
import { useBrewTokens } from '@/hooks/useBrewTokens';
import colors from '@/constants/colors';

function BrewBankBrowserFixture() {
  const economy = useBrewTokens();
  const [visible, setVisible] = useState(false);

  return (
    <View style={{ flex: 1, backgroundColor: '#111419', padding: 16 }}>
      <Pressable
        testID="brew-bank-open"
        accessibilityRole="button"
        onPress={() => setVisible(true)}
        style={{ padding: 12, backgroundColor: '#d6ad54' }}
      >
        <Text>OPEN BREW BANK</Text>
      </Pressable>
      <BrewTokenBank
        visible={visible}
        colors={colors.american}
        tokens={economy.brewTokens}
        quotesViewed={economy.quotesViewed}
        soundEnabled={economy.soundEnabled}
        hapticsEnabled={economy.hapticsEnabled}
        bankKeys={economy.bankKeys}
        bankAccessExpiresAt={economy.bankAccessExpiresAt}
        quickReviveUnlocked={economy.quickReviveUnlocked}
        quickReviveBottles={economy.quickReviveBottles}
        quickReviveArmed={economy.quickReviveArmed}
        daiquiriUnlocked={economy.daiquiriUnlocked}
        daiquiriBottles={economy.daiquiriBottles}
        daiquiriArmed={economy.daiquiriArmed}
        staminUpUnlocked={economy.staminUpUnlocked}
        staminUpBottles={economy.staminUpBottles}
        staminUpArmed={economy.staminUpArmed}
        smartProUnlocked={economy.smartProUnlocked}
        smartProBottles={economy.smartProBottles}
        smartProSaleExpiresAt={economy.smartProSaleExpiresAt}
        darkBrewTokens={economy.darkBrewTokens}
        neonGucciPhrasesUnlocked={economy.neonGucciPhrasesUnlocked}
        neonGucciPhrasesActive={economy.neonGucciPhrasesActive}
        activityLog={economy.activityLog}
        onClose={() => setVisible(false)}
        onResolveBet={economy.resolveBet}
        onSoundEnabledChange={economy.setSoundEnabled}
        onHapticsEnabledChange={economy.setHapticsEnabled}
        onBuyBankKey={economy.buyBankKey}
        onActivateBankKey={economy.activateBankKey}
        onUnlockQuickRevive={economy.unlockQuickRevive}
        onBuyQuickReviveBottle={economy.buyQuickReviveBottle}
        onRedeemQuickRevive={economy.redeemQuickReviveBottle}
        onUnlockDaiquiri={economy.unlockDaiquiri}
        onBuyDaiquiriBottle={economy.buyDaiquiriBottle}
        onRedeemDaiquiri={economy.redeemDaiquiriBottle}
        onUnlockStaminUp={economy.unlockStaminUp}
        onBuyStaminUpBottle={economy.buyStaminUpBottle}
        onRedeemStaminUp={economy.redeemStaminUpBottle}
        onUnlockSmartPro={economy.unlockSmartPro}
        onBuySmartProBottle={economy.buySmartProBottle}
        onRedeemSmartPro={economy.redeemSmartProBottle}
        onUnlockNeonGucciPhrases={economy.unlockNeonGucciPhrases}
        onSetNeonGucciPhrasesActive={economy.setNeonGucciPhrasesActive}
      />
    </View>
  );
}

export default BrewBankBrowserFixture;

createRoot(document.getElementById('root')!).render(<BrewBankBrowserFixture />);
