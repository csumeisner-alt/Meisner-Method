import React from 'react';
import { Modal, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import {
  MOUNTAIN_CHAMPIONSHIP_TRANSFER_LOCK_MESSAGE,
  MOUNTAIN_CHAMPIONSHIP_TRANSFER_LOCK_TITLE,
} from '@/lib/paperChallenge';

type Props = {
  visible: boolean;
  onDismiss: () => void;
};

export function EventArenaTransferLockNotice({ visible, onDismiss }: Props) {
  const colors = useColors();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.68)' }}>
        <View
          testID="mountain-championship-transfer-lock-notice"
          accessibilityRole="alert"
          style={{
            alignItems: 'center',
            padding: 24,
            borderRadius: 20,
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: '#D8B45A',
          }}
        >
          <View style={{
            width: 62,
            height: 62,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 31,
            backgroundColor: 'rgba(216,180,90,0.14)',
            borderWidth: 1,
            borderColor: 'rgba(216,180,90,0.52)',
          }}>
            <Feather name="award" size={31} color="#D8B45A" />
            <View style={{
              position: 'absolute',
              right: -3,
              bottom: -3,
              width: 25,
              height: 25,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 13,
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: '#D8B45A',
            }}>
              <Feather name="lock" size={13} color="#D8B45A" />
            </View>
          </View>
          <Text style={{
            color: '#D8B45A',
            fontFamily: 'Inter_700Bold',
            fontSize: 13,
            letterSpacing: 1,
            textAlign: 'center',
            marginTop: 18,
          }}>
            {MOUNTAIN_CHAMPIONSHIP_TRANSFER_LOCK_TITLE}
          </Text>
          <Text style={{
            color: colors.foreground,
            fontFamily: 'Inter_400Regular',
            fontSize: 13,
            lineHeight: 20,
            textAlign: 'center',
            marginTop: 10,
          }}>
            {MOUNTAIN_CHAMPIONSHIP_TRANSFER_LOCK_MESSAGE}
          </Text>
          <TouchableOpacity
            testID="mountain-championship-transfer-lock-ok"
            accessibilityRole="button"
            accessibilityLabel="OK"
            onPress={onDismiss}
            style={{
              minHeight: 46,
              minWidth: 120,
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: 24,
              marginTop: 22,
              borderRadius: 12,
              backgroundColor: '#D8B45A',
            }}
          >
            <Text style={{ color: '#101720', fontFamily: 'Inter_700Bold', fontSize: 13 }}>OK</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
