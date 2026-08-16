import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';

interface PriceAlertModalProps {
  visible: boolean;
  symbol: string;
  currentPrice?: number;
  existingDirection?: 'above' | 'below';
  existingTarget?: number;
  pushToken: string | null;
  registrationError?: string | null;
  permissionStatus: 'unknown' | 'granted' | 'denied' | 'unavailable';
  onRequestPermission: () => Promise<boolean>;
  onOpenSettings: () => void;
  onSave: (direction: 'above' | 'below', targetPrice: number) => Promise<void> | void;
  onDelete: () => Promise<void> | void;
  onClose: () => void;
  colors: any;
}

const formatPrice = (p: number) => `$${p.toFixed(2)}`;

export function PriceAlertModal({
  visible,
  symbol,
  currentPrice,
  existingDirection,
  existingTarget,
  pushToken,
  permissionStatus,
  onRequestPermission,
  onOpenSettings,
  onSave,
  onDelete,
  onClose,
  colors,
  registrationError,
}: PriceAlertModalProps) {
  const [direction, setDirection] = useState<'above' | 'below'>(existingDirection ?? 'above');
  const [targetInput, setTargetInput] = useState(existingTarget?.toFixed(2) ?? '');
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    if (visible) {
      setDirection(existingDirection ?? 'above');
      setTargetInput(existingTarget?.toFixed(2) ?? (currentPrice ? currentPrice.toFixed(2) : ''));
    }
  }, [visible, existingDirection, existingTarget, currentPrice]);

  const handleSave = async () => {
    const value = parseFloat(targetInput);
    if (!value || value <= 0) {
      Alert.alert('Invalid price', 'Please enter a valid price target.');
      return;
    }
    try {
      await onSave(direction, value);
      onClose();
    } catch (error) {
      Alert.alert(
        'Could not save alert',
        error instanceof Error ? error.message : 'Please check your connection and try again.',
      );
    }
  };

  const requestNotifications = async () => {
    if (requesting) return;
    setRequesting(true);
    try {
      await onRequestPermission();
    } finally {
      setRequesting(false);
    }
  };

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <Pressable style={alertStyles.overlay} onPress={onClose}>
        <Pressable style={[alertStyles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[alertStyles.title, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
            Price Alert — {symbol}
          </Text>
          {currentPrice != null && (
            <Text style={[alertStyles.subtitle, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
              Current: {formatPrice(currentPrice)}
            </Text>
          )}

          {permissionStatus === 'unavailable' ? (
            <View style={[alertStyles.unavailableBox, { backgroundColor: colors.muted, borderColor: colors.border }]}>
              <Feather name="bell-off" size={16} color={colors.mutedForeground} />
              <Text style={[alertStyles.unavailableText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                Push notifications are only available on a physical device with the app installed.
              </Text>
            </View>
          ) : permissionStatus === 'denied' ? (
            <>
              <View style={[alertStyles.unavailableBox, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                <Feather name="bell-off" size={16} color={colors.mutedForeground} />
                <Text style={[alertStyles.unavailableText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                  Notifications are turned off for this app. To get price alerts, enable them in your phone&apos;s settings.
                </Text>
              </View>
              <TouchableOpacity style={[alertStyles.saveBtn, { backgroundColor: colors.primary }]} onPress={onOpenSettings} activeOpacity={0.8}>
                <Feather name="settings" size={14} color={colors.primaryForeground} />
                <Text style={[alertStyles.saveTxt, { color: colors.primaryForeground, fontFamily: 'Inter_700Bold' }]}>
                  Open Settings
                </Text>
              </TouchableOpacity>
            </>
          ) : registrationError ? (
            <>
              <View style={[alertStyles.unavailableBox, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                <Feather name="wifi-off" size={16} color={colors.mutedForeground} />
                <Text style={[alertStyles.unavailableText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                  Notifications are enabled, but this phone could not be registered for price alerts.
                  {` ${registrationError}`}
                </Text>
              </View>
              <TouchableOpacity
                style={[alertStyles.saveBtn, { backgroundColor: colors.primary }]}
                onPress={requestNotifications}
                disabled={requesting}
                activeOpacity={0.8}
              >
                {requesting ? (
                  <ActivityIndicator size="small" color={colors.primaryForeground} />
                ) : (
                  <Feather name="refresh-cw" size={14} color={colors.primaryForeground} />
                )}
                <Text style={[alertStyles.saveTxt, { color: colors.primaryForeground, fontFamily: 'Inter_700Bold' }]}>
                  Try Again
                </Text>
              </TouchableOpacity>
            </>
          ) : !pushToken ? (
            <>
              <View style={[alertStyles.unavailableBox, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                <Feather name="bell" size={16} color={colors.mutedForeground} />
                <Text style={[alertStyles.unavailableText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                  We&apos;ll send you a notification when {symbol} crosses your target price. Allow notifications to set your alert.
                </Text>
              </View>
              <TouchableOpacity
                style={[alertStyles.saveBtn, { backgroundColor: colors.primary, opacity: requesting ? 0.6 : 1 }]}
                onPress={requestNotifications}
                disabled={requesting}
                activeOpacity={0.8}
              >
                {requesting ? (
                  <ActivityIndicator size="small" color={colors.primaryForeground} />
                ) : (
                  <Feather name="bell" size={14} color={colors.primaryForeground} />
                )}
                <Text style={[alertStyles.saveTxt, { color: colors.primaryForeground, fontFamily: 'Inter_700Bold' }]}>
                  Enable Notifications
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={alertStyles.dirRow}>
                {(['above', 'below'] as const).map((d) => (
                  <TouchableOpacity
                    key={d}
                    style={[
                      alertStyles.dirBtn,
                      { borderColor: colors.border },
                      direction === d && {
                        backgroundColor: d === 'above' ? colors.buyBg : colors.sellBg,
                        borderColor: d === 'above' ? colors.buyColor : colors.sellColor,
                      },
                    ]}
                    onPress={() => setDirection(d)}
                    activeOpacity={0.8}
                  >
                    <Text style={[alertStyles.dirTxt, {
                      color: direction === d ? (d === 'above' ? colors.buyColor : colors.sellColor) : colors.mutedForeground,
                      fontFamily: 'Inter_600SemiBold',
                    }]}>
                      {d === 'above' ? '↑ Above' : '↓ Below'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[alertStyles.label, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                Target price ($)
              </Text>
              <TextInput
                style={[alertStyles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.muted, fontFamily: 'Inter_500Medium' }]}
                value={targetInput}
                onChangeText={setTargetInput}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={colors.mutedForeground}
              />

              <TouchableOpacity style={[alertStyles.saveBtn, { backgroundColor: colors.primary }]} onPress={handleSave} activeOpacity={0.8}>
                <Feather name="bell" size={14} color={colors.primaryForeground} />
                <Text style={[alertStyles.saveTxt, { color: colors.primaryForeground, fontFamily: 'Inter_700Bold' }]}>
                  {existingTarget ? 'Update Alert' : 'Set Alert'}
                </Text>
              </TouchableOpacity>
            </>
          )}

          {existingTarget != null && (
            <TouchableOpacity
              style={alertStyles.deleteBtn}
              onPress={async () => { await onDelete(); onClose(); }}
              activeOpacity={0.8}
            >
              <Text style={[alertStyles.deleteTxt, { color: colors.sellColor, fontFamily: 'Inter_500Medium' }]}>
                Remove alert
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={alertStyles.closeBtn} onPress={onClose} activeOpacity={0.7}>
            <Feather name="x" size={20} color={colors.mutedForeground} />
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const alertStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  sheet: { borderRadius: 16, borderWidth: 1, padding: 24, width: '100%', maxWidth: 380 },
  title: { fontSize: 15, letterSpacing: 0.5, marginBottom: 4 },
  subtitle: { fontSize: 12, marginBottom: 20 },
  unavailableBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderWidth: 1, borderRadius: 8, padding: 12, marginBottom: 8 },
  unavailableText: { fontSize: 13, lineHeight: 19, flex: 1 },
  dirRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  dirBtn: { flex: 1, borderWidth: 1, borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  dirTxt: { fontSize: 14 },
  label: { fontSize: 11, letterSpacing: 0.5, marginBottom: 6 },
  input: { height: 48, borderRadius: 8, borderWidth: 1, paddingHorizontal: 14, fontSize: 16, marginBottom: 16 },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, borderRadius: 10, marginBottom: 8 },
  saveTxt: { fontSize: 14, letterSpacing: 0.5 },
  deleteBtn: { alignItems: 'center', paddingVertical: 10 },
  deleteTxt: { fontSize: 13 },
  closeBtn: { position: 'absolute', top: 16, right: 16, padding: 4 },
});