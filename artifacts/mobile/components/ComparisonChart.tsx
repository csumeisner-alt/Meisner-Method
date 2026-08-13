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

import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Svg, { Path, Line, Text as SvgText, Circle, G, Rect } from 'react-native-svg';
import type { GestureResponderEvent } from 'react-native';
import type { Candle } from './StockChart';

// ── Constants ────────────────────────────────────────────────────────────────

export const PRIMARY_COLOR = '#00e5a0';
export const COMP_COLOR    = '#60a5fa';
const GRID_COLOR    = 'rgba(192,192,192,0.07)';
const AXIS_COLOR    = 'rgba(192,192,192,0.40)';
const BG_BUBBLE     = '#1c1c1c';
const PAD = { top: 20, right: 60, bottom: 30, left: 6 };

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

function fmtDate(d: string): string {
  return d.length >= 7 ? d.slice(5) : d; // MM-DD
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
  width,
  height = 240,
}: Props) {
  const [touched, setTouched] = useState<number | null>(null);
  const [mode, setMode] = useState<ChartMode>('percent');

  const chartW = width - PAD.left - PAD.right;
  const chartH = height - PAD.top - PAD.bottom;

  const primValues = mode === 'percent'
    ? normalize(primaryCandles)
    : primaryCandles.map((c) => c.c);
  const compValues = compCandles && compCandles.length > 0
    ? mode === 'percent' ? normalize(compCandles) : compCandles.map((c) => c.c)
    : null;
  const hasComp = compValues !== null && compValues.length > 0;

  const nPrim = primValues.length;
  const nComp = compValues?.length ?? 0;

  // Combined Y domain
  const allVals = [...primValues, ...(compValues ?? [])];
  const rawMin = allVals.length > 0 ? Math.min(...allVals) : mode === 'percent' ? -5 : 0;
  const rawMax = allVals.length > 0 ? Math.max(...allVals) : mode === 'percent' ? 5 : 1;
  const yPad  = Math.max((rawMax - rawMin) * 0.12, 2);
  const minY  = rawMin - yPad;
  const maxY  = rawMax + yPad;
  const rangeY = maxY - minY || 1;

  // X helpers — each series fills full width independently
  const pxPrim = (i: number) =>
    PAD.left + (nPrim <= 1 ? 0 : (i / (nPrim - 1)) * chartW);
  const pxComp = (i: number) =>
    PAD.left + (nComp <= 1 ? 0 : (i / (nComp - 1)) * chartW);
  const pyVal = (v: number) =>
    PAD.top + chartH - ((v - minY) / rangeY) * chartH;
  const py0 = pyVal(0); // zero-return baseline

  // SVG paths
  function buildPath(rets: number[], xFn: (i: number) => number): string {
    return rets
      .map((v, i) => `${i === 0 ? 'M' : 'L'}${xFn(i).toFixed(1)},${pyVal(v).toFixed(1)}`)
      .join(' ');
  }

  // Y-axis ticks
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => ({
    val: minY + t * rangeY,
    y:   PAD.top + chartH * (1 - t),
  }));

  // X-axis labels (primary, up to 5)
  const xLabelCount = Math.min(5, nPrim);
  const xLabels = nPrim > 0
    ? Array.from({ length: xLabelCount }, (_, i) => {
        const idx = Math.round((i / Math.max(xLabelCount - 1, 1)) * (nPrim - 1));
        return { x: pxPrim(idx), label: fmtDate(primaryCandles[idx]?.date ?? '') };
      })
    : [];

  // Touch — snap to nearest primary candle
  const xStep = nPrim <= 1 ? chartW : chartW / (nPrim - 1);
  const handleTouch = useCallback(
    (e: GestureResponderEvent) => {
      const lx = e.nativeEvent.locationX - PAD.left;
      setTouched(Math.max(0, Math.min(nPrim - 1, Math.round(lx / xStep))));
    },
    [xStep, nPrim],
  );

  // Crosshair values
  const touchPrimValue = touched !== null ? primValues[touched] : null;
  const touchCompIdx =
    touched !== null && hasComp && nPrim > 1
      ? Math.round((touched / (nPrim - 1)) * (nComp - 1))
      : null;
  const touchCompValue =
    touchCompIdx !== null && compValues ? compValues[touchCompIdx] : null;

  // Period-end values for legend
  const primFinal = nPrim > 0 ? primValues[nPrim - 1] : null;
  const compFinal = hasComp && compValues ? compValues[nComp - 1] : null;

  if (nPrim === 0) {
    return (
      <View style={[s.empty, { width, height }]}>
        <Text style={s.emptyText}>No chart data</Text>
      </View>
    );
  }

  // End-of-line label positions
  const primEndY = pyVal(primValues[nPrim - 1]);
  const compEndY = hasComp && compValues ? pyVal(compValues[nComp - 1]) : null;
  // Nudge comparison label if too close to primary label
  const compLabelY = compEndY !== null
    ? (Math.abs(compEndY - primEndY) < 12 ? compEndY + 13 : compEndY)
    : null;

  return (
    <View style={{ width }}>
      {/* ── Display mode ───────────────────────────────────────────────── */}
      <View style={s.modeRow}>
        <Text style={s.modeLabel}>VIEW</Text>
        <View style={s.modeToggle}>
          {([
            { key: 'percent' as const, label: '%' },
            { key: 'price' as const, label: '$' },
          ]).map((option) => {
            const selected = mode === option.key;
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
                style={[s.modeButton, selected && s.modeButtonActive]}
              >
                <Text style={[s.modeButtonText, selected && s.modeButtonTextActive]}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={s.modeValueLabel}>{mode === 'percent' ? 'PERCENT' : 'PRICE'}</Text>
      </View>

      {/* ── Legend ─────────────────────────────────────────────────────── */}
      <View style={s.legend}>
        <LegendItem color={PRIMARY_COLOR} ticker={primarySymbol} value={primFinal} mode={mode} />
        {hasComp && compSymbol && (
          <LegendItem color={COMP_COLOR} ticker={compSymbol} value={compFinal} mode={mode} />
        )}
      </View>

      {/* ── SVG ────────────────────────────────────────────────────────── */}
      <Svg
        width={width}
        height={height}
        onPress={handleTouch}
        onPressOut={() => setTouched(null)}
      >
        {/* Grid lines */}
        {yTicks.map(({ y }, i) => (
          <Line key={i}
            x1={PAD.left} y1={y} x2={PAD.left + chartW} y2={y}
            stroke={GRID_COLOR} strokeWidth={1}
          />
        ))}

        {/* Zero-return baseline only applies to percentage mode. */}
        {mode === 'percent' && (
          <Line
            x1={PAD.left} y1={py0} x2={PAD.left + chartW} y2={py0}
            stroke="rgba(192,192,192,0.22)" strokeWidth={1} strokeDasharray="4 3"
          />
        )}

        {/* Y-axis labels */}
        {yTicks.map(({ val, y }, i) => (
          <SvgText key={i} x={PAD.left + chartW + 4} y={y + 4}
            fontSize={9} fill={AXIS_COLOR} textAnchor="start">
             {fmtAxisValue(val, mode)}
          </SvgText>
        ))}

        {/* X-axis labels */}
        {xLabels.map(({ x, label }, i) => (
          <SvgText key={i} x={x} y={height - 4}
            fontSize={9} fill={AXIS_COLOR} textAnchor="middle">
            {label}
          </SvgText>
        ))}

        {/* Comparison line (drawn first, behind primary) */}
        {hasComp && compValues && (
          <Path
            d={buildPath(compValues ?? [], pxComp)}
            stroke={COMP_COLOR} strokeWidth={1.8} fill="none" strokeOpacity={0.85}
          />
        )}

        {/* Primary line */}
        <Path
          d={buildPath(primValues, pxPrim)}
          stroke={PRIMARY_COLOR} strokeWidth={2} fill="none"
        />

        {/* End-of-line label — primary */}
        <SvgText
          x={PAD.left + chartW + 4}
          y={clamp(primEndY, PAD.top + 8, height - PAD.bottom - 4)}
          fontSize={9} fill={PRIMARY_COLOR} textAnchor="start" fontWeight="bold"
        >
          {primarySymbol}
        </SvgText>

        {/* End-of-line label — comparison */}
        {hasComp && compLabelY !== null && compSymbol && (
          <SvgText
            x={PAD.left + chartW + 4}
            y={clamp(compLabelY, PAD.top + 18, height - PAD.bottom - 4)}
            fontSize={9} fill={COMP_COLOR} textAnchor="start" fontWeight="bold"
          >
            {compSymbol}
          </SvgText>
        )}

        {/* ── Crosshair ───────────────────────────────────────────────── */}
        {touched !== null && touchPrimValue !== null && (
          <G>
            <Line
              x1={pxPrim(touched)} y1={PAD.top}
              x2={pxPrim(touched)} y2={PAD.top + chartH}
              stroke="rgba(192,192,192,0.40)" strokeWidth={1} strokeDasharray="3 3"
            />

            {/* Dots */}
            <Circle cx={pxPrim(touched)} cy={pyVal(touchPrimValue)} r={4} fill={PRIMARY_COLOR} />
            {touchCompValue !== null && touchCompIdx !== null && (
              <Circle cx={pxComp(touchCompIdx)} cy={pyVal(touchCompValue)} r={4} fill={COMP_COLOR} />
            )}

            {/* Primary bubble */}
            <Bubble
              x={pxPrim(touched)}
              y={pyVal(touchPrimValue)}
              label={`${primarySymbol}  ${mode === 'percent' ? fmtPct(touchPrimValue) : fmtPrice(touchPrimValue)}`}
              color={PRIMARY_COLOR}
              chartLeft={PAD.left}
              chartRight={PAD.left + chartW}
              offsetY={0}
            />

            {/* Comparison bubble — offset if overlapping */}
            {touchCompValue !== null && touchCompIdx !== null && (
              <Bubble
                x={pxPrim(touched)}
                y={pyVal(touchCompValue)}
                label={`${compSymbol}  ${mode === 'percent' ? fmtPct(touchCompValue) : fmtPrice(touchCompValue)}`}
                color={COMP_COLOR}
                chartLeft={PAD.left}
                chartRight={PAD.left + chartW}
                offsetY={
                   Math.abs(pyVal(touchCompValue) - pyVal(touchPrimValue)) < 30 ? 22 : 0
                }
              />
            )}

            {/* Date label at bottom */}
            <SvgText
              x={clamp(pxPrim(touched), PAD.left + 30, PAD.left + chartW - 30)}
              y={PAD.top + chartH + 14}
              fontSize={9} fill={AXIS_COLOR} textAnchor="middle"
            >
              {fmtDate(primaryCandles[touched]?.date ?? '')}
            </SvgText>
          </G>
        )}
      </Svg>
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
  modeButtonActive: { backgroundColor: 'rgba(0,229,160,0.18)' },
  modeButtonText: { color: 'rgba(192,192,192,0.58)', fontSize: 12, fontFamily: 'Inter_700Bold' },
  modeButtonTextActive: { color: PRIMARY_COLOR },
  legend:       { flexDirection: 'row', gap: 16, paddingHorizontal: 6, paddingBottom: 6 },
  legendItem:   { flexDirection: 'row', alignItems: 'center', gap: 5 },
  swatch:       { width: 10, height: 10, borderRadius: 2 },
  legendTicker: { fontSize: 12, fontFamily: 'Inter_700Bold', letterSpacing: 0.5 },
  legendRet:    { fontSize: 12, fontFamily: 'Inter_500Medium', marginLeft: 2 },
  empty:        { alignItems: 'center', justifyContent: 'center' },
  emptyText:    { color: 'rgba(192,192,192,0.4)', fontSize: 13 },
});
