import { CategoryChip } from '@/components/exercises/category-chip';
import { DesignIcon } from '@/components/ui/design-icon';
import { Colors, Typography } from '@/constants/theme';
import { Image } from 'expo-image';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View, type AccessibilityActionEvent } from 'react-native';
import { useIsActive, useReorderableDrag } from 'react-native-reorderable-list';

type Props = {
  thumbnail: number;
  name: string;
  category: string;
  metaText: string;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
};

// ルーティン(routine-reorder-exercise-card.tsx)・トレーニング(session-reorder-exercise-card.tsx)の
// 両方の「種目まとめて並び替え」画面で使う共通の行。呼び出し側が下書き(DraftExercise)かDB実データ
// (SessionExercise)かに関わらず、表示に必要な値だけをプリミティブなpropsとして渡してもらう
export const ReorderableExerciseRow = memo(function ReorderableExerciseRow({
  thumbnail,
  name,
  category,
  metaText,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
}: Props) {
  const drag = useReorderableDrag();
  const isActive = useIsActive();

  // ドラッグ操作(onLongPress)はVoiceOver/TalkBack等の支援技術からは実行できないため、
  // 同じハンドルにaccessibilityActionsで上へ/下へ移動を提供し、隣接1件だけの入れ替えという形で
  // 並び替えを代替できるようにする(ExerciseCardMenuの「上へ移動/下へ移動」と同じ考え方)
  const handleAccessibilityAction = (event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === 'moveUp') onMoveUp();
    if (event.nativeEvent.actionName === 'moveDown') onMoveDown();
  };

  return (
    <View style={[styles.card, isActive && styles.cardActive]}>
      <Pressable
        onLongPress={drag}
        hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
        accessibilityRole="button"
        accessibilityLabel={`${name}をドラッグして並び替え`}
        accessibilityHint="スクリーンリーダーではドラッグの代わりに上へ移動・下へ移動のアクションを使ってください"
        accessibilityActions={[
          ...(isFirst ? [] : [{ name: 'moveUp', label: '上へ移動' }]),
          ...(isLast ? [] : [{ name: 'moveDown', label: '下へ移動' }]),
        ]}
        onAccessibilityAction={handleAccessibilityAction}
      >
        <DesignIcon name="drag-indicator" size={20} color={isActive ? Colors.accent : Colors.borderStrong} />
      </Pressable>
      <Image source={thumbnail} style={styles.thumbnail} contentFit="cover" />
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        <View style={styles.meta}>
          <CategoryChip category={category} />
          <Text style={styles.setCount}>{metaText}</Text>
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingVertical: 9,
    paddingHorizontal: 10,
    backgroundColor: Colors.surfaceMuted,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
  },
  cardActive: {
    backgroundColor: Colors.surface,
    borderColor: Colors.accent,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
    transform: [{ scale: 1.02 }],
  },
  thumbnail: { width: 40, height: 40, borderRadius: 7, backgroundColor: Colors.surfaceSubtle },
  info: { flex: 1, minWidth: 0, gap: 3 },
  name: { ...Typography.cardTitle, color: Colors.textPrimary },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  setCount: { ...Typography.caption, fontWeight: '600', color: Colors.textMuted },
});
