import { RoutineLoadView } from '@/components/routines/routine-load-view';
import { NotFoundScreen } from '@/components/ui/not-found-screen';
import { addRoutineExercisesToScheduledWorkout } from '@/lib/calendar/scheduled-workout-detail';
import type { RoutineExerciseSelection } from '@/lib/routines/db';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Alert } from 'react-native';

// ヘッダー⋮「ルーティンから読み込む」フローの画面3。選択UIの実体は
// components/routines/routine-load-view.tsx（app/workout/routine-load.tsxと共通）にあり、
// ここでは選択結果をこの予定(scheduledWorkoutExercises/scheduledWorkoutSets)へ実際に
// 書き込む処理だけを担う
export default function ScheduleWorkoutRoutineLoadScreen() {
  const {
    scheduledWorkoutId: scheduledWorkoutIdParam,
    routineId: routineIdParam,
    routineName,
  } = useLocalSearchParams<{ scheduledWorkoutId: string; routineId: string; routineName: string }>();
  const scheduledWorkoutId = Number(scheduledWorkoutIdParam);
  const routineId = Number(routineIdParam);
  const router = useRouter();

  const handleSubmit = useCallback(
    async (selections: RoutineExerciseSelection[]) => {
      try {
        await addRoutineExercisesToScheduledWorkout(scheduledWorkoutId, routineId, selections);
        // 画面3→画面2→種目編集画面の2階層を一度に閉じる(app/workout/routine-load.tsxと同じ)
        router.dismiss(2);
      } catch (e) {
        console.error('[add routine exercises to scheduled workout]', e);
        Alert.alert('エラー', '種目を読み込めませんでした。');
      }
    },
    [scheduledWorkoutId, routineId, router],
  );

  if (!Number.isFinite(scheduledWorkoutId) || !Number.isFinite(routineId)) {
    return (
      <NotFoundScreen message="予定が見つかりません" title="ルーティン" onPressBack={() => router.back()} />
    );
  }

  return <RoutineLoadView routineId={routineId} routineName={routineName} onSubmit={handleSubmit} />;
}
