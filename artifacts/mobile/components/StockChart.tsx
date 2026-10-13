import React, { useState, useCallback } from 'react';
import { Pressable, View } from 'react-native';
import Svg, {
  Path, Line, Rect, Text as SvgText, Circle, G,
} from 'react-native-svg';
import type { GestureResponderEvent } from 'react-native';
import {
  formatHeatMapChartAxisDate,
  formatHeatMapChartFullDate,
  formatHeatMapChartWindow,
} from '@/lib/heatMapChart';

export interface Candle {
  t: number;
  date: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  ma20?: number | null;
  ma50?: number | null;
  ma200?: number | null;
}

export interface ChartTrendLine {
  id: string;
  startT: number;
  endT: number;
  startPrice: number;
  endPrice: number;
}

function getLocalPointerCoordinate(event: GestureResponderEvent, axis: 'x' | 'y'): number {
  const nativeEvent = event.nativeEvent as typeof event.nativeEvent & { pageX?: number; pageY?: number };
  const localCoordinate = axis === 'x' ? nativeEvent.locationX : nativeEvent.locationY;
  if (Number.isFinite(localCoordinate)) return localCoordinate;

  const pageCoordinate = axis === 'x' ? nativeEvent.pageX : nativeEvent.pageY;
  const target = event.currentTarget as unknown as {
    getBoundingClientRect?: () => { left: number; top: number };
  };
  const bounds = target.getBoundingClientRect?.();
  const origin = axis === 'x' ? bounds?.left : bounds?.top;
  if (Number.isFinite(pageCoordinate) && Number.isFinite(origin)) return pageCoordinate! - origin!;
  return 0;
}

interface Props {
  candles: Candle[];
  chartMode?: 'line' | 'candles';
  showMA20?: boolean;
  showMA50?: boolean;
  showMA200?: boolean;
  width: number;
  height?: number;
  supportLevels?: number[];
  resistanceLevels?: number[];
  trendLines?: ChartTrendLine[];
  onChartPoint?: (point: { t: number; price: number }) => void;
}

const PAD = { top: 16, right: 52, bottom: 42, left: 4 };
const VOL_RATIO = 0.18;

function fmtPrice(p: number) {
  if (p >= 1000) return `$${(p / 1000).toFixed(1)}k`;
  if (p >= 1) return `$${p.toFixed(2)}`;
  return `$${p.toFixed(4)}`;
}

