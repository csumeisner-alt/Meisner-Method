/**
 * ComparisonChart
 *
 * Plots one or two price series as either % return from the first candle or
 * absolute prices. Percentage mode remains the default so stocks at wildly
 * different absolute prices share the same Y-axis.
 *
 * Primary series    → green accent  (#00e5a0)
 * Comparison series → blue          (#60a5fa)
 *
 * Features
 *  - Percentage/price display toggle
 *  - Matching Y-axis and touch crosshair values for both modes
 *  - End-of-line ticker labels (right edge)
 *  - Legend row with color swatches and current period return
 */

import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Svg, { Path, Line, Text as SvgText, Circle, G, Rect } from 'react-native-svg';
import type { GestureResponderEvent } from 'react-native';
import type { Candle } from './StockChart';
import {
  formatHeatMapChartAxisDate,
  formatHeatMapChartFullDate,
  formatHeatMapChartWindow,
} from '@/lib/heatMapChart';

// ── Constants ────────────────────────────────────────────────────────────────

export const PRIMARY_COLOR = '#00e5a0';
export const COMP_COLOR    = '#60a5fa';
const SERIES_COLORS = [PRIMARY_COLOR, COMP_COLOR, '#c084fc', '#f59e0b', '#22d3ee'];
const GRID_COLOR    = 'rgba(192,192,192,0.07)';
const AXIS_COLOR    = 'rgba(192,192,192,0.40)';
const BG_BUBBLE     = '#1c1c1c';
const PAD = { top: 20, right: 60, bottom: 42, left: 6 };
const EMPTY_ADDITIONAL_SERIES: { symbol: string; candles: Candle[] }[] = [];

// ── Helpers ──────────────────────────────────────────────────────────────────

function normalize(candles: Candle[]): number[] {
  if (candles.length === 0) return [];
  const base = candles[0].c;
  if (base === 0) return candles.map(() => 0);
  return candles.map((c) => ((c.c - base) / base) * 100);
}

type ChartMode = 'percent' | 'price';

function fmtPct(v: number): string {
  const sign = v >= 0 ? '+' : '';
  return `${sign}${v.toFixed(2)}%`;
}

function fmtPrice(v: number): string {
  if (v >= 1000) return `$${(v / 1000).toFixed(1)}k`;
  if (v >= 1) return `$${v.toFixed(2)}`;
  return `$${v.toFixed(4)}`;
}

