import { RoutinePickerList } from '@/components/routines/routine-picker-list';
import { NotFoundState } from '@/components/ui/not-found-state';
import { Colors } from '@/constants/theme';
import { useDebouncedPush } from '@/hooks/use-debounced-push';
import { useRoutineExerciseSummaries, useRoutines } from '@/hooks/use-routines';
import type { Routine } from '@/db/schema';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet } from 'react-native';
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
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <NotFoundState message="予定が見つかりません" actionLabel="戻る" onPressAction={() => router.back()} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
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

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
});
