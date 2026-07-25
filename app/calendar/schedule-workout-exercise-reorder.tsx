import { ExerciseReorderView } from '@/components/exercises/exercise-reorder-view';
import { useReorderableRows } from '@/hooks/use-reorderable-rows';
import { useScheduledWorkoutExercises, type ScheduledWorkoutExerciseDetail } from '@/hooks/use-scheduled-workout-exercises';
import { reorderScheduledWorkoutExercises } from '@/lib/calendar/scheduled-workout-detail';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';

// ヘッダー⋮「並び替え」(app/calendar/schedule-workout-edit.tsx)から開く専用画面。
// app/workout/exercise-reorder.tsxのカレンダー版。種目データはDBの実テーブル
// (scheduledWorkoutExercises)なので、ドラッグ確定(ドロップ)のたびにDBへ書き込む。失敗時は
// 他の並び替え操作(schedule-workout-edit.tsxのhandleMove)と同じ文言でAlertを出し、表示を
// ドラッグ前の並びへ戻す(楽観的UIの巻き戻し。実装はhooks/use-reorderable-rows.tsで3画面共通)
export default function ScheduleWorkoutExerciseReorderScreen() {
  const router = useRouter();
  const { scheduledWorkoutId: scheduledWorkoutIdParam } = useLocalSearchParams<{ scheduledWorkoutId: string }>();
  const parsedScheduledWorkoutId = Number(scheduledWorkoutIdParam);
  const scheduledWorkoutId = Number.isFinite(parsedScheduledWorkoutId) ? parsedScheduledWorkoutId : -1;
  const { exercises } = useScheduledWorkoutExercises(scheduledWorkoutId);

  const persist = useCallback(
    (next: ScheduledWorkoutExerciseDetail[]) =>
      reorderScheduledWorkoutExercises(
        scheduledWorkoutId,
        next.map((r) => r.scheduledWorkoutExerciseId),
      ),
    [scheduledWorkoutId],
  );

  const { rows, handleReorder, handleMove } = useReorderableRows({
    source: exercises,
    persist,
    errorMessage: '並び順を変更できませんでした。',
    logLabel: '[reorder scheduled workout exercises]',
  });

  return (
    <ExerciseReorderView
      rows={rows}
      keyExtractor={(item) => String(item.scheduledWorkoutExerciseId)}
      setCountOf={(item) => item.sets.length}
      onReorder={handleReorder}
      onMove={handleMove}
      onPressBack={() => router.back()}
    />
  );
}