function fmtAxisValue(v: number, mode: ChartMode): string {
  return mode === 'percent'
    ? `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`
    : fmtPrice(v);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  primaryCandles: Candle[];
  primarySymbol:  string;
  compCandles?:   Candle[];
  compSymbol?:    string;
  secondCompCandles?: Candle[];
  secondCompSymbol?: string;
  additionalSeries?: { symbol: string; candles: Candle[] }[];
  adjustedReturnMode?: boolean;
  returnBasis?: 'price' | 'total';
  totalReturnAvailable?: boolean;
  totalReturnUnavailableReason?: string;
  onReturnBasisChange?: (basis: 'price' | 'total') => void;
  largeTouchTargets?: boolean;
  width:          number;
  height?:        number;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function LegendItem({
  color,
  ticker,
  value,
  mode,
}: {
  color: string;
  ticker: string;
  value: number | null;
  mode: ChartMode;
}) {
  const valueColor = value == null ? color : value >= 0 || mode === 'price' ? color : '#ff3b3b';
  return (
    <View style={s.legendItem}>
      <View style={[s.swatch, { backgroundColor: color }]} />
      <Text style={[s.legendTicker, { color }]}>{ticker}</Text>
      {value != null && (
        <Text style={[s.legendRet, { color: valueColor }]}>
          {mode === 'percent' ? fmtPct(value) : fmtPrice(value)}
        </Text>
      )}
    </View>
  );
}

function Bubble({
  x, y, label, color, chartLeft, chartRight, offsetY,
}: {
  x: number; y: number; label: string; color: string;
  chartLeft: number; chartRight: number; offsetY: number;
}) {
  const W = 110;
  const bx = clamp(x - W / 2, chartLeft, chartRight - W);
  const by = y - 26 + offsetY;
  return (
    <G>
      <Rect x={bx} y={by} width={W} height={18} rx={4}
        fill={BG_BUBBLE} stroke="rgba(192,192,192,0.25)" strokeWidth={1} />
      <SvgText x={bx + W / 2} y={by + 13}
        fontSize={10} fill={color} textAnchor="middle" fontWeight="bold">
        {label}
      </SvgText>
    </G>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ComparisonChart({
  primaryCandles,
  primarySymbol,
  compCandles,
  compSymbol,
  secondCompCandles,
  secondCompSymbol,
  additionalSeries = EMPTY_ADDITIONAL_SERIES,
  adjustedReturnMode = false,
  returnBasis,
  totalReturnAvailable = true,
  totalReturnUnavailableReason,
  onReturnBasisChange,
  largeTouchTargets = false,
  width,
  height = 240,
}: Props) {
  const [touched, setTouched] = useState<number | null>(null);
  const [mode, setMode] = useState<ChartMode>('percent');
  const usesAdjustedReturns = returnBasis === undefined
    ? adjustedReturnMode
    : returnBasis === 'total' && totalReturnAvailable;
  const displayMode: ChartMode = usesAdjustedReturns ? 'percent' : mode;

  const chartW = width - PAD.left - PAD.right;
  const chartH = height - PAD.top - PAD.bottom;

  const comparisons = useMemo(() => [
    ...additionalSeries,
    ...(compCandles?.length && compSymbol ? [{ symbol: compSymbol, candles: compCandles }] : []),
    ...(secondCompCandles?.length && secondCompSymbol
      ? [{ symbol: secondCompSymbol, candles: secondCompCandles }]
      : []),
  ].filter(({ candles }) => candles.length > 0), [
    additionalSeries, compCandles, compSymbol, secondCompCandles, secondCompSymbol,
  ]);
  const chartSeries = useMemo(() => [
    { symbol: primarySymbol, candles: primaryCandles },
    ...comparisons,
  ], [comparisons, primaryCandles, primarySymbol]);
  const seriesValues = useMemo(() => chartSeries.map(({ candles }) => {
    if (displayMode === 'price') return candles.map((candle) => candle.c);
    return usesAdjustedReturns
      ? candles.map((candle) => candle.adjustedReturnPercent ?? 0)
      : normalize(candles);
  }), [chartSeries, displayMode, usesAdjustedReturns]);
  const primValues = seriesValues[0] ?? [];
  const nPrim = primValues.length;
  const seriesLengths = seriesValues.map((values) => values.length);

  // Combined Y domain
  const { rawMin, rawMax } = useMemo(() => {
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const values of seriesValues) {
      for (const value of values) {
        if (value < min) min = value;
        if (value > max) max = value;
      }
    }
    return {
      rawMin: Number.isFinite(min) ? min : displayMode === 'percent' ? -5 : 0,
      rawMax: Number.isFinite(max) ? max : displayMode === 'percent' ? 5 : 1,
    };
  }, [displayMode, seriesValues]);
  const yPad  = Math.max((rawMax - rawMin) * 0.12, 2);
  const minY  = rawMin - yPad;
  const maxY  = rawMax + yPad;
  const rangeY = maxY - minY || 1;

  // Each series uses its reported observations; ETF comparisons are pre-aligned by date.
  const pxForSeries = (seriesIndex: number, pointIndex: number) => {
    const count = seriesLengths[seriesIndex] ?? 0;
    return PAD.left + (count <= 1 ? 0 : (pointIndex / (count - 1)) * chartW);
  };
  const pxPrim = (i: number) => pxForSeries(0, i);
  const pyVal = (v: number) =>
    PAD.top + chartH - ((v - minY) / rangeY) * chartH;
  const py0 = pyVal(0); // zero-return baseline

  // Y-axis ticks
  const yTicks = useMemo(() => [0, 0.25, 0.5, 0.75, 1].map((t) => ({
    val: minY + t * rangeY,
    y:   PAD.top + chartH * (1 - t),
  })), [chartH, minY, rangeY]);

  // X-axis labels (primary, up to 5)
  const xLabelCount = Math.min(5, nPrim);
  const firstDate = primaryCandles[0]?.date ?? '';
  const lastDate = primaryCandles[nPrim - 1]?.date ?? '';
  const spanDays = firstDate && lastDate
    ? (Date.parse(`${lastDate}T00:00:00Z`) - Date.parse(`${firstDate}T00:00:00Z`)) / 86_400_000
    : 0;
  const xLabels = nPrim > 0
    ? Array.from({ length: xLabelCount }, (_, i) => {
        const idx = Math.round((i / Math.max(xLabelCount - 1, 1)) * (nPrim - 1));
        return { idx, x: pxPrim(idx), label: formatHeatMapChartAxisDate(primaryCandles[idx]?.date ?? '', spanDays) };
      })
    : [];
  const dateWindow = formatHeatMapChartWindow(firstDate, lastDate);

  // Touch — snap to nearest primary candle
  const xStep = nPrim <= 1 ? chartW : chartW / (nPrim - 1);
  const handleTouch = useCallback(
    (e: GestureResponderEvent) => {
      const event = e.nativeEvent as typeof e.nativeEvent & { pageX?: number };
      let localX = event.locationX;
      if (!Number.isFinite(localX) && Number.isFinite(event.pageX)) {
        const target = e.currentTarget as unknown as {
          getBoundingClientRect?: () => { left: number };
        };
        const left = target.getBoundingClientRect?.().left;
        if (Number.isFinite(left)) localX = event.pageX! - left!;
      }
      const lx = (Number.isFinite(localX) ? localX : 0) - PAD.left;
      setTouched(Math.max(0, Math.min(nPrim - 1, Math.round(lx / xStep))));
    },
    [xStep, nPrim],
  );

  const paths = useMemo(() => seriesValues.map((values) => values
    .map((value, index) => {
      const x = PAD.left + ((values.length <= 1 ? 0 : index / (values.length - 1)) * chartW);
      const y = PAD.top + chartH - ((value - minY) / rangeY) * chartH;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ')), [chartH, chartW, minY, rangeY, seriesValues]);

  // Crosshair values
  const touchPrimValue = touched !== null ? primValues[touched] : null;
  const touchValues = touched === null
    ? []
    : seriesValues.map((values, seriesIndex) => {
        const count = values.length;
        const index = count <= 1 || nPrim <= 1
          ? 0
          : Math.round((touched / (nPrim - 1)) * (count - 1));
        return { index, value: values[index] ?? null, seriesIndex };
      });

  if (nPrim === 0) {
    return (
      <View style={[s.empty, { width, height }]}>
        <Text style={s.emptyText}>No chart data</Text>
      </View>
    );
  }

  const seriesColors = chartSeries.map((_, index) =>
    SERIES_COLORS[index % SERIES_COLORS.length]);
  const endLabels = chartSeries.map(({ symbol }, seriesIndex) => {
    const values = seriesValues[seriesIndex] ?? [];
    const y = values.length ? pyVal(values[values.length - 1]!) : PAD.top;
    return { symbol, seriesIndex, color: seriesColors[seriesIndex]!, y };
  }).map((label, index, labels) => ({
    ...label,
    y: labels.slice(0, index).some((previous) => Math.abs(previous.y - label.y) < 12)
      ? label.y + 13
      : label.y,
  }));

  return (
    <View style={{ width }}>
      {returnBasis !== undefined && onReturnBasisChange && (
        <>
          <View style={s.modeRow}>
            <Text style={s.modeLabel}>RETURN</Text>
            <View style={s.modeToggle}>
              {([
                { key: 'price' as const, label: 'PRICE RETURN' },
                { key: 'total' as const, label: 'TOTAL RETURN' },
              ]).map((option) => {
                const disabled = option.key === 'total' && !totalReturnAvailable;
                const selected = returnBasis === option.key;
                return (
                  <Pressable
                    key={option.key}
                    testID={`etf-return-basis-${option.key}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected, disabled }}
                    accessibilityLabel={`Show ${option.key === 'price' ? 'price return' : 'provider-adjusted total return'}`}
                    accessibilityHint={disabled ? totalReturnUnavailableReason : undefined}
                    disabled={disabled}
                    onPress={() => {
                      if (disabled) return;
                      setTouched(null);
                      onReturnBasisChange(option.key);
                    }}
                    style={[s.modeButton, largeTouchTargets && s.modeButtonLarge, selected && s.modeButtonActive, disabled && s.modeButtonDisabled]}
                  >
                    <Text style={[s.modeButtonText, selected && s.modeButtonTextActive, disabled && s.modeButtonTextDisabled]}>
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          {!totalReturnAvailable && (
            <Text testID="etf-total-return-unavailable" style={s.returnBasisNote}>
              Total return unavailable: {totalReturnUnavailableReason ?? 'complete provider-adjusted history is not available for this range.'}
            </Text>
          )}
        </>
      )}
      {/* ── Display mode ───────────────────────────────────────────────── */}
      <View style={s.modeRow}>
        <Text style={s.modeLabel}>VIEW</Text>
        <View style={s.modeToggle}>
          {(usesAdjustedReturns
            ? [{ key: 'percent' as const, label: '%' }]
            : [
                { key: 'percent' as const, label: '%' },
                { key: 'price' as const, label: '$' },
              ]).map((option) => {
            const selected = displayMode === option.key;
            return (
              <Pressable
                key={option.key}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`Show chart in ${option.key === 'percent' ? 'percentage' : 'price'} mode`}
                onPress={() => {
                  setTouched(null);
                  setMode(option.key);
                }}
                style={[s.modeButton, largeTouchTargets && s.modeButtonLarge, selected && s.modeButtonActive]}
              >
                <Text style={[s.modeButtonText, selected && s.modeButtonTextActive]}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={s.modeValueLabel}>
          {usesAdjustedReturns ? 'TOTAL RETURN' : displayMode === 'percent' ? 'PERCENT' : 'PRICE'}
        </Text>
      </View>

      {/* ── Legend ─────────────────────────────────────────────────────── */}
      <View style={s.legend}>
        {chartSeries.map(({ symbol }, index) => (
          <LegendItem
            key={`${symbol}-${index}`}
            color={seriesColors[index]!}
            ticker={symbol}
            value={seriesValues[index]?.at(-1) ?? null}
            mode={displayMode}
          />
        ))}
      </View>

      {/* ── SVG ────────────────────────────────────────────────────────── */}
      <View style={{ width, height, position: 'relative' }}>
      <Svg
        width={width}
        height={height}
        pointerEvents={largeTouchTargets ? 'none' : 'auto'}
        onPress={largeTouchTargets ? undefined : handleTouch}
        onPressOut={largeTouchTargets ? undefined : () => setTouched(null)}
      >
        {/* Grid lines */}
        {yTicks.map(({ y }, i) => (
          <Line key={i}
            x1={PAD.left} y1={y} x2={PAD.left + chartW} y2={y}
            stroke={GRID_COLOR} strokeWidth={1}
          />
        ))}

        {/* Zero-return baseline only applies to percentage mode. */}
        {displayMode === 'percent' && (
          <Line
            x1={PAD.left} y1={py0} x2={PAD.left + chartW} y2={py0}
            stroke="rgba(192,192,192,0.22)" strokeWidth={1} strokeDasharray="4 3"
          />
        )}

        {/* Y-axis labels */}
        {yTicks.map(({ val, y }, i) => (
          <SvgText key={i} x={PAD.left + chartW + 4} y={y + 4}
            fontSize={9} fill={AXIS_COLOR} textAnchor="start">
             {fmtAxisValue(val, displayMode)}
          </SvgText>
        ))}

        {/* X-axis labels */}
        {xLabels.map(({ idx, x, label }) => (
          <SvgText key={idx}
            x={idx === 0 ? PAD.left : idx === nPrim - 1 ? PAD.left + chartW : x}
            y={height - 18}
            fontSize={9} fill={AXIS_COLOR}
            textAnchor={idx === 0 ? 'start' : idx === nPrim - 1 ? 'end' : 'middle'}>
            {label}
          </SvgText>
        ))}

        {chartSeries.slice(1).map(({ symbol }, offset) => {
          const seriesIndex = offset + 1;
          return (
            <Path
              key={`${symbol}-${seriesIndex}`}
              d={paths[seriesIndex] ?? ''}
              stroke={seriesColors[seriesIndex]}
              strokeWidth={1.8}
              fill="none"
              strokeOpacity={0.88}
            />
          );
        })}

        {/* Primary line */}
        <Path
          d={paths[0] ?? ''}
          stroke={PRIMARY_COLOR} strokeWidth={2} fill="none"
        />

        {endLabels.map(({ symbol, seriesIndex, color, y }) => (
          <SvgText
            key={`${symbol}-end-label-${seriesIndex}`}
            x={PAD.left + chartW + 4}
            y={clamp(y, PAD.top + 8, height - PAD.bottom - 4)}
            fontSize={9}
            fill={color}
            textAnchor="start"
            fontWeight="bold"
          >
            {symbol}
          </SvgText>
        ))}

        {/* ── Crosshair ───────────────────────────────────────────────── */}
        {touched !== null && touchPrimValue !== null && (
          <G>
            <Line
              x1={pxPrim(touched)} y1={PAD.top}
              x2={pxPrim(touched)} y2={PAD.top + chartH}
              stroke="rgba(192,192,192,0.40)" strokeWidth={1} strokeDasharray="3 3"
            />

            {touchValues.map(({ index, value, seriesIndex }) => {
              if (value === null) return null;
              const symbol = chartSeries[seriesIndex]!.symbol;
              const color = seriesColors[seriesIndex]!;
              const offsetY = seriesIndex > 0
                && Math.abs(pyVal(value) - pyVal(touchPrimValue)) < 30
                ? seriesIndex * 18
                : 0;
              return (
                <G key={`touch-${symbol}-${seriesIndex}`}>
                  <Circle
                    cx={pxForSeries(seriesIndex, index)}
                    cy={pyVal(value)}
                    r={4}
                    fill={color}
                  />
                  <Bubble
                    x={pxPrim(touched)}
                    y={pyVal(value)}
                    label={`${symbol}  ${displayMode === 'percent' ? fmtPct(value) : fmtPrice(value)}`}
                    color={color}
                    chartLeft={PAD.left}
                    chartRight={PAD.left + chartW}
                    offsetY={offsetY}
                  />
                </G>
              );
            })}

            {/* Date label at bottom */}
            <SvgText
              x={clamp(pxPrim(touched), PAD.left + 30, PAD.left + chartW - 30)}
              y={height - 18}
              fontSize={9} fill={AXIS_COLOR} textAnchor="middle"
            >
              {formatHeatMapChartFullDate(primaryCandles[touched]?.date ?? '')}
            </SvgText>
          </G>
        )}
        <SvgText
          x={PAD.left + chartW / 2}
          y={height - 3}
          fontSize={8}
          fill={AXIS_COLOR}
          textAnchor="middle"
        >
          {dateWindow}
        </SvgText>
      </Svg>
      {largeTouchTargets && <Pressable
        testID="comparison-chart-touch-target"
        accessibilityRole="button"
        accessibilityLabel={touched === null
          ? `${primarySymbol} chart, tap to inspect historical values`
          : `${primarySymbol} chart, ${primaryCandles[touched]?.date ?? 'selected date'}, ${fmtAxisValue(touchPrimValue ?? 0, displayMode)}`}
        accessibilityHint="Tap across the chart to inspect values for different dates."
        onPress={handleTouch}
        style={StyleSheet.absoluteFill}
      />}
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  modeRow:      { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 6, paddingBottom: 7 },
  modeLabel:    { color: 'rgba(192,192,192,0.42)', fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 0.8 },
  modeValueLabel: { color: 'rgba(192,192,192,0.42)', fontSize: 9, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.5 },
  modeToggle:   { flexDirection: 'row', borderRadius: 5, borderWidth: 1, borderColor: 'rgba(192,192,192,0.22)', overflow: 'hidden' },
  modeButton:   { minWidth: 28, height: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(192,192,192,0.06)' },
  modeButtonLarge: { minWidth: 44, height: 44, paddingHorizontal: 8 },
  modeButtonActive: { backgroundColor: 'rgba(0,229,160,0.18)' },
  modeButtonDisabled: { opacity: 0.45 },
  modeButtonText: { color: 'rgba(192,192,192,0.58)', fontSize: 12, fontFamily: 'Inter_700Bold' },
  modeButtonTextActive: { color: PRIMARY_COLOR },
  modeButtonTextDisabled: { color: 'rgba(192,192,192,0.42)' },
  returnBasisNote: { color: 'rgba(192,192,192,0.58)', fontSize: 11, lineHeight: 16, paddingHorizontal: 6, paddingBottom: 7 },
  legend:       { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: 6, paddingBottom: 6 },
  legendItem:   { flexDirection: 'row', alignItems: 'center', gap: 5 },
  swatch:       { width: 10, height: 10, borderRadius: 2 },
  legendTicker: { fontSize: 12, fontFamily: 'Inter_700Bold', letterSpacing: 0.5 },
  legendRet:    { fontSize: 12, fontFamily: 'Inter_500Medium', marginLeft: 2 },
  empty:        { alignItems: 'center', justifyContent: 'center' },
  emptyText:    { color: 'rgba(192,192,192,0.4)', fontSize: 13 },
});
