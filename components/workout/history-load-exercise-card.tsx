import { SelectableExerciseRow } from '@/components/exercises/selectable-exercise-row';
import type { SessionHistoryCard } from '@/lib/workout/history';
import { memo } from 'react';

type Props = {
  card: SessionHistoryCard;
  selected: boolean;
  onToggle: (workoutSessionExerciseId: number) => void;
};

// 過去の記録から読み込む、の画面3で使う行。表示の実体はselectable-exercise-row.tsx
// （ルーティンから読み込む、のRoutineLoadExerciseCardと共有）で、ここではSessionHistoryCard
// (実績値)の型をその正規化propsへ変換するだけの薄いアダプター
export const HistoryLoadExerciseCard = memo(function HistoryLoadExerciseCard({ card, selected, onToggle }: Props) {
  return (
    <SelectableExerciseRow
      id={card.workoutSessionExerciseId}
      name={card.name}
      category={card.category}
      measurementType={card.measurementType}
      source={card.source}
      slug={card.slug}
      sets={card.sets}
      selected={selected}
      onToggle={onToggle}
    />
  );
});
