import { Colors, Typography } from '@/constants/theme';
import type { ReactNode } from 'react';
import { StyleSheet, Text, TouchableOpacity, type StyleProp, type ViewStyle } from 'react-native';

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  // 「過去の記録から読み込む」画面のダウンロードアイコン等、ラベル前に小さいアイコンを添える場合に使う
  icon?: ReactNode;
};

export function PrimaryButton({ label, onPress, disabled = false, accessibilityLabel, style, icon }: Props) {
  return (
    <TouchableOpacity
      style={[styles.button, disabled && styles.disabled, style]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
    >
      {icon}
      <Text style={styles.text}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    gap: 6,
    borderRadius: 8,
    paddingVertical: 13,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { backgroundColor: Colors.textPlaceholder },
  text: { ...Typography.bodyStrong, color: Colors.onAccent },
});
