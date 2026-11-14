import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { BottomTabBar } from '../../components/BottomTabBar';
import { PaperAccountSwipeArea } from '../../components/PaperAccountSwipeArea';

const accounts = [{ id: 'tiger' }, { id: 'borg' }, { id: 'fireball' }];

// Exercise the native haptic branch while rendering the real swipe component in a phone-sized browser.
Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
const testWindow = globalThis as typeof globalThis & { __setPaperPlatform?: (os: string) => void };
testWindow.__setPaperPlatform = (os) => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: os });
};

function PaperAccountInteractionFixture() {
  const [activeId, setActiveId] = useState(accounts[0].id);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [tradeCount, setTradeCount] = useState(0);

  return (
    <View style={{ flex: 1, height: '100%', backgroundColor: '#101010' }}>
      <View style={{ height: 42, justifyContent: 'center', paddingHorizontal: 16 }}>
        <Text style={{ color: '#fff' }}>Paper Trading</Text>
      </View>
      <PaperAccountSwipeArea
        accounts={accounts}
        activeId={activeId}
        onSwitchAccount={setActiveId}
        testID="paper-account-hero"
        style={{ margin: 8, padding: 16, borderWidth: 1, borderColor: '#c5a552' }}
      >
        <Text testID="paper-current-account" style={{ color: '#fff', fontSize: 24 }}>
          {activeId}
        </Text>
        <TouchableOpacity
          testID="paper-account-switch"
          accessibilityRole="button"
          onPress={() => setSelectorOpen(true)}
          style={{ minHeight: 44, justifyContent: 'center' }}
        >
          <Text style={{ color: '#ffd700' }}>SWITCH</Text>
        </TouchableOpacity>
      </PaperAccountSwipeArea>
      {selectorOpen && (
        <View testID="paper-account-management">
          {accounts.map((account) => (
            <TouchableOpacity
              key={account.id}
              testID={`select-paper-account-${account.id}`}
              onPress={() => {
                setActiveId(account.id);
                setSelectorOpen(false);
              }}
              style={{ minHeight: 44, justifyContent: 'center' }}
            >
              <Text style={{ color: '#fff' }}>{account.id}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      <ScrollView testID="paper-content" style={{ flex: 1, minHeight: 0 }}>
        <View style={{ height: 1400, padding: 16 }}>
          <Text style={{ color: '#fff' }}>Scrollable paper content</Text>
        </View>
      </ScrollView>
      <TouchableOpacity
        testID="paper-trading-buy-action"
        accessibilityRole="button"
        onPress={() => setTradeCount((current) => current + 1)}
        style={{ height: 56, justifyContent: 'center', paddingHorizontal: 16 }}
      >
        <Text style={{ color: '#fff' }}>Trade</Text>
        <Text testID="paper-trade-count" style={{ color: '#fff' }}>{tradeCount}</Text>
      </TouchableOpacity>
      <BottomTabBar />
    </View>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('Paper account interaction root was not found.');
createRoot(root).render(<PaperAccountInteractionFixture />);
