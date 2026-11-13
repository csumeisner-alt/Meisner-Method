import React from 'react';
import { Feather } from '@expo/vector-icons';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { OrderSubmissionResult, ReviewSnapshot } from './ProfessionalOrderEntry';

const SILVER = '#c0c0c0';
const DIM = 'rgba(192,192,192,0.55)';
const BUY_COLOR = '#00e5a0';
const SELL_COLOR = '#ff3b3b';
const GOLD = '#ffd700';
const CARD_BG = 'rgba(192,192,192,0.08)';
const BORDER = 'rgba(192,192,192,0.24)';

const ORDER_TYPE_LABELS: Record<string, string> = {
  market: 'Market',
  limit: 'Limit',
  stop: 'Stop',
  stop_limit: 'Stop limit',
  trailing_stop: 'Trailing stop',
};

type Props = {
  review: ReviewSnapshot | null;
  result: OrderSubmissionResult | null;
  submitting: boolean;
  onSubmit: () => void;
  onBack: () => void;
  onClose: () => void;
  onEdit: () => void;
};

function money(value: number) {
  if (!Number.isFinite(value)) return '—';
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function OrderEntryReview({
  review,
  result,
  submitting,
  onSubmit,
  onBack,
  onClose,
  onEdit,
}: Props) {
  if (result) {
    const resultColor = result.status === 'rejected'
      ? SELL_COLOR
      : result.status === 'filled'
        ? BUY_COLOR
        : GOLD;
    return (
      <View testID="paper-order-result" style={styles.resultWrap}>
        <View style={[styles.resultIcon, { borderColor: resultColor }]}>
          <Feather
            name={result.status === 'rejected' ? 'x' : result.status === 'filled' ? 'check' : 'clock'}
            size={30}
            color={resultColor}
          />
        </View>
        <Text style={styles.resultTitle}>
          {result.status === 'filled' ? 'Order filled' : result.status === 'pending' ? 'Order pending' : 'Order rejected'}
        </Text>
        <Text style={styles.resultMessage}>{result.message}</Text>
        {result.status === 'filled' && (
          <View style={styles.resultFill}>
            <Text style={styles.mutedLabel}>ACTUAL PAPER FILL</Text>
            <Text style={styles.resultPrice}>{money(result.fillPrice)}</Text>
          </View>
        )}
        <TouchableOpacity
          testID="paper-order-result-close"
          accessibilityRole="button"
          style={styles.primaryNeutralButton}
          onPress={onClose}
        >
          <Text style={styles.primaryNeutralText}>DONE</Text>
        </TouchableOpacity>
        {result.status === 'rejected' && (
          <TouchableOpacity accessibilityRole="button" style={styles.textAction} onPress={onEdit}>
            <Text style={styles.textActionLabel}>EDIT ORDER</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }
  if (!review) return null;

  const accent = review.args.side === 'buy' ? BUY_COLOR : SELL_COLOR;
  const shares = review.args.shares.toLocaleString('en-US', { maximumFractionDigits: 6 });
  return (
    <ScrollView
      testID="paper-order-review"
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.sectionLabel}>CONFIRM THESE DETAILS</Text>
      <View style={styles.accountCard}>
        <View style={styles.accountTitleRow}>
          <Feather name="briefcase" size={16} color={GOLD} />
          <Text style={styles.accountName} numberOfLines={1}>{review.accountName}</Text>
          <Text style={styles.capturedTag}>CAPTURED ACCOUNT</Text>
        </View>
        <View style={styles.metricsRow}>
          <Metric label="EQUITY" value={money(review.equity)} />
          <Metric label="SETTLED B.P." value={money(review.buyingPower)} />
          <Metric label="CASH" value={money(review.cash)} />
        </View>
      </View>
      <View style={[styles.reviewCard, { borderColor: `${accent}70` }]}>
        <View style={styles.reviewSideRow}>
          <View style={[styles.sideBadge, { backgroundColor: `${accent}20` }]}>
            <Text style={[styles.sideBadgeText, { color: accent }]}>{review.args.side.toUpperCase()}</Text>
          </View>
          <Text style={styles.reviewSymbol}>{review.args.symbol}</Text>
          <Text style={styles.reviewOrderType}>{ORDER_TYPE_LABELS[review.args.orderType]}</Text>
        </View>
        <Text style={styles.reviewCompany}>{review.args.companyName}</Text>
        <ReviewRow label="Account" value={review.accountName} />
        <ReviewRow label="Shares" value={shares} />
        <ReviewRow label="Estimated value" value={money(review.estimatedValue)} emphasize />
        {review.args.limitPrice != null && <ReviewRow label="Limit price" value={money(review.args.limitPrice)} />}
        {review.args.stopPrice != null && <ReviewRow label="Stop trigger" value={money(review.args.stopPrice)} />}
        {review.args.orderType === 'limit' && (
          <View style={styles.warningLine}>
            <Feather name="info" size={14} color={GOLD} />
            <Text style={styles.warningText}>A limit order may remain pending and is not guaranteed to fill.</Text>
          </View>
        )}
      </View>
      <View style={styles.reviewQuote}>
        <Text style={styles.mutedLabel}>QUOTE USED FOR ESTIMATE</Text>
        <Text style={styles.reviewQuotePrice}>{money(review.args.quotePrice)}</Text>
        <Text style={styles.smallNote}>{review.quoteNote}</Text>
      </View>
      <Text style={styles.reviewDisclaimer}>Market fills can differ slightly because the paper engine applies simulated slippage.</Text>
      <TouchableOpacity
        testID="paper-order-submit"
        accessibilityRole="button"
        accessibilityLabel={`${submitting ? 'Submitting' : 'Confirm'} ${review.args.side} order for ${shares} shares of ${review.args.symbol}`}
        style={[styles.primaryAction, { backgroundColor: accent }, submitting && styles.disabledButton]}
        onPress={onSubmit}
        disabled={submitting}
      >
        <Text style={styles.primaryActionText}>{submitting ? 'SUBMITTING…' : `CONFIRM ${review.args.side.toUpperCase()}`}</Text>
        {submitting ? <View style={styles.spinner} /> : <Feather name="arrow-right" size={17} color="#000" />}
      </TouchableOpacity>
      <TouchableOpacity
        testID="paper-order-review-back"
        accessibilityRole="button"
        style={styles.secondaryAction}
        onPress={onBack}
        disabled={submitting}
      >
        <Text style={styles.secondaryActionText}>BACK TO EDIT</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    </View>
  );
}

function ReviewRow({ label, value, emphasize }: { label: string; value: string; emphasize?: boolean }) {
  return (
    <View style={styles.reviewRow}>
      <Text style={styles.reviewLabel}>{label}</Text>
      <Text style={[styles.reviewValue, emphasize && styles.reviewValueStrong]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scrollContent: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 28 },
  sectionLabel: { color: DIM, fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1.5, marginBottom: 8, marginTop: 2 },
  accountCard: { backgroundColor: '#15191e', borderWidth: 1, borderColor: 'rgba(214,173,84,0.32)', borderRadius: 14, padding: 13, marginBottom: 12 },
  accountTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0, marginBottom: 13 },
  accountName: { color: '#f3df91', fontFamily: 'Inter_700Bold', fontSize: 13, flex: 1, minWidth: 0 },
  capturedTag: { color: GOLD, fontFamily: 'Inter_600SemiBold', fontSize: 7, letterSpacing: 0.65, textAlign: 'right' },
  metricsRow: { flexDirection: 'row', gap: 8 },
  metric: { flex: 1, minWidth: 0 },
  metricLabel: { fontFamily: 'Inter_600SemiBold', color: DIM, fontSize: 8, letterSpacing: 0.8, marginBottom: 5 },
  metricValue: { fontFamily: 'Inter_700Bold', color: '#fff', fontSize: 12 },
  reviewCard: { backgroundColor: '#12161b', borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 12 },
  reviewSideRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sideBadge: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 7 },
  sideBadgeText: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 0.7 },
  reviewSymbol: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 20, flex: 1 },
  reviewOrderType: { color: SILVER, fontFamily: 'Inter_600SemiBold', fontSize: 10 },
  reviewCompany: { color: DIM, fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 5, marginBottom: 12 },
  reviewRow: { minHeight: 33, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, borderTopWidth: 1, borderTopColor: 'rgba(192,192,192,0.1)' },
  reviewLabel: { color: DIM, fontFamily: 'Inter_400Regular', fontSize: 11 },
  reviewValue: { color: SILVER, fontFamily: 'Inter_600SemiBold', fontSize: 11, textAlign: 'right', flexShrink: 1 },
  reviewValueStrong: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 14 },
  warningLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, borderTopWidth: 1, borderTopColor: 'rgba(192,192,192,0.1)', paddingTop: 10, marginTop: 4 },
  warningText: { color: GOLD, fontFamily: 'Inter_500Medium', fontSize: 10, lineHeight: 15, flex: 1 },
  reviewQuote: { borderWidth: 1, borderColor: BORDER, backgroundColor: CARD_BG, borderRadius: 11, padding: 12, marginBottom: 9 },
  mutedLabel: { color: DIM, fontFamily: 'Inter_700Bold', fontSize: 8, letterSpacing: 1.1 },
  reviewQuotePrice: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 19, marginVertical: 4 },
  smallNote: { color: DIM, fontFamily: 'Inter_400Regular', fontSize: 10, lineHeight: 15 },
  reviewDisclaimer: { color: DIM, fontFamily: 'Inter_400Regular', fontSize: 10, lineHeight: 15, marginBottom: 14 },
  primaryAction: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderRadius: 11, paddingHorizontal: 16, marginTop: 3 },
  primaryActionText: { color: '#000', fontFamily: 'Inter_700Bold', fontSize: 13, letterSpacing: 0.75 },
  disabledButton: { opacity: 0.42 },
  secondaryAction: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 3 },
  secondaryActionText: { color: DIM, fontFamily: 'Inter_600SemiBold', fontSize: 11, letterSpacing: 1 },
  spinner: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: '#000', borderTopColor: 'transparent' },
  resultWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 28 },
  resultIcon: { width: 70, height: 70, borderRadius: 35, borderWidth: 1, backgroundColor: '#12161b', justifyContent: 'center', alignItems: 'center', marginBottom: 18 },
  resultTitle: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 22, textAlign: 'center' },
  resultMessage: { color: DIM, fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 10, maxWidth: 320 },
  resultFill: { alignItems: 'center', marginTop: 22, marginBottom: 18 },
  resultPrice: { color: BUY_COLOR, fontFamily: 'Inter_700Bold', fontSize: 24, marginTop: 5 },
  primaryNeutralButton: { minHeight: 48, width: '100%', maxWidth: 340, alignItems: 'center', justifyContent: 'center', backgroundColor: GOLD, borderRadius: 10, marginTop: 24 },
  primaryNeutralText: { color: '#111', fontFamily: 'Inter_700Bold', fontSize: 12, letterSpacing: 1 },
  textAction: { padding: 14 },
  textActionLabel: { color: SILVER, fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 1 },
});
