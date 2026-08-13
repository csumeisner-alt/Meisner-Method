import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

export const GRADE_ORDER = [
  'A+', 'A', 'A-',
  'B+', 'B', 'B-',
  'C+', 'C', 'C-',
  'D+', 'D', 'D-',
  'F+', 'F', 'F-',
] as const;

export type GradeHistoryPoint = {
  id: string;
  symbol: string;
  date: string;
  grade: string;
  gradeIndex: number;
  shares: number;
  sellPrice: number;
  grossPnL: number;
  fee: number;
  netPnL: number;
  returnPct: number;
  holdDays: number;
};

type ChartColors = {
  background: string;
  card: string;
  foreground: string;
  mutedForeground: string;
  border: string;
  primary: string;
  buyColor: string;
  sellColor: string;
  holdColor: string;
};

type Props = {
  points: GradeHistoryPoint[];
  width: number;
  height: number;
  colors: ChartColors;
};

const PAD = { left: 12, right: 52, top: 22, bottom: 38 };

function fmtCurrency(value: number) {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function gradeColor(grade: string, colors: ChartColors) {
  if (grade.startsWith('A') || grade.startsWith('B')) return colors.buyColor;
  if (grade.startsWith('F')) return colors.sellColor;
  return colors.holdColor;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function GradeHistoryChart({ points, width, height, colors }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const chartWidth = Math.max(width - PAD.left - PAD.right, 1);
  const chartHeight = Math.max(height - PAD.top - PAD.bottom, 1);
  const selected = points.find(point => point.id === selectedId) ?? null;

  const toX = useCallback((index: number) => (
    PAD.left + (points.length <= 1 ? chartWidth / 2 : (index / (points.length - 1)) * chartWidth)
  ), [chartWidth, points.length]);

  const toY = useCallback((gradeIndex: number) => (
    PAD.top + (gradeIndex / (GRADE_ORDER.length - 1)) * chartHeight
  ), [chartHeight]);

  const path = useMemo(() => points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${toX(index).toFixed(1)},${toY(point.gradeIndex).toFixed(1)}`)
    .join(' '), [points, toX, toY]);

  const xLabelIndexes = useMemo(() => {
    const count = Math.min(points.length, 5);
    return Array.from(
      new Set(Array.from({ length: count }, (_, index) => (
        Math.round((index / Math.max(count - 1, 1)) * Math.max(points.length - 1, 0))
      ))),
    );
  }, [points.length]);

  const handleChartPress = useCallback((event: GestureResponderEvent) => {
    if (!points.length) return;
    const localX = clamp(event.nativeEvent.locationX - PAD.left, 0, chartWidth);
    const index = points.length <= 1
      ? 0
      : Math.round((localX / chartWidth) * (points.length - 1));
    setSelectedId(points[index]?.id ?? null);
  }, [chartWidth, points]);

  if (points.length === 0) {
    return (
      <View style={[styles.empty, { width, height, backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No completed trades yet</Text>
        <Text style={[styles.emptyCopy, { color: colors.mutedForeground }]}>
          Complete a sell trade to start tracking your grade history.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ width }}>
      <Svg width={width} height={height} onPress={handleChartPress}>
        {GRADE_ORDER.map((grade, index) => {
          const y = toY(index);
          const isSelected = selected?.grade === grade;
          return (
            <React.Fragment key={grade}>
              <Line
                x1={PAD.left}
                y1={y}
                x2={PAD.left + chartWidth}
                y2={y}
                stroke={colors.border}
                strokeOpacity={isSelected ? 0.65 : 0.25}
                strokeWidth={isSelected ? 1.4 : 1}
              />
              <SvgText
                x={PAD.left + chartWidth + 7}
                y={y + 3}
                fontSize={9}
                fill={isSelected ? gradeColor(grade, colors) : colors.mutedForeground}
                fontWeight={isSelected ? '700' : '400'}
              >
                {grade}
              </SvgText>
            </React.Fragment>
          );
        })}

        {xLabelIndexes.map(index => (
          <SvgText
            key={index}
            x={toX(index)}
            y={height - 10}
            textAnchor="middle"
            fontSize={9}
            fill={colors.mutedForeground}
          >
            {fmtDate(points[index]!.date)}
          </SvgText>
        ))}

        {points.length > 1 && (
          <Path d={path} stroke={colors.primary} strokeWidth={2.4} fill="none" />
        )}

        {points.map((point, index) => {
          const x = toX(index);
          const y = toY(point.gradeIndex);
          const isSelected = point.id === selectedId;
          return (
            <Circle
              key={point.id}
              cx={x}
              cy={y}
              r={isSelected ? 6 : 4}
              fill={gradeColor(point.grade, colors)}
              stroke={isSelected ? colors.foreground : colors.background}
              strokeWidth={isSelected ? 2 : 1.5}
              onPress={() => setSelectedId(point.id)}
            />
          );
        })}

        {selected && (
          <G pointerEvents="none">
            <Line
              x1={toX(points.indexOf(selected))}
              y1={PAD.top}
              x2={toX(points.indexOf(selected))}
              y2={PAD.top + chartHeight}
              stroke={colors.foreground}
              strokeOpacity={0.45}
              strokeDasharray="4 3"
            />
            <Rect
              x={clamp(toX(points.indexOf(selected)) - 46, PAD.left, PAD.left + chartWidth - 92)}
              y={Math.max(PAD.top - 17, 2)}
              width={92}
              height={17}
              rx={4}
              fill={colors.card}
              stroke={colors.border}
              strokeWidth={1}
            />
            <SvgText
              x={clamp(toX(points.indexOf(selected)), PAD.left + 46, PAD.left + chartWidth - 46)}
              y={PAD.top - 5}
              textAnchor="middle"
              fontSize={9}
              fill={gradeColor(selected.grade, colors)}
              fontWeight="700"
            >
              {`${selected.symbol} · ${selected.grade}`}
            </SvgText>
          </G>
        )}
      </Svg>

      {selected && (
        <View style={[styles.detailCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.detailHeader}>
            <View>
              <Text style={[styles.detailEyebrow, { color: colors.mutedForeground }]}>COMPLETED TRADE</Text>
              <Text style={[styles.detailTitle, { color: colors.foreground }]}>{selected.symbol}</Text>
            </View>
            <View style={[styles.gradePill, { backgroundColor: gradeColor(selected.grade, colors) + '20', borderColor: gradeColor(selected.grade, colors) }]}>
              <Text style={[styles.gradeText, { color: gradeColor(selected.grade, colors) }]}>{selected.grade}</Text>
            </View>
          </View>
          <Text style={[styles.detailDate, { color: colors.mutedForeground }]}>{fmtDate(selected.date)}</Text>
          <View style={styles.detailGrid}>
            <DetailMetric label="NET P&L" value={`${selected.netPnL >= 0 ? '+' : ''}${fmtCurrency(selected.netPnL)}`} color={selected.netPnL >= 0 ? colors.buyColor : colors.sellColor} />
            <DetailMetric label="RETURN" value={`${selected.returnPct >= 0 ? '+' : ''}${selected.returnPct.toFixed(1)}%`} color={selected.returnPct >= 0 ? colors.buyColor : colors.sellColor} />
            <DetailMetric label="SHARES" value={selected.shares.toLocaleString('en-US', { maximumFractionDigits: 4 })} color={colors.foreground} />
            <DetailMetric label="HELD FOR" value={selected.holdDays === 0 ? 'same day' : `${selected.holdDays}d`} color={colors.foreground} />
          </View>
        </View>
      )}
    </View>
  );
}

function DetailMetric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.metric}>
      <Text style={[styles.metricLabel, { color: 'rgba(192,192,192,0.68)' }]}>{label}</Text>
      <Text style={[styles.metricValue, { color }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 12, paddingHorizontal: 24 },
  emptyTitle: { fontSize: 16, fontFamily: 'Inter_700Bold', marginBottom: 6 },
  emptyCopy: { fontSize: 12, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 18 },
  detailCard: { borderWidth: 1, borderRadius: 12, padding: 14, marginTop: 4 },
  detailHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  detailEyebrow: { fontSize: 9, letterSpacing: 1, fontFamily: 'Inter_500Medium' },
  detailTitle: { fontSize: 21, letterSpacing: 1, fontFamily: 'Inter_700Bold', marginTop: 2 },
  detailDate: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 2 },
  gradePill: { borderWidth: 1, borderRadius: 7, paddingHorizontal: 12, paddingVertical: 6 },
  gradeText: { fontSize: 22, fontFamily: 'Inter_700Bold' },
  detailGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 14 },
  metric: { minWidth: '43%' },
  metricLabel: { fontSize: 9, letterSpacing: 0.6, fontFamily: 'Inter_400Regular' },
  metricValue: { fontSize: 14, fontFamily: 'Inter_600SemiBold', marginTop: 3 },
});