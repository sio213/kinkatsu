import { CategoryChip } from '@/components/exercises/category-chip';
import { DesignIcon } from '@/components/ui/design-icon';
import { Colors, Typography } from '@/constants/theme';
import type { Exercise } from '@/db/schema';
import { getExerciseImages } from '@/lib/exercises/images';
import { Image } from 'expo-image';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View, type AccessibilityActionEvent } from 'react-native';
import { useIsActive, useReorderableDrag } from 'react-native-reorderable-list';

// 並び替え画面の行が表示に必要とする最小限の形。ルーティンの下書き(DraftExercise)・
// トレーニング中セッション(SessionExercise)・カレンダーの予定(ScheduledWorkoutExerciseDetail)は
// どれもこの形を満たすため、行側はどのドメインのデータかを知らずに描画できる
export type ReorderableExercise = Pick<Exercise, 'source' | 'slug'> & {
  name: string;
  category: string;
};

type Props = {
  exercise: ReorderableExercise;
  setCount: number;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
};

// 「種目まとめて並び替え」画面(ルーティン/トレーニング中/カレンダーの予定)で使う共通の行。
// 通常の種目カード(RoutineTemplateExerciseCard・SessionExerciseCard等)はセット編集や⋮メニューを
// 含み、そのまま使うと不要な状態を巻き込むため、ドラッグ表示に必要な情報(サムネイル・名前・
// カテゴリ・セット数)だけを描画する専用の行にしている
export const ReorderableExerciseRow = memo(function ReorderableExerciseRow({
  exercise,
  setCount,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
}: Props) {
  const { name, category } = exercise;
  const { thumbnail } = getExerciseImages(exercise);
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
    // この画面の行自体はタップで詳細へ遷移する等の他の役割を持たないため、ハンドルアイコン
    // だけでなくカード全体を長押し領域にできる(他のタップ操作と衝突しない)。長押し時間も
    // RN標準の500msだと並び替え操作としてはもたつくため、体感が軽くなるよう短くしている
    <Pressable
      onLongPress={drag}
      delayLongPress={150}
      style={[styles.card, isActive && styles.cardActive]}
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
      <Image source={thumbnail} style={styles.thumbnail} contentFit="cover" />
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        <View style={styles.meta}>
          <CategoryChip category={category} />
          {/* 数値と文字列に分けて渡すとchildrenが配列になるため、1つの文字列として組み立てる */}
          <Text style={styles.setCount}>{`${setCount}セット`}</Text>
        </View>
      </View>
    </Pressable>
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
