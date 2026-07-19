import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { Colors, Typography } from '@/constants/theme';
import { StyleSheet, Text, TouchableOpacity, type StyleProp, type ViewStyle } from 'react-native';

type Props = {
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  // 「予定を追加」（カレンダー選択日パネル、PR10-4）等、種目追加以外の用途でも同じ見た目の
  // 「+ラベル」ボタンとして再利用できるよう、ラベル・アイコンを差し替え可能にしている。
  // 省略時は既存の「種目を追加」用の値のまま（呼び出し元の挙動を変えない）
  label?: string;
  accessibilityLabel?: string;
  icon?: IconSymbolName;
};

export function AddExerciseButton({
  onPress,
  style,
  label = '種目を追加',
  accessibilityLabel = '種目を追加',
  icon = 'plus',
}: Props) {
  return (
    <TouchableOpacity
      style={[styles.button, style]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <IconSymbol name={icon} size={18} color={Colors.accent} />
      <Text style={styles.text}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Colors.accentSurface,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  text: { color: Colors.accent, ...Typography.bodyStrong },
});
