import { SelectableExerciseRow } from '@/components/exercises/selectable-exercise-row';
import type { RoutineDetailExercise } from '@/lib/routines/db';
import { memo } from 'react';

type Props = {
  exercise: RoutineDetailExercise;
  selected: boolean;
  onToggle: (routineExerciseId: number) => void;
};

// トレーニング中画面ヘッダー⋮「ルーティンから読み込む」フローの画面3で使う行。表示の実体は
// selectable-exercise-row.tsx（過去の記録から読み込む、のHistoryLoadExerciseCardと共有）で、
// ここではRoutineDetailExercise(目標値)の型をその正規化propsへ変換するだけの薄いアダプター
export const RoutineLoadExerciseCard = memo(function RoutineLoadExerciseCard({
  exercise,
  selected,
  onToggle,
}: Props) {
  return (
    <SelectableExerciseRow
      id={exercise.id}
      name={exercise.name}
      category={exercise.category}
      measurementType={exercise.measurementType}
      source={exercise.source}
      slug={exercise.slug}
      sets={exercise.sets}
      selected={selected}
      onToggle={onToggle}
      accessibilityValuePrefix="目標"
      emptyLabel="目標値未設定"
    />
  );
});
