import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
type PaperTab = { id: string; label: string; icon: string };
type PaperTabGroup = { id: string; label: string; icon: string; tabs: string[] };

const SILVER = '#c0c0c0';
const DIM = '#a2a8b2';
const BUY_COLOR = '#00e5a0';
const SELL_COLOR = '#ff3b3b';
const GOLD = '#ffd700';
const CARD_BG = 'rgba(192,192,192,0.08)';
const BORDER = 'rgba(192,192,192,0.28)';

function paperLayoutCurrency(value: number) {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function paperLayoutPercent(value: number) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function valueColor(value: number) {
  return value > 0 ? BUY_COLOR : value < 0 ? SELL_COLOR : SILVER;
}

function fitOneLineFontSize(text: string, availableWidth: number, maxFontSize: number) {
  const estimatedWidthPerFontSize = Math.max(1, text.length * 0.7);
  return Math.min(maxFontSize, Math.max(6, availableWidth / estimatedWidthPerFontSize));
}

export function PaperPortfolioSummary({
  accountName,
  accountPosition,
  accountCount,
  equity,
  todayPnL,
  totalReturn,
  buyingPower,
  onSwitchAccount,
}: {
  accountName: string;
  accountPosition: number;
  accountCount: number;
  equity: number;
  todayPnL: number;
  totalReturn: number;
  buyingPower: number;
  onSwitchAccount: () => void;
}) {
  const { width, fontScale } = useWindowDimensions();
  const compactStats = width <= 360 || fontScale >= 1.3;
  const todayText = `${todayPnL >= 0 ? '+' : ''}${paperLayoutCurrency(todayPnL)}`;
  const totalReturnText = paperLayoutPercent(totalReturn);
  const buyingPowerText = paperLayoutCurrency(buyingPower);
  const metricTextWidth = compactStats
    ? Math.max(96, (width - 64) * 0.48)
    : Math.max(60, (width - 100) / 3);

  return (
    <>
      <View style={styles.heroTopline}>
        <Text style={styles.selectorTitle}>SIMULATED PORTFOLIO</Text>
        <TouchableOpacity
          testID="paper-account-switch"
          accessibilityRole="button"
          accessibilityLabel="Switch paper trading account"
          onPress={onSwitchAccount}
          style={styles.editAccountsButton}
        >
          <Text style={styles.editAccountsText}>SWITCH</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.heroIdentityRow}>
        <Text testID="paper-current-account" style={styles.heroAccountName} numberOfLines={1}>
          {accountName}
        </Text>
        <Text style={styles.heroAccountPosition}>
          {accountPosition >= 0 ? `${accountPosition + 1} / ${accountCount}` : ''}
        </Text>
      </View>
      <Text
        testID="paper-account-equity"
        style={styles.heroEquity}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.65}
        allowFontScaling
      >
        {paperLayoutCurrency(equity)}
      </Text>
      <Text testID="paper-account-equity-label" style={styles.heroEquityLabel}>TOTAL EQUITY</Text>
      <View style={[styles.heroStats, compactStats && styles.heroStatsCompact]}>
        <View style={[styles.heroStat, compactStats && styles.heroStatCompact]}>
          <Text
            testID="paper-account-today-pnl"
            allowFontScaling
            style={[
              styles.heroStatValue,
              compactStats && styles.heroStatValueCompact,
              { color: valueColor(todayPnL), fontSize: fitOneLineFontSize(todayText, metricTextWidth, 12) },
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.65}
          >
            {todayText}
          </Text>
          <Text testID="paper-account-today-pnl-label" allowFontScaling style={[styles.heroStatLabel, compactStats && styles.heroStatLabelCompact]}>
            TODAY’S P/L
          </Text>
        </View>
        <View style={[styles.heroStatDivider, compactStats && styles.heroStatDividerCompact]} />
        <View style={[styles.heroStat, compactStats && styles.heroStatCompact]}>
          <Text
            testID="paper-account-total-return"
            allowFontScaling
            style={[
              styles.heroStatValue,
              compactStats && styles.heroStatValueCompact,
              { color: valueColor(totalReturn), fontSize: fitOneLineFontSize(totalReturnText, metricTextWidth, 12) },
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.65}
          >
            {totalReturnText}
          </Text>
          <Text testID="paper-account-total-return-label" allowFontScaling style={[styles.heroStatLabel, compactStats && styles.heroStatLabelCompact]}>
            TOTAL RETURN
          </Text>
        </View>
        <View style={[styles.heroStatDivider, compactStats && styles.heroStatDividerCompact]} />
        <View style={[styles.heroStat, compactStats && styles.heroStatCompact]}>
          <Text
            testID="paper-account-buying-power"
            allowFontScaling
            style={[
              styles.heroStatValue,
              compactStats && styles.heroStatValueCompact,
              { fontSize: fitOneLineFontSize(buyingPowerText, metricTextWidth, 12) },
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.65}
          >
            {buyingPowerText}
          </Text>
          <Text testID="paper-account-buying-power-label" allowFontScaling style={[styles.heroStatLabel, compactStats && styles.heroStatLabelCompact]}>
            BUYING POWER
          </Text>
        </View>
      </View>
    </>
  );
}

export function PaperPortfolioNavigation({
  groups,
  tabs,
  activeTabGroupId,
  activeTabId,
  positionsCount,
  onSelectGroup,
  onSelectTab,
}: {
  groups: PaperTabGroup[];
  tabs: PaperTab[];
  activeTabGroupId: string;
  activeTabId: string;
  positionsCount: number;
  onSelectGroup: (id: string) => void;
  onSelectTab: (id: string) => void;
}) {
  const activeGroup = groups.find((group) => group.id === activeTabGroupId) ?? groups[0];
  const activeGroupTabs = tabs.filter((tab) => activeGroup.tabs.includes(tab.id));
  const isPortfolio = activeGroup.id === 'portfolio';

  return (
    <>
      <View style={styles.primaryTabs} accessibilityRole="tablist">
        {groups.map((group) => {
          const selected = group.id === activeGroup.id;
          return (
            <TouchableOpacity
              key={group.id}
              testID={`paper-tab-group-${group.id}`}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              style={[styles.primaryTab, selected && styles.primaryTabActive]}
              onPress={() => {
                if (!group.tabs.includes(activeTabId)) onSelectGroup(group.tabs[0]);
              }}
              activeOpacity={0.7}
            >
              <Feather name={group.icon as any} size={15} color={selected ? GOLD : DIM} />
              <Text style={[styles.primaryTabLabel, selected && styles.primaryTabLabelActive]}>
                {group.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {isPortfolio ? (
        <View style={[styles.subTabBar, styles.portfolioSubTabBar]} accessibilityRole="tablist">
          {activeGroupTabs.map((tab) => {
            const selected = activeTabId === tab.id;
            return (
              <TouchableOpacity
                key={tab.id}
                testID={`paper-tab-${tab.id}`}
                accessibilityRole="tab"
                accessibilityLabel={tab.id === 'positions' ? `Positions, ${positionsCount} open` : tab.label}
                accessibilityState={{ selected }}
                style={[styles.tabBtn, styles.portfolioTabBtn, selected && styles.tabBtnActive]}
                onPress={() => onSelectTab(tab.id)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.portfolioTabLabel,
                    tab.id === 'overview' && styles.overviewTabLabel,
                    styles.tabLabel,
                    selected && (tab.id === 'positions' ? styles.positionsTabLabelActive : styles.tabLabelActive),
                  ]}
                  allowFontScaling
                >
                  {tab.label}
                </Text>
                {tab.id === 'positions' && selected && (
                  <Text testID="paper-positions-count" allowFontScaling style={styles.sectionCount}>
                    {positionsCount}
                  </Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabScroll}
          contentContainerStyle={styles.subTabBar}
          accessibilityRole="tablist"
        >
          {activeGroupTabs.map((tab) => (
            <TouchableOpacity
              key={tab.id}
              testID={`paper-tab-${tab.id}`}
              accessibilityRole="tab"
              accessibilityState={{ selected: activeTabId === tab.id }}
              style={[styles.tabBtn, activeTabId === tab.id && styles.tabBtnActive]}
              onPress={() => onSelectTab(tab.id)}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabLabel, activeTabId === tab.id && styles.tabLabelActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </>
  );
}

export function PaperPositionRow({
  id,
  symbol,
  companyName,
  isShort,
  shares,
  avgCost,
  marketValue,
  pnl,
  pnlPercent,
  color,
  expanded,
  onPress,
}: {
  id: string;
  symbol: string;
  companyName: string;
  isShort: boolean;
  shares: number;
  avgCost: number;
  marketValue: number;
  pnl: number;
  pnlPercent: number;
  color: string;
  expanded: boolean;
  onPress: () => void;
}) {
  const { width } = useWindowDimensions();
  const marketValueText = paperLayoutCurrency(marketValue);
  const symbolText = `${symbol}${isShort ? '  ·  SHORT' : ''}`;
  const quantityCostText = `${shares.toLocaleString('en-US')} sh · ${isShort ? 'Entry' : 'Avg.'} ${paperLayoutCurrency(avgCost)}`;
  const pnlAmountText = `${pnl >= 0 ? '+' : ''}${paperLayoutCurrency(pnl)}`;
  const pnlPercentText = `(${paperLayoutPercent(pnlPercent)})`;
  const pnlText = `${pnlAmountText} ${pnlPercentText}`;
  const pnlLines = pnlText.length > 24 ? [pnlAmountText, pnlPercentText] : [pnlText];
  const availableCardWidth = Math.max(0, width - 84);
  const valueColumnWidth = Math.max(72, availableCardWidth * 0.48);
  const identityColumnWidth = Math.max(72, availableCardWidth - valueColumnWidth - 8);

  return (
    <TouchableOpacity
      testID={`paper-position-${id}`}
      style={[styles.posCard, expanded && styles.posCardExpanded]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.posColorBar, { backgroundColor: color }]} />
      <View style={styles.posContent}>
        <View style={styles.posTopRow}>
          <View style={styles.posIdentity}>
            <Text
              testID={`paper-position-symbol-${id}`}
              style={[styles.posSymbol, { fontSize: fitOneLineFontSize(symbolText, identityColumnWidth, 15) }]}
              numberOfLines={1}
              ellipsizeMode="tail"
              adjustsFontSizeToFit
              minimumFontScale={0.65}
              allowFontScaling
            >
              {symbolText}
            </Text>
            <Text
              testID={`paper-position-name-${id}`}
              style={styles.posName}
              numberOfLines={1}
              ellipsizeMode="tail"
              allowFontScaling
            >
              {companyName}
            </Text>
          </View>
          <View style={styles.positionValue}>
            <Text style={styles.posMktLabel} numberOfLines={1} allowFontScaling>
              {isShort ? 'LIABILITY' : 'MARKET VALUE'}
            </Text>
            <Text
              testID={`paper-position-market-value-${id}`}
              style={[styles.posMktVal, { fontSize: fitOneLineFontSize(marketValueText, valueColumnWidth, 16) }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.4}
              allowFontScaling
            >
              {marketValueText}
            </Text>
          </View>
        </View>
        <View style={styles.posMetaRow}>
          <Text
            testID={`paper-position-quantity-cost-${id}`}
            style={[styles.posMeta, { fontSize: fitOneLineFontSize(quantityCostText, identityColumnWidth, 10) }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.4}
            allowFontScaling
          >
            {quantityCostText}
          </Text>
          <Text
            testID={`paper-position-pnl-${id}`}
            style={[
              styles.posPnl,
              {
                color: valueColor(pnl),
                fontSize: fitOneLineFontSize(pnlLines.reduce((longest, line) => line.length > longest.length ? line : longest, ''), valueColumnWidth, 11.5),
              },
            ]}
            numberOfLines={pnlLines.length}
            adjustsFontSizeToFit
            minimumFontScale={0.4}
            allowFontScaling
          >
            {pnlLines.join('\n')}
          </Text>
        </View>
      </View>
      <Feather
        name={expanded ? 'chevron-down' : 'chevron-right'}
        size={14}
        color={DIM}
        style={{ marginLeft: 8 }}
      />
    </TouchableOpacity>
  );
}

export function PaperTradingAction({
  title,
  hint,
  disabled,
  accessibilityLabel,
  onPress,
}: {
  title: string;
  hint: string;
  disabled: boolean;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  return (
    <View style={styles.buyActionWrap}>
      <TouchableOpacity
        testID="paper-trading-buy-action"
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ disabled }}
        disabled={disabled}
        style={[styles.buyAction, disabled && { opacity: 0.55 }]}
        onPress={onPress}
        activeOpacity={0.85}
      >
        <Feather name={disabled ? 'lock' : 'plus'} size={18} color="#000" />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text allowFontScaling style={styles.buyActionTitle}>{title}</Text>
          <Text allowFontScaling style={styles.buyActionHint}>{hint}</Text>
        </View>
        {!disabled && <Feather name="arrow-up-right" size={17} color="#000" />}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  selectorTitle: {
    flexShrink: 1,
    fontFamily: 'Inter_700Bold' as const,
    fontSize: 11,
    color: GOLD,
    letterSpacing: 1.2,
  },
  heroTopline: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: 8,
  },
  editAccountsButton: {
    minHeight: 36,
    paddingHorizontal: 11,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.38)',
    borderRadius: 8,
    backgroundColor: 'rgba(255,215,0,0.08)',
  },
  editAccountsText: { color: GOLD, fontFamily: 'Inter_700Bold' as const, fontSize: 9, letterSpacing: 0.8 },
  heroIdentityRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: 8,
    marginTop: 1,
  },
  heroAccountName: { flex: 1, minWidth: 0, color: '#eee9dc', fontFamily: 'Inter_600SemiBold' as const, fontSize: 15 },
  heroAccountPosition: { color: DIM, fontFamily: 'Inter_600SemiBold' as const, fontSize: 9, letterSpacing: 0.8 },
  heroEquity: {
    width: '100%' as const,
    flexShrink: 1,
    color: '#f4f0e6',
    fontFamily: 'Inter_700Bold' as const,
    fontSize: 27,
    letterSpacing: -0.7,
    marginTop: 1,
  },
  heroEquityLabel: {
    color: DIM,
    fontFamily: 'Inter_600SemiBold' as const,
    fontSize: 9,
    letterSpacing: 1.2,
    marginTop: 1,
  },
  heroStats: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(192,192,192,0.16)',
  },
  heroStatsCompact: {
    flexDirection: 'column' as const,
    alignItems: 'stretch' as const,
    gap: 2,
    marginTop: 4,
    paddingTop: 4,
  },
  heroStat: { flex: 1, minWidth: 0 },
  heroStatCompact: {
    flex: 0,
    flexGrow: 0,
    flexShrink: 0,
    flexDirection: 'row-reverse' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: 8,
    minHeight: 20,
  },
  heroStatValue: { color: '#e5e0d4', fontFamily: 'Inter_700Bold' as const, fontSize: 12, minWidth: 0 },
  heroStatValueCompact: { flex: 1, minWidth: 0, textAlign: 'right' as const },
  heroStatLabel: {
    color: DIM,
    fontFamily: 'Inter_500Medium' as const,
    fontSize: 8,
    letterSpacing: 0.65,
    marginTop: 2,
  },
  heroStatLabelCompact: {
    flex: 1,
    minWidth: 0,
    fontSize: 10,
    letterSpacing: 0.35,
    marginTop: 0,
    textAlign: 'left' as const,
  },
  heroStatDivider: { width: 1, height: 24, backgroundColor: BORDER },
  heroStatDividerCompact: { width: '100%' as const, height: 1, backgroundColor: BORDER },
  accountPositionIndicators: {
    flexDirection: 'row' as const,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    gap: 5,
    marginTop: 7,
  },
  accountPositionIndicator: { width: 5, height: 5, borderRadius: 3, backgroundColor: 'rgba(192,192,192,0.3)' },
  accountPositionIndicatorActive: { width: 16, backgroundColor: GOLD },
  eventPositionIndicator: { backgroundColor: BUY_COLOR },
  primaryTabs: {
    flexDirection: 'row' as const,
    marginHorizontal: 16,
    marginTop: 2,
    padding: 4,
    gap: 4,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  primaryTab: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 6,
    paddingHorizontal: 4,
    borderRadius: 10,
  },
  primaryTabActive: { backgroundColor: 'rgba(255,215,0,0.12)' },
  primaryTabLabel: {
    flexShrink: 1,
    minWidth: 0,
    textAlign: 'center' as const,
    color: DIM,
    fontFamily: 'Inter_600SemiBold' as const,
    fontSize: 11,
  },
  primaryTabLabelActive: { color: GOLD },
  tabScroll: { flexGrow: 0 },
  subTabBar: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 8, gap: 8 },
  portfolioSubTabBar: { flexDirection: 'row' as const, alignItems: 'stretch' as const },
  tabBtn: {
    minHeight: 38,
    minWidth: 78,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD_BG,
  },
  portfolioTabBtn: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    justifyContent: 'center' as const,
    gap: 8,
    paddingHorizontal: 8,
  },
  portfolioTabLabel: { flexShrink: 1, minWidth: 0, textAlign: 'center' as const },
  overviewTabLabel: { flex: 1 },
  tabBtnActive: { borderColor: GOLD, backgroundColor: 'rgba(255,215,0,0.12)' },
  tabLabel: { fontFamily: 'Inter_600SemiBold' as const, fontSize: 12, color: DIM },
  tabLabelActive: { color: GOLD },
  positionsTabLabelActive: { color: '#fff' },
  sectionCount: {
    minWidth: 28,
    textAlign: 'center' as const,
    color: GOLD,
    fontFamily: 'Inter_700Bold' as const,
    fontSize: 12,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 9,
    backgroundColor: 'rgba(255,215,0,0.1)',
  },
  posCard: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    minHeight: 64,
    paddingVertical: 3,
    paddingHorizontal: 9,
    gap: 6,
  },
  posCardExpanded: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderBottomWidth: 0 },
  posColorBar: { width: 3, height: '100%' as const, borderRadius: 2, minHeight: 44 },
  posContent: { flex: 1, minWidth: 0, gap: 2, justifyContent: 'center' as const },
  posTopRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    minWidth: 0,
    gap: 8,
  },
  posIdentity: { flex: 1, minWidth: 0, paddingRight: 4 },
  posSymbol: { fontFamily: 'Inter_700Bold' as const, fontSize: 15, color: '#fff' },
  posName: { fontFamily: 'Inter_400Regular' as const, fontSize: 10, color: DIM, marginTop: 1, flexShrink: 1 },
  positionValue: { flex: 0.92, minWidth: 0, alignItems: 'flex-end' as const },
  posMktLabel: {
    width: '100%' as const,
    fontFamily: 'Inter_600SemiBold' as const,
    fontSize: 8,
    lineHeight: 11,
    color: DIM,
    letterSpacing: 0.35,
    textAlign: 'right' as const,
  },
  posMktVal: {
    width: '100%' as const,
    fontFamily: 'Inter_700Bold' as const,
    fontSize: 16,
    lineHeight: 20,
    color: '#fff',
    textAlign: 'right' as const,
  },
  posMetaRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: 8,
    minWidth: 0,
    paddingTop: 2,
    borderTopWidth: 1,
    borderTopColor: 'rgba(192,192,192,0.12)',
  },
  posMeta: { flex: 1, minWidth: 0, fontFamily: 'Inter_400Regular' as const, fontSize: 10, lineHeight: 14, color: DIM },
  posPnl: {
    flex: 0.92,
    minWidth: 0,
    fontFamily: 'Inter_600SemiBold' as const,
    fontSize: 11.5,
    lineHeight: 15,
    textAlign: 'right' as const,
  },
  buyActionWrap: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10 },
  buyAction: {
    minWidth: 0,
    minHeight: 58,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    paddingHorizontal: 16,
    backgroundColor: BUY_COLOR,
    borderRadius: 13,
  },
  buyActionTitle: { fontFamily: 'Inter_700Bold' as const, fontSize: 14, color: '#000' },
  buyActionHint: { fontFamily: 'Inter_500Medium' as const, fontSize: 10, color: 'rgba(0,0,0,0.72)', marginTop: 2 },
});