export function StockChart({
  candles,
  chartMode = 'line',
  showMA20 = false,
  showMA50 = true,
  showMA200 = false,
  width,
  height = 280,
  supportLevels = [],
  resistanceLevels = [],
  trendLines = [],
  onChartPoint,
}: Props) {
  const [touched, setTouched] = useState<number | null>(null);

  const chartW = width - PAD.left - PAD.right;
  const chartH = height - PAD.top - PAD.bottom;
  const priceH = chartH * (1 - VOL_RATIO);
  const volH = chartH * VOL_RATIO;
  const volY = PAD.top + priceH + 4;

  const n = candles.length;
  const xStep = chartW / Math.max(n - 1, 1);

  // Price domain
  const prices = candles.flatMap((c) => chartMode === 'candles' ? [c.l, c.h] : [c.c]);
  const allMaVals = [
    ...(showMA20 ? candles.map((c) => c.ma20).filter((v): v is number => v != null) : []),
    ...(showMA50 ? candles.map((c) => c.ma50).filter((v): v is number => v != null) : []),
    ...(showMA200 ? candles.map((c) => c.ma200).filter((v): v is number => v != null) : []),
  ];
  const overlayVals = [
    ...supportLevels,
    ...resistanceLevels,
    ...trendLines.flatMap((line) => [line.startPrice, line.endPrice]),
  ];
  const minP = Math.min(...prices, ...allMaVals, ...overlayVals) * 0.994;
  const maxP = Math.max(...prices, ...allMaVals, ...overlayVals) * 1.006;
  const range = maxP - minP || 1;

  const maxVol = Math.max(...candles.map((c) => c.v), 1);

  const px = (i: number) => PAD.left + i * xStep;
  const py = (p: number) => PAD.top + priceH - ((p - minP) / range) * priceH;

  // Price line
  const pricePath = candles
    .map((c, i) => `${i === 0 ? 'M' : 'L'}${px(i).toFixed(1)},${py(c.c).toFixed(1)}`)
    .join(' ');

  // MA path builder
  function buildMaPath(key: 'ma20' | 'ma50' | 'ma200') {
    let d = '';
    let started = false;
    for (let i = 0; i < n; i++) {
      const v = candles[i][key];
      if (v == null) { started = false; continue; }
      d += `${started ? 'L' : 'M'}${px(i).toFixed(1)},${py(v).toFixed(1)} `;
      started = true;
    }
    return d;
  }

  // Y-axis labels
  const yTicks = [0, 0.33, 0.67, 1].map((t) => ({
    price: minP + t * range,
    y: PAD.top + priceH * (1 - t),
  }));

  // X-axis labels use readable calendar context rather than numeric month-day fragments.
  const xLabelCount = Math.min(5, n);
  const firstDate = candles[0]?.date ?? '';
  const lastDate = candles[n - 1]?.date ?? '';
  const spanDays = firstDate && lastDate
    ? (Date.parse(`${lastDate}T00:00:00Z`) - Date.parse(`${firstDate}T00:00:00Z`)) / 86_400_000
    : 0;
  const xLabels = Array.from({ length: xLabelCount }, (_, i) => {
    const idx = Math.round((i / Math.max(xLabelCount - 1, 1)) * (n - 1));
    const d = candles[idx]?.date ?? '';
    return { idx, label: formatHeatMapChartAxisDate(d, spanDays) };
  });
  const dateWindow = formatHeatMapChartWindow(firstDate, lastDate);

  // Touch handling
  const handleTouch = useCallback(
    (e: GestureResponderEvent) => {
      const x = getLocalPointerCoordinate(e, 'x');
      const i = Math.round(x / xStep);
      const index = Math.max(0, Math.min(n - 1, i));
      setTouched(index);
      const y = Math.max(0, Math.min(priceH, getLocalPointerCoordinate(e, 'y')));
      onChartPoint?.({
        t: candles[index]!.t,
        price: minP + ((priceH - y) / priceH) * range,
      });
    },
    [xStep, n, candles, onChartPoint, minP, range, priceH]
  );

  const touchCandle = touched !== null ? candles[touched] : null;

  if (n === 0) return null;

  return (
      <View style={{ width, height, position: 'relative' }}>
      <Svg
        width={width}
        height={height}
      >
        {/* Grid lines */}
        {yTicks.map(({ y }, i) => (
          <Line
            key={i}
            x1={PAD.left}
            y1={y}
            x2={PAD.left + chartW}
            y2={y}
            stroke="rgba(192,192,192,0.07)"
            strokeWidth={1}
          />
        ))}

        {/* Y-axis labels */}
        {yTicks.map(({ price, y }, i) => (
          <SvgText
            key={i}
            x={PAD.left + chartW + 3}
            y={y + 4}
            fontSize={9}
            fill="rgba(192,192,192,0.45)"
            textAnchor="start"
          >
            {price >= 1000 ? `${(price / 1000).toFixed(1)}k` : price.toFixed(price < 5 ? 3 : price < 50 ? 2 : 0)}
          </SvgText>
        ))}

        {/* X-axis labels */}
        {xLabels.map(({ idx, label }) => (
          <SvgText
            key={idx}
            x={idx === 0 ? PAD.left : idx === n - 1 ? PAD.left + chartW : px(idx)}
            y={height - 18}
            fontSize={9}
            fill="rgba(192,192,192,0.45)"
            textAnchor={idx === 0 ? 'start' : idx === n - 1 ? 'end' : 'middle'}
          >
            {label}
          </SvgText>
        ))}
        <SvgText
          x={PAD.left + chartW / 2}
          y={height - 3}
          fontSize={8}
          fill="rgba(192,192,192,0.58)"
          textAnchor="middle"
        >
          {dateWindow}
        </SvgText>

        {/* Volume bars */}
        {candles.map((c, i) => {
          const barH = Math.max(1, (c.v / maxVol) * (volH - 4));
          const barW = Math.max(Math.min(xStep * 0.65, 8), 1.5);
          const isUp = c.c >= c.o;
          return (
            <Rect
              key={i}
              x={px(i) - barW / 2}
              y={volY + (volH - 4 - barH)}
              width={barW}
              height={barH}
              fill={isUp ? 'rgba(0,229,160,0.32)' : 'rgba(255,59,59,0.32)'}
            />
          );
        })}

        {/* MA lines */}
        {showMA200 && (
          <Path
            d={buildMaPath('ma200')}
            stroke="#f59e0b"
            strokeWidth={1.4}
            fill="none"
            strokeDasharray="5 3"
          />
        )}
        {showMA50 && (
          <Path
            d={buildMaPath('ma50')}
            stroke="#60a5fa"
            strokeWidth={1.5}
            fill="none"
          />
        )}
        {showMA20 && (
          <Path
            d={buildMaPath('ma20')}
            stroke="#c084fc"
            strokeWidth={1.2}
            fill="none"
          />
        )}

        {chartMode === 'candles' ? candles.map((candle, i) => {
          const up = candle.c >= candle.o;
          const color = up ? '#00e5a0' : '#ff3b3b';
          const bodyWidth = Math.max(1.2, Math.min(xStep * 0.68, 8));
          const bodyTop = Math.min(py(candle.o), py(candle.c));
          const bodyHeight = Math.max(1, Math.abs(py(candle.o) - py(candle.c)));
          return (
            <G key={`candle-${i}`}>
              <Line x1={px(i)} y1={py(candle.h)} x2={px(i)} y2={py(candle.l)}
                stroke={color} strokeWidth={1} />
              <Rect x={px(i) - bodyWidth / 2} y={bodyTop} width={bodyWidth} height={bodyHeight}
                fill={color} stroke={color} strokeWidth={1} />
            </G>
          );
        }) : <Path d={pricePath} stroke="#c0c0c0" strokeWidth={1.8} fill="none" />}

        {supportLevels.map((level) => (
          <G key={`support-${level}`}>
            <Line x1={PAD.left} y1={py(level)} x2={PAD.left + chartW} y2={py(level)}
              stroke="#00e5a0" strokeWidth={1.3} strokeDasharray="5 4" />
            <SvgText x={PAD.left + chartW - 2} y={py(level) - 3} fontSize={9}
              fill="#00e5a0" textAnchor="end">SUPPORT {fmtPrice(level)}</SvgText>
          </G>
        ))}
        {resistanceLevels.map((level) => (
          <G key={`resistance-${level}`}>
            <Line x1={PAD.left} y1={py(level)} x2={PAD.left + chartW} y2={py(level)}
              stroke="#ff9f43" strokeWidth={1.3} strokeDasharray="5 4" />
            <SvgText x={PAD.left + chartW - 2} y={py(level) - 3} fontSize={9}
              fill="#ff9f43" textAnchor="end">RESISTANCE {fmtPrice(level)}</SvgText>
          </G>
        ))}
        {trendLines.map((trend) => {
          const firstT = candles[0]!.t;
          const lastT = candles[n - 1]!.t;
          const span = Math.max(lastT - firstT, 1);
          const xForT = (t: number) => PAD.left + ((t - firstT) / span) * chartW;
          return (
            <Line key={trend.id}
              x1={xForT(trend.startT)} y1={py(trend.startPrice)}
              x2={xForT(trend.endT)} y2={py(trend.endPrice)}
              stroke="#facc15" strokeWidth={2} />
          );
        })}

        {/* Crosshair */}
        {touchCandle != null && touched !== null && (
          <G>
            <Line
              x1={px(touched)}
              y1={PAD.top}
              x2={px(touched)}
              y2={PAD.top + priceH}
              stroke="rgba(192,192,192,0.45)"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            <Circle cx={px(touched)} cy={py(touchCandle.c)} r={4} fill="#c0c0c0" />
            {/* Bubble */}
            {(() => {
              const bx = Math.min(px(touched) - 30, chartW - 16);
              return (
                <>
                  <Rect x={bx} y={py(touchCandle.c) - 24} width={60} height={18} rx={4}
                    fill="#1c1c1c" stroke="rgba(192,192,192,0.3)" strokeWidth={1} />
                  <SvgText x={bx + 30} y={py(touchCandle.c) - 11}
                    fontSize={10} fill="#c0c0c0" textAnchor="middle" fontWeight="bold">
                    {fmtPrice(touchCandle.c)}
                  </SvgText>
                </>
              );
            })()}
            {/* Date label */}
            <SvgText
              x={Math.min(Math.max(px(touched), 30), PAD.left + chartW - 30)}
              y={PAD.top + priceH + 14}
              fontSize={9}
              fill="#c0c0c0"
              textAnchor="middle"
            >
              {formatHeatMapChartFullDate(touchCandle.date)}
            </SvgText>
          </G>
        )}
      </Svg>
      <Pressable
        testID="stock-chart-touch-target"
        accessibilityRole="button"
        accessibilityLabel="Inspect chart or place a trend-line point"
        onPress={handleTouch}
        style={{
          position: 'absolute',
          left: PAD.left,
          top: PAD.top,
          width: chartW,
          height: priceH,
          backgroundColor: 'transparent',
        }}
      />
    </View>
  );
}
