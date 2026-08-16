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
  primaryForeground: string;
  buyColor: string;
  sellColor: string;
  holdColor: string;
  gradeGood: string;
  gradeCaution: string;
  gradeWarning: string;
  gradeFail: string;
};

type Props = {
  points: GradeHistoryPoint[];
  width: number;
  height: number;
  colors: ChartColors;
};

const PAD = { left: 12, right: 52, top: 22, bottom: 38 };
type TimeRange = '7d' | '4w' | '6m' | '1y' | 'all';
type ZoomLevel = 1 | 2 | 4 | 8;

const TIME_RANGES: { key: TimeRange; label: string; durationMs?: number }[] = [
  { key: '7d', label: '7D', durationMs: 7 * 86_400_000 },
  { key: '4w', label: '4W', durationMs: 28 * 86_400_000 },
  { key: '6m', label: '6M', durationMs: 183 * 86_400_000 },
  { key: '1y', label: '1Y', durationMs: 365 * 86_400_000 },
  { key: 'all', label: 'ALL' },
];

const ZOOM_LEVELS: ZoomLevel[] = [1, 2, 4, 8];

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
  if (grade.startsWith('A') || grade.startsWith('B')) return colors.gradeGood;
  if (grade.startsWith('C')) return colors.gradeCaution;
  if (grade.startsWith('D')) return colors.gradeWarning;
  return colors.gradeFail;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function GradeHistoryChart({ points, width, height, colors }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>('all');
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>(1);

  const rangePoints = useMemo(() => {
    if (timeRange === 'all' || points.length === 0) return points;
    const range = TIME_RANGES.find(option => option.key === timeRange);
    const latestTime = new Date(points[points.length - 1]!.date).getTime();
    const cutoff = latestTime - (range?.durationMs ?? 0);
    return points.filter(point => new Date(point.date).getTime() >= cutoff);
  }, [points, timeRange]);

  const visiblePoints = useMemo(() => {
    if (zoomLevel === 1 || rangePoints.length <= 2) return rangePoints;
    const count = Math.max(2, Math.ceil(rangePoints.length / zoomLevel));
    return rangePoints.slice(-count);
  }, [rangePoints, zoomLevel]);

  const chartWidth = Math.max(width - PAD.left - PAD.right, 1);
  const chartHeight = Math.max(height - PAD.top - PAD.bottom, 1);
  const selected = visiblePoints.find(point => point.id === selectedId) ?? null;

  const toX = useCallback((index: number) => (
    PAD.left + (visiblePoints.length <= 1 ? chartWidth / 2 : (index / (visiblePoints.length - 1)) * chartWidth)
  ), [chartWidth, visiblePoints.length]);

  const toY = useCallback((gradeIndex: number) => (
    PAD.top + (gradeIndex / (GRADE_ORDER.length - 1)) * chartHeight
  ), [chartHeight]);

  const path = useMemo(() => visiblePoints
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${toX(index).toFixed(1)},${toY(point.gradeIndex).toFixed(1)}`)
    .join(' '), [visiblePoints, toX, toY]);

  const xLabelIndexes = useMemo(() => {
    const count = Math.min(visiblePoints.length, 5);
    return Array.from(
      new Set(Array.from({ length: count }, (_, index) => (
        Math.round((index / Math.max(count - 1, 1)) * Math.max(visiblePoints.length - 1, 0))
      ))),
    );
  }, [visiblePoints.length]);

  const handleChartPress = useCallback((event: GestureResponderEvent) => {
    if (!visiblePoints.length) return;
    const localX = clamp(event.nativeEvent.locationX - PAD.left, 0, chartWidth);
    const index = visiblePoints.length <= 1
      ? 0
      : Math.round((localX / chartWidth) * (visiblePoints.length - 1));
    setSelectedId(visiblePoints[index]?.id ?? null);
  }, [chartWidth, visiblePoints]);

  const zoomOut = () => {
    const currentIndex = ZOOM_LEVELS.indexOf(zoomLevel);
    setZoomLevel(ZOOM_LEVELS[Math.max(0, currentIndex - 1)]!);
    setSelectedId(null);
  };

  const zoomIn = () => {
    const currentIndex = ZOOM_LEVELS.indexOf(zoomLevel);
    setZoomLevel(ZOOM_LEVELS[Math.min(ZOOM_LEVELS.length - 1, currentIndex + 1)]!);
    setSelectedId(null);
  };

  const setRange = (range: TimeRange) => {
    setTimeRange(range);
    setZoomLevel(1);
    setSelectedId(null);
  };

  const latestDate = points.length > 0 ? fmtDate(points[points.length - 1]!.date) : 'No trades';

  return (
    <View style={[styles.chartRoot, { width }]}>
      <View style={styles.toolbar}>
        <View style={styles.rangeGroup}>
          <Text style={[styles.toolbarLabel, { color: colors.mutedForeground }]}>PERIOD</Text>
          <View style={styles.rangeButtons}>
            {TIME_RANGES.map(option => {
              const active = timeRange === option.key;
              return (
                <Pressable
                  key={option.key}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`Show ${option.label} of trade history`}
                  onPress={() => setRange(option.key)}
                  style={[
                    styles.rangeButton,
                    { borderColor: colors.border },
                    active && { backgroundColor: colors.primary, borderColor: colors.primary },
                  ]}
                >
                  <Text style={[styles.rangeText, { color: active ? colors.primaryForeground : colors.mutedForeground }]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        <View style={styles.zoomGroup}>
          <Text style={[styles.toolbarLabel, { color: colors.mutedForeground }]}>ZOOM</Text>
          <View style={styles.zoomButtons}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Zoom out"
              accessibilityState={{ disabled: zoomLevel === 1 }}
              disabled={zoomLevel === 1}
              onPress={zoomOut}
              style={[styles.zoomButton, { borderColor: colors.border }, zoomLevel === 1 && styles.disabledButton]}
            >
              <Text style={[styles.zoomButtonText, { color: zoomLevel === 1 ? colors.border : colors.foreground }]}>−</Text>
            </Pressable>
            <Text style={[styles.zoomValue, { color: colors.primary }]}>{zoomLevel}×</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Zoom in"
              accessibilityState={{ disabled: zoomLevel === ZOOM_LEVELS[ZOOM_LEVELS.length - 1] }}
              disabled={zoomLevel === ZOOM_LEVELS[ZOOM_LEVELS.length - 1]}
              onPress={zoomIn}
              style={[
                styles.zoomButton,
                { borderColor: colors.border },
                zoomLevel === ZOOM_LEVELS[ZOOM_LEVELS.length - 1] && styles.disabledButton,
              ]}
            >
              <Text style={[styles.zoomButtonText, { color: zoomLevel === ZOOM_LEVELS[ZOOM_LEVELS.length - 1] ? colors.border : colors.foreground }]}>+</Text>
            </Pressable>
          </View>
        </View>
      </View>
      <View style={styles.metaRow}>
        <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
          {visiblePoints.length} {visiblePoints.length === 1 ? 'trade' : 'trades'} in view
        </Text>
        <Text style={[styles.metaText, { color: colors.mutedForeground }]}>Latest · {latestDate}</Text>
      </View>

      {visiblePoints.length === 0 ? (
        <View style={[styles.empty, { width, height, backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
            {points.length === 0 ? 'No completed trades yet' : 'No trades in this period'}
          </Text>
          <Text style={[styles.emptyCopy, { color: colors.mutedForeground }]}>
            {points.length === 0
              ? 'Complete a sell trade to start tracking your grade history.'
              : 'Choose a wider period to see more of your trade history.'}
          </Text>
        </View>
      ) : (
        <>
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
            {fmtDate(visiblePoints[index]!.date)}
          </SvgText>
        ))}

        {visiblePoints.length > 1 && (
          <Path d={path} stroke={colors.primary} strokeWidth={2.4} fill="none" />
        )}

        {visiblePoints.map((point, index) => {
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
              x1={toX(visiblePoints.indexOf(selected))}
              y1={PAD.top}
              x2={toX(visiblePoints.indexOf(selected))}
              y2={PAD.top + chartHeight}
              stroke={colors.foreground}
              strokeOpacity={0.45}
              strokeDasharray="4 3"
            />
            <Rect
              x={clamp(toX(visiblePoints.indexOf(selected)) - 46, PAD.left, PAD.left + chartWidth - 92)}
              y={Math.max(PAD.top - 17, 2)}
              width={92}
              height={17}
              rx={4}
              fill={colors.card}
              stroke={colors.border}
              strokeWidth={1}
            />
            <SvgText
              x={clamp(toX(visiblePoints.indexOf(selected)), PAD.left + 46, PAD.left + chartWidth - 46)}
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
        <View style={styles.detailSection}>
          <View style={[styles.detailCard, { backgroundColor: colors.card, borderColor: gradeColor(selected.grade, colors) }]}>
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
        </View>
      )}
        </>
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
  chartRoot: { position: 'relative' },
  toolbar: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'flex-start', gap: 18, marginBottom: 8 },
  toolbarLabel: { fontSize: 9, letterSpacing: 0.8, fontFamily: 'Inter_600SemiBold' },
  rangeGroup: { flex: 0 },
  rangeButtons: { flexDirection: 'row', gap: 4, marginTop: 5 },
  rangeButton: { minWidth: 31, height: 28, paddingHorizontal: 7, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 6 },
  rangeText: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 0.3 },
  zoomGroup: { alignItems: 'center' },
  zoomButtons: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5 },
  zoomButton: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 6 },
  disabledButton: { opacity: 0.45 },
  zoomButtonText: { fontSize: 19, lineHeight: 20, fontFamily: 'Inter_500Medium' },
  zoomValue: { width: 25, textAlign: 'center', fontSize: 10, fontFamily: 'Inter_700Bold' },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2, paddingHorizontal: 2 },
  metaText: { fontSize: 10, fontFamily: 'Inter_400Regular' },
  empty: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 12, paddingHorizontal: 24 },
  emptyTitle: { fontSize: 16, fontFamily: 'Inter_700Bold', marginBottom: 6 },
  emptyCopy: { fontSize: 12, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 18 },
  detailSection: { width: '100%', marginTop: 12 },
  detailCard: { width: '100%', borderWidth: 1.5, borderRadius: 12, padding: 14 },
  detailHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  detailEyebrow: { fontSize: 9, letterSpacing: 1, fontFamily: 'Inter_500Medium' },
  detailTitle: { fontSize: 21, letterSpacing: 1, fontFamily: 'Inter_700Bold', marginTop: 2 },
  detailDate: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 2, textAlign: 'center' },
  gradePill: { borderWidth: 1, borderRadius: 7, paddingHorizontal: 12, paddingVertical: 6 },
  gradeText: { fontSize: 22, fontFamily: 'Inter_700Bold' },
  detailGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12, marginTop: 14 },
  metric: { minWidth: '43%', alignItems: 'center' },
  metricLabel: { fontSize: 9, letterSpacing: 0.6, fontFamily: 'Inter_400Regular' },
  metricValue: { fontSize: 14, fontFamily: 'Inter_600SemiBold', marginTop: 3 },
});