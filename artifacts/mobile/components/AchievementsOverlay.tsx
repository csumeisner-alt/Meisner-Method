import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ACHIEVEMENTS, hasCompletedAllAchievements, PREMIUM_FLAGS } from '@/lib/achievements';
import { PremiumFlagBadge } from '@/components/PremiumFlagBadge';
import { useAchievements } from '@/contexts/AchievementsContext';
import { useColors } from '@/hooks/useColors';
import { useReduceMotion } from '@/hooks/useReduceMotion';

export function AchievementsOverlay() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const {
    earnedIds,
    selectedPremiumFlagId,
    premiumFlagReady,
    selectPremiumFlag,
    galleryVisible,
    closeGallery,
    toastAchievement,
    dismissToast,
  } = useAchievements();
  const toastMotion = useRef(new Animated.Value(0)).current;

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
        visible={galleryVisible}
        transparent
        animationType="fade"
        onRequestClose={closeGallery}
      >
        <View style={[styles.modalRoot, { paddingTop: Math.max(insets.top, 16), paddingBottom: Math.max(insets.bottom, 16) }]}>
          <Pressable
            onPress={closeGallery}
            style={[StyleSheet.absoluteFill, styles.backdrop]}
            accessibilityRole="button"
            accessibilityLabel="Close achievements"
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
              <View style={[styles.flagRewardCard, { backgroundColor: colors.card, borderColor: colors.goldMuted }]}>
                <View style={styles.flagRewardHeading}>
                  <Feather name="award" size={17} color={colors.gold} />
                  <Text style={[styles.flagRewardEyebrow, { color: colors.gold, fontFamily: 'Inter_700Bold' }]}>
                    PREMIUM FLAG BADGE
                  </Text>
                </View>
                {hasCompletedAllAchievements(earnedIds) ? (
                  <>
                    <Text style={[styles.flagRewardTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
                      Choose your title flag
                    </Text>
                    <Text style={[styles.flagRewardDescription, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                      Your selected flag waves beside Meisner Method on the home screen.
                    </Text>
                    <View style={styles.flagGrid}>
                      {PREMIUM_FLAGS.map((flag) => {
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
                            <PremiumFlagBadge flagId={flag.id} size={86} animated={galleryVisible} />
                            <Text style={[styles.flagChoiceName, { color: selected ? colors.gold : colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>
                              {flag.name}
                            </Text>
                            {selected && <Feather name="check-circle" size={14} color={colors.gold} />}
                          </Pressable>
                        );
                      })}
                    </View>
                  </>
                ) : (
                  <View style={styles.flagLockedRow}>
                    <View style={[styles.flagLockedIcon, { backgroundColor: colors.steelShadow }]}>
                      <Feather name="lock" size={17} color={colors.mutedForeground} />
                    </View>
                    <View style={styles.flagRewardCopy}>
                      <Text style={[styles.flagRewardTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
                        Complete all 15 achievements
                      </Text>
                      <Text style={[styles.flagRewardDescription, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                        Unlock five premium waving American flags for your title badge.
                      </Text>
                    </View>
                  </View>
                )}
              </View>
            </ScrollView>
          </View>
        </View>
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
});
