import { ReorderableExerciseRow } from '@/components/exercises/reorderable-exercise-row';
import { getExerciseImages } from '@/lib/exercises/images';
import type { DraftExercise } from '@/lib/routines/validation';
import { memo } from 'react';

type Props = {
  exercise: DraftExercise;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
};

// 種目まとめて並び替え画面(app/routine/exercise-reorder.tsx)専用の行。
// RoutineTemplateExerciseCard(セット編集・⋮メニュー込み)をそのまま使うと不要な状態
// (rowKeys/lastSetsReplacement等)を巻き込むため、ドラッグ表示に必要な最小限の情報
// (サムネイル・名前・カテゴリ・セット数)だけをReorderableExerciseRowへ渡す薄いラッパーにする
export const RoutineReorderExerciseCard = memo(function RoutineReorderExerciseCard({
  exercise,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
}: Props) {
  const images = getExerciseImages(exercise);
  return (
    <ReorderableExerciseRow
      thumbnail={images.thumbnail}
      name={exercise.name}
      category={exercise.category}
      metaText={`${exercise.sets.length}セット`}
      isFirst={isFirst}
      isLast={isLast}
      onMoveUp={onMoveUp}
      onMoveDown={onMoveDown}
    />
  );
});
