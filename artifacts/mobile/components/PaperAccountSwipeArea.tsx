import React, { useMemo, useRef } from 'react';
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

  const responder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) =>
      Math.abs(gesture.dx) > 12 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.2,
    onPanResponderRelease: (_event, gesture) => {
      if (
        Math.abs(gesture.dx) < 40
        || Math.abs(gesture.dx) <= Math.abs(gesture.dy) * 1.2
      ) return;
      const current = latestProps.current;
      const nextId = getAdjacentPaperAccountId(current.accounts, current.activeId, gesture.dx < 0 ? 1 : -1);
      if (nextId && nextId !== current.activeId) {
        current.onSwitchAccount(nextId);
        if (Platform.OS !== 'web') {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        }
      }
    },
  }), []);

  return (
    <View testID={testID} style={style} {...responder.panHandlers}>
      {children}
    </View>
  );
}
