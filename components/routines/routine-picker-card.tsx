import { CategoryChip } from '@/components/exercises/category-chip';
import { Colors, Typography } from '@/constants/theme';
import { getCategoryLabel } from '@/lib/exercises/constants';
import { summarizeCategories } from '@/lib/routines/format';
import { memo, useCallback } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type Props = {
  name: string;
  exerciseCount: number;
  categories: string[];
  onPress: () => void;
};

// トレーニング中画面ヘッダー⋮「ルーティンから読み込む」の画面2で使う、読み取り専用の
// ルーティン行。routine-card.tsxと違い⋮メニュー・スケジュール・「開始」ボタンは持たず、
// タップ＝そのルーティンを選ぶ、という単一の操作だけに絞る（past-training-session-card.tsxと
// 同じく「一覧から1件選ぶだけの画面」用の簡易カードという位置づけ）。
// 見た目はrouting一覧画面(app/routine/index.tsx)で既に馴染みのあるRoutineCardの
// 「名前+N種目+カテゴリチップ」の行にそろえ、選ぶ対象が同じルーティンだと一目でわかるようにする
export const RoutinePickerCard = memo(function RoutinePickerCard({
  name,
  exerciseCount,
  categories,
  onPress,
}: Props) {
  const { visible, overflowCount } = summarizeCategories(categories);

  // VoiceOver/TalkBackで名前・種目数・カテゴリがバラバラに読み上げられないよう
  // カード全体を1つの読み上げ単位にまとめる（routine-card.tsxと同じ考え方）
  const accessibilityLabel = [
    name,
    `${exerciseCount}種目`,
    categories.length > 0 ? categories.map(getCategoryLabel).join('・') : null,
  ]
    .filter(Boolean)
    .join('、');

  const handlePress = useCallback(() => onPress(), [onPress]);

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <View style={styles.content}>
        <Text style={styles.name} numberOfLines={1}>{name}</Text>
        <View style={styles.meta}>
          <Text style={styles.exerciseCount}>{exerciseCount}種目</Text>
          {visible.map((category) => (
            <CategoryChip key={category} category={category} />
          ))}
          {overflowCount > 0 && <Text style={styles.overflow}>{`+${overflowCount}`}</Text>}
        </View>
      </View>
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  // past-training-session-card.tsxと同じ箱型スタイルに統一
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.surfaceMuted,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  content: { flex: 1, gap: 6 },
  name: { ...Typography.cardTitle, color: Colors.textPrimary },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' },
  exerciseCount: { ...Typography.caption, fontWeight: '600', color: Colors.textMuted },
  overflow: { ...Typography.caption, fontWeight: '700', color: Colors.textPlaceholder },
  chevron: { fontSize: 20, color: Colors.textPlaceholder, fontWeight: '600' },
});
