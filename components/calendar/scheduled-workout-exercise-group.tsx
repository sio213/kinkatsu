import { ScheduleExerciseCardGroup } from '@/components/calendar/schedule-exercise-card-group';
import { useScheduledExerciseCards } from '@/hooks/use-scheduled-exercise-cards';
import { memo } from 'react';

type Props = {
  scheduledWorkoutId: number;
  // ルーティン紐付き予定（手動追加・実体化済みのリマインダー予定）のときだけ呼び出し元が渡す。
  // 直接予定（個別種目選択、routineId===null）はルーティン名に相当するものが無いため渡さない
  routineName?: string;
  sessionStartedAt: number;
  title: string;
  // 今日自身の予定にのみ渡す
  onPressStart?: () => void;
  onDelete: () => void;
  onPress: () => void;
};

// scheduledWorkoutId実体を持つ予定（直接予定、および実体化済みのルーティン予定）共通の
// 選択日パネル表示（2026-07-21、旧DirectScheduleExerciseGroupを一般化）。
// useScheduledExerciseCardsの結果をScheduleExerciseCardGroupの共通カード形に変換するだけの
// 薄いコンテナ。実体化済みルーティン予定はこの予定インスタンス専用にコピーされた
// scheduledWorkoutExercises/scheduledWorkoutSetsを編集するため、ルーティン本体には影響しない
// （lib/calendar/scheduled-workouts.tsのaddScheduledWorkout、PR1で対応済み）
export const ScheduledWorkoutExerciseGroup = memo(function ScheduledWorkoutExerciseGroup({
  scheduledWorkoutId,
  routineName,
  sessionStartedAt,
  title,
  onPressStart,
  onDelete,
  onPress,
}: Props) {
  const { cards, retry } = useScheduledExerciseCards(scheduledWorkoutId);

  return (
    <ScheduleExerciseCardGroup
      routineName={routineName}
      sessionStartedAt={sessionStartedAt}
      title={title}
      cards={cards === 'error' || cards === null ? cards : cards.map((card) => ({ key: String(card.scheduledWorkoutExerciseId), ...card }))}
      onRetryCards={retry}
      onPressStart={onPressStart}
      onDelete={onDelete}
      onPress={onPress}
    />
  );
});
