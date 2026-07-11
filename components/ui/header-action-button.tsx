import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { Colors, Typography } from '@/constants/theme';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';

// headerRightに置く「アイコン+ラベル」の主要アクションボタン（記録=開始・種目/リマインダー=追加）。
// ⋮メニュー(DropdownMenuHeaderTrigger)と違いこちらは主要導線なのでaccent色にして役割の違いを見せる
export function HeaderActionButton({
  icon,
  label,
  onPress,
  accessibilityLabel,
}: {
  icon: IconSymbolName;
  label: string;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  return (
    <TouchableOpacity
      style={styles.button}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
    >
      <IconSymbol name={icon} size={18} color={Colors.accent} />
      <Text style={styles.label}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 36 },
  label: { ...Typography.bodyStrong, color: Colors.accent },
});
