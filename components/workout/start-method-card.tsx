import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { Colors, Typography } from '@/constants/theme';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type Props = {
  icon: IconSymbolName;
  label: string;
  // 未実装の開始方法（履歴から・おすすめメニュー）はdisabled=trueで「準備中」バッジを出し、
  // タップしても何も起きないようにする（デザイン未確定のプレースホルダー画面のため）
  disabled?: boolean;
  onPress?: () => void;
};

export function StartMethodCard({ icon, label, disabled = false, onPress }: Props) {
  return (
    <TouchableOpacity
      style={styles.card}
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      accessibilityHint={disabled ? '準備中の機能です' : undefined}
    >
      {disabled && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>準備中</Text>
        </View>
      )}
      <IconSymbol name={icon} size={26} color={disabled ? Colors.textMuted : Colors.accent} />
      <Text style={[styles.label, disabled && styles.labelDisabled]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: Colors.surfaceMuted,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingVertical: 16,
    paddingHorizontal: 10,
    alignItems: 'center',
    gap: 6,
  },
  label: { ...Typography.caption, fontWeight: '700', color: Colors.textPrimary, textAlign: 'center' },
  // textPlaceholder(#94A3B8)はcard背景(surfaceMuted)とのコントラスト比が約2.56:1でWCAG基準未達のため、
  // 無効化表現でも読める濃さのtextMuted(約4.76:1)を使う
  labelDisabled: { color: Colors.textMuted },
  badge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: Colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: { ...Typography.badge, color: Colors.textMuted },
});
