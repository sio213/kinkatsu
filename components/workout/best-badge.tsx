import { DesignIcon } from '@/components/ui/design-icon';
import { Colors, Typography } from '@/constants/theme';
import { StyleSheet, Text, View } from 'react-native';

// 自己ベストを示す星バッジ。history-entry-card.tsx（過去の記録から読み込む画面）・
// calendar-exercise-card.tsx（カレンダー選択日パネル）で見た目が完全に一致していたため共通化した。
// 文言は「自己ベスト」だとカード幅の狭い箇所で2行になってしまうため「ベスト」に短縮している
// （2026-07-19、両画面とも本コンポーネント経由なので変更が自動的に反映される）
export function BestBadge() {
  return (
    <View style={styles.badge}>
      <DesignIcon name="star" size={11} color={Colors.warningText} />
      <Text style={styles.text}>ベスト</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.warningSurface,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  text: { ...Typography.badge, color: Colors.warningText },
});
