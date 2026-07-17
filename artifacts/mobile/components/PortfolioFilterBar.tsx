/**
 * PortfolioFilterBar — compact filter + sort control for the portfolio
 * History tab. Renders a sort toggle, a search input, and a ticker-picker
 * button that opens a scrollable dropdown Modal of all traded symbols.
 *
 * Consumed by portfolio.tsx; all state lives in the parent (PortfolioScreen)
 * so filteredTrades can be derived there and used in the tab-count label too.
 */
import React, { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { ColorScheme } from '@/constants/colors';
import type { Trade } from '@/lib/portfolioMath';

interface Props {
  /** Full (unfiltered) trade list — used to build the symbol picker. */
  trades: Trade[];
  filterSymbol: string;
  setFilterSymbol: (v: string) => void;
  sortOrder: 'date' | 'symbol';
  setSortOrder: (v: 'date' | 'symbol') => void;
  colors: ColorScheme & { radius: number };
}

export function PortfolioFilterBar({
  trades,
  filterSymbol,
  setFilterSymbol,
  sortOrder,
  setSortOrder,
  colors,
}: Props) {
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Unique, sorted list of symbols from the full (unfiltered) trade list.
  const allSymbols = useMemo(
    () => [...new Set(trades.map((t) => t.symbol))].sort(),
    [trades],
  );

  const trimmed = filterSymbol.trim().toUpperCase();
  const isFiltered = trimmed.length > 0;
  // True when the search box exactly matches a traded ticker — highlights the picker button.
  const exactMatch = allSymbols.includes(trimmed);

  return (
    <>
      {/* ── Filter row ──────────────────────────────────────────── */}
      <View
        style={[
          styles.bar,
          { backgroundColor: colors.card, borderBottomColor: colors.border },
        ]}
      >
        {/* Sort toggle pill: Date | A→Z */}
        <View style={[styles.sortPill, { backgroundColor: colors.muted }]}>
          {(['date', 'symbol'] as const).map((order) => (
            <TouchableOpacity
              key={order}
              style={[
                styles.sortBtn,
                sortOrder === order && { backgroundColor: colors.accent },
              ]}
              onPress={() => setSortOrder(order)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.sortBtnText,
                  {
                    color:
                      sortOrder === order
                        ? colors.foreground
                        : colors.mutedForeground,
                    fontFamily:
                      sortOrder === order
                        ? 'Inter_700Bold'
                        : 'Inter_400Regular',
                  },
                ]}
              >
                {order === 'date' ? 'Date' : 'A→Z'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Search input */}
        <View
          style={[
            styles.searchWrap,
            {
              backgroundColor: colors.muted,
              borderColor: isFiltered ? colors.primary : colors.border,
            },
          ]}
        >
          <Feather name="search" size={12} color={colors.mutedForeground} />
          <TextInput
            style={[
              styles.searchInput,
              {
                color: colors.foreground,
                fontFamily: 'Inter_400Regular',
              },
            ]}
            placeholder="Search ticker…"
            placeholderTextColor={colors.mutedForeground}
            value={filterSymbol}
            onChangeText={(text) => setFilterSymbol(text.toUpperCase())}
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="done"
          />
          {isFiltered && (
            <TouchableOpacity
              onPress={() => setFilterSymbol('')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Feather name="x" size={12} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
        </View>

        {/* Ticker list picker button */}
        <TouchableOpacity
          style={[
            styles.pickerBtn,
            {
              backgroundColor: colors.muted,
              borderColor: exactMatch ? colors.primary : colors.border,
            },
          ]}
          onPress={() => setDropdownOpen(true)}
          activeOpacity={0.75}
        >
          <Feather
            name="list"
            size={12}
            color={exactMatch ? colors.primary : colors.mutedForeground}
          />
          <Text
            style={[
              styles.pickerBtnText,
              {
                color: exactMatch ? colors.primary : colors.mutedForeground,
                fontFamily: 'Inter_400Regular',
              },
            ]}
            numberOfLines={1}
          >
            {exactMatch ? trimmed : 'List'}
          </Text>
          <Feather
            name="chevron-down"
            size={11}
            color={exactMatch ? colors.primary : colors.mutedForeground}
          />
        </TouchableOpacity>
      </View>

      {/* ── Active-filter chip ──────────────────────────────────── */}
      {isFiltered && (
        <View style={styles.chipRow}>
          <View
            style={[
              styles.chip,
              { backgroundColor: colors.accent, borderColor: colors.primary },
            ]}
          >
            <Text
              style={[
                styles.chipLabel,
                { color: colors.primary, fontFamily: 'Inter_700Bold' },
              ]}
            >
              {trimmed}
            </Text>
            <TouchableOpacity
              onPress={() => setFilterSymbol('')}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Feather name="x" size={11} color={colors.primary} />
            </TouchableOpacity>
          </View>
          <Text
            style={[
              styles.chipHint,
              { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' },
            ]}
          >
            tap ✕ to show all trades
          </Text>
        </View>
      )}

      {/* ── Ticker picker dropdown Modal ────────────────────────── */}
      <Modal
        visible={dropdownOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setDropdownOpen(false)}
      >
        <Pressable
          style={styles.backdrop}
          onPress={() => setDropdownOpen(false)}
        >
          {/* Inner Pressable stops backdrop tap from propagating inward */}
          <Pressable
            style={[
              styles.panel,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
            onPress={() => {}}
          >
            {/* Panel header */}
            <View
              style={[
                styles.panelHeader,
                { borderBottomColor: colors.border },
              ]}
            >
              <Text
                style={[
                  styles.panelTitle,
                  {
                    color: colors.foreground,
                    fontFamily: 'Inter_700Bold',
                  },
                ]}
              >
                Select Ticker
              </Text>
              <TouchableOpacity onPress={() => setDropdownOpen(false)}>
                <Feather name="x" size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            {/* "All Tickers" row */}
            <TouchableOpacity
              style={[
                styles.panelRow,
                !filterSymbol && { backgroundColor: colors.accent },
              ]}
              onPress={() => {
                setFilterSymbol('');
                setDropdownOpen(false);
              }}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.panelRowText,
                  {
                    color: colors.foreground,
                    fontFamily: !filterSymbol
                      ? 'Inter_700Bold'
                      : 'Inter_400Regular',
                  },
                ]}
              >
                All Tickers
              </Text>
              {!filterSymbol && (
                <Feather name="check" size={14} color={colors.primary} />
              )}
            </TouchableOpacity>

            <View
              style={[styles.panelDivider, { backgroundColor: colors.border }]}
            />

            {/* Symbol list */}
            <ScrollView
              style={styles.panelScroll}
              bounces={false}
              showsVerticalScrollIndicator={false}
            >
              {allSymbols.map((symbol) => {
                const selected =
                  symbol.toUpperCase() === filterSymbol.trim().toUpperCase();
                return (
                  <TouchableOpacity
                    key={symbol}
                    style={[
                      styles.panelRow,
                      selected && { backgroundColor: colors.accent },
                    ]}
                    onPress={() => {
                      setFilterSymbol(symbol);
                      setDropdownOpen(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.panelRowText,
                        {
                          color: selected ? colors.primary : colors.foreground,
                          fontFamily: selected
                            ? 'Inter_700Bold'
                            : 'Inter_400Regular',
                        },
                      ]}
                    >
                      {symbol}
                    </Text>
                    {selected && (
                      <Feather name="check" size={14} color={colors.primary} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Filter bar
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  // Sort pill
  sortPill: {
    flexDirection: 'row',
    borderRadius: 8,
    overflow: 'hidden',
  },
  sortBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  sortBtnText: {
    fontSize: 11,
    letterSpacing: 0.3,
  },
  // Search
  searchWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  searchInput: {
    flex: 1,
    fontSize: 12,
    padding: 0,
    margin: 0,
    minWidth: 0,
  },
  // Picker button
  pickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  pickerBtnText: {
    fontSize: 11,
    maxWidth: 44,
  },
  // Active filter chip
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 2,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  chipLabel: {
    fontSize: 11,
    letterSpacing: 0.5,
  },
  chipHint: {
    fontSize: 11,
    opacity: 0.75,
  },
  // Modal backdrop
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  // Dropdown panel
  panel: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  panelTitle: {
    fontSize: 15,
  },
  panelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  panelRowText: {
    fontSize: 14,
  },
  panelDivider: {
    height: StyleSheet.hairlineWidth,
  },
  panelScroll: {
    maxHeight: 300,
  },
});
