import { ReorderableExerciseRow } from '@/components/exercises/reorderable-exercise-row';
import type { ScheduledWorkoutExerciseDetail } from '@/hooks/use-scheduled-workout-exercises';
import { getExerciseImages } from '@/lib/exercises/images';
import { memo } from 'react';

type Props = {
  exercise: ScheduledWorkoutExerciseDetail;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
};

// 種目まとめて並び替え画面(app/calendar/schedule-workout-exercise-reorder.tsx)専用の行。
// components/workout/session-reorder-exercise-card.tsxのカレンダー版。setsは
// useScheduledWorkoutExercisesの時点で種目に同梱されているため、session版と違い
// 別途live queryから都度参照する必要は無い
export const ScheduledWorkoutReorderExerciseCard = memo(function ScheduledWorkoutReorderExerciseCard({
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
