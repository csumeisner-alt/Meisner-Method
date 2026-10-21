import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BREW_TOKEN_QUOTE_THRESHOLD } from '@/lib/brewTokenLogic';
import {
  ACHIEVEMENTS,
  ACHIEVEMENT_UNLOCKED_FLAGS,
  DEFAULT_FLAG_ID,
  hasCompletedAllAchievements,
  PRIDE_FLAG,
} from '@/lib/achievements';
import { PremiumFlagBadge } from '@/components/PremiumFlagBadge';
import { useAchievements } from '@/contexts/AchievementsContext';
import { useColors } from '@/hooks/useColors';
import { useReduceMotion } from '@/hooks/useReduceMotion';

const RAINBOW_ARC_COLORS = ['#E54B4B', '#F28C38', '#F1C84B', '#47B879', '#3A9ED9', '#4E69C8', '#8556B3'];

function RainbowCelebration({ onDismiss }: { onDismiss: () => void }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 2_400,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 2_400,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [pulse]);

  const arcSize = Math.max(width * 1.75, height * 1.15);
  const baseline = height * 0.79;
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1.04] });
  const glowOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.22, 0.52] });

  return (
    <View style={[styles.celebrationRoot, { backgroundColor: colors.background }]}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.rainbowArcField,
          { opacity: glowOpacity, transform: [{ scale }] },
        ]}
      >
        {RAINBOW_ARC_COLORS.map((color, index) => {
          const size = arcSize - index * 32;
          return (
            <View
              key={color}
              style={[
                styles.rainbowArc,
                {
                  width: size,
                  height: size,
                  left: (width - size) / 2,
                  top: baseline - size / 2,
                  borderColor: color,
                },
              ]}
            />
          );
        })}
      </Animated.View>

      <Pressable
        onPress={onDismiss}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Dismiss rainbow celebration"
        style={[styles.celebrationClose, { top: insets.top + 10 }]}
      >
        <Feather name="x" size={21} color={colors.foreground} />
      </Pressable>

      <View style={styles.celebrationCopy}>
        <PremiumFlagBadge flagId={PRIDE_FLAG.id} size={112} />
        <Text style={[styles.celebrationEyebrow, { color: colors.gold, fontFamily: 'Inter_700Bold' }]}>
          TITLE ICON UPDATED
        </Text>
        <Text style={[styles.celebrationTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
          Pride, selected.
        </Text>
        <Text style={[styles.celebrationDescription, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
          Your new flag is ready beside Meisner Method.
        </Text>
        <Pressable
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="Continue"
          style={[styles.celebrationButton, { backgroundColor: colors.gold }]}
        >
          <Text style={[styles.celebrationButtonText, { color: colors.background, fontFamily: 'Inter_700Bold' }]}>
            Continue
          </Text>
          <Feather name="arrow-right" size={16} color={colors.background} />
        </Pressable>
      </View>
    </View>
  );
}

export function AchievementsOverlay() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const {
    earnedIds,
    selectedPremiumFlagId,
    quotesViewed,
    prideUnlocked,
    premiumFlagReady,
    selectPremiumFlag,
    galleryVisible,
    closeGallery,
    toastAchievement,
    dismissToast,
  } = useAchievements();
  const toastMotion = useRef(new Animated.Value(0)).current;
  const [prideConfirmVisible, setPrideConfirmVisible] = useState(false);
  const [rainbowCelebrationVisible, setRainbowCelebrationVisible] = useState(false);
  const [iconUnchangedNotice, setIconUnchangedNotice] = useState(false);

  const requestPrideSelection = () => {
    if (!premiumFlagReady || !prideUnlocked) return;
    setPrideConfirmVisible(true);
  };

  const confirmPrideSelection = () => {
    if (!prideUnlocked) return;
    selectPremiumFlag(PRIDE_FLAG.id);
    setPrideConfirmVisible(false);
    setRainbowCelebrationVisible(true);
  };

  const cancelPrideSelection = () => {
    setPrideConfirmVisible(false);
    setIconUnchangedNotice(true);
  };

  const dismissRainbowCelebration = () => {
    setRainbowCelebrationVisible(false);
    closeGallery();
  };

  useEffect(() => {
    if (!iconUnchangedNotice) return;
    const timeout = setTimeout(() => setIconUnchangedNotice(false), 2_500);
    return () => clearTimeout(timeout);
  }, [iconUnchangedNotice]);

  useEffect(() => {
    if (!toastAchievement) {
      toastMotion.setValue(0);
      return;
    }
    if (reduceMotion) {
      toastMotion.setValue(1);
      return;
    }
    toastMotion.setValue(0);
    const animation = Animated.spring(toastMotion, {
      toValue: 1,
      tension: 90,
      friction: 12,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [reduceMotion, toastAchievement, toastMotion]);

  return (
    <>
      {toastAchievement && (
        <View
          pointerEvents="box-none"
          style={[
            styles.toastLayer,
            { bottom: Math.max(insets.bottom, 12) + 62 },
          ]}
        >
          <Animated.View
            accessibilityLiveRegion="polite"
            accessibilityRole="alert"
            style={[
              styles.toast,
              {
                backgroundColor: colors.card,
                borderColor: colors.goldMuted,
                opacity: toastMotion,
                transform: [{
                  translateY: toastMotion.interpolate({
                    inputRange: [0, 1],
                    outputRange: [10, 0],
                  }),
                }],
              },
            ]}
          >
            <View style={[styles.toastIcon, { backgroundColor: colors.steelShadow }]}>
              <Feather name="award" size={18} color={colors.gold} />
            </View>
            <View style={styles.toastCopy}>
              <Text style={[styles.toastEyebrow, { color: colors.gold, fontFamily: 'Inter_700Bold' }]}>
                ACHIEVEMENT EARNED
              </Text>
              <Text style={[styles.toastTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
                {toastAchievement.title}
              </Text>
              <Text style={[styles.toastDescription, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                {toastAchievement.description}
              </Text>
            </View>
            <Pressable
              onPress={dismissToast}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Dismiss achievement"
              style={styles.dismiss}
            >
              <Feather name="x" size={16} color={colors.mutedForeground} />
            </Pressable>
          </Animated.View>
        </View>
      )}

      <Modal
        visible={galleryVisible || rainbowCelebrationVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (rainbowCelebrationVisible) dismissRainbowCelebration();
          else if (prideConfirmVisible) setPrideConfirmVisible(false);
          else closeGallery();
        }}
      >
        {rainbowCelebrationVisible ? (
          <RainbowCelebration onDismiss={dismissRainbowCelebration} />
        ) : (
          <View style={[styles.modalRoot, { paddingTop: Math.max(insets.top, 16), paddingBottom: Math.max(insets.bottom, 16) }]}>
            <Pressable
              onPress={() => prideConfirmVisible ? cancelPrideSelection() : closeGallery()}
              style={[StyleSheet.absoluteFill, styles.backdrop]}
              accessibilityRole="button"
              accessibilityLabel={prideConfirmVisible ? 'Keep current icon' : 'Close achievements'}
            />
            <View style={[styles.panel, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <View style={styles.panelHeader}>
              <View style={styles.panelTitleGroup}>
                <Feather name="award" size={20} color={colors.gold} />
                <View>
                  <Text style={[styles.panelTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
                    ACHIEVEMENTS
                  </Text>
                  <Text style={[styles.panelSubtitle, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                    {earnedIds.length} of {ACHIEVEMENTS.length} earned
                  </Text>
                </View>
              </View>
              <Pressable
                onPress={closeGallery}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Close achievements"
              >
                <Feather name="x" size={20} color={colors.mutedForeground} />
              </Pressable>
            </View>

            {iconUnchangedNotice && (
              <View style={[styles.iconKeptNotice, { backgroundColor: colors.steelShadow, borderColor: colors.border }]}>
                <Feather name="check-circle" size={15} color={colors.gold} />
                <Text style={[styles.iconKeptText, { color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }]}>
                  Smart choice. Your current flag stays selected.
                </Text>
              </View>
            )}

            <ScrollView
              style={styles.achievementScroll}
              contentContainerStyle={styles.achievementList}
              showsVerticalScrollIndicator
              nestedScrollEnabled
              accessibilityLabel="Achievement list"
            >
              {ACHIEVEMENTS.map((achievement) => {
                const earned = earnedIds.includes(achievement.id);
                return (
                  <View
                    key={achievement.id}
                    style={[
                      styles.achievementRow,
                      {
                        backgroundColor: earned ? colors.card : colors.steelShadow,
                        borderColor: earned ? colors.goldMuted : colors.border,
                        opacity: earned ? 1 : 0.65,
                      },
                    ]}
                  >
                    <View style={[styles.achievementIcon, { backgroundColor: earned ? colors.steelShadow : colors.background }]}>
                      <Feather
                        name={earned ? achievement.icon : 'lock'}
                        size={17}
                        color={earned ? colors.gold : colors.mutedForeground}
                      />
                    </View>
                    <View style={styles.achievementCopy}>
                      <Text style={[styles.achievementTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
                        {achievement.title}
                      </Text>
                      <Text style={[styles.achievementDescription, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                        {achievement.description}
                      </Text>
                    </View>
                    {earned && <Feather name="check" size={16} color={colors.gold} />}
                  </View>
                );
              })}
              {hasCompletedAllAchievements(earnedIds) && (
                <View style={[styles.flagRewardCard, { backgroundColor: colors.card, borderColor: colors.goldMuted }]}>
                <View style={styles.flagRewardHeading}>
                  <Feather name="award" size={17} color={colors.gold} />
                  <Text style={[styles.flagRewardEyebrow, { color: colors.gold, fontFamily: 'Inter_700Bold' }]}>
                    TITLE FLAG
                  </Text>
                </View>
                  <>
                    <Text style={[styles.flagRewardTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
                      Choose your title flag
                    </Text>
                    <Text style={[styles.flagRewardDescription, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                      Choose the default U.S. flag or one of five designs. Pride unlocks after {BREW_TOKEN_QUOTE_THRESHOLD} Biden quote views.
                    </Text>
                    <View style={styles.flagGrid}>
                      <Pressable
                        onPress={() => selectPremiumFlag(DEFAULT_FLAG_ID)}
                        disabled={!premiumFlagReady}
                        accessibilityRole="button"
                        accessibilityState={{ selected: selectedPremiumFlagId === DEFAULT_FLAG_ID, disabled: !premiumFlagReady }}
                        accessibilityLabel={`Default U.S. flag${selectedPremiumFlagId === DEFAULT_FLAG_ID ? ', selected' : ''}`}
                        style={[
                          styles.flagChoice,
                          {
                            borderColor: selectedPremiumFlagId === DEFAULT_FLAG_ID ? colors.gold : colors.border,
                            backgroundColor: selectedPremiumFlagId === DEFAULT_FLAG_ID ? colors.steelShadow : colors.background,
                            opacity: premiumFlagReady ? 1 : 0.6,
                          },
                        ]}
                      >
                        <View style={styles.defaultFlagPreview}>
                          <Text style={{ fontSize: 42 }}>🇺🇸</Text>
                        </View>
                        <Text style={[styles.flagChoiceName, { color: selectedPremiumFlagId === DEFAULT_FLAG_ID ? colors.gold : colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>
                          Default
                        </Text>
                        {selectedPremiumFlagId === DEFAULT_FLAG_ID && <Feather name="check-circle" size={14} color={colors.gold} />}
                      </Pressable>
                      {ACHIEVEMENT_UNLOCKED_FLAGS.map((flag) => {
                        const selected = selectedPremiumFlagId === flag.id;
                        return (
                          <Pressable
                            key={flag.id}
                            onPress={() => selectPremiumFlag(flag.id)}
                            disabled={!premiumFlagReady}
                            accessibilityRole="button"
                            accessibilityState={{ selected, disabled: !premiumFlagReady }}
                            accessibilityLabel={`${flag.name} premium flag${selected ? ', selected' : ''}`}
                            style={[
                              styles.flagChoice,
                              {
                                borderColor: selected ? colors.gold : colors.border,
                                backgroundColor: selected ? colors.steelShadow : colors.background,
                                opacity: premiumFlagReady ? 1 : 0.6,
                              },
                            ]}
                          >
                            <PremiumFlagBadge flagId={flag.id} size={86} />
                            <Text style={[styles.flagChoiceName, { color: selected ? colors.gold : colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>
                              {flag.name}
                            </Text>
                            {selected && <Feather name="check-circle" size={14} color={colors.gold} />}
                          </Pressable>
                        );
                      })}
                      <Pressable
                        onPress={requestPrideSelection}
                        disabled={!premiumFlagReady || !prideUnlocked}
                        accessibilityRole="button"
                        accessibilityState={{ selected: selectedPremiumFlagId === PRIDE_FLAG.id, disabled: !premiumFlagReady || !prideUnlocked }}
                        accessibilityLabel={`Pride premium flag${prideUnlocked ? '' : `, locked until ${BREW_TOKEN_QUOTE_THRESHOLD} Biden quotes are viewed`}${selectedPremiumFlagId === PRIDE_FLAG.id ? ', selected' : ''}`}
                        style={[
                          styles.flagChoice,
                          {
                            borderColor: selectedPremiumFlagId === PRIDE_FLAG.id ? colors.gold : colors.border,
                            backgroundColor: selectedPremiumFlagId === PRIDE_FLAG.id ? colors.steelShadow : colors.background,
                            opacity: premiumFlagReady && prideUnlocked ? 1 : 0.6,
                          },
                        ]}
                      >
                        <View style={styles.pridePreview}>
                          <PremiumFlagBadge flagId={PRIDE_FLAG.id} size={86} />
                          {!prideUnlocked && (
                            <View style={styles.lockOverlay}>
                              <Feather name="lock" size={18} color={colors.foreground} />
                            </View>
                          )}
                        </View>
                        <Text style={[styles.flagChoiceName, { color: selectedPremiumFlagId === PRIDE_FLAG.id ? colors.gold : colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>
                          Pride
                        </Text>
                        {!prideUnlocked && (
                          <Text style={[styles.prideProgress, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                            {Math.min(quotesViewed, BREW_TOKEN_QUOTE_THRESHOLD)} / {BREW_TOKEN_QUOTE_THRESHOLD} Biden quotes
                          </Text>
                        )}
                        {selectedPremiumFlagId === PRIDE_FLAG.id && <Feather name="check-circle" size={14} color={colors.gold} />}
                      </Pressable>
                    </View>
                  </>
                </View>
              )}
            </ScrollView>
          </View>
            {prideConfirmVisible && (
              <View style={styles.confirmLayer}>
                <Pressable
                  onPress={cancelPrideSelection}
                  style={StyleSheet.absoluteFill}
                  accessibilityRole="button"
                  accessibilityLabel="Keep current icon"
                />
                <View style={[styles.confirmCard, { backgroundColor: colors.card, borderColor: colors.goldMuted }]}>
                  <View style={[styles.confirmIcon, { backgroundColor: colors.steelShadow }]}>
                    <Feather name="flag" size={20} color={colors.gold} />
                  </View>
                  <Text style={[styles.confirmTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
                    Set the Pride flag as your icon?
                  </Text>
                  <Text style={[styles.confirmDescription, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                    Your current title icon will be replaced. You can change it any time.
                  </Text>
                  <Pressable
                    onPress={confirmPrideSelection}
                    accessibilityRole="button"
                    accessibilityLabel="Yes, set Pride as my icon"
                    style={[styles.confirmPrimary, { backgroundColor: colors.gold }]}
                  >
                    <Text style={[styles.confirmPrimaryText, { color: colors.background, fontFamily: 'Inter_700Bold' }]}>
                      Yes, set Pride
                    </Text>
                    <Feather name="check" size={17} color={colors.background} />
                  </Pressable>
                  <Pressable
                    onPress={cancelPrideSelection}
                    accessibilityRole="button"
                    accessibilityLabel="No, keep my current icon"
                    style={styles.confirmSecondary}
                  >
                    <Text style={[styles.confirmSecondaryText, { color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>
                      No, keep current icon
                    </Text>
                  </Pressable>
                </View>
              </View>
            )}
          </View>
        )}
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  toastLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 14,
    zIndex: 1000,
  },
  toast: {
    width: '100%',
    maxWidth: 440,
    minHeight: 76,
    borderWidth: 1,
    borderRadius: 12,
    padding: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    elevation: 9,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },
  toastIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  toastCopy: { flex: 1, gap: 2 },
  toastEyebrow: { fontSize: 8, letterSpacing: 1 },
  toastTitle: { fontSize: 13 },
  toastDescription: { fontSize: 10, lineHeight: 14 },
  dismiss: { padding: 4 },
  modalRoot: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 18 },
  backdrop: { backgroundColor: 'rgba(0,0,0,0.72)' },
  panel: { width: '100%', maxWidth: 460, maxHeight: '88%', borderWidth: 1, borderRadius: 16, padding: 18 },
  panelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  panelTitleGroup: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  panelTitle: { fontSize: 14, letterSpacing: 1 },
  panelSubtitle: { fontSize: 11, marginTop: 2 },
  achievementScroll: { flexShrink: 1 },
  achievementList: { gap: 9, paddingBottom: 2 },
  achievementRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9 },
  achievementIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  achievementCopy: { flex: 1, gap: 2 },
  achievementTitle: { fontSize: 12 },
  achievementDescription: { fontSize: 10, lineHeight: 14 },
  flagRewardCard: { borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 8, gap: 7 },
  flagRewardHeading: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  flagRewardEyebrow: { fontSize: 10, letterSpacing: 0.8 },
  flagRewardTitle: { fontSize: 13, lineHeight: 18 },
  flagRewardDescription: { fontSize: 11, lineHeight: 16 },
  flagRewardCopy: { flex: 1, gap: 3 },
  flagLockedRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  flagLockedIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  flagGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, marginTop: 4 },
  flagChoice: { width: '48%', minHeight: 102, borderWidth: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 8 },
  flagChoiceName: { fontSize: 11 },
  defaultFlagPreview: { width: 86, height: 54, alignItems: 'center', justifyContent: 'center' },
  pridePreview: { width: 86, height: 54, position: 'relative', alignItems: 'center', justifyContent: 'center' },
  lockOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.52)' },
  prideProgress: { fontSize: 9, lineHeight: 12, textAlign: 'center' },
  iconKeptNotice: { minHeight: 36, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 10 },
  iconKeptText: { fontSize: 10 },
  confirmLayer: { ...StyleSheet.absoluteFillObject, zIndex: 5, alignItems: 'center', justifyContent: 'center', padding: 18, backgroundColor: 'rgba(0,0,0,0.74)' },
  confirmCard: { width: '100%', maxWidth: 380, borderWidth: 1, borderRadius: 16, padding: 22, alignItems: 'center', gap: 12 },
  confirmIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  confirmTitle: { fontSize: 17, textAlign: 'center', lineHeight: 23 },
  confirmDescription: { fontSize: 13, lineHeight: 19, textAlign: 'center' },
  confirmPrimary: { minHeight: 46, width: '100%', borderRadius: 10, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4 },
  confirmPrimaryText: { fontSize: 13 },
  confirmSecondary: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 12 },
  confirmSecondaryText: { fontSize: 12 },
  celebrationRoot: { flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  rainbowArcField: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
  rainbowArc: { position: 'absolute', borderWidth: 18, borderBottomColor: 'transparent', borderRadius: 9999 },
  celebrationClose: { position: 'absolute', right: 18, width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  celebrationCopy: { alignItems: 'center', gap: 12, paddingHorizontal: 28, zIndex: 1 },
  celebrationEyebrow: { fontSize: 10, letterSpacing: 1.8, marginTop: 12 },
  celebrationTitle: { fontSize: 26, lineHeight: 32, textAlign: 'center' },
  celebrationDescription: { fontSize: 14, lineHeight: 21, textAlign: 'center' },
  celebrationButton: { minHeight: 48, minWidth: 180, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 12 },
  celebrationButtonText: { fontSize: 14 },
});
