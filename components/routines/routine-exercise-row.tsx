import { CategoryChip } from '@/components/exercises/category-chip';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, Typography } from '@/constants/theme';
import { getCategoryLabel, resolveMeasurementType } from '@/lib/exercises/constants';
import { getExerciseImages } from '@/lib/exercises/images';
import { summarizeRoutineExerciseSets } from '@/lib/routines/format';
import type { DraftExercise } from '@/lib/routines/validation';
import { Image } from 'expo-image';
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
  const setsSummary = summarizeRoutineExerciseSets(resolveMeasurementType(exercise.measurementType), exercise.sets);
  const categoryLabel = getCategoryLabel(exercise.category);

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${exercise.name}、${categoryLabel}、${setsSummary}`}
    >
      <Image source={images.thumbnail} style={styles.thumbnail} contentFit="cover" />
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>{exercise.name}</Text>
        <View style={styles.meta}>
          <CategoryChip category={exercise.category} />
          <Text style={styles.setsSummary} numberOfLines={1}>{setsSummary}</Text>
        </View>
      </View>
      <IconSymbol name="chevron.right" size={18} color={Colors.textPlaceholder} />
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
  thumbnail: {
    width: 38,
    height: 38,
    borderRadius: 7,
    backgroundColor: Colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  info: { flex: 1, minWidth: 0, gap: 3 },
  name: { ...Typography.cardTitle, color: Colors.textPrimary },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  setsSummary: { ...Typography.caption, fontWeight: '600', color: Colors.textMuted, flexShrink: 1 },
});
