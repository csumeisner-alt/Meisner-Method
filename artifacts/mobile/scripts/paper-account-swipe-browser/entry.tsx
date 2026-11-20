import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Platform, ScrollView, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { BottomTabBar } from '../../components/BottomTabBar';
import { PaperEventArenaDashboard } from '../../components/PaperEventArenaDashboard';
import { PaperAccountSwipeArea } from '../../components/PaperAccountSwipeArea';
import {
  PaperPortfolioNavigation,
  PaperPortfolioSummary,
  PaperPositionRow,
  PaperTradingAction,
} from '../../components/PaperPortfolioLayout';
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
const stressData: PaperAccountData = {
  accounts: [
    { id: 'tiger', name: 'Tiger', cash: 123_456_789_012.34, createdAt: '2026-11-01T00:00:00.000Z' },
    { id: 'borg', name: 'Borg', cash: 900_000_000_000, createdAt: '2026-11-01T00:00:00.000Z' },
    { id: 'fireball', name: 'Fireball', cash: 7_654_321_987.65, createdAt: '2026-11-01T00:00:00.000Z' },
    { id: 'paper-event:arena', name: 'Event Arena', cash: 95_000, createdAt: '2026-11-01T00:00:00.000Z' },
  ],
  positions: [
    { id: 'tiger-stress-a', accountId: 'tiger', symbol: 'VERY-LONG-TICKER-NAME', companyName: 'International Robotics and Advanced Systems Holdings', shares: 123_456_789, avgCost: 125.67, openedAt: '2026-11-01T00:00:00.000Z', dividendYield: 0, sector: 'Test' },
    { id: 'borg-stress-a', accountId: 'borg', symbol: 'LONG-SYMBOL-BORG', companyName: 'Borg Global Infrastructure and Technology Company', shares: 987_654_321, avgCost: 18_900, openedAt: '2026-11-01T00:00:00.000Z', dividendYield: 0, sector: 'Test' },
    { id: 'fireball-stress-a', accountId: 'fireball', symbol: 'FIREBALL-CLASS-A', companyName: 'Fireball Holdings Incorporated', shares: 2_345_678, avgCost: 124.5, openedAt: '2026-11-01T00:00:00.000Z', dividendYield: 0, sector: 'Test' },
    { id: 'fireball-stress-b', accountId: 'fireball', symbol: 'FIR-B', companyName: 'Fireball Series B Preferred', shares: 987_654, avgCost: 8_765, openedAt: '2026-11-01T00:00:00.000Z', dividendYield: 0, sector: 'Test' },
    { id: 'event-position', accountId: 'paper-event:arena', symbol: 'EVT', companyName: 'Event Co.', shares: 25, avgCost: 100, openedAt: '2026-11-01T00:00:00.000Z', dividendYield: 0, sector: 'Test' },
  ],
  transactions: [],
  orders: [],
  lots: [],
};
const stressQuotes = {
  'VERY-LONG-TICKER-NAME': { price: 152.44 },
  'LONG-SYMBOL-BORG': { price: 1_250 },
  'FIREBALL-CLASS-A': { price: 186.75 },
  'FIR-B': { price: 11_200 },
  EVT: { price: 250 },
};
const tabs = [
  { id: 'overview', label: 'Overview', icon: 'grid' },
  { id: 'positions', label: 'Positions', icon: 'list' },
  { id: 'orders', label: 'Orders', icon: 'clock' },
  { id: 'history', label: 'Trade History', icon: 'repeat' },
  { id: 'analytics', label: 'Analytics', icon: 'bar-chart-2' },
  { id: 'dividends', label: 'Dividends', icon: 'dollar-sign' },
  { id: 'growth', label: 'Growth', icon: 'trending-up' },
];
const groups = [
  { id: 'portfolio', label: 'Portfolio', icon: 'briefcase', tabs: ['overview', 'positions'] },
  { id: 'activity', label: 'Activity', icon: 'activity', tabs: ['orders', 'history'] },
  { id: 'insights', label: 'Insights', icon: 'bar-chart-2', tabs: ['analytics', 'dividends', 'growth'] },
];

