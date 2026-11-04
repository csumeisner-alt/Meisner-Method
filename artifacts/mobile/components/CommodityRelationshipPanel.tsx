import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import type { GestureResponderEvent } from 'react-native';
import {
  getGetCommodityRelationshipQueryKey,
  useGetCommodityRelationship,
} from '@workspace/api-client-react';
import type {
  CommodityRelationshipResponse,
  CommodityRelationshipResponsePeriod,
  CommodityRelationshipResponsePointsItem,
} from '@workspace/api-client-react';
import { ComparisonChart } from '@/components/ComparisonChart';
import { useColors } from '@/hooks/useColors';

const RELATIONSHIPS = [
  { id: 'gold-silver', label: 'Gold & Silver' },
  { id: 'gold-dollar', label: 'Gold & Dollar' },
  { id: 'copper-gold', label: 'Copper & Gold' },
  { id: 'oil-gold', label: 'Oil & Gold' },
  { id: 'gold-silver-ratio', label: 'Gold / Silver Ratio' },
] as const;
type RelationshipId = typeof RELATIONSHIPS[number]['id'];

const PERIODS: { value: CommodityRelationshipResponsePeriod; label: string }[] = [
  { value: '1mo', label: '1M' },
  { value: '3mo', label: '3M' },
  { value: '6mo', label: '6M' },
  { value: '1y', label: '1Y' },
  { value: '5y', label: '5Y' },
  { value: 'max', label: 'MAX' },
];

