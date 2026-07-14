/**
 * SVG chart components for the Paper Trading screen.
 * All charts use react-native-svg (already installed).
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, {
  Line,
  Path,
  Circle,
  Rect,
  Text as SvgText,
  Defs,
  LinearGradient,
  Stop,
  Polygon,
} from 'react-native-svg';

export const POSITION_COLORS = [
  '#c0c0c0', '#00e5a0', '#4da6ff', '#ff8c42',
  '#b86bff', '#ff4f6d', '#ffd700', '#00d9e8',
  '#ff85c2', '#69db7c', '#ffa94d', '#74c0fc',
];

function fmtK(v: number) {
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(0)}k`;
  return `$${v.toFixed(0)}`;
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// ── Portfolio Value Line Chart ─────────────────────────────────────────────
export function PortfolioLineChart({
  points,
  width,
  height,
}: {
  points: { date: string; value: number }[];
  width: number;
  height: number;
}) {
  if (points.length < 2) {
    return (
      <View style={{ width, height, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: 'rgba(192,192,192,0.4)', fontSize: 12 }}>
          Make trades to see portfolio history
        </Text>
      </View>
    );
  }

  const values = points.map(p => p.value);
  const min = Math.min(...values) * 0.99;
  const max = Math.max(...values) * 1.01;
  const range = max - min || 1;
  const pad = { left: 56, right: 12, top: 16, bottom: 28 };
  const w = width - pad.left - pad.right;
  const h = height - pad.top - pad.bottom;

  const toX = (i: number) => pad.left + (i / (points.length - 1)) * w;
  const toY = (v: number) => pad.top + h - ((v - min) / range) * h;

  const pathD = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)} ${toY(p.value).toFixed(1)}`)
    .join(' ');

  const areaD =
    pathD +
    ` L ${toX(points.length - 1).toFixed(1)} ${(pad.top + h).toFixed(1)}` +
    ` L ${toX(0).toFixed(1)} ${(pad.top + h).toFixed(1)} Z`;

  const isUp = values[values.length - 1] >= values[0];
  const lineColor = isUp ? '#00e5a0' : '#ff3b3b';
  const areaColor = isUp ? 'rgba(0,229,160,0.08)' : 'rgba(255,59,59,0.08)';

  const yTicks = [min, min + range * 0.5, max];
  // Show first, last, and a middle label on x-axis (if enough points)
  const xLabelIdxs = Array.from(
    new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])
  );

  return (
    <Svg width={width} height={height}>
      {/* Grid lines */}
      {yTicks.map((v, i) => {
        const y = toY(v);
        return (
          <React.Fragment key={i}>
            <Line
              x1={pad.left} y1={y} x2={width - pad.right} y2={y}
              stroke="rgba(192,192,192,0.1)" strokeWidth={1}
            />
            <SvgText
              x={pad.left - 4} y={y + 4}
              textAnchor="end" fontSize={9}
              fill="rgba(192,192,192,0.45)"
            >
              {fmtK(v)}
            </SvgText>
          </React.Fragment>
        );
      })}

      {/* Area fill */}
      <Path d={areaD} fill={areaColor} />

      {/* Line */}
      <Path d={pathD} stroke={lineColor} strokeWidth={2} fill="none" />

      {/* Start dot */}
      <Circle cx={toX(0)} cy={toY(values[0])} r={3} fill={lineColor} />
      {/* End dot */}
      <Circle cx={toX(points.length - 1)} cy={toY(values[points.length - 1])} r={4} fill={lineColor} />

      {/* X-axis labels */}
      {xLabelIdxs.map(i => (
        <SvgText
          key={i}
          x={toX(i)} y={height - 4}
          textAnchor="middle" fontSize={9}
          fill="rgba(192,192,192,0.45)"
        >
          {i === points.length - 1 ? 'Now' : fmtDate(points[i].date)}
        </SvgText>
      ))}
    </Svg>
  );
}

// ── Allocation Segmented Bar ───────────────────────────────────────────────
export function AllocationBar({
  segments,
  width,
  height = 28,
}: {
  segments: { label: string; value: number; color: string }[];
  width: number;
  height?: number;
}) {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  if (total <= 0) return null;

  let x = 0;
  const bars = segments.map(seg => {
    const barW = (seg.value / total) * width;
    const bar = { x, w: barW, ...seg };
    x += barW;
    return bar;
  });

  return (
    <Svg width={width} height={height}>
      {bars.map((b, i) => (
        <Rect key={i} x={b.x} y={0} width={Math.max(b.w - 1, 0)} height={height} fill={b.color} rx={i === 0 ? 4 : 0} />
      ))}
    </Svg>
  );
}