// Exercise the native haptic branch while rendering the real swipe component in a phone-sized browser.
Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
const testWindow = globalThis as typeof globalThis & {
  __eventLeaderboardOpened?: boolean;
  __lightningRoundOpened?: boolean;
  __setLightningPromotion?: (enabled: boolean) => void;
  __setPaperSharing?: (enabled: boolean) => void;
  __setEventState?: (phase: 'upcoming' | 'active' | 'ended') => void;
  __setPaperPlatform?: (os: string) => void;
  __setPaperStressScenario?: (enabled: boolean) => void;
};
testWindow.__setPaperPlatform = (os) => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: os });
};

function PaperAccountInteractionFixture() {
  const { width: viewportWidth } = useWindowDimensions();
  const [data, setData] = useState<PaperAccountData>(initialData);
  const [activeQuotes, setActiveQuotes] = useState<Record<string, { price: number }>>(quotes);
  const accounts = data.accounts;
  const positions = data.positions;
  const [activeId, setActiveId] = useState(accounts[0].id);
  const [activeTab, setActiveTab] = useState('positions');
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [tradeCount, setTradeCount] = useState(0);
  const [eventPhase, setEventPhase] = useState<'upcoming' | 'active' | 'ended'>('active');
  const [sharing, setSharing] = useState(true);
  const [lightningPromotion, setLightningPromotion] = useState(false);
  const [, setFixtureRefresh] = useState(0);
  const activeAccount = accounts.find((account) => account.id === activeId);
  if (!activeAccount) throw new Error(`Unknown paper account: ${activeId}`);
  const activePositions = positions.filter((position) => position.accountId === activeId);
  const portfolioValue = computePaperEquity(activeAccount, activePositions, activeQuotes);
  const totalReturn = ((portfolioValue - INITIAL_BALANCE) / INITIAL_BALANCE) * 100;
  const todayPnL = activePositions.reduce((total, position) => (
    total + position.shares * ((activeQuotes[position.symbol]?.price ?? position.avgCost) - position.avgCost)
  ), 0);
  const resetAccount = (accountId: string) => {
    setData((current) => resetPaperAccountData(current, accountId, new Date().toISOString()));
  };
  const now = Date.now();
  const lightningPromotionWindow = lightningPromotion
    ? { startAtMs: now + 48 * 60 * 60 * 1000, endAtMs: now + 72 * 60 * 60 * 1000 }
    : null;
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
  testWindow.__lightningRoundOpened = false;
  testWindow.__setLightningPromotion = setLightningPromotion;
  testWindow.__setPaperSharing = setSharing;
  testWindow.__setPaperStressScenario = (enabled) => {
    setData(enabled ? stressData : initialData);
    setActiveQuotes(enabled ? stressQuotes : quotes);
    setActiveId('tiger');
    setActiveTab('positions');
    setSelectorOpen(false);
  };

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
        style={[
          {
            marginHorizontal: 16,
            marginTop: 6,
            marginBottom: 6,
            paddingHorizontal: 16,
            paddingTop: 9,
            paddingBottom: 7,
            borderRadius: 13,
            borderWidth: 1,
            borderColor: '#c5a552',
            backgroundColor: 'rgba(28,27,23,0.96)',
          },
          activeId !== 'paper-event:arena' && viewportWidth <= 360 && {
            marginTop: 4,
            marginBottom: 3,
            paddingHorizontal: 12,
            paddingTop: 4,
            paddingBottom: 4,
          },
        ]}
      >
        {activeId === 'paper-event:arena' ? (
          <>
            <Text testID="paper-current-account" style={{ color: '#fff', fontSize: 24 }}>
              {activeId}
            </Text>
            <Text testID="paper-account-total-return" style={{ height: 0, color: '#fff' }}>
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
            lightningRoundPromotionWindow={lightningPromotionWindow}
            onOpenLightningRound={() => { testWindow.__lightningRoundOpened = true; }}
            onViewLeaderboard={() => { testWindow.__eventLeaderboardOpened = true; }}
          />
          </>
        ) : (
          <PaperPortfolioSummary
            accountName={activeId}
            accountPosition={accounts.findIndex((account) => account.id === activeId)}
            accountCount={accounts.length}
            equity={portfolioValue}
            todayPnL={todayPnL}
            totalReturn={totalReturn}
            buyingPower={activeAccount.cash}
            onSwitchAccount={() => setSelectorOpen(true)}
          />
        )}
        {accounts.length > 1 && (
          <View
            testID="paper-account-position-indicator"
            accessibilityRole="text"
            accessibilityLabel={`Account ${accounts.findIndex((account) => account.id === activeId) + 1} of ${accounts.length}`}
            style={{
              flexDirection: 'row',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 5,
              marginTop: activeId !== 'paper-event:arena' && viewportWidth <= 360 ? 4 : 7,
            }}
          >
            {accounts.map((item, index) => (
              <View
                key={item.id}
                testID={`paper-account-indicator-${index}`}
                style={{
                  width: item.id === activeId ? 16 : 5,
                  height: 5,
                  borderRadius: 3,
                  backgroundColor: item.id.startsWith('paper-event:')
                    ? '#00e5a0'
                    : item.id === activeId ? '#ffd700' : 'rgba(192,192,192,0.3)',
                }}
              />
            ))}
          </View>
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
      <PaperPortfolioNavigation
        groups={groups}
        tabs={tabs}
        activeTabGroupId={groups.find((group) => group.tabs.includes(activeTab))?.id ?? 'portfolio'}
        activeTabId={activeTab}
        positionsCount={activePositions.length}
        onSelectGroup={(id) => setActiveTab(id)}
        onSelectTab={(id) => setActiveTab(id)}
      />
      <ScrollView testID="paper-content" style={{ flex: 1, minHeight: 0 }}>
        <View style={{ padding: 16, gap: 4 }}>
          {activeTab === 'positions' && activeId !== 'paper-event:arena'
            ? activePositions.map((position, index) => {
                const price = activeQuotes[position.symbol]?.price ?? position.avgCost;
                const pnl = position.shares * (price - position.avgCost);
                return (
                  <PaperPositionRow
                    key={position.id}
                    id={position.id}
                    symbol={position.symbol}
                    companyName={position.companyName}
                    isShort={false}
                    shares={position.shares}
                    avgCost={position.avgCost}
                    marketValue={position.shares * price}
                    pnl={pnl}
                    pnlPercent={position.avgCost > 0 ? (pnl / (position.shares * position.avgCost)) * 100 : 0}
                    color={['#00e5a0', '#ffd700', '#4da6ff'][index % 3]}
                    expanded={false}
                    onPress={() => {}}
                  />
                );
              })
            : <Text testID="paper-active-view" style={{ color: '#fff' }}>{activeTab}</Text>}
          <View testID="paper-scroll-fixture-content" style={{ height: 900 }}>
            <Text style={{ color: '#fff' }}>Scrollable paper content</Text>
          </View>
        </View>
      </ScrollView>
      <PaperTradingAction
        title="Trade"
        hint={`Trade in ${activeId}`}
        disabled={false}
        accessibilityLabel={`Buy stocks or ETFs in ${activeId}`}
        onPress={() => setTradeCount((current) => current + 1)}
      />
      <Text testID="paper-trade-count" style={{ color: '#fff', height: 0 }}>{tradeCount}</Text>
      <BottomTabBar />
    </View>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('Paper account interaction root was not found.');
createRoot(root).render(<PaperAccountInteractionFixture />);
