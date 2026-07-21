import { ScheduleExerciseCardGroup } from '@/components/calendar/schedule-exercise-card-group';
import { useRoutinePreviewExerciseCards } from '@/hooks/use-routine-preview-exercise-cards';
import { memo } from 'react';

type Props = {
  routineId: number;
  routineName: string;
  sessionStartedAt: number;
  // 今日自身の予定にのみ渡す
  onPressStart?: () => void;
  onDelete: () => void;
  // リマインダー予定専用（PR10-6b）
  onReplace?: () => void;
  // 未実体化のため、タップ時にmaterializeReminderOccurrence（DB書き込み+遷移）を行う想定。
  // 呼び出し元（app/(tabs)/calendar.tsx）が非同期処理・二重タップ防止・エラーハンドリングの
  // 責務を持つ（このコンポーネント自身はUIのみ）
  onPress: () => void;
};

// まだ実体化(materializeReminderOccurrence、lib/notifications/scheduled-workout-scheduler.ts)して
// いないリマインダー予定の選択日パネル表示（2026-07-21）。scheduledWorkoutIdを持たないため、
// useScheduledExerciseCardsではなくuseRoutinePreviewExerciseCardsでルーティン本体の現在の
// 中身をライブ表示する。目標セットは「ルーティン本体の実際の値」そのものであり、
// scheduledWorkoutSetsのような「未設定」概念が無いため、値があるセットは全てconfirmedSets
// 扱いにするためのセンチネルとしてcompletedAt: 0を付与する（hooks/use-scheduled-exercise-cards.ts
// のtargetSets判定と同じ理由）。このフックは'error'状態を持たないためonRetryCardsは渡さない
export const ReminderScheduleExerciseGroup = memo(function ReminderScheduleExerciseGroup({
  routineId,
  routineName,
  sessionStartedAt,
  onPressStart,
  onDelete,
  onReplace,
  onPress,
}: Props) {
  const { exercises, loaded } = useRoutinePreviewExerciseCards(routineId);

  return (
    <ScheduleExerciseCardGroup
      routineName={routineName}
      sessionStartedAt={sessionStartedAt}
      title={routineName}
      cards={
        loaded
          ? exercises.map((exercise) => ({
              key: String(exercise.routineExerciseId),
              exerciseId: exercise.exerciseId,
              name: exercise.name,
              category: exercise.category,
              source: exercise.source,
              slug: exercise.slug,
              measurementType: exercise.measurementType,
              sets: exercise.sets.map((set) => ({ ...set, completedAt: 0 })),
            }))
          : null
      }
      onPressStart={onPressStart}
      onDelete={onDelete}
      onReplace={onReplace}
      onPress={onPress}
    />
  );
});
