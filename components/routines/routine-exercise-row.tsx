import { CategoryChip } from '@/components/exercises/category-chip';
import { ExerciseThumbnail } from '@/components/exercises/exercise-thumbnail';
import { DesignIcon } from '@/components/ui/design-icon';
import { Colors, IconSizes, Typography } from '@/constants/theme';
import { getCategoryLabel, resolveMeasurementType } from '@/lib/exercises/constants';
import { getExerciseImages } from '@/lib/exercises/images';
import type { DraftExercise } from '@/lib/routines/validation';
import { summarizeExerciseSets } from '@/lib/workout/set-format';
import { memo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type Props = {
  exercise: DraftExercise;
  onPress: () => void;
};

// ルーティンフォームの種目一覧に表示する1件分（サムネイル・名前・部位タグ・代表セット・chevron）。
// タップするとテンプレートセット編集画面へ遷移する。誤って追加した種目の削除は、そちらの画面の
// ⋮メニュー（デザイン案どおり）で行う想定のため、この行自体には削除ボタンを持たせない
export const RoutineExerciseRow = memo(function RoutineExerciseRow({ exercise, onPress }: Props) {
  const images = getExerciseImages(exercise);
  const setsSummary = summarizeExerciseSets(resolveMeasurementType(exercise.measurementType), exercise.sets);
  const categoryLabel = getCategoryLabel(exercise.category);

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${exercise.name}、${categoryLabel}、${setsSummary}`}
    >
      <ExerciseThumbnail source={images.thumbnail} size={38} />
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>{exercise.name}</Text>
        <View style={styles.meta}>
          <CategoryChip category={exercise.category} />
          <Text style={styles.setsSummary} numberOfLines={1}>{setsSummary}</Text>
        </View>
      </View>
      <DesignIcon name="chevron-right" size={IconSizes.cardChevron} color={Colors.textSecondary} />
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.surfaceMuted,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 9,
    paddingHorizontal: 10,
  },
  info: { flex: 1, minWidth: 0, gap: 3 },
  name: { ...Typography.cardTitle, color: Colors.textPrimary },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  setsSummary: { ...Typography.caption, fontWeight: '600', color: Colors.textMuted, flexShrink: 1 },
});
