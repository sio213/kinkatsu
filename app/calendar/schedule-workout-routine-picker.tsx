import { routineCreateHeaderRight } from '@/components/routines/routine-create-header-button';
import { RoutinePickerList } from '@/components/routines/routine-picker-list';
import { NotFoundScreen } from '@/components/ui/not-found-screen';
import { ScreenStyles } from '@/constants/theme';
import type { Routine } from '@/db/schema';
import { useDebouncedPush } from '@/hooks/use-debounced-push';
import { useRoutineExerciseSummaries, useRoutines } from '@/hooks/use-routines';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

// ヘッダー⋮「ルーティンから読み込む」フローの画面2。app/workout/routine-picker.tsxのカレンダー版
// （2026-07-21新設）。ルーティンを1つ選ぶと、画面3(schedule-workout-routine-load.tsx)でそのルーティン
// 内の種目を個別に選べる。一覧の取得・見た目はRoutinePickerList（3本の既存画面と共通化済み）を
// そのまま使う
export default function ScheduleWorkoutRoutinePickerScreen() {
  const { scheduledWorkoutId: scheduledWorkoutIdParam } = useLocalSearchParams<{ scheduledWorkoutId: string }>();
  const scheduledWorkoutId = Number(scheduledWorkoutIdParam);
  const router = useRouter();
  const pushDebounced = useDebouncedPush();
  const { routines } = useRoutines();
  const summaries = useRoutineExerciseSummaries();

  const handleSelect = useCallback(
    (routine: Routine) => {
      pushDebounced({
        pathname: '/calendar/schedule-workout-routine-load',
        params: {
          scheduledWorkoutId: String(scheduledWorkoutId),
          routineId: String(routine.id),
          // 画面3のヘッダーでルーティン名を表示するために渡す。追加のDBクエリを発行せずに済ませるため
          routineName: routine.name,
        },
      });
    },
    [pushDebounced, scheduledWorkoutId],
  );

  if (!Number.isFinite(scheduledWorkoutId)) {
    return (
      <NotFoundScreen message="予定が見つかりません" onPressBack={() => router.back()} />
    );
  }

  return (
    <SafeAreaView style={ScreenStyles.safeArea} edges={['bottom']}>
      <Stack.Screen options={{ headerRight: routineCreateHeaderRight(routines) }} />
      <RoutinePickerList
        routines={routines}
        summaries={summaries}
        onSelect={handleSelect}
        onPressBack={() => router.back()}
        hint="タップして種目を選ぶ画面に進みます"
      />
    </SafeAreaView>
  );
}
