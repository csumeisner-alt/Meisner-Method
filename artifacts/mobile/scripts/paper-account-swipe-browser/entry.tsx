import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { BottomTabBar } from '../../components/BottomTabBar';
import { PaperEventArenaDashboard } from '../../components/PaperEventArenaDashboard';
import { PaperAccountSwipeArea } from '../../components/PaperAccountSwipeArea';
import { computePaperEquity, INITIAL_BALANCE } from '../../lib/paperMath.ts';
import { resetPaperAccountData, type PaperAccountData } from '../../lib/paperAccountManagement.ts';

const initialData = {
  accounts: [
    { id: 'tiger', name: 'Tiger', cash: 95_000, createdAt: '2026-11-01T00:00:00.000Z' },
    { id: 'borg', name: 'Borg', cash: 90_000, createdAt: '2026-11-01T00:00:00.000Z' },
    { id: 'fireball', name: 'Fireball', cash: 80_000, createdAt: '2026-11-01T00:00:00.000Z' },
    { id: 'paper-event:arena', name: 'Event Arena', cash: 95_000, createdAt: '2026-11-01T00:00:00.000Z' },
  ],
  positions: [
    { id: 'tiger-position', accountId: 'tiger', symbol: 'TIG', companyName: 'Tiger Co.', shares: 50, avgCost: 100, openedAt: '2026-11-01T00:00:00.000Z', dividendYield: 0, sector: 'Test' },
    { id: 'borg-position', accountId: 'borg', symbol: 'BOR', companyName: 'Borg Co.', shares: 25, avgCost: 100, openedAt: '2026-11-01T00:00:00.000Z', dividendYield: 0, sector: 'Test' },
    { id: 'fireball-position', accountId: 'fireball', symbol: 'FIR', companyName: 'Fireball Co.', shares: 200, avgCost: 100, openedAt: '2026-11-01T00:00:00.000Z', dividendYield: 0, sector: 'Test' },
    { id: 'event-position', accountId: 'paper-event:arena', symbol: 'EVT', companyName: 'Event Co.', shares: 25, avgCost: 100, openedAt: '2026-11-01T00:00:00.000Z', dividendYield: 0, sector: 'Test' },
  ],
  transactions: [],
  orders: [],
  lots: [],
};
const quotes = {
  TIG: { price: 225 },
  BOR: { price: 100 },
  FIR: { price: 250 },
  EVT: { price: 250 },
};

// Exercise the native haptic branch while rendering the real swipe component in a phone-sized browser.
Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
const testWindow = globalThis as typeof globalThis & {
  __eventLeaderboardOpened?: boolean;
  __setPaperSharing?: (enabled: boolean) => void;
  __setEventState?: (phase: 'upcoming' | 'active' | 'ended') => void;
  __setPaperPlatform?: (os: string) => void;
};
testWindow.__setPaperPlatform = (os) => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: os });
};

function PaperAccountInteractionFixture() {
  const [data, setData] = useState<PaperAccountData>(initialData);
  const accounts = data.accounts;
  const positions = data.positions;
  const [activeId, setActiveId] = useState(accounts[0].id);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [tradeCount, setTradeCount] = useState(0);
  const [eventPhase, setEventPhase] = useState<'upcoming' | 'active' | 'ended'>('active');
  const [sharing, setSharing] = useState(true);
  const [, setFixtureRefresh] = useState(0);
  const activeAccount = accounts.find((account) => account.id === activeId);
  if (!activeAccount) throw new Error(`Unknown paper account: ${activeId}`);
  const activePositions = positions.filter((position) => position.accountId === activeId);
  const portfolioValue = computePaperEquity(activeAccount, activePositions, quotes);
  const totalReturn = ((portfolioValue - INITIAL_BALANCE) / INITIAL_BALANCE) * 100;
  const resetAccount = (accountId: string) => {
    setData((current) => resetPaperAccountData(current, accountId, new Date().toISOString()));
  };
  const now = Date.now();
  const eventTimes = eventPhase === 'upcoming'
    ? { startAtMs: now + 86_400_000, endAtMs: now + 4 * 86_400_000 }
    : eventPhase === 'ended'
      ? { startAtMs: now - 4 * 86_400_000, endAtMs: now - 86_400_000 }
      : { startAtMs: now - 86_400_000, endAtMs: now + 86_400_000 };
  const completedSummary = eventPhase === 'ended'
    ? {
        eventId: 'arena',
        eventStartAtMs: eventTimes.startAtMs,
        eventEndAtMs: eventTimes.endAtMs,
        joinedAtMs: eventTimes.startAtMs,
        accountId: 'paper-event:arena',
        accountName: 'Event Portfolio',
        startEquity: 100_000,
        endEquity: 106_250,
        netProfit: 6_250,
        returnPercent: 6.25,
        tradeCount: 0,
        buyCount: 0,
        sellCount: 0,
        symbolsTraded: [],
        realizedPnL: 0,
        completedAtMs: now,
        finalRank: 2,
      }
    : null;
  testWindow.__eventLeaderboardOpened = false;
  testWindow.__setEventState = (phase) => {
    setEventPhase(phase);
    setFixtureRefresh((current) => current + 1);
  };
  testWindow.__setPaperSharing = setSharing;

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
        <Text testID="paper-account-total-return" style={{ color: '#fff' }}>
          {`${totalReturn >= 0 ? '+' : ''}${totalReturn.toFixed(2)}%`}
        </Text>
        <TouchableOpacity
          testID="paper-account-switch"
          accessibilityRole="button"
          onPress={() => setSelectorOpen(true)}
          style={{ minHeight: 44, justifyContent: 'center' }}
        >
          <Text style={{ color: '#ffd700' }}>SWITCH</Text>
        </TouchableOpacity>
        {activeId === 'paper-event:arena' && (
          <PaperEventArenaDashboard
            eventId="arena"
            startAtMs={eventTimes.startAtMs}
            endAtMs={eventTimes.endAtMs}
            enrollment={eventPhase === 'ended' ? null : {
              eventId: 'arena',
              eventStartAtMs: eventTimes.startAtMs,
              eventEndAtMs: eventTimes.endAtMs,
              joinedAtMs: eventTimes.startAtMs,
              accountId: 'paper-event:arena',
              accountName: 'Event Portfolio',
              startEquity: eventPhase === 'upcoming' ? null : 100_000,
              leaderboardOptedIn: sharing,
            }}
            summary={completedSummary}
            equity={portfolioValue}
            buyingPower={activeAccount.cash}
            onViewLeaderboard={() => { testWindow.__eventLeaderboardOpened = true; }}
          />
        )}
      </PaperAccountSwipeArea>
      {selectorOpen && (
        <View testID="paper-account-management">
          {accounts.map((account) => (
            <View key={account.id}>
              <TouchableOpacity
                testID={`select-paper-account-${account.id}`}
                onPress={() => {
                  setActiveId(account.id);
                  setSelectorOpen(false);
                }}
                style={{ minHeight: 44, justifyContent: 'center' }}
              >
                <Text style={{ color: '#fff' }}>{account.id}</Text>
              </TouchableOpacity>
              {!account.id.startsWith('paper-event:') && (
                <TouchableOpacity
                  testID={`reset-paper-account-${account.id}`}
                  accessibilityRole="button"
                  onPress={() => resetAccount(account.id)}
                  style={{ minHeight: 44, justifyContent: 'center' }}
                >
                  <Text style={{ color: '#ffd700' }}>Reset {account.id}</Text>
                </TouchableOpacity>
              )}
            </View>
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