// ── Dividend Bar Chart ─────────────────────────────────────────────────────
export function DividendBarChart({
  items,
  width,
  height,
}: {
  items: { symbol: string; annual: number }[];
  width: number;
  height: number;
}) {
  if (items.length === 0) {
    return (
      <View style={{ width, height, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: 'rgba(192,192,192,0.4)', fontSize: 12 }}>
          No dividend-paying stocks in portfolio
        </Text>
      </View>
    );
  }

  const maxVal = Math.max(...items.map(i => i.annual), 1);
  const pad = { left: 8, right: 8, top: 12, bottom: 28 };
  const barW = Math.floor((width - pad.left - pad.right) / items.length) - 4;
  const availH = height - pad.top - pad.bottom;

  return (
    <Svg width={width} height={height}>
      {items.map((item, i) => {
        const barH = Math.max((item.annual / maxVal) * availH, 2);
        const x = pad.left + i * ((width - pad.left - pad.right) / items.length) + 2;
        const y = pad.top + availH - barH;
        const color = POSITION_COLORS[i % POSITION_COLORS.length];
        return (
          <React.Fragment key={item.symbol}>
            <Rect x={x} y={y} width={barW} height={barH} fill={color} rx={2} />
            <SvgText
              x={x + barW / 2} y={y - 3}
              textAnchor="middle" fontSize={8} fill={color}
            >
              {fmtK(item.annual)}
            </SvgText>
            <SvgText
              x={x + barW / 2} y={height - 6}
              textAnchor="middle" fontSize={9} fill="rgba(192,192,192,0.6)"
            >
              {item.symbol}
            </SvgText>
          </React.Fragment>
        );
      })}
    </Svg>
  );
}

// ── Growth Projection Chart ────────────────────────────────────────────────
type GrowthRate = { label: string; rate: number; color: string };

const GROWTH_RATES: GrowthRate[] = [
  { label: '6% Conservative', rate: 0.06, color: '#74c0fc' },
  { label: '10% Moderate',    rate: 0.10, color: '#00e5a0' },
  { label: '15% Aggressive',  rate: 0.15, color: '#ffd700' },
];

const YEARS = 10;

export function GrowthProjectionChart({
  startValue,
  width,
  height,
}: {
  startValue: number;
  width: number;
  height: number;
}) {
  const pad = { left: 60, right: 12, top: 16, bottom: 36 };
  const w = width - pad.left - pad.right;
  const h = height - pad.top - pad.bottom;

  const allValues = GROWTH_RATES.flatMap(r =>
    Array.from({ length: YEARS + 1 }, (_, yr) => startValue * Math.pow(1 + r.rate, yr))
  );
  const min = Math.min(...allValues) * 0.98;
  const max = Math.max(...allValues) * 1.02;
  const range = max - min || 1;

  const toX = (yr: number) => pad.left + (yr / YEARS) * w;
  const toY = (v: number) => pad.top + h - ((v - min) / range) * h;

  const yTicks = [min, min + range * 0.33, min + range * 0.66, max];
  const xTicks = [0, 2, 4, 6, 8, 10];

  return (
    <View>
      <Svg width={width} height={height}>
        {/* Grid */}
        {yTicks.map((v, i) => {
          const y = toY(v);
          return (
            <React.Fragment key={i}>
              <Line
                x1={pad.left} y1={y} x2={width - pad.right} y2={y}
                stroke="rgba(192,192,192,0.08)" strokeWidth={1}
              />
              <SvgText x={pad.left - 4} y={y + 4} textAnchor="end" fontSize={9} fill="rgba(192,192,192,0.45)">
                {fmtK(v)}
              </SvgText>
            </React.Fragment>
          );
        })}
        {xTicks.map(yr => (
          <SvgText
            key={yr}
            x={toX(yr)} y={height - 6}
            textAnchor="middle" fontSize={9} fill="rgba(192,192,192,0.45)"
          >
            {yr === 0 ? 'Now' : `Yr ${yr}`}
          </SvgText>
        ))}

        {/* Lines */}
        {GROWTH_RATES.map(r => {
          const pts = Array.from({ length: YEARS + 1 }, (_, yr) => ({
            x: toX(yr),
            y: toY(startValue * Math.pow(1 + r.rate, yr)),
          }));
          const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
          return <Path key={r.label} d={d} stroke={r.color} strokeWidth={2} fill="none" />;
        })}

        {/* End-of-line dots */}
        {GROWTH_RATES.map(r => {
          const finalVal = startValue * Math.pow(1 + r.rate, YEARS);
          return (
            <Circle key={r.label} cx={toX(YEARS)} cy={toY(finalVal)} r={4} fill={r.color} />
          );
        })}
      </Svg>

      {/* Legend */}
      <View style={styles.legend}>
        {GROWTH_RATES.map(r => {
          const finalVal = startValue * Math.pow(1 + r.rate, YEARS);
          return (
            <View key={r.label} style={styles.legendRow}>
              <View style={[styles.legendDot, { backgroundColor: r.color }]} />
              <Text style={styles.legendLabel}>{r.label}</Text>
              <Text style={[styles.legendVal, { color: r.color }]}>→ {fmtK(finalVal)}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  legend: { paddingHorizontal: 16, marginTop: 4, gap: 6 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { flex: 1, color: 'rgba(192,192,192,0.7)', fontSize: 12, fontFamily: 'Inter_400Regular' },
  legendVal: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
});