const pct = (value: number | null) => value == null
  ? 'Unavailable'
  : `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
const corr = (value: number | null) => value == null ? 'Unavailable' : value.toFixed(2);

function RelationshipCorrelationChart({
  points,
  width,
}: {
  points: CommodityRelationshipResponsePointsItem[];
  width: number;
}) {
  const colors = useColors();
  const [touched, setTouched] = useState<number | null>(null);
  const height = 154;
  const pad = { left: 8, right: 12, top: 15, bottom: 24 };
  const chartWidth = Math.max(1, width - pad.left - pad.right);
  const chartHeight = height - pad.top - pad.bottom;
  const y = (value: number) => pad.top + ((1 - value) / 2) * chartHeight;
  const valid = points.flatMap((point, index) => point.rollingCorrelation == null
    ? []
    : [{ index, value: point.rollingCorrelation }]);
  const path = valid.map(({ index, value }, pointIndex) => {
    const x = pad.left + (index / Math.max(points.length - 1, 1)) * chartWidth;
    return `${pointIndex === 0 ? 'M' : 'L'}${x.toFixed(1)},${y(value).toFixed(1)}`;
  }).join(' ');
  const getTouchX = (event: GestureResponderEvent) => {
    const nativeEvent = event.nativeEvent as typeof event.nativeEvent & { pageX?: number };
    if (Number.isFinite(nativeEvent.locationX)) return nativeEvent.locationX;
    const target = event.currentTarget as unknown as {
      getBoundingClientRect?: () => { left: number };
    };
    const left = target.getBoundingClientRect?.().left;
    return Number.isFinite(nativeEvent.pageX) && Number.isFinite(left)
      ? nativeEvent.pageX! - left!
      : 0;
  };
  const selectPoint = (event: GestureResponderEvent) => {
    const position = Math.max(0, Math.min(chartWidth, getTouchX(event) - pad.left));
    setTouched(Math.round((position / chartWidth) * Math.max(points.length - 1, 0)));
  };
  const selectedPoint = touched == null ? null : points[touched] ?? null;
  const selectedValue = selectedPoint?.rollingCorrelation ?? null;

  return (
    <View testID="commodity-relationship-correlation-chart" accessible accessibilityLabel="Touch-enabled rolling correlation chart">
      <Svg
        width={width}
        height={height}
        onPress={selectPoint}
        onPressOut={() => setTouched(null)}
        accessibilityRole="image"
        accessibilityLabel="Rolling correlation from minus one to plus one"
      >
        {[-1, 0, 1].map((value) => (
          <Line
            key={value}
            x1={pad.left}
            y1={y(value)}
            x2={width - pad.right}
            y2={y(value)}
            stroke={colors.border}
            strokeDasharray={value === 0 ? '4 4' : undefined}
          />
        ))}
        <Path d={path} stroke={colors.primary} strokeWidth={2.5} fill="none" />
        <SvgText x={pad.left} y={height - 5} fontSize={9} fill={colors.mutedForeground}>Earlier</SvgText>
        <SvgText x={width - pad.right} y={height - 5} fontSize={9} fill={colors.mutedForeground} textAnchor="end">Latest</SvgText>
        {selectedPoint && selectedValue != null && (
          <>
            <Line
              x1={pad.left + (touched! / Math.max(points.length - 1, 1)) * chartWidth}
              y1={pad.top}
              x2={pad.left + (touched! / Math.max(points.length - 1, 1)) * chartWidth}
              y2={height - pad.bottom}
              stroke={colors.mutedForeground}
              strokeDasharray="3 3"
            />
            <Circle
              cx={pad.left + (touched! / Math.max(points.length - 1, 1)) * chartWidth}
              cy={y(selectedValue)}
              r={4}
              fill={colors.primary}
            />
          </>
        )}
      </Svg>
      <Text
        accessibilityLiveRegion="polite"
        style={{ color: colors.mutedForeground, fontSize: 11, marginTop: 2 }}
      >
        {selectedPoint
          ? `${selectedPoint.date} · ${selectedValue == null ? 'Correlation unavailable' : `correlation ${selectedValue.toFixed(2)}`}`
          : valid.length
            ? `Rolling return correlation · ${valid[0]!.index + 1}+ matched return observations`
            : 'Correlation history unavailable for this range.'}
      </Text>
    </View>
  );
}

function toComparisonCandles(data: CommodityRelationshipResponse): {
  primary: { t: number; date: string; o: number; h: number; l: number; c: number; v: number }[];
  comparison: { t: number; date: string; o: number; h: number; l: number; c: number; v: number }[];
} {
  const firstBase = data.points[0]?.firstClose ?? 1;
  const secondBase = data.points[0]?.secondClose ?? 1;
  const toCandle = (point: CommodityRelationshipResponsePointsItem, value: number) => ({
    t: point.timestamp,
    date: point.date,
    o: value,
    h: value,
    l: value,
    c: value,
    v: 0,
  });
  return {
    primary: data.points.map((point) => toCandle(point, point.firstClose / firstBase)),
    comparison: data.points.map((point) => toCandle(point, point.secondClose / secondBase)),
  };
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  const colors = useColors();
  return (
    <View style={{ flexBasis: '47%', flexGrow: 1, borderRadius: 10, padding: 10, backgroundColor: `${colors.background}bb` }}>
      <Text style={{ color: colors.mutedForeground, fontSize: 10 }}>{label}</Text>
      <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 13, marginTop: 4 }}>{value}</Text>
    </View>
  );
}

function RelationshipSummary({ data, width }: { data: CommodityRelationshipResponse; width: number }) {
  const colors = useColors();
  const chartCandles = toComparisonCandles(data);
  const metric = data.metrics;
  const firstReturn = pct(metric.firstPeriodReturnPercent);
  const secondReturn = pct(metric.secondPeriodReturnPercent);
  const relativeStrength = metric.relativeStrengthPercentagePoints == null
    ? 'Unavailable'
    : `${metric.relativeStrengthPercentagePoints > 0 ? '+' : ''}${metric.relativeStrengthPercentagePoints.toFixed(2)} pp`;
  const ratio = metric.currentRelativeValue == null
    ? 'Unavailable'
    : metric.currentRelativeValue.toLocaleString('en-US', { maximumFractionDigits: 4 });
  const correlationChange = metric.correlationChange == null
    ? 'Unavailable'
    : `${metric.correlationChange > 0 ? '+' : ''}${metric.correlationChange.toFixed(2)} vs prior 20 returns`;
  const firstLatestDate = data.coverage.firstEndDate ?? 'unavailable';
  const secondLatestDate = data.coverage.secondEndDate ?? 'unavailable';

  return (
    <View testID="commodity-relationship-result" style={{ gap: 12 }}>
      {data.status === 'available' ? (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Metric label={data.relationship.relativeValueLabel} value={ratio} />
            <Metric label={`${data.relationship.first.name} · period return`} value={firstReturn} />
            <Metric label={`${data.relationship.second.name} · period return`} value={secondReturn} />
            <Metric label="Relative strength · first minus second" value={relativeStrength} />
            <Metric label="Matched-date return correlation" value={corr(metric.correlation)} />
            <Metric label="Correlation change" value={correlationChange} />
          </View>
          <Text style={{ color: colors.mutedForeground, fontSize: 10, lineHeight: 15 }}>
            {data.relationship.first.unit === data.relationship.second.unit
              ? `Relative value uses matching quote units (${data.relationship.first.unit}).`
              : `Quote ratio compares different units (${data.relationship.first.unit} / ${data.relationship.second.unit}); it is not a unit conversion.`}
            {data.relationship.second.proxy ? ` ${data.relationship.second.name} is a futures proxy, not the spot index.` : ''}
          </Text>
          <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold', fontSize: 11, letterSpacing: 0.5 }}>
            NORMALIZED RELATIVE PERFORMANCE · {data.period.toUpperCase()}
          </Text>
          {data.points.length > 0 && (
            <ComparisonChart
              primaryCandles={chartCandles.primary}
              primarySymbol={data.relationship.first.name}
              compCandles={chartCandles.comparison}
              compSymbol={data.relationship.second.name}
              width={width}
              height={220}
            />
          )}
          <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold', fontSize: 11, letterSpacing: 0.5 }}>
            ROLLING CORRELATION · LAST 20 MATCHED RETURNS
          </Text>
          <RelationshipCorrelationChart points={data.points} width={width} />
          <View style={{ borderRadius: 10, borderWidth: 1, borderColor: `${colors.primary}55`, padding: 11, backgroundColor: `${colors.primary}0d`, gap: 5 }}>
            <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold', fontSize: 11 }}>
              {data.divergence.status === 'detected' ? 'DIVERGENCE FLAGGED' : 'DIVERGENCE CHECK'}
            </Text>
            <Text style={{ color: colors.foreground, fontSize: 11, lineHeight: 16 }}>{data.divergence.reason}</Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 10, lineHeight: 14 }}>{data.method.divergence}</Text>
          </View>
          <View style={{ borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: 11, gap: 5 }}>
            <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold', fontSize: 11 }}>AI INTERPRETATION · SEPARATE FROM OBSERVED DATA</Text>
            {data.aiInterpretation.status === 'available' && data.aiInterpretation.text ? (
              <Text testID="commodity-relationship-ai" style={{ color: colors.foreground, fontSize: 12, lineHeight: 18 }}>
                {data.aiInterpretation.text}
              </Text>
            ) : (
              <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16 }}>
                AI interpretation is unavailable. Calculated history remains available; no causal claim is inferred from correlation.
              </Text>
            )}
            <Text style={{ color: colors.mutedForeground, fontSize: 10, lineHeight: 14 }}>
              Correlation describes co-movement in the selected history; it does not establish causation.
            </Text>
          </View>
          <Text testID="commodity-relationship-coverage" style={{ color: colors.mutedForeground, fontSize: 10, lineHeight: 15 }}>
            {data.coverage.matchedObservations} exact matched trading dates · {data.coverage.returnObservations} return observations · shared {data.coverage.matchedStartDate ?? '—'} to {data.coverage.matchedEndDate ?? '—'}. {data.relationship.first.symbol} source range: {data.coverage.firstStartDate ?? '—'} to {firstLatestDate}; {data.relationship.second.symbol}: {data.coverage.secondStartDate ?? '—'} to {secondLatestDate}. Provider: {data.sources.provider}.
          </Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 10, lineHeight: 15 }}>
            {data.method.alignment}
          </Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 10, lineHeight: 15 }}>
            {data.method.correlation} {data.method.correlationChange}
          </Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 10, lineHeight: 15 }}>
            Source timestamps: {data.sources.firstLatestTimestamp == null ? 'unavailable' : new Date(data.sources.firstLatestTimestamp * 1000).toLocaleString()} · {data.sources.secondLatestTimestamp == null ? 'unavailable' : new Date(data.sources.secondLatestTimestamp * 1000).toLocaleString()}.
          </Text>
          {data.relationship.first.proxy || data.relationship.second.proxy ? (
            <Text style={{ color: colors.mutedForeground, fontSize: 10, lineHeight: 15 }}>{data.sources.alignmentNote}</Text>
          ) : null}
        </>
      ) : (
        <View testID="commodity-relationship-unavailable" style={{ borderRadius: 10, padding: 12, backgroundColor: `${colors.holdColor}12` }}>
          <Text style={{ color: colors.holdColor, fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>Relationship unavailable</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16, marginTop: 4 }}>
            {data.reason ?? 'There are not enough valid, shared trading dates for this comparison.'}
          </Text>
        </View>
      )}
    </View>
  );
}

export function CommodityRelationshipPanel() {
  const colors = useColors();
  const { width: screenWidth } = useWindowDimensions();
  const [relationshipId, setRelationshipId] = useState<RelationshipId>('gold-silver');
  const [period, setPeriod] = useState<CommodityRelationshipResponsePeriod>('3mo');
  const query = useGetCommodityRelationship(relationshipId, period, {
    query: {
      queryKey: getGetCommodityRelationshipQueryKey(relationshipId, period),
      retry: false,
      staleTime: 5 * 60 * 1000,
    },
  });
  const chartWidth = Math.max(280, screenWidth - 64);

  return (
    <View
      testID="commodity-relationship-panel"
      style={{ borderRadius: 16, borderWidth: 1, borderColor: `${colors.primary}88`, backgroundColor: colors.card, overflow: 'hidden', marginBottom: 14 }}
    >
      <View style={{ padding: 15, gap: 12 }}>
        <View>
          <Text style={{ color: colors.primary, fontFamily: 'Inter_700Bold', fontSize: 12, letterSpacing: 1 }}>COMMODITY RELATIONSHIPS</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16, marginTop: 4 }}>
            Compare dated market history. Relationships describe co-movement, not cause.
          </Text>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
          {RELATIONSHIPS.map((item) => {
            const selected = item.id === relationshipId;
            return (
              <Pressable
                key={item.id}
                testID={`commodity-relationship-select-${item.id}`}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`Show ${item.label} relationship`}
                onPress={() => setRelationshipId(item.id)}
                style={{
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: selected ? colors.primary : colors.border,
                  backgroundColor: selected ? `${colors.primary}22` : colors.background,
                  paddingVertical: 7,
                  paddingHorizontal: 10,
                }}
              >
                <Text style={{ color: selected ? colors.primary : colors.foreground, fontFamily: selected ? 'Inter_600SemiBold' : 'Inter_400Regular', fontSize: 10 }}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 5 }}>
          {PERIODS.map((item) => {
            const selected = item.value === period;
            return (
              <Pressable
                key={item.value}
                testID={`commodity-relationship-period-${item.value}`}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`Show ${item.label === 'MAX' ? 'maximum' : item.label} of history`}
                onPress={() => setPeriod(item.value)}
                style={{
                  flex: 1,
                  minHeight: 34,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: selected ? colors.primary : colors.border,
                  backgroundColor: selected ? `${colors.primary}22` : colors.background,
                }}
              >
                <Text style={{ color: selected ? colors.primary : colors.mutedForeground, fontFamily: 'Inter_600SemiBold', fontSize: 10 }}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {query.isLoading ? (
          <View style={{ alignItems: 'center', paddingVertical: 30, gap: 8 }}>
            <ActivityIndicator color={colors.primary} />
            <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>Loading matched price history…</Text>
          </View>
        ) : query.data ? (
          <RelationshipSummary data={query.data} width={chartWidth} />
        ) : (
          <View style={{ alignItems: 'center', paddingVertical: 12, gap: 8 }}>
            <Text style={{ color: colors.mutedForeground, fontSize: 11, textAlign: 'center' }}>
              {query.isError ? 'Relationship history could not be loaded. Existing commodity analysis is unchanged.' : 'Relationship history is not available.'}
            </Text>
            {query.isError && (
              <Pressable
                testID="commodity-relationship-retry"
                accessibilityRole="button"
                onPress={() => { void query.refetch(); }}
                style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, borderWidth: 1, borderColor: colors.border }}
              >
                <Text style={{ color: colors.primary, fontSize: 11 }}>Retry</Text>
              </Pressable>
            )}
          </View>
        )}
      </View>
    </View>
  );
}
