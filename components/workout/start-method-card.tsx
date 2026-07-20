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
  // 過去日の事後記録モード(app/workout/start-chooser.tsx)専用。カード自体のラベル・アイコンは
  // 今日のライブ開始フローと同じ（「自分で選ぶ」「ルーティン」に「開始」のニュアンスは元々無い）
  // ため変えないが、視覚的な日付サブタイトルだけでは伝わりにくいVoiceOverユーザー向けに
  // 対象日を読み上げで補う（@designer指摘）
  hint?: string;
};

export function StartMethodCard({ icon, label, disabled = false, onPress, hint }: Props) {
  return (
    <TouchableOpacity
      style={styles.card}
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      accessibilityHint={disabled ? '準備中の機能です' : hint}
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
