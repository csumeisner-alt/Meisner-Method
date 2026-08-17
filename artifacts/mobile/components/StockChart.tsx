import React, { useState, useCallback } from 'react';
import { View } from 'react-native';
import Svg, {
  Path, Line, Rect, Text as SvgText, Circle, G,
} from 'react-native-svg';
import type { GestureResponderEvent } from 'react-native';

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

interface Props {
  candles: Candle[];
  showMA20?: boolean;
  showMA50?: boolean;
  showMA200?: boolean;
  width: number;
  height?: number;
}

const PAD = { top: 16, right: 52, bottom: 36, left: 4 };
const VOL_RATIO = 0.18;

function fmtPrice(p: number) {
  if (p >= 1000) return `$${(p / 1000).toFixed(1)}k`;
  if (p >= 1) return `$${p.toFixed(2)}`;
  return `$${p.toFixed(4)}`;
}

export function StockChart({
  candles,
  showMA20 = false,
  showMA50 = true,
  showMA200 = false,
  width,
  height = 280,
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
  const prices = candles.map((c) => c.c);
  const allMaVals = [
    ...(showMA20 ? candles.map((c) => c.ma20).filter((v): v is number => v != null) : []),
    ...(showMA50 ? candles.map((c) => c.ma50).filter((v): v is number => v != null) : []),
    ...(showMA200 ? candles.map((c) => c.ma200).filter((v): v is number => v != null) : []),
  ];
  const minP = Math.min(...prices, ...allMaVals) * 0.994;
  const maxP = Math.max(...prices, ...allMaVals) * 1.006;
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

  // X-axis labels (4 evenly spaced)
  const xLabelCount = Math.min(5, n);
  const xLabels = Array.from({ length: xLabelCount }, (_, i) => {
    const idx = Math.round((i / Math.max(xLabelCount - 1, 1)) * (n - 1));
    const d = candles[idx]?.date ?? '';
    return { idx, label: d.slice(5) }; // MM-DD
  });

  // Touch handling
  const handleTouch = useCallback(
    (e: GestureResponderEvent) => {
      const x = e.nativeEvent.locationX - PAD.left;
      const i = Math.round(x / xStep);
      setTouched(Math.max(0, Math.min(n - 1, i)));
    },
    [xStep, n]
  );

  const touchCandle = touched !== null ? candles[touched] : null;

  if (n === 0) return null;

  return (
    <View style={{ width, height }}>
      <Svg
        width={width}
        height={height}
        onPress={handleTouch}
        onPressOut={() => setTouched(null)}
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
            x={px(idx)}
            y={height - 4}
            fontSize={9}
            fill="rgba(192,192,192,0.45)"
            textAnchor="middle"
          >
            {label}
          </SvgText>
        ))}

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

        {/* Price line */}
        <Path d={pricePath} stroke="#c0c0c0" strokeWidth={1.8} fill="none" />

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
              {touchCandle.date}
            </SvgText>
          </G>
        )}
      </Svg>
    </View>
  );
}
