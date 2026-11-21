import React, { useEffect, useMemo, useRef } from 'react';
import { reserveInteraction, releaseInteraction } from '@/lib/interactionOwnership';
import {
  PanResponder,
  Platform,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  getAdjacentPaperAccountId,
  type PaperAccountSwipeItem,
} from '@/lib/paperAccountManagement';

type PaperAccountSwipeAreaProps = React.PropsWithChildren<{
  accounts: PaperAccountSwipeItem[];
  activeId: string;
  onSwitchAccount: (id: string) => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}>;

export function PaperAccountSwipeArea({
  accounts,
  activeId,
  onSwitchAccount,
  style,
  testID,
  children,
}: PaperAccountSwipeAreaProps) {
  const latestProps = useRef({ accounts, activeId, onSwitchAccount });
  latestProps.current = { accounts, activeId, onSwitchAccount };
  const owner = useRef({});
  const startingAccount = useRef(activeId);
  useEffect(() => () => releaseInteraction(owner.current), []);

  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponderCapture: (_event, gesture) =>
      Math.abs(gesture.dx) > 12 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.2,
    onMoveShouldSetPanResponder: (_event, gesture) =>
      Math.abs(gesture.dx) > 12 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.2,
    onPanResponderRelease: (_event, gesture) => {
      releaseInteraction(owner.current);
      if (
        Math.abs(gesture.dx) < 40
        || Math.abs(gesture.dx) <= Math.abs(gesture.dy) * 1.2
      ) return;
      const current = latestProps.current;
      if (current.activeId !== startingAccount.current) return;
      const nextId = getAdjacentPaperAccountId(current.accounts, current.activeId, gesture.dx < 0 ? 1 : -1);
      if (nextId && nextId !== current.activeId) {
        current.onSwitchAccount(nextId);
        if (Platform.OS !== 'web') {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        }
      }
    },
    onPanResponderTerminationRequest: () => false,
    onPanResponderTerminate: () => releaseInteraction(owner.current),
  }), []);

  return (
    <View
      testID={testID}
      collapsable={false}
      style={[
        { flexShrink: 0, minHeight: 160 },
        style,
        Platform.OS === 'web' && ({ touchAction: 'pan-y' } as ViewStyle),
      ]}
      onTouchStart={() => {
        startingAccount.current = latestProps.current.activeId;
        reserveInteraction(owner.current);
      }}
      onTouchEnd={() => releaseInteraction(owner.current)}
      onTouchCancel={() => releaseInteraction(owner.current)}
      {...responder.panHandlers}
    >
      {children}
    </View>
  );
}
