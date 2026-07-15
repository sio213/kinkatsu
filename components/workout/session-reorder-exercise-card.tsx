import { ReorderableExerciseRow } from '@/components/exercises/reorderable-exercise-row';
import type { SessionExercise } from '@/hooks/use-workout-session';
import { getExerciseImages } from '@/lib/exercises/images';
import { memo } from 'react';

type Props = {
  exercise: SessionExercise;
  setCount: number;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
};

// 種目まとめて並び替え画面(app/workout/exercise-reorder.tsx)専用の行。
// SessionExerciseCard(セット記録・⋮メニュー込み)をそのまま使うと不要な状態を巻き込むため、
// ドラッグ表示に必要な最小限の情報だけをReorderableExerciseRowへ渡す薄いラッパーにする。
// setCountは画面側でuseSessionSetsから求めて渡す(このコンポーネント自身はDBを購読しない)
export const SessionReorderExerciseCard = memo(function SessionReorderExerciseCard({
  exercise,
  setCount,
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
      metaText={`${setCount}セット`}
      isFirst={isFirst}
      isLast={isLast}
      onMoveUp={onMoveUp}
      onMoveDown={onMoveDown}
    />
  );
});
