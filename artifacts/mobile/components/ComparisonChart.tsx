/**
 * ComparisonChart
 *
 * Plots one or two price series as % return from the first candle, so stocks
 * at wildly different absolute prices share the same Y-axis.
 *
 * Primary series    → green accent  (#00e5a0)
 * Comparison series → blue          (#60a5fa)
 *
 * Features
 *  - Normalised % return Y-axis
 *  - Touch crosshair showing % return for both series
 *  - End-of-line ticker labels (right edge)
 *  - Legend row with color swatches and current period return
 */

import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
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

function fmtPct(v: number): string {
  const sign = v >= 0 ? '+' : '';
  return `${sign}${v.toFixed(2)}%`;
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

function LegendItem({ color, ticker, ret }: { color: string; ticker: string; ret: number | null }) {
  const retColor = ret == null ? color : ret >= 0 ? color : '#ff3b3b';
  return (
    <View style={s.legendItem}>
      <View style={[s.swatch, { backgroundColor: color }]} />
      <Text style={[s.legendTicker, { color }]}>{ticker}</Text>
      {ret != null && (
        <Text style={[s.legendRet, { color: retColor }]}>{fmtPct(ret)}</Text>
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

  const chartW = width - PAD.left - PAD.right;
  const chartH = height - PAD.top - PAD.bottom;

  const primRet = normalize(primaryCandles);
  const compRet = compCandles && compCandles.length > 0 ? normalize(compCandles) : null;
  const hasComp = compRet !== null && compRet.length > 0;

  const nPrim = primRet.length;
  const nComp = compRet?.length ?? 0;

  // Combined Y domain
  const allVals = [...primRet, ...(compRet ?? [])];
  const rawMin = allVals.length > 0 ? Math.min(...allVals) : -5;
  const rawMax = allVals.length > 0 ? Math.max(...allVals) : 5;
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
  const touchPrimRet = touched !== null ? primRet[touched] : null;
  const touchCompIdx =
    touched !== null && hasComp && nPrim > 1
      ? Math.round((touched / (nPrim - 1)) * (nComp - 1))
      : null;
  const touchCompRet =
    touchCompIdx !== null && compRet ? compRet[touchCompIdx] : null;

  // Period-end returns for legend
  const primFinal = nPrim > 0 ? primRet[nPrim - 1] : null;
  const compFinal = hasComp && compRet ? compRet[nComp - 1] : null;

  if (nPrim === 0) {
    return (
      <View style={[s.empty, { width, height }]}>
        <Text style={s.emptyText}>No chart data</Text>
      </View>
    );
  }

  // End-of-line label positions
  const primEndY = pyVal(primRet[nPrim - 1]);
  const compEndY = hasComp && compRet ? pyVal(compRet[nComp - 1]) : null;
  // Nudge comparison label if too close to primary label
  const compLabelY = compEndY !== null
    ? (Math.abs(compEndY - primEndY) < 12 ? compEndY + 13 : compEndY)
    : null;

  return (
    <View style={{ width }}>
      {/* ── Legend ─────────────────────────────────────────────────────── */}
      <View style={s.legend}>
        <LegendItem color={PRIMARY_COLOR} ticker={primarySymbol} ret={primFinal} />
        {hasComp && compSymbol && (
          <LegendItem color={COMP_COLOR} ticker={compSymbol} ret={compFinal} />
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

        {/* Zero baseline */}
        <Line
          x1={PAD.left} y1={py0} x2={PAD.left + chartW} y2={py0}
          stroke="rgba(192,192,192,0.22)" strokeWidth={1} strokeDasharray="4 3"
        />

        {/* Y-axis labels */}
        {yTicks.map(({ val, y }, i) => (
          <SvgText key={i} x={PAD.left + chartW + 4} y={y + 4}
            fontSize={9} fill={AXIS_COLOR} textAnchor="start">
            {val >= 0 ? '+' : ''}{val.toFixed(1)}%
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
        {hasComp && compRet && (
          <Path
            d={buildPath(compRet, pxComp)}
            stroke={COMP_COLOR} strokeWidth={1.8} fill="none" strokeOpacity={0.85}
          />
        )}

        {/* Primary line */}
        <Path
          d={buildPath(primRet, pxPrim)}
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
        {touched !== null && touchPrimRet !== null && (
          <G>
            <Line
              x1={pxPrim(touched)} y1={PAD.top}
              x2={pxPrim(touched)} y2={PAD.top + chartH}
              stroke="rgba(192,192,192,0.40)" strokeWidth={1} strokeDasharray="3 3"
            />

            {/* Dots */}
            <Circle cx={pxPrim(touched)} cy={pyVal(touchPrimRet)} r={4} fill={PRIMARY_COLOR} />
            {touchCompRet !== null && touchCompIdx !== null && (
              <Circle cx={pxComp(touchCompIdx)} cy={pyVal(touchCompRet)} r={4} fill={COMP_COLOR} />
            )}

            {/* Primary bubble */}
            <Bubble
              x={pxPrim(touched)}
              y={pyVal(touchPrimRet)}
              label={`${primarySymbol}  ${fmtPct(touchPrimRet)}`}
              color={PRIMARY_COLOR}
              chartLeft={PAD.left}
              chartRight={PAD.left + chartW}
              offsetY={0}
            />

            {/* Comparison bubble — offset if overlapping */}
            {touchCompRet !== null && touchCompIdx !== null && (
              <Bubble
                x={pxPrim(touched)}
                y={pyVal(touchCompRet)}
                label={`${compSymbol}  ${fmtPct(touchCompRet)}`}
                color={COMP_COLOR}
                chartLeft={PAD.left}
                chartRight={PAD.left + chartW}
                offsetY={
                  Math.abs(pyVal(touchCompRet) - pyVal(touchPrimRet)) < 30 ? 22 : 0
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
  legend:       { flexDirection: 'row', gap: 16, paddingHorizontal: 6, paddingBottom: 6 },
  legendItem:   { flexDirection: 'row', alignItems: 'center', gap: 5 },
  swatch:       { width: 10, height: 10, borderRadius: 2 },
  legendTicker: { fontSize: 12, fontFamily: 'Inter_700Bold', letterSpacing: 0.5 },
  legendRet:    { fontSize: 12, fontFamily: 'Inter_500Medium', marginLeft: 2 },
  empty:        { alignItems: 'center', justifyContent: 'center' },
  emptyText:    { color: 'rgba(192,192,192,0.4)', fontSize: 13 },
});
