import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { StyleSheet, TouchableOpacity } from 'react-native';

// 一覧系ヘッダー右の新規作成ボタン。デザイン案 A5「塗りアイコン・背景なし（iOS風）」に準拠し、
// ラベルなしで塗りつぶしの add_circle だけを accent 色で表示する。種目・ルーティン・リマインダーで共通利用。
// ヘッダー内の他ボタン（戻る・⋮・開始）と同じく背景を持たない ghost 表現で統一している。
export function HeaderAddButton({
  onPress,
  accessibilityLabel,
}: {
  onPress: () => void;
  accessibilityLabel: string;
}) {
  return (
    <TouchableOpacity
      style={styles.button}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
    >
      <IconSymbol name="plus.circle.fill" size={27} color={Colors.accent} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: { padding: 4 },
});
